import { Test, TestingModule } from '@nestjs/testing';
import { EventsRepository } from './events.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { DeepMockProxy } from 'jest-mock-extended';
import { Room } from '@prisma/client';
import { createMockContext } from '../../../../test/mocks/prisma.mock';

describe('EventsRepository', () => {
  let repository: EventsRepository;
  let prismaMock: DeepMockProxy<PrismaService>;

  const mockRoom: Room = {
    id: '1',
    name: 'A1',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

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
    it('should return all rooms sorted by name', async () => {
      prismaMock.room.findMany.mockResolvedValue([mockRoom]);

      const result = await repository.findAllUpcoming();

      expect(result).toEqual([mockRoom]);
      expect(prismaMock.room.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });
  });
});
