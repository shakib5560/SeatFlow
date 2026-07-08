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
      expect(redisService.remember).toHaveBeenCalledWith('events:all', expect.any(Number), expect.any(Function));
    });
  });

  describe('findById', () => {
    it('should return a single room mapped to response dto', async () => {
      redisService.remember.mockImplementation(async (key, ttl, factory) => {
        return factory();
      });
      eventsRepository.findById.mockResolvedValue(mockRoom);

      const result = await service.findById('123');

      expect(result).toBeDefined();
      expect(result?.id).toEqual('123');
      expect(redisService.remember).toHaveBeenCalledWith('events:123', expect.any(Number), expect.any(Function));
    });

    it('should return null if room not found', async () => {
      redisService.remember.mockImplementation(async (key, ttl, factory) => {
        return factory();
      });
      eventsRepository.findById.mockResolvedValue(null);

      const result = await service.findById('999');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a room and invalidate cache', async () => {
      const data = {
        name: 'New Room',
        description: 'New Description',
      };
      
      const createdRoom = { ...mockRoom, ...data, id: '456' };
      eventsRepository.create.mockResolvedValue(createdRoom);

      const result = await service.create(data);

      expect(eventsRepository.create).toHaveBeenCalledWith(data);
      expect(redisService.invalidate).toHaveBeenCalledWith('events:*');
      expect(result.id).toEqual('456');
    });
  });

  describe('update', () => {
    it('should update a room and invalidate cache', async () => {
      const data = { name: 'Updated Name' };
      const updatedRoom = { ...mockRoom, ...data };
      eventsRepository.update.mockResolvedValue(updatedRoom);

      const result = await service.update('123', data);

      expect(eventsRepository.update).toHaveBeenCalledWith('123', data);
      expect(redisService.invalidate).toHaveBeenCalledWith('events:*');
      expect(result.name).toEqual('Updated Name');
    });
  });

  describe('delete', () => {
    it('should delete a room and invalidate cache', async () => {
      eventsRepository.delete.mockResolvedValue(mockRoom);

      const result = await service.delete('123');

      expect(eventsRepository.delete).toHaveBeenCalledWith('123');
      expect(redisService.invalidate).toHaveBeenCalledWith('events:*');
      expect(result.id).toEqual('123');
    });
  });
});
