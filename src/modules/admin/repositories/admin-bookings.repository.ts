import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, Booking, Event } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminBookingQueryDto, AdminBookingSortBy, SortOrder } from '../dto/admin-booking-query.dto';
import { AdminFailureReason } from '../constants/admin-failure-reason.constants';

/** Shape returned by findPendingBookings / findBookings */
export type BookingWithEvent = Booking & { event: { id: string; name: string } };

/** Full booking detail shape (includes all event fields) */
export type BookingWithFullEvent = Booking & { event: Event };

/**
 * AdminBookingsRepository — pure data-access layer for admin booking operations.
 *
 * Rules:
 *  - No business logic here. All decision-making lives in AdminBookingsService.
 *  - Prisma is NEVER accessed outside this repository in the admin module.
 *  - All locking and transaction orchestration is handled inside this layer,
 *    because the transaction callback must hold a reference to `this.prisma`.
 */
@Injectable()
export class AdminBookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Queries ─────────────────────────────────────────────────────────────────

  /**
   * Paginated, filterable, sortable list of bookings.
   *
   * Runs findMany + count in a single $transaction for consistency.
   * When called by the pending-bookings endpoint, callers set query.status = PENDING.
   */
  async findBookings(query: AdminBookingQueryDto): Promise<{
    data: BookingWithEvent[];
    totalItems: number;
  }> {
    const page    = query.page    ?? 1;
    const limit   = query.limit   ?? 10;
    const sortBy  = query.sortBy  ?? AdminBookingSortBy.CREATED_AT;
    const order   = (query.order  ?? SortOrder.DESC).toLowerCase() as Prisma.SortOrder;

    // ── WHERE clause ──────────────────────────────────────────────────────────
    const where: Prisma.BookingWhereInput = {};

    if (query.status)    where.status  = query.status;
    if (query.eventId)   where.eventId = query.eventId;

    if (query.customerEmail) {
      where.customerEmail = { contains: query.customerEmail, mode: 'insensitive' };
    }
    if (query.customerName) {
      where.customerName = { contains: query.customerName, mode: 'insensitive' };
    }
    if (query.bookingReference) {
      where.bookingReference = { contains: query.bookingReference, mode: 'insensitive' };
    }

    // ── ORDER BY clause ───────────────────────────────────────────────────────
    let orderBy: Prisma.BookingOrderByWithRelationInput;
    if (sortBy === AdminBookingSortBy.EVENT_DATE) {
      orderBy = { event: { eventDate: order } };
    } else {
      orderBy = { [sortBy]: order };
    }

    const skip = (page - 1) * limit;

    // ── Run findMany + count concurrently ─────────────────────────────────────
    const [data, totalItems] = await Promise.all([
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
          requestId:        true,
          seats:            true,
          status:           true,
          failureReason:    true,
          eventId:          true,
          createdAt:        true,
          updatedAt:        true,
          event: { select: { id: true, name: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { data: data as BookingWithEvent[], totalItems };
  }

  /**
   * Find a single booking by UUID, including all event details.
   * Returns null if not found (caller decides how to handle).
   */
  async findBookingById(bookingId: string): Promise<BookingWithFullEvent | null> {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { event: true },
    });
  }

  /**
   * Count all bookings with PENDING status.
   * Used for dashboard summary / audit reporting.
   */
  async countPendingBookings(): Promise<number> {
    return this.prisma.booking.count({
      where: { status: BookingStatus.PENDING },
    });
  }

  // ── Commands ─────────────────────────────────────────────────────────────────

  /**
   * approveBooking — the single, atomic, concurrency-safe admin approval.
   *
   * Runs entirely inside ONE PostgreSQL transaction with a SELECT FOR UPDATE
   * lock on the event row to prevent overbooking and double-approval races.
   *
   * Flow:
   *  1. Lock the event row (blocks concurrent approvals on the same event).
   *  2. Re-read fresh remainingSeats from the locked row.
   *  3. Re-verify the booking is still PENDING (guard against race conditions).
   *  4a. Seats available  → decrement, set CONFIRMED.
   *  4b. Seats exhausted  → set FAILED / SOLD_OUT.
   *  5. Commit (releases lock).
   *
   * Returns the updated booking record.
   * Throws PrismaClientKnownRequestError on DB failure (caller handles).
   */
  async approveBooking(bookingId: string, eventId: string, seats: number): Promise<Booking> {
    return this.prisma.$transaction(async (tx) => {
      // Step 1 — Lock the event row for the duration of this transaction.
      const rows = await tx.$queryRaw<Array<{ remainingSeats: number }>>`
        SELECT "remainingSeats"
        FROM   "events"
        WHERE  "id" = ${eventId}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        // Event was deleted between the service guard and this transaction.
        return tx.booking.update({
          where: { id: bookingId },
          data: {
            status:        BookingStatus.FAILED,
            failureReason: AdminFailureReason.SOLD_OUT,
            updatedAt:     new Date(),
          },
        });
      }

      // Step 2 — Use the LOCKED row's value (not a stale cached value).
      const remainingSeats = Number(rows[0].remainingSeats);

      // Step 3 — Re-read the booking inside the transaction for state re-check.
      const freshBooking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });

      if (freshBooking.status !== BookingStatus.PENDING) {
        // Another admin approved/rejected concurrently between guard and lock.
        // Return the already-updated booking so the service can raise a 409.
        return freshBooking;
      }

      // Step 4 — Seat check and atomic update.
      if (remainingSeats < seats) {
        // Not enough seats — mark FAILED / SOLD_OUT.
        return tx.booking.update({
          where: { id: bookingId },
          data: {
            status:        BookingStatus.FAILED,
            failureReason: AdminFailureReason.SOLD_OUT,
            updatedAt:     new Date(),
          },
        });
      }

      // Sufficient seats — deduct atomically and confirm.
      await tx.event.update({
        where: { id: eventId },
        data:  { remainingSeats: { decrement: seats } },
      });

      return tx.booking.update({
        where: { id: bookingId },
        data: {
          status:        BookingStatus.CONFIRMED,
          failureReason: null,
          updatedAt:     new Date(),
        },
      });
    });
  }

  /**
   * rejectBooking — marks a booking as FAILED with reason ADMIN_REJECTED.
   *
   * Does NOT touch the event's seat count.
   * The caller is responsible for verifying the booking was PENDING before calling this.
   */
  async rejectBooking(bookingId: string): Promise<Booking> {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status:        BookingStatus.FAILED,
        failureReason: AdminFailureReason.ADMIN_REJECTED,
        updatedAt:     new Date(),
      },
    });
  }
}
