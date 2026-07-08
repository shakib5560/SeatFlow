import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { RoomsRepository } from '../repositories/rooms.repository';
import {
  RoomDto,
  RoomAvailabilityDto,
  RoomAvailabilityCheckDto,
  BookedRangeDto,
} from '../responses/room.response.dto';
import { RoomAvailabilityQueryDto } from '../dto/room-availability-query.dto';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(private readonly roomsRepository: RoomsRepository) {}

  /**
   * List all 10 rooms.
   */
  async findAll(): Promise<RoomDto[]> {
    const rooms = await this.roomsRepository.findAll();
    return rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
    }));
  }

  /**
   * Return the booking calendar for a room — all PENDING + CONFIRMED date ranges.
   * If startDate + endDate are provided in the query, also checks availability.
   */
  async getRoomAvailability(
    roomId: string,
    query: RoomAvailabilityQueryDto,
  ): Promise<RoomAvailabilityDto | RoomAvailabilityCheckDto> {
    const room = await this.roomsRepository.findById(roomId);
    if (!room) {
      throw new NotFoundException(`Room with ID ${roomId} does not exist.`);
    }

    const { startDate: startStr, endDate: endStr } = query;

    // ── Calendar-only view (no date range provided) ───────────────────────────
    if (!startStr && !endStr) {
      const bookedRanges = await this.roomsRepository.findBookedRanges(roomId);
      const result: RoomAvailabilityDto = {
        roomId: room.id,
        roomName: room.name,
        bookedRanges: bookedRanges.map((b) => ({
          bookingReference: b.bookingReference,
          startDate: b.startDate,
          endDate: b.endDate,
          status: b.status,
        })),
      };
      return result;
    }

    // ── Date range availability check ─────────────────────────────────────────
    if (!startStr || !endStr) {
      throw new BadRequestException(
        'Both startDate and endDate must be provided together.',
      );
    }

    const startDate = this.parseDate(startStr);
    const endDate = this.parseDate(endStr);

    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate.');
    }

    this.logger.log(
      `Checking availability for room ${room.name}: ${startStr} → ${endStr}`,
    );

    const availability = await this.roomsRepository.checkAvailability(
      roomId,
      startDate,
      endDate,
    );

    const conflictDtos: BookedRangeDto[] = availability.available
      ? []
      : availability.conflictingBookings.map((b) => ({
          bookingReference: b.bookingReference,
          startDate: b.startDate,
          endDate: b.endDate,
          status: b.status,
        }));

    const result: RoomAvailabilityCheckDto = {
      roomId: room.id,
      roomName: room.name,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      available: availability.available,
      nextAvailableDate: availability.available
        ? undefined
        : availability.nextAvailableDate,
      message: availability.available
        ? `Room ${room.name} is available for the requested dates.`
        : `Room ${room.name} is not available from ${startStr} to ${endStr}. Next available date: ${this.formatDate(
            availability.nextAvailableDate,
          )}.`,
      conflictingBookings: conflictDtos,
    };

    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Parse an ISO date string (YYYY-MM-DD) to UTC midnight DateTime. */
  private parseDate(dateStr: string): Date {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(d.getTime())) {
      throw new BadRequestException(
        `Invalid date format: ${dateStr}. Use YYYY-MM-DD.`,
      );
    }
    return d;
  }

  /** Format a Date as YYYY-MM-DD for human-readable messages. */
  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
