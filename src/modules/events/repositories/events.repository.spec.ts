import { Test, TestingModule } from '@nestjs/testing';
import { EventsRepository } from './events.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { DeepMockProxy } from 'jest-mock-extended';
import { createMockContext } from '../../../../test/mocks/prisma.mock';

describe('EventsRepository', () => {
  let repository: EventsRepository;
  let prismaMock: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const mockContext = createMockContext();
    prismaMock = mockContext.prisma;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<EventsRepository>(EventsRepository);
  });

  describe('findAllUpcoming', () => {
    it('should return all upcoming events', async () => {
      const mockEvents = [{ id: '1', name: 'Event 1' }];
      prismaMock.event.findMany.mockResolvedValue(mockEvents as any);

      const result = await repository.findAllUpcoming();
      
      expect(result).toEqual(mockEvents);
      expect(prismaMock.event.findMany).toHaveBeenCalledWith({
        orderBy: { eventDate: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('should create an event with remainingSeats equal to totalSeats', async () => {
      const data = {
        name: 'Event',
        eventDate: new Date(),
        totalSeats: 100,
        price: 50,
      };
      
      prismaMock.event.create.mockResolvedValue({ ...data, remainingSeats: 100, id: '1' } as any);

      const result = await repository.create(data);

      expect(result.id).toEqual('1');
      expect(prismaMock.event.create).toHaveBeenCalledWith({
        data: {
          ...data,
          remainingSeats: 100,
        },
      });
    });
  });

  describe('findById', () => {
    it('should return an event', async () => {
      prismaMock.event.findUnique.mockResolvedValue({ id: '1' } as any);

      const result = await repository.findById('1');

      expect(result?.id).toEqual('1');
      expect(prismaMock.event.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
    });
  });

  describe('update', () => {
    it('should update an event', async () => {
      prismaMock.event.update.mockResolvedValue({ id: '1', price: 60 } as any);

      const result = await repository.update('1', { price: 60 });

      expect(result.price).toEqual(60);
      expect(prismaMock.event.update).toHaveBeenCalledWith({ where: { id: '1' }, data: { price: 60 } });
    });
  });

  describe('delete', () => {
    it('should delete an event', async () => {
      prismaMock.event.delete.mockResolvedValue({ id: '1' } as any);

      const result = await repository.delete('1');

      expect(result.id).toEqual('1');
      expect(prismaMock.event.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });
  });
});
