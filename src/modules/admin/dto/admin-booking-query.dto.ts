import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '@prisma/client';

export enum AdminBookingSortBy {
  CREATED_AT   = 'createdAt',
  CUSTOMER_NAME = 'customerName',
  STATUS       = 'status',
  START_DATE   = 'startDate',
}

export enum SortOrder {
  ASC  = 'ASC',
  DESC = 'DESC',
}

/**
 * AdminBookingQueryDto — query parameters for admin booking list endpoints.
 *
 * Supports pagination, search, sorting, and filtering.
 * All fields are optional — defaults are applied in the service layer.
 */
export class AdminBookingQueryDto {
  // ── Pagination ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Page number (1-indexed)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Results per page (max 100)', example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  // ── Filters ─────────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Filter by customer email (partial, case-insensitive)', example: 'john' })
  @IsOptional()
  @IsString()
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Filter by customer name (partial, case-insensitive)', example: 'Doe' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: 'Filter by room UUID', example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201' })
  @IsOptional()
  @IsUUID('4')
  roomId?: string;

  @ApiPropertyOptional({ description: 'Filter by booking reference (partial, case-insensitive)', example: 'BK-2026' })
  @IsOptional()
  @IsString()
  bookingReference?: string;

  @ApiPropertyOptional({ description: 'Filter by booking status', enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  // ── Sorting ─────────────────────────────────────────────────────────────────
  @ApiPropertyOptional({
    description: 'Field to sort results by',
    enum: AdminBookingSortBy,
    default: AdminBookingSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(AdminBookingSortBy)
  sortBy?: AdminBookingSortBy = AdminBookingSortBy.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;
}
