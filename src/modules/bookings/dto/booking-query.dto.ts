import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsEmail, IsEnum, IsUUID, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '@prisma/client';

export enum BookingSortBy {
  CREATED_AT = 'createdAt',
  EVENT_DATE = 'eventDate',
  CUSTOMER_NAME = 'customerName',
  STATUS = 'status',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class BookingQueryDto {
  // ── Pagination ────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  // ── Filters ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Filter by booking status', enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ description: 'Filter by event ID (UUID)', example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201' })
  @IsOptional()
  @IsUUID('4')
  eventId?: string;

  @ApiPropertyOptional({ description: 'Filter by customer email (partial, case-insensitive)', example: 'john' })
  @IsOptional()
  @IsString()
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Filter by booking reference (partial, case-insensitive)', example: 'BK-2026' })
  @IsOptional()
  @IsString()
  bookingReference?: string;

  // ── Sorting ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: BookingSortBy,
    default: BookingSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(BookingSortBy)
  sortBy?: BookingSortBy = BookingSortBy.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;
}
