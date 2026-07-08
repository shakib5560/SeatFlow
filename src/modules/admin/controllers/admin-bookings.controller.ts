import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AdminBookingsService } from '../services/admin-bookings.service';
import { AdminBookingQueryDto } from '../dto/admin-booking-query.dto';
import { BookingApprovalDto } from '../dto/booking-approval.dto';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import {
  AdminActionResultDto,
  AdminBookingDetailDto,
  PaginatedAdminBookingsDto,
} from '../responses/admin-booking.response.dto';

/**
 * AdminBookingsController — HTTP interface for admin booking operations.
 *
 * Routes:
 *   GET    /api/admin/bookings/pending        → list all PENDING bookings (paginated)
 *   GET    /api/admin/bookings/:bookingId     → full booking detail
 *   PATCH  /api/admin/bookings/:bookingId/approve → approve a pending booking
 *   PATCH  /api/admin/bookings/:bookingId/reject  → reject a pending booking
 *
 * Security note:
 *   @ApiBearerAuth() is declared so Swagger renders the auth lock icon.
 *   Add @UseGuards(AdminAuthGuard, AdminRoleGuard) here when auth is implemented.
 *
 * Controller rules (Clean Architecture):
 *   - No business logic here.
 *   - No Prisma imports here.
 *   - Delegates ALL work to AdminBookingsService.
 */
@ApiTags('Admin — Bookings')
@ApiBearerAuth()
@Controller('admin/bookings')
export class AdminBookingsController {
  private readonly logger = new Logger(AdminBookingsController.name);

  constructor(private readonly adminBookingsService: AdminBookingsService) {}

  // ── GET /admin/bookings/pending ─────────────────────────────────────────────

  /**
   * IMPORTANT: '/pending' must be declared BEFORE '/:bookingId' so that
   * NestJS route resolution does not accidentally match "pending" as a UUID
   * parameter for the detail endpoint.
   */
  @Get('pending')
  @ResponseMessage('Pending bookings retrieved successfully.')
  @ApiOperation({
    summary: 'List all pending bookings',
    description:
      'Returns a paginated, filterable, sortable list of bookings with status = PENDING. ' +
      'Supports filtering by customerEmail, customerName, eventId, and bookingReference.',
  })
  @ApiOkResponse({
    description: 'Paginated list of PENDING bookings.',
    type: PaginatedAdminBookingsDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  async listPendingBookings(
    @Query() query: AdminBookingQueryDto,
  ): Promise<PaginatedAdminBookingsDto> {
    this.logger.log(
      `Admin GET /pending | page=${query.page ?? 1}, limit=${query.limit ?? 10}, ` +
        `sortBy=${query.sortBy ?? 'createdAt'}, order=${query.order ?? 'DESC'}`,
    );
    return this.adminBookingsService.listPendingBookings(query);
  }

  // ── GET /admin/bookings ─────────────────────────────────────────────────────

  @Get()
  @ResponseMessage('All bookings retrieved successfully.')
  @ApiOperation({
    summary: 'List all bookings',
    description:
      'Returns a paginated, filterable, sortable list of all bookings (both pending and approved/failed). ' +
      'Supports filtering by status, customerEmail, customerName, eventId, and bookingReference.',
  })
  @ApiOkResponse({
    description: 'Paginated list of all bookings.',
    type: PaginatedAdminBookingsDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  async listAllBookings(
    @Query() query: AdminBookingQueryDto,
  ): Promise<PaginatedAdminBookingsDto> {
    this.logger.log(
      `Admin GET / | page=${query.page ?? 1}, limit=${query.limit ?? 10}, ` +
        `sortBy=${query.sortBy ?? 'createdAt'}, order=${query.order ?? 'DESC'}`,
    );
    return this.adminBookingsService.listAllBookings(query);
  }

  // ── GET /admin/bookings/:bookingId ──────────────────────────────────────────

  @Get(':bookingId')
  @ResponseMessage('Booking details retrieved successfully.')
  @ApiOperation({
    summary: 'Get full booking detail',
    description:
      'Returns complete booking information including customer details, event, status, ' +
      'failure reason, and timestamps. Used by admins to review a booking before acting.',
  })
  @ApiParam({
    name: 'bookingId',
    description: 'UUID of the booking to retrieve',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a499',
  })
  @ApiOkResponse({
    description: 'Full booking detail.',
    type: AdminBookingDetailDto,
  })
  @ApiBadRequestResponse({ description: 'bookingId is not a valid UUID.' })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  async getBookingById(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<AdminBookingDetailDto> {
    this.logger.log(`Admin GET /:bookingId | bookingId=${bookingId}`);
    return this.adminBookingsService.getBookingById(bookingId);
  }

  // ── PATCH /admin/bookings/:bookingId/approve ────────────────────────────────

  @Patch(':bookingId/approve')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Booking approved successfully.')
  @ApiOperation({
    summary: 'Approve a pending booking',
    description:
      'Approves a booking that is currently in PENDING status. ' +
      'Runs inside a single PostgreSQL transaction with a SELECT FOR UPDATE lock on the event row ' +
      'to prevent overbooking and double-approval races. ' +
      '\n\n**State transitions allowed:** PENDING → CONFIRMED or PENDING → FAILED (if sold out).' +
      '\n\nReturns 409 Conflict if the booking is already CONFIRMED or FAILED.',
  })
  @ApiParam({
    name: 'bookingId',
    description: 'UUID of the booking to approve',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a499',
  })
  @ApiOkResponse({
    description:
      'Booking approved. Returns updated booking reference and status.',
    type: AdminActionResultDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid bookingId or request body.' })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  @ApiConflictResponse({
    description:
      'Booking already processed (CONFIRMED/FAILED), or seat availability exhausted (SOLD_OUT).',
  })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  async approveBooking(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: BookingApprovalDto,
  ): Promise<AdminActionResultDto> {
    this.logger.log(`Admin PATCH /:bookingId/approve | bookingId=${bookingId}`);
    return this.adminBookingsService.approveBooking(bookingId, dto);
  }

  // ── PATCH /admin/bookings/:bookingId/reject ─────────────────────────────────

  @Patch(':bookingId/reject')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Booking rejected successfully.')
  @ApiOperation({
    summary: 'Reject a pending booking',
    description:
      'Rejects a booking that is currently in PENDING status. ' +
      'Sets status = FAILED with failureReason = ADMIN_REJECTED. ' +
      "Does NOT modify the event's remaining seat count. " +
      '\n\nReturns 409 Conflict if the booking is already CONFIRMED or FAILED.',
  })
  @ApiParam({
    name: 'bookingId',
    description: 'UUID of the booking to reject',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a499',
  })
  @ApiOkResponse({
    description:
      'Booking rejected. Returns updated booking reference and FAILED status.',
    type: AdminActionResultDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid bookingId or request body.' })
  @ApiNotFoundResponse({ description: 'Booking not found.' })
  @ApiConflictResponse({
    description:
      'Booking is not in PENDING state — already CONFIRMED or FAILED.',
  })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  async rejectBooking(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: BookingApprovalDto,
  ): Promise<AdminActionResultDto> {
    this.logger.log(`Admin PATCH /:bookingId/reject | bookingId=${bookingId}`);
    return this.adminBookingsService.rejectBooking(bookingId, dto);
  }
}
