import { Injectable, NotFoundException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BookingsRepository } from '../repositories/bookings.repository';
import { BookingReferenceService } from './booking-reference.service';
import { BookingProducer } from '../../queue/producers/booking.producer';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { BookingQueryDto } from '../dto/booking-query.dto';
import { BookingResponseDto } from '../responses/booking-response.dto';
import { PaginatedBookingsDto, BookingItemDto, PaginationMetaDto } from '../responses/paginated-bookings.dto';
import { RedisService, REDIS_TTL } from '../../../infrastructure/redis';

const DUPLICATE_REQUEST_MESSAGE = 'Duplicate request. Returning existing booking.';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly bookingsRepository: BookingsRepository,
    private readonly bookingReferenceService: BookingReferenceService,
    private readonly redisService: RedisService,
    private readonly bookingProducer: BookingProducer,
  ) {}

  /**
   * Handle POST /bookings
   *
   * Idempotency strategy (two-layer defence):
   *
   * Layer 1 — Pre-check (optimistic fast path):
   *   Query for requestId before attempting to write. If found, return immediately.
   *   Handles the vast majority of duplicates with zero DB writes.
   *
   * Layer 2 — Unique constraint + P2002 recovery (race-condition safety net):
   *   If two requests with the same requestId arrive simultaneously, both may
   *   pass the pre-check. The DB unique constraint on requestId ensures only ONE
   *   INSERT succeeds. The loser gets a P2002 error, which we catch, then we
   *   fetch and return the winner's booking. Client gets 202 either way — no error.
   */
  async create(data: CreateBookingDto): Promise<BookingResponseDto> {
    this.logger.log(`Processing booking request: requestId=${data.requestId}, eventId=${data.eventId}`);

    // ── Layer 1: Pre-check for duplicate requestId (optimistic fast path) ────
    const existingBooking = await this.bookingsRepository.findByRequestId(data.requestId);
    if (existingBooking) {
      this.logger.log(
        `[Layer 1] Duplicate request detected: requestId=${data.requestId}. ` +
        `Returning existing booking reference=${existingBooking.bookingReference}`
      );
      return {
        bookingReference: existingBooking.bookingReference,
        status: existingBooking.status,
        message: DUPLICATE_REQUEST_MESSAGE,
      };
    }

    // ── Verify the event exists (only needed for new requests) ────────────────
    const event = await this.bookingsRepository.findEventById(data.eventId);
    if (!event) {
      this.logger.warn(`Event not found: eventId=${data.eventId}`);
      throw new NotFoundException(`Event with ID ${data.eventId} does not exist`);
    }

    // ── Generate reference and attempt DB insert ───────────────────────────────
    const bookingReference = await this.bookingReferenceService.generateReference();

    let booking;
    try {
      booking = await this.bookingsRepository.createPendingBooking({
        eventId: data.eventId,
        bookingReference,
        requestId: data.requestId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        seats: data.seats,
      });

      this.logger.log(`Pending booking created: reference=${booking.bookingReference}, requestId=${data.requestId}`);
    } catch (error) {
      // ── Layer 2: Unique constraint violation recovery (P2002) ───────────────
      // Concurrent request with the same requestId already committed. Recover
      // gracefully by fetching and returning that booking — no error to caller.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `[Layer 2] Unique constraint violation on requestId=${data.requestId}. ` +
          `Recovering by fetching the winning concurrent booking.`
        );

        const recovered = await this.bookingsRepository.findByRequestId(data.requestId);
        if (recovered) {
          this.logger.log(
            `[Layer 2] Recovery successful: returning existing booking reference=${recovered.bookingReference}`
          );
          return {
            bookingReference: recovered.bookingReference,
            status: recovered.status,
            message: DUPLICATE_REQUEST_MESSAGE,
          };
        }
      }

      // Non-P2002 error — re-throw for global exception filter
      throw error;
    }

    // ── Enqueue the processing job (only for genuinely new bookings) ──────────
    try {
      await this.bookingProducer.enqueueBooking(booking.id);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue booking job for reference ${bookingReference}`,
        error instanceof Error ? error.stack : error
      );
      throw new ServiceUnavailableException(
        'The booking queue service is currently unavailable. Please try again later.'
      );
    }

    // ── Invalidate stale caches ───────────────────────────────────────────────
    await this.redisService.invalidate(`bookings:user:${data.customerEmail}*`);
    await this.redisService.invalidate(`bookings:event:${data.eventId}*`);

    return {
      bookingReference: booking.bookingReference,
      status: booking.status,
    };
  }

  /**
   * Paginated, filterable booking list for GET /bookings.
   */
  async listBookings(query: BookingQueryDto): Promise<PaginatedBookingsDto> {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 10;

    this.logger.log(
      `Listing bookings: page=${page}, limit=${limit}, ` +
      `status=${query.status ?? 'all'}, eventId=${query.eventId ?? 'all'}, ` +
      `customerEmail=${query.customerEmail ?? 'all'}, sortBy=${query.sortBy ?? 'createdAt'}, order=${query.order ?? 'DESC'}`
    );

    const { data, totalItems } = await this.bookingsRepository.findAllPaginated(query);

    const totalPages      = Math.ceil(totalItems / limit);
    const hasNextPage     = page < totalPages;
    const hasPreviousPage = page > 1;

    this.logger.log(`Booking list retrieved: totalItems=${totalItems}, totalPages=${totalPages}`);

    const meta: PaginationMetaDto = { page, limit, totalItems, totalPages, hasNextPage, hasPreviousPage };

    const items: BookingItemDto[] = data.map((b) => ({
      bookingReference: b.bookingReference,
      event: { id: b.event.id, name: b.event.name },
      customerName:  b.customerName,
      customerEmail: b.customerEmail,
      seats:         b.seats,
      status:        b.status,
      createdAt:     b.createdAt,
    }));

    return { data: items, meta };
  }

  /**
   * Get all bookings (internal — used by workers / admin tooling).
   */
  async findAll() {
    return this.bookingsRepository.findAll();
  }

  /**
   * Get bookings by customer email.
   */
  async findByCustomerEmail(customerEmail: string) {
    return this.redisService.remember(
      `bookings:user:${customerEmail}`,
      REDIS_TTL.MEDIUM,
      () => this.bookingsRepository.findByCustomerEmail(customerEmail)
    );
  }

  /**
   * Get bookings by event ID.
   */
  async findByEventId(eventId: string) {
    return this.redisService.remember(
      `bookings:event:${eventId}`,
      REDIS_TTL.MEDIUM,
      () => this.bookingsRepository.findByEventId(eventId)
    );
  }

  /**
   * Calculate booked seats count for an event.
   */
  async getBookedSeatCount(eventId: string): Promise<number> {
    return this.redisService.remember<number>(
      `bookings:count:${eventId}`,
      REDIS_TTL.DAY,
      async () => {
        const bookings = await this.bookingsRepository.findByEventId(eventId);
        return bookings.reduce((sum, b) => sum + b.seats, 0);
      },
    );
  }
}
