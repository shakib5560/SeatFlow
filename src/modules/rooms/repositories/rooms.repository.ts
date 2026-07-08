import { Injectable } from '@nestjs/common';
import { BookingStatus, Room, RoomBooking } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type RoomConflict = {
  nextAvailableDate: Date;
  conflictingBookings: RoomBooking[];
};

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch all rooms ordered alphabetically by name.
   */
  async findAll(): Promise<Room[]> {
    return this.prisma.room.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * Find a room by its UUID.
   */
  async findById(id: string): Promise<Room | null> {
    return this.prisma.room.findUnique({ where: { id } });
  }

  /**
   * Find a room by its display name (e.g. "A1").
   */
  async findByName(name: string): Promise<Room | null> {
    return this.prisma.room.findUnique({ where: { name } });
  }

  /**
   * Return all PENDING + CONFIRMED bookings for a room, ordered by startDate ASC.
   * Used to render the room calendar view.
   */
  async findBookedRanges(roomId: string): Promise<RoomBooking[]> {
    return this.prisma.roomBooking.findMany({
      where: {
        roomId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  /**
   * Check whether a room is available for the given date range.
   *
   * Returns:
   *   - { available: true }
   *   - { available: false, nextAvailableDate, conflictingBookings }
   *
   * Overlap condition: existing.startDate <= requested.endDate  AND  existing.endDate >= requested.startDate
   */
  async checkAvailability(
    roomId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ available: true } | ({ available: false } & RoomConflict)> {
    const conflicts = await this.prisma.roomBooking.findMany({
      where: {
        roomId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      orderBy: { endDate: 'desc' },
    });

    if (conflicts.length === 0) {
      return { available: true };
    }

    // Latest end date among all conflicting bookings
    const latestEnd = conflicts[0].endDate;
    const nextAvailableDate = new Date(latestEnd);
    nextAvailableDate.setUTCDate(nextAvailableDate.getUTCDate() + 1);
    nextAvailableDate.setUTCHours(0, 0, 0, 0);

    return {
      available: false,
      nextAvailableDate,
      conflictingBookings: conflicts,
    };
  }
}
