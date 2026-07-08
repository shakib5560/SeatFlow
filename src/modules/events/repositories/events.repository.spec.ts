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
    it('should return all rooms sorted by name', async () => {
      const mockRooms = [{ id: '1', name: 'A1' }];
      prismaMock.room.findMany.mockResolvedValue(mockRooms as any);

      const result = await repository.findAllUpcoming();
      
      expect(result).toEqual(mockRooms);
      expect(prismaMock.room.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('should create a room', async () => {
      const data = {
        name: 'A1',
        description: 'Room A1 description',
      };
      
      prismaMock.room.create.mockResolvedValue({ ...data, id: '1' } as any);

      const result = await repository.create(data);

      expect(result.id).toEqual('1');
      expect(prismaMock.room.create).toHaveBeenCalledWith({
        data,
      });
    });
  });

  describe('findById', () => {
    it('should return a room', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: '1', name: 'A1' } as any);

      const result = await repository.findById('1');

      expect(result?.id).toEqual('1');
      expect(prismaMock.room.findUnique).toHaveBeenCalledWith({ where: { id: '1' } });
    });
  });

  describe('update', () => {
    it('should update a room', async () => {
      prismaMock.room.update.mockResolvedValue({ id: '1', name: 'A2' } as any);

      const result = await repository.update('1', { name: 'A2' });

      expect(result.name).toEqual('A2');
      expect(prismaMock.room.update).toHaveBeenCalledWith({ where: { id: '1' }, data: { name: 'A2' } });
    });
  });

  describe('delete', () => {
    it('should delete a room', async () => {
      prismaMock.room.delete.mockResolvedValue({ id: '1', name: 'A1' } as any);

      const result = await repository.delete('1');

      expect(result.id).toEqual('1');
      expect(prismaMock.room.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });
  });
});
