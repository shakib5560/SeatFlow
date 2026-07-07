import { ApiProperty } from '@nestjs/swagger';

export class EventResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the event (UUID)',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201',
  })
  id: string;

  @ApiProperty({
    description: 'The name of the event',
    example: 'NestJS Masterclass',
  })
  name: string;

  @ApiProperty({
    description: 'Optional description of the event',
    example: 'Advanced NestJS Workshop',
    required: false,
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'The scheduled date and time of the event',
    example: '2026-08-07T18:30:00.000Z',
  })
  eventDate: Date;

  @ApiProperty({
    description: 'Total number of seats available for the event',
    example: 100,
  })
  totalSeats: number;

  @ApiProperty({
    description: 'Remaining number of seats available for booking',
    example: 100,
  })
  remainingSeats: number;

  @ApiProperty({
    description: 'Price per ticket/seat',
    example: 1200.0,
  })
  price: number;
}
