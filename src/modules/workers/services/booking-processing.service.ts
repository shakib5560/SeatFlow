import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { BookingsRepository } from '../../bookings/repositories/bookings.repository';
import { FailureReason } from '../constants/failure-reason.constants';

@Injectable()
export class BookingProcessingService {
  private readonly logger = new Logger(BookingProcessingService.name);

  constructor(private readonly bookingsRepository: BookingsRepository) {}

  /**
   * Core booking processing pipeline — concurrency-safe.
   *
   * Rules:
   *  - Always fetch fresh data from the DB; never trust the job payload.
   *  - Steps 1 & 2 run OUTSIDE the locked transaction to keep lock duration minimal.
   *  - Step 3 onwards runs INSIDE ONE transaction with SELECT FOR UPDATE on the event row.
   *  - Validation failures (SOLD_OUT, EVENT_NOT_FOUND) complete the job — no BullMQ retry.
   *  - Transient DB failures are re-thrown so BullMQ retries with exponential backoff.
   */
  async processBooking(bookingId: string): Promise<void> {
    this.logger.log(`Processing booking: bookingId=${bookingId}`);

    // ── Step 1: Load the booking (outside transaction — no lock needed yet) ───
    const booking = await this.bookingsRepository.findById(bookingId);
    if (!booking) {
      this.logger.error(`Booking not found: bookingId=${bookingId}. Discarding job.`);
      return; // non-retryable — nothing to update
    }

    this.logger.log(
      `Booking loaded: reference=${booking.bookingReference}, status=${booking.status}, seats=${booking.seats}`
    );

    // ── Step 2: Idempotency guard — skip already-terminal bookings ────────────
    if (
      booking.status === BookingStatus.CONFIRMED ||
      booking.status === BookingStatus.FAILED
    ) {
      this.logger.warn(
        `Booking ${booking.bookingReference} is already in terminal state (${booking.status}). Skipping to prevent duplicate processing.`
      );
      return;
    }

    // ── Step 3–5: Locked transaction — seat check, deduct, confirm/fail ───────
    this.logger.log(
      `Starting locked transaction for booking ${booking.bookingReference}: eventId=${booking.eventId}, seats=${booking.seats}`
    );

    const result = await this.bookingsRepository.processBookingWithLock(
      bookingId,
      booking.eventId,
      booking.seats,
    );

    // ── Step 6: Log the outcome ───────────────────────────────────────────────
    if (result.status === BookingStatus.CONFIRMED) {
      this.logger.log(
        `Transaction committed — Booking CONFIRMED: reference=${result.bookingReference}, seats=${booking.seats}, eventId=${booking.eventId}`
      );
    } else {
      this.logger.warn(
        `Transaction committed — Booking FAILED: reference=${result.bookingReference}, reason=${result.failureReason}`
      );
    }
  }
}
