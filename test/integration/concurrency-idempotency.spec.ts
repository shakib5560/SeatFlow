/**
 * Concurrency & Idempotency Integration Tests
 *
 * These tests verify the core invariants of the booking system at the service
 * level, using mocked infrastructure so they run fast and without a real DB/Redis.
 *
 * For full end-to-end concurrency verification (true SELECT FOR UPDATE against
 * PostgreSQL), run the docker-compose stack and execute the test tagged
 * @group integration.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from '../../src/modules/bookings/services/bookings.service';
import { BookingsRepository } from '../../src/modules/bookings/repositories/bookings.repository';
import { BookingReferenceService } from '../../src/modules/bookings/services/booking-reference.service';
import { BookingProducer } from '../../src/modules/queue/producers/booking.producer';
import { RedisService } from '../../src/infrastructure/redis';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingStatus, Prisma } from '@prisma/client';

describe('Concurrency & Idempotency (Unit-level simulation)', () => {
  let bookingsService: BookingsService;
  let bookingsRepo: DeepMockProxy<BookingsRepository>;
  let referenceService: DeepMockProxy<BookingReferenceService>;
  let bookingProducer: DeepMockProxy<BookingProducer>;
  let redisService: DeepMockProxy<RedisService>;

  beforeEach(async () => {
    bookingsRepo = mockDeep<BookingsRepository>();
    referenceService = mockDeep<BookingReferenceService>();
    bookingProducer = mockDeep<BookingProducer>();
    redisService = mockDeep<RedisService>();
    redisService.invalidate.mockResolvedValue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: BookingsRepository, useValue: bookingsRepo },
        { provide: BookingReferenceService, useValue: referenceService },
        { provide: BookingProducer, useValue: bookingProducer },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    bookingsService = module.get<BookingsService>(BookingsService);
  });

  describe('Idempotency: duplicate requestId returns existing booking', () => {
    it('should return existing booking when requestId was already used', async () => {
      const existingBooking = {
        id: 'bk-1',
        requestId: 'req-dup',
        bookingReference: 'BK-REF-1',
        status: BookingStatus.PENDING,
        customerName: 'Alice',
        customerEmail: 'alice@test.com',
        seats: 1,
        eventId: 'evt-1',
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Pre-existing booking in DB
      bookingsRepo.findByRequestId.mockResolvedValue(existingBooking);
      bookingsRepo.findEventById.mockResolvedValue({
        id: 'evt-1',
        name: 'Event',
        remainingSeats: 10,
        totalSeats: 100,
        price: 100,
        description: null,
        eventDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await bookingsService.create({
        eventId: 'evt-1',
        requestId: 'req-dup',
        customerName: 'Alice',
        customerEmail: 'alice@test.com',
        seats: 1,
      });

      // No new booking should be created
      expect(bookingsRepo.createPendingBooking).not.toHaveBeenCalled();
      expect(result.bookingReference).toBe('BK-REF-1');
    });

    it('should handle race-condition idempotency via P2002 catch path', async () => {
      // Simulate: pre-check finds null (two parallel requests both pass the pre-check)
      // Then the DB throws P2002 unique constraint on requestId
      bookingsRepo.findByRequestId
        .mockResolvedValueOnce(null)     // pre-check misses (race)
        .mockResolvedValueOnce({         // recovery fetch
          id: 'bk-1',
          requestId: 'req-race',
          bookingReference: 'BK-RACE-1',
          status: BookingStatus.PENDING,
          customerName: 'Bob',
          customerEmail: 'bob@test.com',
          seats: 1,
          eventId: 'evt-1',
          failureReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      bookingsRepo.findEventById.mockResolvedValue({
        id: 'evt-1',
        name: 'Event',
        remainingSeats: 10,
        totalSeats: 100,
        price: 100,
        description: null,
        eventDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      referenceService.generateReference.mockResolvedValue('BK-RACE-NEW');

      // Simulate the P2002 unique-constraint error on DB insert
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`requestId`)',
        { code: 'P2002', clientVersion: '5.0.0', meta: { target: ['requestId'] } }
      );
      bookingsRepo.createPendingBooking.mockRejectedValue(p2002);

      const result = await bookingsService.create({
        eventId: 'evt-1',
        requestId: 'req-race',
        customerName: 'Bob',
        customerEmail: 'bob@test.com',
        seats: 1,
      });

      // The recovery path should return the existing booking, not throw
      expect(result.bookingReference).toBe('BK-RACE-1');
      expect(bookingProducer.enqueueBooking).not.toHaveBeenCalled();
    });
  });

  describe('Concurrency: simulates 10 concurrent booking requests', () => {
    it('should call createPendingBooking for each unique requestId', async () => {
      bookingsRepo.findByRequestId.mockResolvedValue(null);
      bookingsRepo.findEventById.mockResolvedValue({
        id: 'evt-1',
        name: 'Event',
        remainingSeats: 100,
        totalSeats: 100,
        price: 100,
        description: null,
        eventDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      let counter = 0;
      referenceService.generateReference.mockImplementation(async () => `BK-${++counter}`);
      bookingsRepo.createPendingBooking.mockImplementation(async (data) => ({
        id: `bk-${data.bookingReference}`,
        ...data,
        status: BookingStatus.PENDING,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      bookingProducer.enqueueBooking.mockResolvedValue('job-id');

      const requests = Array.from({ length: 10 }).map((_, i) =>
        bookingsService.create({
          eventId: 'evt-1',
          requestId: `req-${i}`,
          customerName: `User ${i}`,
          customerEmail: `user${i}@test.com`,
          seats: 1,
        })
      );

      const results = await Promise.all(requests);
      expect(results).toHaveLength(10);
      expect(bookingsRepo.createPendingBooking).toHaveBeenCalledTimes(10);
      expect(bookingProducer.enqueueBooking).toHaveBeenCalledTimes(10);
    });
  });
});
