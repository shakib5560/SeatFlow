import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsInt, Min, MaxLength, MinLength, IsEmail } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({
    description: 'A unique UUID v4 idempotency token to prevent duplicate requests',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a301',
  })
  @IsUUID('4')
  @IsNotEmpty()
  requestId: string;

  @ApiProperty({
    description: 'The ID of the event to book seats for (UUID)',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201',
  })
  @IsUUID('4')
  @IsNotEmpty()
  eventId: string;

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
