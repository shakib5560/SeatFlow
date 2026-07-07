import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Booking, Event, BookingStatus, Prisma } from '@prisma/client';
import { FailureReason } from '../../workers/constants/failure-reason.constants';
import { BookingQueryDto, BookingSortBy, SortOrder } from '../dto/booking-query.dto';

@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search for booking by requestId (idempotency request key).
   */
  async findByRequestId(requestId: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({
      where: { requestId },
    });
  }

  /**
   * Create a new booking in PENDING state.
   */
  async createPendingBooking(data: {
    eventId: string;
    bookingReference: string;
    requestId: string;
    customerName: string;
    customerEmail: string;
    seats: number;
  }): Promise<Booking> {
    return this.prisma.booking.create({
      data: {
        ...data,
        status: BookingStatus.PENDING,
      },
    });
  }

  /**
   * Find booking by its unique reference code.
   */
  async findByBookingReference(bookingReference: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({
      where: { bookingReference },
    });
  }

  /**
   * Find booking by unique ID.
   */
  async findById(id: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({
      where: { id },
    });
  }

  /**
   * Find event by ID to verify existence.
   */
  async findEventById(eventId: string): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id: eventId },
    });
  }

  /**
   * Find the first event in the database (ordered by date/creation).
   */
  async findFirstEvent(): Promise<Event | null> {
    return this.prisma.event.findFirst({
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Paginated query with dynamic filtering, searching, and sorting.
   * Runs findMany + count in a single $transaction for efficiency.
   */
  async findAllPaginated(query: BookingQueryDto): Promise<{
    data: (Booking & { event: { id: string; name: string } })[];
    totalItems: number;
  }> {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? BookingSortBy.CREATED_AT;
    const order  = (query.order ?? SortOrder.DESC).toLowerCase() as Prisma.SortOrder;

    // ── Build WHERE clause ────────────────────────────────────────────────────
    const where: Prisma.BookingWhereInput = {};

    if (query.status)    where.status    = query.status;
    if (query.eventId)   where.eventId   = query.eventId;

    if (query.customerEmail) {
      where.customerEmail = { contains: query.customerEmail, mode: 'insensitive' };
    }
    if (query.bookingReference) {
      where.bookingReference = { contains: query.bookingReference, mode: 'insensitive' };
    }

    // ── Build ORDER BY clause ─────────────────────────────────────────────────
    let orderBy: Prisma.BookingOrderByWithRelationInput;
    if (sortBy === BookingSortBy.EVENT_DATE) {
      orderBy = { event: { eventDate: order } };
    } else {
      orderBy = { [sortBy]: order };
    }

    const skip = (page - 1) * limit;

    // ── Run findMany + count atomically ───────────────────────────────────────
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id:               true,
          bookingReference: true,
          customerName:     true,
          customerEmail:    true,
          seats:            true,
          status:           true,
          createdAt:        true,
          // Embed only required event fields — avoids over-fetching
          event: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { data: data as (Booking & { event: { id: string; name: string } })[], totalItems };
  }

  /**
   * Retrieve all bookings with event relation details.
   */
  async findAll(): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      include: { event: true },
    });
  }

  /**
   * Find bookings associated with a specific event.
   */
  async findByEventId(eventId: string): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      where: { eventId },
    });
  }

  /**
   * Find bookings associated with a specific customer email.
   */
  async findByCustomerEmail(customerEmail: string): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      where: { customerEmail },
    });
  }

  /**
   * processBookingWithLock — the single, atomic, concurrency-safe booking confirmation.
   *
   * HOW OVERBOOKING IS PREVENTED:
   * ──────────────────────────────
   * 1. Opens a PostgreSQL transaction.
   * 2. Executes `SELECT ... FOR UPDATE` on the event row.
   *    → PostgreSQL places an exclusive row-level lock on that event.
   *    → Any other worker trying to lock the SAME event row is blocked
   *      at the database level until this transaction commits or rolls back.
   *    → This serialises all concurrent workers that compete for the same event.
   * 3. Reads `remainingSeats` from the LOCKED row (always fresh — no stale cache).
   * 4. If seats are available  → decrement remainingSeats + mark CONFIRMED.
   *    If seats are exhausted  → mark FAILED/SOLD_OUT (no seat change).
   * 5. Commits → lock is released → next waiting worker proceeds.
   *
   * Result: it is structurally impossible for two workers to both read
   * "seats available = 5" and both confirm a 3-seat booking. The second
   * worker is blocked until the first commits and only then reads "seats = 2".
   */
  async processBookingWithLock(bookingId: string, eventId: string, seats: number): Promise<Booking> {
    return this.prisma.$transaction(async (tx) => {
      // ── Lock the event row ──────────────────────────────────────────────────
      // $queryRaw returns typed results; the generic param maps the row shape.
      const rows = await tx.$queryRaw<Array<{ remainingSeats: number }>>`
        SELECT "remainingSeats"
        FROM   "events"
        WHERE  "id" = ${eventId}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        // Event was deleted between enqueue and processing — fail the booking.
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.FAILED, failureReason: FailureReason.EVENT_NOT_FOUND },
        });
        // Return the updated booking record
        return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      }

      const remainingSeats = Number(rows[0].remainingSeats);

      if (remainingSeats < seats) {
        // ── SOLD OUT — not enough seats ───────────────────────────────────────
        return tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.FAILED, failureReason: FailureReason.SOLD_OUT },
        });
      }

      // ── CONFIRMED — deduct seats and confirm in one atomic write ─────────────
      await tx.event.update({
        where: { id: eventId },
        data: { remainingSeats: { decrement: seats } },
      });

      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CONFIRMED, failureReason: null },
      });
    });
  }

  /**
   * Mark a booking as CONFIRMED and atomically decrement event remaining seats.
   * Delegates to processBookingWithLock for full concurrency safety.
   */
  async confirmBooking(bookingId: string, eventId: string, seats: number): Promise<Booking> {
    return this.processBookingWithLock(bookingId, eventId, seats);
  }

  /**
   * Mark a booking as FAILED with a structured failure reason string.
   */
  async failBooking(bookingId: string, reason: string): Promise<Booking> {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.FAILED, failureReason: reason },
    });
  }

  /**
   * Delete a booking by ID.
   */
  async delete(id: string): Promise<Booking> {
    return this.prisma.booking.delete({
      where: { id },
    });
  }
}
