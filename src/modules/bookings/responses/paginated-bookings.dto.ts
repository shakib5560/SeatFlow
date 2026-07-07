import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

export class BookingEventDto {
  @ApiProperty({ example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201' })
  id: string;

  @ApiProperty({ example: 'NestJS Masterclass' })
  name: string;
}

export class BookingItemDto {
  @ApiProperty({ example: 'BK-20260708-000001' })
  bookingReference: string;

  @ApiProperty({ type: () => BookingEventDto })
  event: BookingEventDto;

  @ApiProperty({ example: 'John Doe' })
  customerName: string;

  @ApiProperty({ example: 'john@example.com' })
  customerEmail: string;

  @ApiProperty({ example: 2 })
  seats: number;

  @ApiProperty({ example: 'CONFIRMED', enum: BookingStatus })
  status: BookingStatus;

  @ApiProperty({ example: '2026-07-08T00:00:00.000Z' })
  createdAt: Date;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 125 })
  totalItems: number;

  @ApiProperty({ example: 13 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage: boolean;
}

export class PaginatedBookingsDto {
  @ApiProperty({ type: () => BookingItemDto, isArray: true })
  data: BookingItemDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
