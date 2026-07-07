import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { EventsRepository } from '../repositories/events.repository';
import { RedisService } from '../../../infrastructure/redis';
import { createRedisMock } from '../../../../test/mocks/redis.mock';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Event } from '@prisma/client';

describe('EventsService', () => {
  let service: EventsService;
  let eventsRepository: DeepMockProxy<EventsRepository>;
  let redisService: DeepMockProxy<RedisService>;

  const mockEvent: Event = {
    id: '123',
    name: 'NestJS Workshop',
    description: 'Learn NestJS',
    eventDate: new Date('2026-07-08T12:00:00Z'),
    totalSeats: 100,
    remainingSeats: 100,
    price: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    eventsRepository = mockDeep<EventsRepository>();
    redisService = createRedisMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: EventsRepository,
          useValue: eventsRepository,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all events mapped to response dto', async () => {
      redisService.remember.mockImplementation(async (key, ttl, factory) => {
        return factory();
      });
      eventsRepository.findAllUpcoming.mockResolvedValue([mockEvent]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual(mockEvent.id);
      expect(result[0]).not.toHaveProperty('createdAt'); // Ensure mapping works
      expect(redisService.remember).toHaveBeenCalledWith('events:all', expect.any(Number), expect.any(Function));
    });
  });

  describe('findById', () => {
    it('should return a single event mapped to response dto', async () => {
      redisService.remember.mockImplementation(async (key, ttl, factory) => {
        return factory();
      });
      eventsRepository.findById.mockResolvedValue(mockEvent);

      const result = await service.findById('123');

      expect(result).toBeDefined();
      expect(result?.id).toEqual('123');
      expect(redisService.remember).toHaveBeenCalledWith('events:123', expect.any(Number), expect.any(Function));
    });

    it('should return null if event not found', async () => {
      redisService.remember.mockImplementation(async (key, ttl, factory) => {
        return factory();
      });
      eventsRepository.findById.mockResolvedValue(null);

      const result = await service.findById('999');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create an event and invalidate cache', async () => {
      const data = {
        name: 'New Event',
        eventDate: new Date(),
        totalSeats: 50,
        price: 10,
      };
      
      const createdEvent = { ...mockEvent, ...data, id: '456', remainingSeats: 50 };
      eventsRepository.create.mockResolvedValue(createdEvent);

      const result = await service.create(data);

      expect(eventsRepository.create).toHaveBeenCalledWith(data);
      expect(redisService.invalidate).toHaveBeenCalledWith('events:*');
      expect(result.id).toEqual('456');
    });
  });

  describe('update', () => {
    it('should update an event and invalidate cache', async () => {
      const data = { price: 20 };
      const updatedEvent = { ...mockEvent, ...data };
      eventsRepository.update.mockResolvedValue(updatedEvent);

      const result = await service.update('123', data);

      expect(eventsRepository.update).toHaveBeenCalledWith('123', data);
      expect(redisService.invalidate).toHaveBeenCalledWith('events:*');
      expect(result.price).toEqual(20);
    });
  });

  describe('delete', () => {
    it('should delete an event and invalidate cache', async () => {
      eventsRepository.delete.mockResolvedValue(mockEvent);

      const result = await service.delete('123');

      expect(eventsRepository.delete).toHaveBeenCalledWith('123');
      expect(redisService.invalidate).toHaveBeenCalledWith('events:*');
      expect(result.id).toEqual('123');
    });
  });
});
