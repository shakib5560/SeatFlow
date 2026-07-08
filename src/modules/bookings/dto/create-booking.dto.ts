import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsEmail, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { BookingType } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({
    description: 'A unique UUID v4 idempotency token to prevent duplicate requests. Automatically generated if not provided.',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a301',
    required: false,
  })
  @IsUUID('4')
  @IsOptional()
  requestId?: string;

  @ApiProperty({
    description: 'The ID of the room to book (UUID).',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a501',
  })
  @IsUUID('4')
  @IsNotEmpty()
  roomId: string;

  @ApiProperty({
    description: 'Full name of the customer booking the room',
    example: 'John Doe',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({
    description: 'Valid email address of the customer',
    example: 'john@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  customerEmail: string;

  @ApiProperty({
    description: 'Booking duration label: DAILY, WEEKLY, or MONTHLY',
    enum: BookingType,
    example: BookingType.DAILY,
  })
  @IsEnum(BookingType)
  @IsNotEmpty()
  bookingType: BookingType;

  @ApiProperty({
    description: 'Start date of the booking period (ISO 8601 YYYY-MM-DD)',
    example: '2026-07-10',
  })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({
    description: 'End date of the booking period (ISO 8601 YYYY-MM-DD, inclusive)',
    example: '2026-07-17',
  })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;
}
