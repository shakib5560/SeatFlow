import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * BookingApprovalDto — optional payload accepted on approve/reject endpoints.
 *
 * Neither field is required; they are stored as audit metadata if provided.
 */
export class BookingApprovalDto {
  @ApiPropertyOptional({
    description:
      'Optional human-readable reason for the approval or rejection decision.',
    example: 'Verified customer identity and confirmed seat availability.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Optional internal admin notes (not exposed to the customer).',
    example: 'VIP customer — priority handling applied.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
