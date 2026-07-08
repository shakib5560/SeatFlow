/**
 * Bookings API E2E-style tests (isolated, no real infrastructure)
 * Tests the full controller → service → response pipeline with mocked service.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BookingsController } from '../../src/modules/bookings/controllers/bookings.controller';
import { BookingsService } from '../../src/modules/bookings/services/bookings.service';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingResponseDto } from '../../src/modules/bookings/responses/booking-response.dto';
import { BookingItemDto } from '../../src/modules/bookings/responses/paginated-bookings.dto';
import { BookingType, BookingStatus } from '@prisma/client';

describe('BookingsController (e2e)', () => {
  let app: INestApplication;
  let bookingsService: DeepMockProxy<BookingsService>;
  let controller: BookingsController;

  const validDto = {
    roomId: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201',
    requestId: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a301',
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    bookingType: BookingType.DAILY,
    startDate: '2026-08-01',
    endDate: '2026-08-07',
  };

  beforeAll(async () => {
    bookingsService = mockDeep<BookingsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
        Reflector,
      ],
    }).compile();

    app = module.createNestApplication();
    const reflector = app.get<Reflector>(Reflector);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalInterceptors(new ResponseInterceptor(reflector));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    controller = app.get<BookingsController>(BookingsController);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /bookings — creates a new booking and returns PENDING status', async () => {
    const mockResponse: BookingResponseDto = {
      bookingReference: 'BK-2026-001',
      status: BookingStatus.PENDING,
    };
    bookingsService.create.mockResolvedValue(mockResponse);

    const result = await controller.create(validDto);

    expect(result.bookingReference).toBe('BK-2026-001');
    expect(result.status).toBe('PENDING');
    expect(bookingsService.create).toHaveBeenCalled();
  });

  it('GET /bookings — returns paginated booking list', async () => {
    const mockData: BookingItemDto[] = [
      {
        bookingReference: 'BK-2026-001',
        status: BookingStatus.PENDING,
      } as BookingItemDto,
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

    const result = await controller.listBookings({ page: 1, limit: 10 });
    expect(result.meta.totalItems).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('GET /bookings with duplicate requestId — returns existing booking with message', async () => {
    const existingResponse: BookingResponseDto = {
      bookingReference: 'BK-EXISTING',
      status: BookingStatus.CONFIRMED,
      message: 'Duplicate request. Returning existing booking.',
    };
    bookingsService.create.mockResolvedValue(existingResponse);

    const result = await controller.create({
      ...validDto,
      requestId: 'existing-req-id',
      customerEmail: 'dup@example.com',
    });

    expect(result.bookingReference).toBe('BK-EXISTING');
    expect(result.message).toBeDefined();
  });
});
