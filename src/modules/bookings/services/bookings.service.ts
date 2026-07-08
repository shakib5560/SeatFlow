import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, RoomBooking } from '@prisma/client';
import { BookingsRepository } from '../repositories/bookings.repository';
import { RoomsRepository } from '../../rooms/repositories/rooms.repository';
import { BookingReferenceService } from './booking-reference.service';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { BookingQueryDto } from '../dto/booking-query.dto';
import { BookingResponseDto } from '../responses/booking-response.dto';
import {
  PaginatedBookingsDto,
  BookingItemDto,
  PaginationMetaDto,
} from '../responses/paginated-bookings.dto';
import { RedisService, REDIS_TTL } from '../../../infrastructure/redis';

const DUPLICATE_REQUEST_MESSAGE =
  'Duplicate request. Returning existing booking.';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly bookingsRepository: BookingsRepository,
    private readonly roomsRepository: RoomsRepository,
    private readonly bookingReferenceService: BookingReferenceService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Handle POST /bookings
   * Creates a RoomBooking in PENDING status.
   */
  async create(data: CreateBookingDto): Promise<BookingResponseDto> {
    const requestId = data.requestId || randomUUID();
    const roomId = data.roomId;

    this.logger.log(
      `Processing booking request: requestId=${requestId}, roomId=${roomId}`,
    );

    // ── Layer 1: Pre-check for duplicate requestId (optimistic fast path) ────
    const existingBooking =
      await this.bookingsRepository.findByRequestId(requestId);
    if (existingBooking) {
      this.logger.log(
        `[Layer 1] Duplicate request detected: requestId=${requestId}. ` +
          `Returning existing booking reference=${existingBooking.bookingReference}`,
      );
      return {
        bookingReference: existingBooking.bookingReference,
        status: existingBooking.status,
        message: DUPLICATE_REQUEST_MESSAGE,
      };
    }

    // ── Verify the room exists ───────────────────────────────────────────────
    const room = await this.roomsRepository.findById(roomId);
    if (!room) {
      this.logger.warn(`Room not found: roomId=${roomId}`);
      throw new NotFoundException(`Room with ID ${roomId} does not exist`);
    }

    // ── Parse dates and validate range ────────────────────────────────────────
    const startDate = this.parseDate(data.startDate);
    const endDate = this.parseDate(data.endDate);

    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate.');
    }

    // ── Concurrency-Safe Overlap Check & Lock ──────────────────────────────
    // Check if the room is available for these dates
    const availability = await this.roomsRepository.checkAvailability(
      roomId,
      startDate,
      endDate,
    );
    if (!availability.available) {
      const nextDateStr = availability.nextAvailableDate
        .toISOString()
        .slice(0, 10);
      throw new ConflictException(
        `This room is not available for the selected dates. Next available date: ${nextDateStr}`,
      );
    }

    // ── Generate reference and attempt DB insert ───────────────────────────────
    const bookingReference =
      await this.bookingReferenceService.generateReference();

    let booking: RoomBooking;
    try {
      booking = await this.bookingsRepository.createPendingBooking({
        roomId,
        bookingReference,
        requestId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        bookingType: data.bookingType,
        startDate,
        endDate,
      });

      this.logger.log(
        `Pending booking created: reference=${booking.bookingReference}, requestId=${requestId}`,
      );
    } catch (error) {
      // ── Layer 2: Unique constraint violation recovery (P2002) ───────────────
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `[Layer 2] Unique constraint violation on requestId=${requestId}. ` +
            `Recovering by fetching the winning concurrent booking.`,
        );

        const recovered =
          await this.bookingsRepository.findByRequestId(requestId);
        if (recovered) {
          this.logger.log(
            `[Layer 2] Recovery successful: returning existing booking reference=${recovered.bookingReference}`,
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

    // ── Invalidate stale caches ───────────────────────────────────────────────
    await this.redisService.invalidate(`bookings:user:${data.customerEmail}*`);
    await this.redisService.invalidate(`bookings:room:${roomId}*`);

    return {
      bookingReference: booking.bookingReference,
      status: booking.status,
    };
  }

  /**
   * Paginated, filterable booking list for GET /bookings.
   */
  async listBookings(query: BookingQueryDto): Promise<PaginatedBookingsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    this.logger.log(
      `Listing bookings: page=${page}, limit=${limit}, ` +
        `status=${query.status ?? 'all'}, roomId=${query.roomId ?? 'all'}, ` +
        `customerEmail=${query.customerEmail ?? 'all'}, sortBy=${query.sortBy ?? 'createdAt'}, order=${query.order ?? 'DESC'}`,
    );

    const { data, totalItems } =
      await this.bookingsRepository.findAllPaginated(query);

    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    this.logger.log(
      `Booking list retrieved: totalItems=${totalItems}, totalPages=${totalPages}`,
    );

    const meta: PaginationMetaDto = {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };

    const items: BookingItemDto[] = data.map((b) => ({
      bookingReference: b.bookingReference,
      room: { id: b.room.id, name: b.room.name },
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      bookingType: b.bookingType,
      startDate: b.startDate,
      endDate: b.endDate,
      status: b.status,
      createdAt: b.createdAt,
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
      () => this.bookingsRepository.findByCustomerEmail(customerEmail),
    );
  }

  /**
   * Get bookings by room ID.
   */
  async findByRoomId(roomId: string) {
    return this.redisService.remember(
      `bookings:room:${roomId}`,
      REDIS_TTL.MEDIUM,
      () => this.bookingsRepository.findByRoomId(roomId),
    );
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  /** Parse an ISO date string (YYYY-MM-DD) to UTC midnight DateTime. */
  private parseDate(dateStr: string): Date {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(d.getTime())) {
      throw new BadRequestException(
        `Invalid date format: ${dateStr}. Use YYYY-MM-DD.`,
      );
    }
    return d;
  }
}
