import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Room } from '@prisma/client';

/**
 * EventsRepository — now wraps the Room model.
 *
 * The legacy `Event` model has been replaced by `Room` in the room-based
 * booking system. This repository provides a minimal compatibility layer so that
 * the EventsService (and its controller) continues to compile. It exposes
 * room data via the same method signatures previously used for events.
 */
@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch all rooms sorted by name ASC.
   */
  async findAllUpcoming(): Promise<Room[]> {
    return this.prisma.room.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
