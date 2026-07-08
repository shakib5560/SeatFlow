import { Injectable, Logger } from '@nestjs/common';
import { EventsRepository } from '../repositories/events.repository';
import { RedisService, REDIS_TTL } from '../../../infrastructure/redis';
import { Room } from '@prisma/client';
import { EventResponseDto } from '../responses/event.response.dto';

/**
 * EventsService — now exposes room data via the legacy events interface.
 *
 * The Event model has been retired in favour of Room. This service remains
 * in place for the /events endpoint (still useful for listing available rooms)
 * and maps Room entities to EventResponseDto to avoid breaking API consumers.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Retrieve all rooms (replacing the old "upcoming events" list).
   * Maps entities to EventResponseDto to preserve the existing API contract.
   */
  async findAll(): Promise<EventResponseDto[]> {
    this.logger.log('Retrieving all rooms (events endpoint)');
    try {
      const rooms = await this.redisService.remember<Room[]>(
        'events:all',
        REDIS_TTL.LONG,
        () => this.eventsRepository.findAllUpcoming(),
      );

      this.logger.log(
        `Successfully retrieved ${rooms.length} rooms from cache or database`,
      );
      return rooms.map((room) => this.mapToResponseDto(room));
    } catch (error) {
      this.logger.error(
        'Unexpected failure during room retrieval',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  /**
   * Maps a Room entity to the EventResponseDto (compatibility shim).
   * Rooms don't have eventDate / totalSeats / price — those fields are omitted / zeroed.
   */
  private mapToResponseDto(room: Room): EventResponseDto {
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      // Rooms don't have event-style scheduling fields; provide sensible defaults.
      eventDate: room.createdAt,
      totalSeats: 0,
      remainingSeats: 0,
      price: 0,
    };
  }
}
