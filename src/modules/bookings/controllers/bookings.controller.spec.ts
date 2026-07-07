import { Test, TestingModule } from '@nestjs/testing';
import { BookingsController } from './bookings.controller';
import { BookingsService } from '../services/bookings.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

describe('BookingsController', () => {
  let controller: BookingsController;
  let bookingsService: DeepMockProxy<BookingsService>;

  beforeEach(async () => {
    bookingsService = mockDeep<BookingsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
      ],
    }).compile();

    controller = module.get<BookingsController>(BookingsController);
  });

  describe('create', () => {
    it('should create a booking and return 202 status implicitly via decorator', async () => {
      bookingsService.create.mockResolvedValue({ bookingReference: 'BK-1', status: 'PENDING' } as any);
      
      const dto = { eventId: '1', requestId: '1', customerName: 'J', customerEmail: 'j@e.com', seats: 2 };
      const result = await controller.create(dto);
      
      expect(result.bookingReference).toBe('BK-1');
      expect(bookingsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('listBookings', () => {
    it('should return paginated bookings', async () => {
      bookingsService.listBookings.mockResolvedValue({
        data: [{ bookingReference: 'BK-1' } as any],
        meta: { totalItems: 1, totalPages: 1, page: 1, limit: 10, hasNextPage: false, hasPreviousPage: false }
      });
      
      const query = { page: 1, limit: 10 };
      const result = await controller.listBookings(query);
      
      expect(result.data).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
      expect(bookingsService.listBookings).toHaveBeenCalledWith(query);
    });
  });
});
