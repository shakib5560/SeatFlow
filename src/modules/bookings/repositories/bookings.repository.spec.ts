import { Test, TestingModule } from '@nestjs/testing';
import { BookingsRepository } from './bookings.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { DeepMockProxy } from 'jest-mock-extended';
import { createMockContext } from '../../../../test/mocks/prisma.mock';
import { BookingStatus } from '@prisma/client';

describe('BookingsRepository', () => {
  let repository: BookingsRepository;
  let prismaMock: DeepMockProxy<PrismaService>;

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
      const mockBooking = { id: '1', requestId: 'req-1' };
      prismaMock.booking.findUnique.mockResolvedValue(mockBooking as any);

      const result = await repository.findByRequestId('req-1');

      expect(result).toEqual(mockBooking);
      expect(prismaMock.booking.findUnique).toHaveBeenCalledWith({
        where: { requestId: 'req-1' },
      });
    });
  });

  describe('createPendingBooking', () => {
    it('should create booking with PENDING status', async () => {
      const data = {
        eventId: 'evt-1',
        bookingReference: 'BK-1',
        requestId: 'req-1',
        customerName: 'John',
        customerEmail: 'j@e.com',
        seats: 2,
      };

      prismaMock.booking.create.mockResolvedValue({ id: '1', ...data, status: BookingStatus.PENDING } as any);

      const result = await repository.createPendingBooking(data);

      expect(result.status).toEqual(BookingStatus.PENDING);
      expect(prismaMock.booking.create).toHaveBeenCalledWith({
        data: {
          ...data,
          status: BookingStatus.PENDING,
        },
      });
    });
  });

  describe('findAllPaginated', () => {
    it('should return paginated data and total items', async () => {
      const mockBookings = [{ id: '1' }];
      const totalItems = 1;
      
      prismaMock.$transaction.mockResolvedValue([mockBookings, totalItems] as any);

      const result = await repository.findAllPaginated({ page: 1, limit: 10 });

      expect(result.data).toEqual(mockBookings);
      expect(result.totalItems).toEqual(totalItems);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });
  });

  describe('failBooking', () => {
    it('should update booking to FAILED with reason', async () => {
      prismaMock.booking.update.mockResolvedValue({ id: '1', status: BookingStatus.FAILED, failureReason: 'SOLD_OUT' } as any);

      const result = await repository.failBooking('1', 'SOLD_OUT');

      expect(result.status).toEqual(BookingStatus.FAILED);
      expect(result.failureReason).toEqual('SOLD_OUT');
      expect(prismaMock.booking.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { status: BookingStatus.FAILED, failureReason: 'SOLD_OUT' },
      });
    });
  });
});
