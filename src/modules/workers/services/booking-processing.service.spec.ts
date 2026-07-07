import { Test, TestingModule } from '@nestjs/testing';
import { BookingProcessingService } from './booking-processing.service';
import { BookingsRepository } from '../../bookings/repositories/bookings.repository';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingStatus } from '@prisma/client';

describe('BookingProcessingService', () => {
  let service: BookingProcessingService;
  let bookingsRepository: DeepMockProxy<BookingsRepository>;

  beforeEach(async () => {
    bookingsRepository = mockDeep<BookingsRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingProcessingService,
        { provide: BookingsRepository, useValue: bookingsRepository },
      ],
    }).compile();

    service = module.get<BookingProcessingService>(BookingProcessingService);
  });

  describe('processBooking', () => {
    const bookingId = 'bk-123';

    it('should discard job if booking is not found', async () => {
      bookingsRepository.findById.mockResolvedValue(null);

      await service.processBooking(bookingId);

      expect(bookingsRepository.findById).toHaveBeenCalledWith(bookingId);
      expect(bookingsRepository.processBookingWithLock).not.toHaveBeenCalled();
    });

    it('should skip processing if booking is already CONFIRMED', async () => {
      bookingsRepository.findById.mockResolvedValue({
        id: bookingId,
        status: BookingStatus.CONFIRMED,
        bookingReference: 'BK-1',
        seats: 2,
        eventId: 'evt-1'
      } as any);

      await service.processBooking(bookingId);

      expect(bookingsRepository.processBookingWithLock).not.toHaveBeenCalled();
    });

    it('should skip processing if booking is already FAILED', async () => {
      bookingsRepository.findById.mockResolvedValue({
        id: bookingId,
        status: BookingStatus.FAILED,
        bookingReference: 'BK-1',
        seats: 2,
        eventId: 'evt-1'
      } as any);

      await service.processBooking(bookingId);

      expect(bookingsRepository.processBookingWithLock).not.toHaveBeenCalled();
    });

    it('should process booking with lock if PENDING', async () => {
      bookingsRepository.findById.mockResolvedValue({
        id: bookingId,
        status: BookingStatus.PENDING,
        bookingReference: 'BK-1',
        seats: 2,
        eventId: 'evt-1'
      } as any);

      bookingsRepository.processBookingWithLock.mockResolvedValue({
        status: BookingStatus.CONFIRMED,
        bookingReference: 'BK-1',
        failureReason: null
      } as any);

      await service.processBooking(bookingId);

      expect(bookingsRepository.processBookingWithLock).toHaveBeenCalledWith(bookingId, 'evt-1', 2);
    });

    it('should handle FAILED lock result', async () => {
      bookingsRepository.findById.mockResolvedValue({
        id: bookingId,
        status: BookingStatus.PENDING,
        bookingReference: 'BK-1',
        seats: 2,
        eventId: 'evt-1'
      } as any);

      bookingsRepository.processBookingWithLock.mockResolvedValue({
        status: BookingStatus.FAILED,
        bookingReference: 'BK-1',
        failureReason: 'SOLD_OUT'
      } as any);

      await service.processBooking(bookingId);

      expect(bookingsRepository.processBookingWithLock).toHaveBeenCalledWith(bookingId, 'evt-1', 2);
    });
  });
});
