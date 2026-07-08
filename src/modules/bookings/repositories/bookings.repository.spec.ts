import { Test, TestingModule } from '@nestjs/testing';
import { BookingsRepository } from './bookings.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { DeepMockProxy } from 'jest-mock-extended';
import { createMockContext } from '../../../../test/mocks/prisma.mock';
import { BookingStatus, BookingType, RoomBooking } from '@prisma/client';

describe('BookingsRepository', () => {
  let repository: BookingsRepository;
  let prismaMock: DeepMockProxy<PrismaService>;

  const mockBooking: RoomBooking = {
    id: '1',
    requestId: 'req-1',
    bookingReference: 'BK-1',
    customerName: 'John',
    customerEmail: 'j@e.com',
    bookingType: BookingType.DAILY,
    roomId: 'room-123',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-08-07T00:00:00.000Z'),
    status: BookingStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockContext = createMockContext();
    prismaMock = mockContext.prisma;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<BookingsRepository>(BookingsRepository);
  });

  describe('findByRequestId', () => {
    it('should find booking by request id', async () => {
      prismaMock.roomBooking.findUnique.mockResolvedValue(mockBooking);

      const result = await repository.findByRequestId('req-1');

      expect(result).toEqual(mockBooking);
      expect(prismaMock.roomBooking.findUnique).toHaveBeenCalledWith({
        where: { requestId: 'req-1' },
        include: { room: true },
      });
    });
  });

  describe('createPendingBooking', () => {
    it('should create booking with PENDING status', async () => {
      const data = {
        roomId: 'room-123',
        bookingReference: 'BK-1',
        requestId: 'req-1',
        customerName: 'John',
        customerEmail: 'j@e.com',
        bookingType: BookingType.DAILY,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-07T00:00:00.000Z'),
      };

      prismaMock.roomBooking.create.mockResolvedValue({
        id: '1',
        ...data,
        status: BookingStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await repository.createPendingBooking(data);

      expect(result.status).toEqual(BookingStatus.PENDING);
      expect(prismaMock.roomBooking.create).toHaveBeenCalledWith({
        data: {
          ...data,
          status: BookingStatus.PENDING,
        },
        include: { room: true },
      });
    });
  });

  describe('findAllPaginated', () => {
    it('should return paginated data and total items', async () => {
      prismaMock.roomBooking.findMany.mockResolvedValue([mockBooking]);
      prismaMock.roomBooking.count.mockResolvedValue(1);

      const result = await repository.findAllPaginated({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.totalItems).toEqual(1);
      expect(prismaMock.roomBooking.findMany).toHaveBeenCalled();
      expect(prismaMock.roomBooking.count).toHaveBeenCalled();
    });
  });
});
