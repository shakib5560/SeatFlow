import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Event } from '@prisma/client';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch all events sorted by eventDate ASC (upcoming events first).
   */
  async findAllUpcoming(): Promise<Event[]> {
    return this.prisma.event.findMany({
      orderBy: {
        eventDate: 'asc',
      },
    });
  }

  /**
   * Create a new event.
   * remainingSeats is initialized to totalSeats.
   */
  async create(data: {
    name: string;
    description?: string;
    eventDate: Date;
    totalSeats: number;
    price: number;
  }): Promise<Event> {
    return this.prisma.event.create({
      data: {
        ...data,
        remainingSeats: data.totalSeats,
      },
    });
  }

  /**
   * Find an event by its ID.
   */
  async findById(id: string): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id },
    });
  }

  /**
   * Update event details.
   */
  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      eventDate?: Date;
      totalSeats?: number;
      remainingSeats?: number;
      price?: number;
    },
  ): Promise<Event> {
    return this.prisma.event.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete an event by ID.
   */
  async delete(id: string): Promise<Event> {
    return this.prisma.event.delete({
      where: { id },
    });
  }
}
