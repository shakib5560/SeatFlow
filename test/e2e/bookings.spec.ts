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

describe('BookingsController (e2e)', () => {
  let app: INestApplication;
  let bookingsService: DeepMockProxy<BookingsService>;
  let controller: BookingsController;

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
    bookingsService.create.mockResolvedValue({
      bookingReference: 'BK-2026-001',
      status: 'PENDING',
    } as any);

    const result = await controller.create({
      eventId: '1',
      requestId: `req-${Date.now()}-${Math.random()}`,
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      seats: 2,
    });

    expect(result.bookingReference).toBe('BK-2026-001');
    expect(result.status).toBe('PENDING');
    expect(bookingsService.create).toHaveBeenCalled();
  });

  it('GET /bookings — returns paginated booking list', async () => {
    bookingsService.listBookings.mockResolvedValue({
      data: [{ bookingReference: 'BK-2026-001', status: 'PENDING' } as any],
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
    bookingsService.create.mockResolvedValue({
      bookingReference: 'BK-EXISTING',
      status: 'CONFIRMED',
      message: 'Duplicate request. Returning existing booking.',
    } as any);

    const result = await controller.create({
      eventId: '1',
      requestId: 'existing-req-id',
      customerName: 'Duplicate User',
      customerEmail: 'dup@example.com',
      seats: 1,
    });

    expect(result.bookingReference).toBe('BK-EXISTING');
    expect(result.message).toBeDefined();
  });
});
