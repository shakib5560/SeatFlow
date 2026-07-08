import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

// ── Individual Room ──────────────────────────────────────────────────────────

export class RoomDto {
  @ApiProperty({ example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a501' })
  id: string;

  @ApiProperty({ example: 'A1' })
  name: string;

  @ApiPropertyOptional({ example: 'Standard meeting room — capacity 8' })
  description: string | null;
}

// ── Booked Date Range ────────────────────────────────────────────────────────

export class BookedRangeDto {
  @ApiProperty({ example: 'BK-20260710-000001' })
  bookingReference: string;

  @ApiProperty({ example: '2026-07-10T00:00:00.000Z' })
  startDate: Date;

  @ApiProperty({ example: '2026-07-17T00:00:00.000Z' })
  endDate: Date;

  @ApiProperty({ example: 'PENDING', enum: BookingStatus })
  status: BookingStatus;
}

// ── Room Availability (calendar view) ────────────────────────────────────────

export class RoomAvailabilityDto {
  @ApiProperty({ example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a501' })
  roomId: string;

  @ApiProperty({ example: 'A1' })
  roomName: string;

  @ApiProperty({ type: () => BookedRangeDto, isArray: true })
  bookedRanges: BookedRangeDto[];
}

// ── Availability Check Result ─────────────────────────────────────────────────

export class RoomAvailabilityCheckDto {
  @ApiProperty({ example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a501' })
  roomId: string;

  @ApiProperty({ example: 'A1' })
  roomName: string;

  @ApiProperty({ example: '2026-07-10T00:00:00.000Z' })
  requestedStartDate: Date;

  @ApiProperty({ example: '2026-07-17T00:00:00.000Z' })
  requestedEndDate: Date;

  @ApiProperty({ example: true })
  available: boolean;

  @ApiPropertyOptional({
    example: '2026-07-18T00:00:00.000Z',
    description: 'First available date after existing bookings end. Only present when available=false.',
  })
  nextAvailableDate?: Date;

  @ApiProperty({ example: 'Room A1 is available for the requested dates.' })
  message: string;

  @ApiProperty({ type: () => BookedRangeDto, isArray: true })
  conflictingBookings: BookedRangeDto[];
}
