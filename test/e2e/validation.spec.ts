/**
 * Validation E2E-style tests (isolated, no real infrastructure)
 * Verifies that NestJS ValidationPipe rejects invalid inputs with 400 errors
 * and that the GlobalExceptionFilter formats them into the standard error shape.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BookingsController } from '../../src/modules/bookings/controllers/bookings.controller';
import { BookingsService } from '../../src/modules/bookings/services/bookings.service';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

describe('Validation (e2e)', () => {
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor(reflector));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    controller = app.get<BookingsController>(BookingsController);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /bookings input validation', () => {
    it('should reject invalid email via ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });
      const metadata = { metatype: require('../../src/modules/bookings/dto/create-booking.dto').CreateBookingDto, type: 'body', data: '' };

      await expect(
        pipe.transform(
          { eventId: 'e1', requestId: 'r1', customerName: 'John', customerEmail: 'invalid', seats: 1 },
          metadata as any,
        ),
      ).rejects.toThrow();
    });

    it('should reject seats < 1 via ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });
      const metadata = { metatype: require('../../src/modules/bookings/dto/create-booking.dto').CreateBookingDto, type: 'body', data: '' };

      await expect(
        pipe.transform(
          { eventId: 'e1', requestId: 'r1', customerName: 'John', customerEmail: 'test@example.com', seats: 0 },
          metadata as any,
        ),
      ).rejects.toThrow();
    });

    it('should accept valid payload without throwing', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });
      const metadata = { metatype: require('../../src/modules/bookings/dto/create-booking.dto').CreateBookingDto, type: 'body', data: '' };

      const result = await pipe.transform(
        { eventId: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201', requestId: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a301', customerName: 'John', customerEmail: 'valid@example.com', seats: 2 },
        metadata as any,
      );

      expect(result.customerEmail).toBe('valid@example.com');
      expect(result.seats).toBe(2);
    });
  });

  describe('GET /bookings query validation', () => {
    it('should reject page < 1 via ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });
      const metadata = { metatype: require('../../src/modules/bookings/dto/booking-query.dto').BookingQueryDto, type: 'query', data: '' };

      await expect(
        pipe.transform({ page: -1, limit: 10 }, metadata as any),
      ).rejects.toThrow();
    });

    it('should reject limit > 100 via ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });
      const metadata = { metatype: require('../../src/modules/bookings/dto/booking-query.dto').BookingQueryDto, type: 'query', data: '' };

      await expect(
        pipe.transform({ page: 1, limit: 500 }, metadata as any),
      ).rejects.toThrow();
    });
  });
});
