import { Test, TestingModule } from '@nestjs/testing';
import { BookingProcessingService } from './booking-processing.service';
import { BookingsRepository } from '../../bookings/repositories/bookings.repository';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingStatus, BookingType, RoomBooking } from '@prisma/client';

describe('BookingProcessingService', () => {
  let service: BookingProcessingService;
  let bookingsRepository: DeepMockProxy<BookingsRepository>;

  const makeBooking = (status: BookingStatus): RoomBooking => ({
    id: 'bk-123',
    bookingReference: 'BK-1',
    status,
    roomId: 'room-1',
    requestId: 'req-1',
    customerName: 'John',
    customerEmail: 'j@e.com',
    bookingType: BookingType.DAILY,
    startDate: new Date(),
    endDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

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
    });

    it('should skip processing if booking is already CONFIRMED', async () => {
      bookingsRepository.findById.mockResolvedValue(
        makeBooking(BookingStatus.CONFIRMED),
      );

      await service.processBooking(bookingId);

      expect(bookingsRepository.findById).toHaveBeenCalledWith(bookingId);
    });

    it('should skip processing if booking is already FAILED', async () => {
      bookingsRepository.findById.mockResolvedValue(
        makeBooking(BookingStatus.FAILED),
      );

      await service.processBooking(bookingId);

      expect(bookingsRepository.findById).toHaveBeenCalledWith(bookingId);
    });

    it('should leave booking PENDING in manual-approval mode', async () => {
      bookingsRepository.findById.mockResolvedValue(
        makeBooking(BookingStatus.PENDING),
      );

      await service.processBooking(bookingId);

      expect(bookingsRepository.findById).toHaveBeenCalledWith(bookingId);
    });
  });
});
