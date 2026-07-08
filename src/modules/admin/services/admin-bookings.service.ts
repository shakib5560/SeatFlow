import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { AdminBookingsRepository } from '../repositories/admin-bookings.repository';
import { AdminBookingQueryDto } from '../dto/admin-booking-query.dto';
import { BookingApprovalDto } from '../dto/booking-approval.dto';
import {
  AdminBookingDetailDto,
  AdminBookingListItemDto,
  AdminActionResultDto,
  PaginatedAdminBookingsDto,
  AdminPaginationMetaDto,
} from '../responses/admin-booking.response.dto';

/**
 * AdminBookingsService — all admin booking business logic.
 *
 * Architecture rules:
 *  - Controller delegates ALL logic here.
 *  - Service delegates ALL data access to AdminBookingsRepository.
 *  - Business decisions (status guards, 409 detection, logging) live here.
 *  - No Prisma imports here.
 */
@Injectable()
export class AdminBookingsService {
  private readonly logger = new Logger(AdminBookingsService.name);

  constructor(
    private readonly adminBookingsRepository: AdminBookingsRepository,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // LIST
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * listPendingBookings — GET /admin/bookings/pending
   *
   * Forces status = PENDING in the query so only unprocessed bookings are returned.
   * Supports pagination, filtering, and sorting via AdminBookingQueryDto.
   */
  async listPendingBookings(
    query: AdminBookingQueryDto,
  ): Promise<PaginatedAdminBookingsDto> {
    const forcedQuery: AdminBookingQueryDto = {
      ...query,
      status: BookingStatus.PENDING,
    };
    return this.buildPaginatedResponse(forcedQuery);
  }

  /**
   * listAllBookings — generic paginated list with any status filter.
   * Useful for future admin dashboards or audit screens.
   */
  async listAllBookings(
    query: AdminBookingQueryDto,
  ): Promise<PaginatedAdminBookingsDto> {
    return this.buildPaginatedResponse(query);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DETAIL
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * getBookingById — GET /admin/bookings/:bookingId
   *
   * Returns full booking detail including event, status, failure reason, timestamps.
   * Throws 404 if the booking does not exist.
   */
  async getBookingById(bookingId: string): Promise<AdminBookingDetailDto> {
    this.logger.log(`Admin viewed booking detail: bookingId=${bookingId}`);

    const booking =
      await this.adminBookingsRepository.findBookingById(bookingId);
    if (!booking) {
      this.logger.warn(`Booking not found: bookingId=${bookingId}`);
      throw new NotFoundException(
        `Booking with ID ${bookingId} does not exist.`,
      );
    }

    return {
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      room: {
        id: booking.room.id,
        name: booking.room.name,
      },
      startDate: booking.startDate,
      endDate: booking.endDate,
      bookingType: booking.bookingType,
      status: booking.status,
      failureReason: booking.failureReason,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // APPROVE
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * approveBooking — PATCH /admin/bookings/:bookingId/approve
   *
   * Guards:
   *  1. Verifies the booking exists (404).
   *  2. Verifies the booking is still PENDING (409).
   *
   * Then delegates the atomic seat-deduction + confirmation to the repository,
   * which executes everything in a single PostgreSQL transaction with SELECT FOR UPDATE.
   *
   * If the transaction detects a concurrent state change (another admin acted first),
   * the updated booking will no longer be CONFIRMED and a 409 is raised.
   *
   * If seats run out during the transaction, the booking is marked FAILED/SOLD_OUT
   * and a 409 is raised to inform the admin.
   */
  async approveBooking(
    bookingId: string,
    _dto: BookingApprovalDto,
  ): Promise<AdminActionResultDto> {
    this.logger.log(`Admin approval initiated: bookingId=${bookingId}`);

    // ── Guard 1: Existence check ──────────────────────────────────────────────
    const booking =
      await this.adminBookingsRepository.findBookingById(bookingId);
    if (!booking) {
      this.logger.warn(
        `Approval failed — booking not found: bookingId=${bookingId}`,
      );
      throw new NotFoundException(
        `Booking with ID ${bookingId} does not exist.`,
      );
    }

    // ── Guard 2: Status check ─────────────────────────────────────────────────
    if (booking.status !== BookingStatus.PENDING) {
      this.logger.warn(
        `Approval failed — booking already processed: bookingId=${bookingId}, ` +
          `currentStatus=${booking.status}`,
      );
      throw new ConflictException(
        `Booking ${booking.bookingReference} cannot be approved — ` +
          `current status is ${booking.status}. Only PENDING bookings may be approved.`,
      );
    }

    // ── Atomic approval (SELECT FOR UPDATE inside transaction) ────────────────
    let result;
    try {
      result = await this.adminBookingsRepository.approveBooking(bookingId);
    } catch (error) {
      this.logger.error(
        `Approval transaction failed: bookingId=${bookingId}`,
        error instanceof Error ? error.stack : error,
      );
      throw error; // re-throw — caught by GlobalExceptionFilter
    }

    // ── Post-transaction state validation ─────────────────────────────────────
    if (result.status === BookingStatus.PENDING) {
      // Should never happen — but defensive guard.
      this.logger.error(
        `Approval produced no state change: bookingId=${bookingId}`,
      );
      throw new ConflictException(
        'Approval failed due to an unexpected state transition.',
      );
    }

    if (result.status === BookingStatus.FAILED) {
      // Booking was failed inside the transaction (e.g., SOLD_OUT, concurrent approval).
      this.logger.warn(
        `Approval resulted in FAILED booking: bookingId=${bookingId}, ` +
          `reference=${result.bookingReference}, reason=${result.failureReason}`,
      );
      throw new ConflictException(
        `Booking ${result.bookingReference} could not be approved — ` +
          `reason: ${result.failureReason}. The booking has been marked as FAILED.`,
      );
    }

    this.logger.log(
      `Booking approved successfully: bookingId=${bookingId}, ` +
        `reference=${result.bookingReference}, status=${result.status}`,
    );

    return {
      bookingReference: result.bookingReference,
      status: result.status,
      failureReason: result.failureReason,
      updatedAt: result.updatedAt,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // REJECT
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * rejectBooking — PATCH /admin/bookings/:bookingId/reject
   *
   * Guards:
   *  1. Verifies the booking exists (404).
   *  2. Verifies the booking is still PENDING (409).
   *
   * Sets status = FAILED, failureReason = ADMIN_REJECTED.
   * Does NOT touch the event's seat count.
   */
  async rejectBooking(
    bookingId: string,
    _dto: BookingApprovalDto,
  ): Promise<AdminActionResultDto> {
    this.logger.log(`Admin rejection initiated: bookingId=${bookingId}`);

    // ── Guard 1: Existence check ──────────────────────────────────────────────
    const booking =
      await this.adminBookingsRepository.findBookingById(bookingId);
    if (!booking) {
      this.logger.warn(
        `Rejection failed — booking not found: bookingId=${bookingId}`,
      );
      throw new NotFoundException(
        `Booking with ID ${bookingId} does not exist.`,
      );
    }

    // ── Guard 2: Status check ─────────────────────────────────────────────────
    if (booking.status !== BookingStatus.PENDING) {
      this.logger.warn(
        `Rejection failed — booking already processed: bookingId=${bookingId}, ` +
          `currentStatus=${booking.status}`,
      );
      throw new ConflictException(
        `Booking ${booking.bookingReference} cannot be rejected — ` +
          `current status is ${booking.status}. Only PENDING bookings may be rejected.`,
      );
    }

    const result = await this.adminBookingsRepository.rejectBooking(bookingId);

    this.logger.log(
      `Booking rejected: bookingId=${bookingId}, ` +
        `reference=${result.bookingReference}, reason=${result.failureReason}`,
    );

    return {
      bookingReference: result.bookingReference,
      status: result.status,
      failureReason: result.failureReason,
      updatedAt: result.updatedAt,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  /** Shared paginated response builder used by listPendingBookings and listAllBookings. */
  private async buildPaginatedResponse(
    query: AdminBookingQueryDto,
  ): Promise<PaginatedAdminBookingsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    this.logger.log(
      `Admin listing bookings: page=${page}, limit=${limit}, ` +
        `status=${query.status ?? 'all'}, sortBy=${query.sortBy ?? 'createdAt'}, ` +
        `order=${query.order ?? 'DESC'}`,
    );

    const { data, totalItems } =
      await this.adminBookingsRepository.findBookings(query);

    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    this.logger.log(
      `Admin booking list retrieved: totalItems=${totalItems}, totalPages=${totalPages}`,
    );

    const meta: AdminPaginationMetaDto = {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage,
      hasPreviousPage,
    };

    const items: AdminBookingListItemDto[] = data.map((b) => ({
      bookingId: b.id,
      bookingReference: b.bookingReference,
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      room: {
        id: b.room.id,
        name: b.room.name,
      },
      startDate: b.startDate,
      endDate: b.endDate,
      bookingType: b.bookingType,
      status: b.status,
      createdAt: b.createdAt,
    }));

    return { data: items, meta };
  }
}
