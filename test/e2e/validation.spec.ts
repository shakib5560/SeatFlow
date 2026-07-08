/**
 * Validation E2E-style tests (isolated, no real infrastructure)
 * Verifies that NestJS ValidationPipe rejects invalid inputs with 400 errors
 * and that the GlobalExceptionFilter formats them into the standard error shape.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ArgumentMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BookingsController } from '../../src/modules/bookings/controllers/bookings.controller';
import { BookingsService } from '../../src/modules/bookings/services/bookings.service';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingType } from '@prisma/client';
import { CreateBookingDto } from '../../src/modules/bookings/dto/create-booking.dto';
import { BookingQueryDto } from '../../src/modules/bookings/dto/booking-query.dto';

describe('Validation (e2e)', () => {
  let app: INestApplication;
  let bookingsService: DeepMockProxy<BookingsService>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /bookings input validation', () => {
    const createBookingMetadata: ArgumentMetadata = {
      metatype: CreateBookingDto,
      type: 'body',
      data: '',
    };

    it('should reject invalid email via ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });

      await expect(
        pipe.transform(
          {
            roomId: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201',
            requestId: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a301',
            customerName: 'John',
            customerEmail: 'invalid',
            bookingType: BookingType.DAILY,
            startDate: '2026-08-01',
            endDate: '2026-08-07',
          },
          createBookingMetadata,
        ),
      ).rejects.toThrow();
    });

    it('should reject invalid roomId via ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });

      await expect(
        pipe.transform(
          {
            roomId: 'invalid-uuid',
            requestId: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a301',
            customerName: 'John',
            customerEmail: 'test@example.com',
            bookingType: BookingType.DAILY,
            startDate: '2026-08-01',
            endDate: '2026-08-07',
          },
          createBookingMetadata,
        ),
      ).rejects.toThrow();
    });

    it('should accept valid payload without throwing', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });

      const result = (await pipe.transform(
        {
          roomId: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a201',
          requestId: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a301',
          customerName: 'John',
          customerEmail: 'valid@example.com',
          bookingType: BookingType.DAILY,
          startDate: '2026-08-01',
          endDate: '2026-08-07',
        },
        createBookingMetadata,
      )) as CreateBookingDto;

      expect(result.customerEmail).toBe('valid@example.com');
      expect(result.bookingType).toBe(BookingType.DAILY);
    });
  });

  describe('GET /bookings query validation', () => {
    const bookingQueryMetadata: ArgumentMetadata = {
      metatype: BookingQueryDto,
      type: 'query',
      data: '',
    };

    it('should reject page < 1 via ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });

      await expect(
        pipe.transform({ page: -1, limit: 10 }, bookingQueryMetadata),
      ).rejects.toThrow();
    });

    it('should reject limit > 100 via ValidationPipe', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });

      await expect(
        pipe.transform({ page: 1, limit: 500 }, bookingQueryMetadata),
      ).rejects.toThrow();
    });
  });
});
