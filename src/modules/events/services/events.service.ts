import { Injectable, Logger } from '@nestjs/common';
import { EventsRepository } from '../repositories/events.repository';
import { RedisService, REDIS_TTL } from '../../../infrastructure/redis';
import { Event } from '@prisma/client';
import { EventResponseDto } from '../responses/event.response.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Retrieve all upcoming events sorted by eventDate ASC.
   * Maps entities to EventResponseDto to exclude internal fields.
   */
  async findAll(): Promise<EventResponseDto[]> {
    this.logger.log('Retrieving all upcoming events');
    try {
      const events = await this.redisService.remember<Event[]>(
        'events:all',
        REDIS_TTL.LONG,
        () => this.eventsRepository.findAllUpcoming(),
      );

      this.logger.log(`Successfully retrieved ${events.length} events from cache or database`);
      return events.map((event) => this.mapToResponseDto(event));
    } catch (error) {
      this.logger.error('Unexpected failure during event retrieval', error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Retrieve a single event by ID and map it to EventResponseDto.
   */
  async findById(id: string): Promise<EventResponseDto | null> {
    this.logger.log(`Retrieving event by ID: ${id}`);
    try {
      const event = await this.redisService.remember<Event | null>(
        `events:${id}`,
        REDIS_TTL.LONG,
        () => this.eventsRepository.findById(id),
      );

      if (!event) {
        this.logger.warn(`Event with ID ${id} not found`);
        return null;
      }

      return this.mapToResponseDto(event);
    } catch (error) {
      this.logger.error(`Failed to retrieve event ${id}`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Create a new event, clear cache namespaces.
   */
  async create(data: {
    name: string;
    description?: string;
    eventDate: Date;
    totalSeats: number;
    price: number;
  }): Promise<EventResponseDto> {
    this.logger.log(`Creating new event: ${data.name}`);
    try {
      const event = await this.eventsRepository.create(data);
      await this.redisService.invalidate('events:*');
      this.logger.log(`Successfully created event: ${event.name} (${event.id})`);
      return this.mapToResponseDto(event);
    } catch (error) {
      this.logger.error('Failed to create event', error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Update event details, invalidate stale cache entries.
   */
  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      eventDate?: Date;
      totalSeats?: number;
      price?: number;
    },
  ): Promise<EventResponseDto> {
    this.logger.log(`Updating event ID: ${id}`);
    try {
      const event = await this.eventsRepository.update(id, data);
      await this.redisService.invalidate('events:*');
      this.logger.log(`Successfully updated event ID: ${id}`);
      return this.mapToResponseDto(event);
    } catch (error) {
      this.logger.error(`Failed to update event ID: ${id}`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Delete an event and clear all caches.
   */
  async delete(id: string): Promise<EventResponseDto> {
    this.logger.log(`Deleting event ID: ${id}`);
    try {
      const event = await this.eventsRepository.delete(id);
      await this.redisService.invalidate('events:*');
      this.logger.log(`Successfully deleted event ID: ${id}`);
      return this.mapToResponseDto(event);
    } catch (error) {
      this.logger.error(`Failed to delete event ID: ${id}`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Maps internal database Event entity to public EventResponseDto.
   */
  private mapToResponseDto(event: Event): EventResponseDto {
    return {
      id: event.id,
      name: event.name,
      description: event.description,
      eventDate: event.eventDate,
      totalSeats: event.totalSeats,
      remainingSeats: event.remainingSeats,
      price: event.price,
    };
  }
}
