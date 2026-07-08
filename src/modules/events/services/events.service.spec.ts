import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { EventsRepository } from '../repositories/events.repository';
import { RedisService } from '../../../infrastructure/redis';
import { createRedisMock } from '../../../../test/mocks/redis.mock';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Room } from '@prisma/client';

describe('EventsService', () => {
  let service: EventsService;
  let eventsRepository: DeepMockProxy<EventsRepository>;
  let redisService: DeepMockProxy<RedisService>;

  const mockRoom: Room = {
    id: '123',
    name: 'A1',
    description: 'Room A1 description',
    createdAt: new Date('2026-07-08T12:00:00Z'),
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
    it('should return all rooms mapped to response dto', async () => {
      redisService.remember.mockImplementation(async (key, ttl, factory) => {
        return factory();
      });
      eventsRepository.findAllUpcoming.mockResolvedValue([mockRoom]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual(mockRoom.id);
      expect(result[0].name).toEqual(mockRoom.name);
      expect(result[0]).not.toHaveProperty('createdAt'); // Ensure mapping works
      expect(redisService.remember).toHaveBeenCalledWith(
        'events:all',
        expect.any(Number),
        expect.any(Function),
      );
    });
  });
});
