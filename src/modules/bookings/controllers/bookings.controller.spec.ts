import { Test, TestingModule } from '@nestjs/testing';
import { BookingsController } from './bookings.controller';
import { BookingsService } from '../services/bookings.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingType, BookingStatus } from '@prisma/client';
import { BookingResponseDto } from '../responses/booking-response.dto';
import { BookingItemDto } from '../responses/paginated-bookings.dto';

describe('BookingsController', () => {
  let controller: BookingsController;
  let bookingsService: DeepMockProxy<BookingsService>;

  beforeEach(async () => {
    bookingsService = mockDeep<BookingsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [{ provide: BookingsService, useValue: bookingsService }],
    }).compile();

    controller = module.get<BookingsController>(BookingsController);
  });

  describe('create', () => {
    it('should create a booking and return 202 status implicitly via decorator', async () => {
      const mockResponse = {
        bookingReference: 'BK-1',
        status: BookingStatus.PENDING,
      } as BookingResponseDto;

      bookingsService.create.mockResolvedValue(mockResponse);

      const dto = {
        roomId: 'room-123',
        requestId: 'req-456',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        bookingType: BookingType.DAILY,
        startDate: '2026-08-01',
        endDate: '2026-08-07',
      };
      const result = await controller.create(dto);

      expect(result.bookingReference).toBe('BK-1');
      expect(bookingsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('listBookings', () => {
    it('should return paginated bookings', async () => {
      const mockData: BookingItemDto[] = [
        { bookingReference: 'BK-1' } as BookingItemDto,
      ];

      bookingsService.listBookings.mockResolvedValue({
        data: mockData,
        meta: {
          totalItems: 1,
          totalPages: 1,
          page: 1,
          limit: 10,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

      const query = { page: 1, limit: 10 };
      const result = await controller.listBookings(query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
      expect(bookingsService.listBookings).toHaveBeenCalledWith(query);
    });
  });
});
