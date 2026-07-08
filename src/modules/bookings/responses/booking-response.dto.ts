import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';

export class BookingResponseDto {
  @ApiProperty({
    description: 'The unique reference code of the booking',
    example: 'BK-20260708-000001',
  })
  bookingReference: string;

  @ApiProperty({
    description: 'The current status of the booking',
    example: 'PENDING',
    enum: BookingStatus,
  })
  status: BookingStatus;

  @ApiPropertyOptional({
    description:
      'Informational message — present when a duplicate request was detected',
    example: 'Duplicate request. Returning existing booking.',
  })
  message?: string;
}
