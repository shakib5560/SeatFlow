import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * Query parameters for the room availability endpoint.
 * If startDate and endDate are provided, the response includes
 * an availability check for that specific date range.
 */
export class RoomAvailabilityQueryDto {
  @ApiPropertyOptional({
    description: 'Start date of the desired booking period (ISO 8601, e.g. 2026-07-10)',
    example: '2026-07-10',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date of the desired booking period (ISO 8601, e.g. 2026-07-17)',
    example: '2026-07-17',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
