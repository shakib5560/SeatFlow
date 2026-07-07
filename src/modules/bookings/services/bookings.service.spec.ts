import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { BookingsRepository } from '../repositories/bookings.repository';
import { BookingReferenceService } from './booking-reference.service';
import { BookingProducer } from '../../queue/producers/booking.producer';
import { RedisService } from '../../../infrastructure/redis';
import { createRedisMock } from '../../../../test/mocks/redis.mock';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingsRepository: DeepMockProxy<BookingsRepository>;
  let bookingReferenceService: DeepMockProxy<BookingReferenceService>;
  let bookingProducer: DeepMockProxy<BookingProducer>;
  let redisService: DeepMockProxy<RedisService>;

  beforeEach(async () => {
    bookingsRepository = mockDeep<BookingsRepository>();
    bookingReferenceService = mockDeep<BookingReferenceService>();
    bookingProducer = mockDeep<BookingProducer>();
    redisService = createRedisMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: BookingsRepository, useValue: bookingsRepository },
        { provide: BookingReferenceService, useValue: bookingReferenceService },
        { provide: BookingProducer, useValue: bookingProducer },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  describe('create', () => {
    const createData = {
      eventId: 'evt-123',
      requestId: 'req-456',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      seats: 2,
    };

    it('should return existing booking if pre-check finds duplicate requestId', async () => {
      bookingsRepository.findByRequestId.mockResolvedValue({
        id: 'bk-123',
        bookingReference: 'BK-REF-1',
        status: BookingStatus.PENDING,
        eventId: 'evt-123',
        requestId: 'req-456',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        seats: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(createData);

      expect(result.bookingReference).toEqual('BK-REF-1');
      expect(result.message).toContain('Duplicate request');
      expect(bookingsRepository.findEventById).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if event does not exist', async () => {
      bookingsRepository.findByRequestId.mockResolvedValue(null);
      bookingsRepository.findEventById.mockResolvedValue(null);

      await expect(service.create(createData)).rejects.toThrow(NotFoundException);
    });

    it('should recover gracefully on P2002 unique constraint violation', async () => {
      bookingsRepository.findByRequestId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'bk-123',
          bookingReference: 'BK-WINNER',
          status: BookingStatus.PENDING,
          eventId: 'evt-123',
          requestId: 'req-456',
          customerName: 'John Doe',
          customerEmail: 'john@example.com',
          seats: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      bookingsRepository.findEventById.mockResolvedValue({ id: 'evt-123' } as any);
      bookingReferenceService.generateReference.mockResolvedValue('BK-NEW');

      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.0.0',
      });
      bookingsRepository.createPendingBooking.mockRejectedValue(prismaError);

      const result = await service.create(createData);

      expect(result.bookingReference).toEqual('BK-WINNER');
      expect(result.message).toContain('Duplicate request');
      expect(bookingProducer.enqueueBooking).not.toHaveBeenCalled();
    });

    it('should create booking, enqueue job, and invalidate cache for new request', async () => {
      bookingsRepository.findByRequestId.mockResolvedValue(null);
      bookingsRepository.findEventById.mockResolvedValue({ id: 'evt-123' } as any);
      bookingReferenceService.generateReference.mockResolvedValue('BK-NEW');
      
      const newBooking = {
        id: 'bk-new-id',
        bookingReference: 'BK-NEW',
        status: BookingStatus.PENDING,
        eventId: 'evt-123',
        requestId: 'req-456',
        customerName: 'John',
        customerEmail: 'john@example.com',
        seats: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      bookingsRepository.createPendingBooking.mockResolvedValue(newBooking);
      bookingProducer.enqueueBooking.mockResolvedValue({} as any);

      const result = await service.create(createData);

      expect(result.bookingReference).toEqual('BK-NEW');
      expect(bookingProducer.enqueueBooking).toHaveBeenCalledWith('bk-new-id');
      expect(redisService.invalidate).toHaveBeenCalledWith('bookings:user:john@example.com*');
      expect(redisService.invalidate).toHaveBeenCalledWith('bookings:event:evt-123*');
    });

    it('should throw ServiceUnavailableException if queue fails', async () => {
      bookingsRepository.findByRequestId.mockResolvedValue(null);
      bookingsRepository.findEventById.mockResolvedValue({ id: 'evt-123' } as any);
      bookingReferenceService.generateReference.mockResolvedValue('BK-NEW');
      bookingsRepository.createPendingBooking.mockResolvedValue({ id: 'bk-new-id' } as any);
      
      bookingProducer.enqueueBooking.mockRejectedValue(new Error('Redis down'));

      await expect(service.create(createData)).rejects.toThrow(ServiceUnavailableException);
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
            seats: 2,
            status: BookingStatus.CONFIRMED,
            createdAt: new Date(),
            event: { id: 'evt-1', name: 'Event' },
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
