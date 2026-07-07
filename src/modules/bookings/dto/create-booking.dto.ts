import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsInt, Min, MaxLength, MinLength, IsEmail, IsOptional } from 'class-validator';

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
    description: 'The ID of the event to book seats for (UUID). Automatically falls back to the first available event if not provided.',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201',
    required: false,
  })
  @IsUUID('4')
  @IsOptional()
  eventId?: string;

  @ApiProperty({
    description: 'Full name of the customer booking the seats',
    example: 'John Doe',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  customerName: string;

  @ApiProperty({
    description: 'Valid email address of the customer',
    example: 'john@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  customerEmail: string;

  @ApiProperty({
    description: 'Number of seats to reserve (minimum 1)',
    example: 2,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  seats: number;
}
