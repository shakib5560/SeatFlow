import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

// ── Nested DTOs ──────────────────────────────────────────────────────────────

export class AdminBookingEventDto {
  @ApiProperty({ example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201' })
  id: string;

  @ApiProperty({ example: 'NestJS Masterclass' })
  name: string;
}

// ── List Item (used in paginated responses) ──────────────────────────────────

export class AdminBookingListItemDto {
  @ApiProperty({ example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a499' })
  bookingId: string;

  @ApiProperty({ example: 'BK-20260708-000015' })
  bookingReference: string;

  @ApiProperty({ example: 'John Doe' })
  customerName: string;

  @ApiProperty({ example: 'john@example.com' })
  customerEmail: string;

  @ApiProperty({ type: () => AdminBookingEventDto })
  event: AdminBookingEventDto;

  @ApiProperty({ example: 2 })
  requestedSeats: number;

  @ApiProperty({ example: 'PENDING', enum: BookingStatus })
  status: BookingStatus;

  @ApiProperty({ example: '2026-07-08T00:00:00.000Z' })
  createdAt: Date;
}

// ── Pagination Meta ──────────────────────────────────────────────────────────

export class AdminPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 42 })
  totalItems: number;

  @ApiProperty({ example: 5 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage: boolean;
}

// ── Paginated List Response ──────────────────────────────────────────────────

export class PaginatedAdminBookingsDto {
  @ApiProperty({ type: () => AdminBookingListItemDto, isArray: true })
  data: AdminBookingListItemDto[];

  @ApiProperty({ type: () => AdminPaginationMetaDto })
  meta: AdminPaginationMetaDto;
}

// ── Full Booking Detail Response (used in GET /:bookingId) ───────────────────

export class AdminBookingDetailDto {
  @ApiProperty({ example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a499' })
  bookingId: string;

  @ApiProperty({ example: 'BK-20260708-000015' })
  bookingReference: string;

  @ApiProperty({ example: 'John Doe' })
  customerName: string;

  @ApiProperty({ example: 'john@example.com' })
  customerEmail: string;

  @ApiProperty({ type: () => AdminBookingEventDto })
  event: AdminBookingEventDto;

  @ApiProperty({ example: 2 })
  requestedSeats: number;

  @ApiProperty({ example: 'PENDING', enum: BookingStatus })
  status: BookingStatus;

  @ApiPropertyOptional({ example: 'SOLD_OUT', nullable: true })
  failureReason: string | null;

  @ApiProperty({ example: '2026-07-08T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-07-08T01:00:00.000Z' })
  updatedAt: Date;
}

// ── Approval / Rejection Action Response ────────────────────────────────────

export class AdminActionResultDto {
  @ApiProperty({ example: 'BK-20260708-000015' })
  bookingReference: string;

  @ApiProperty({ example: 'CONFIRMED', enum: BookingStatus })
  status: BookingStatus;

  @ApiPropertyOptional({ example: 'ADMIN_REJECTED', nullable: true })
  failureReason: string | null;

  @ApiProperty({ example: '2026-07-08T01:00:00.000Z' })
  updatedAt: Date;
}
