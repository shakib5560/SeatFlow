import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { BookingsRepository } from '../../bookings/repositories/bookings.repository';

/**
 * BookingProcessingService — no-op stub.
 *
 * In the room-based booking system all approvals are performed MANUALLY by the admin
 * via PATCH /admin/bookings/:id/approve (or /reject).
 * The background worker queue is retained for future use (e.g., expiring stale
 * PENDING bookings), but currently performs only an idempotency guard and exits.
 */
@Injectable()
export class BookingProcessingService {
  private readonly logger = new Logger(BookingProcessingService.name);

  constructor(private readonly bookingsRepository: BookingsRepository) {}

  /**
   * Called by the BullMQ worker for each dequeued job.
   * Currently performs only an idempotency guard so that jobs published
   * before the migration to manual approvals complete safely.
   */
  async processBooking(bookingId: string): Promise<void> {
    this.logger.log(
      `processBooking called: bookingId=${bookingId} (manual-approval mode — no auto-processing)`,
    );

    // Load booking to check current state.
    const booking = await this.bookingsRepository.findById(bookingId);
    if (!booking) {
      this.logger.warn(
        `Booking not found: bookingId=${bookingId}. Discarding job.`,
      );
      return;
    }

    // Skip already-terminal bookings (idempotency guard).
    if (
      booking.status === BookingStatus.CONFIRMED ||
      booking.status === BookingStatus.FAILED
    ) {
      this.logger.warn(
        `Booking ${booking.bookingReference} is already in terminal state (${booking.status}). Skipping.`,
      );
      return;
    }

    // In manual-approval mode, PENDING bookings are left for admin to review.
    this.logger.log(
      `Booking ${booking.bookingReference} is PENDING — awaiting admin approval. No automatic action taken.`,
    );
  }
}
