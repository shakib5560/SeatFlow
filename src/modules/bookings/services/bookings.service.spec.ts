import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { BookingsRepository } from '../repositories/bookings.repository';
import { BookingReferenceService } from './booking-reference.service';
import { RoomsRepository } from '../../rooms/repositories/rooms.repository';
import { RedisService } from '../../../infrastructure/redis';
import { createRedisMock } from '../../../../test/mocks/redis.mock';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Prisma, BookingType } from '@prisma/client';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingsRepository: DeepMockProxy<BookingsRepository>;
  let roomsRepository: DeepMockProxy<RoomsRepository>;
  let bookingReferenceService: DeepMockProxy<BookingReferenceService>;
  let redisService: DeepMockProxy<RedisService>;

  beforeEach(async () => {
    bookingsRepository = mockDeep<BookingsRepository>();
    roomsRepository = mockDeep<RoomsRepository>();
    bookingReferenceService = mockDeep<BookingReferenceService>();
    redisService = createRedisMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: BookingsRepository, useValue: bookingsRepository },
        { provide: RoomsRepository, useValue: roomsRepository },
        { provide: BookingReferenceService, useValue: bookingReferenceService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  describe('create', () => {
    const createData = {
      roomId: 'room-123',
      requestId: 'req-456',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      bookingType: BookingType.DAILY,
      startDate: '2026-08-01',
      endDate: '2026-08-07',
    };

    it('should return existing booking if pre-check finds duplicate requestId', async () => {
      bookingsRepository.findByRequestId.mockResolvedValue({
        id: 'bk-123',
        bookingReference: 'BK-REF-1',
        status: BookingStatus.PENDING,
        roomId: 'room-123',
        requestId: 'req-456',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        bookingType: BookingType.DAILY,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-07T00:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.create(createData);

      expect(result.bookingReference).toEqual('BK-REF-1');
      expect(result.message).toContain('Duplicate request');
      expect(roomsRepository.findById).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if room does not exist', async () => {
      bookingsRepository.findByRequestId.mockResolvedValue(null);
      roomsRepository.findById.mockResolvedValue(null);

      await expect(service.create(createData)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if endDate is before startDate', async () => {
      bookingsRepository.findByRequestId.mockResolvedValue(null);
      roomsRepository.findById.mockResolvedValue({ id: 'room-123', name: 'A1' } as any);

      const invalidData = {
        ...createData,
        startDate: '2026-08-07',
        endDate: '2026-08-01',
      };

      await expect(service.create(invalidData)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if room is not available', async () => {
      bookingsRepository.findByRequestId.mockResolvedValue(null);
      roomsRepository.findById.mockResolvedValue({ id: 'room-123', name: 'A1' } as any);
      roomsRepository.checkAvailability.mockResolvedValue({
        available: false,
        nextAvailableDate: new Date('2026-08-08T00:00:00.000Z'),
        conflictingBookings: [],
      });

      await expect(service.create(createData)).rejects.toThrow(ConflictException);
    });

    it('should recover gracefully on P2002 unique constraint violation', async () => {
      bookingsRepository.findByRequestId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'bk-123',
          bookingReference: 'BK-WINNER',
          status: BookingStatus.PENDING,
          roomId: 'room-123',
          requestId: 'req-456',
          customerName: 'John Doe',
          customerEmail: 'john@example.com',
          bookingType: BookingType.DAILY,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-07T00:00:00.000Z'),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
      roomsRepository.findById.mockResolvedValue({ id: 'room-123', name: 'A1' } as any);
      roomsRepository.checkAvailability.mockResolvedValue({ available: true });
      bookingReferenceService.generateReference.mockResolvedValue('BK-NEW');

      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.0.0',
      });
      bookingsRepository.createPendingBooking.mockRejectedValue(prismaError);

      const result = await service.create(createData);

      expect(result.bookingReference).toEqual('BK-WINNER');
      expect(result.message).toContain('Duplicate request');
    });

    it('should create booking and invalidate cache for new request', async () => {
      bookingsRepository.findByRequestId.mockResolvedValue(null);
      roomsRepository.findById.mockResolvedValue({ id: 'room-123', name: 'A1' } as any);
      roomsRepository.checkAvailability.mockResolvedValue({ available: true });
      bookingReferenceService.generateReference.mockResolvedValue('BK-NEW');
      
      const newBooking = {
        id: 'bk-new-id',
        bookingReference: 'BK-NEW',
        status: BookingStatus.PENDING,
        roomId: 'room-123',
        requestId: 'req-456',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        bookingType: BookingType.DAILY,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-07T00:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      bookingsRepository.createPendingBooking.mockResolvedValue(newBooking as any);

      const result = await service.create(createData);

      expect(result.bookingReference).toEqual('BK-NEW');
      expect(redisService.invalidate).toHaveBeenCalledWith('bookings:user:john@example.com*');
      expect(redisService.invalidate).toHaveBeenCalledWith('bookings:room:room-123*');
    });
  });

  describe('listBookings', () => {
    it('should return paginated data', async () => {
      bookingsRepository.findAllPaginated.mockResolvedValue({
        data: [
          {
            bookingReference: 'BK-1',
            customerName: 'John',
            customerEmail: 'j@e.com',
            bookingType: BookingType.DAILY,
            startDate: new Date(),
            endDate: new Date(),
            status: BookingStatus.CONFIRMED,
            createdAt: new Date(),
            room: { id: 'room-1', name: 'A1' },
          } as any
        ],
        totalItems: 1
      });

      const result = await service.listBookings({ page: 1, limit: 10 });

      expect(result.meta.totalItems).toEqual(1);
      expect(result.meta.totalPages).toEqual(1);
      expect(result.data).toHaveLength(1);
    });
  });
});
