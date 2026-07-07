import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { Job } from 'bullmq';
import { BOOKING_QUEUE_NAME, BOOKING_JOB_NAME } from '../queue/queue.constants';
import { JobPayload } from '../../common/interfaces';
import { BookingProcessingService } from './services/booking-processing.service';
import { BookingsRepository } from '../bookings/repositories/bookings.repository';
import { FailureReason } from './constants/failure-reason.constants';
import { correlationStorage } from '../../common/logger/correlation.store';

/**
 * BookingWorker — BullMQ consumer.
 *
 * Architectural rule:
 *  - The worker is a thin shell: receive job, delegate to service, handle retry/fail.
 *  - ALL business logic lives in BookingProcessingService.
 *  - Validation failures complete the job cleanly (no re-throw → no BullMQ retry).
 *  - Transient errors (DB connectivity etc.) are re-thrown so BullMQ retries with backoff.
 */
@Processor(BOOKING_QUEUE_NAME)
export class BookingWorker extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(BookingWorker.name);

  constructor(
    private readonly bookingProcessingService: BookingProcessingService,
    private readonly bookingsRepository: BookingsRepository,
  ) {
    super();
  }

  /**
   * Graceful shutdown handler.
   * Closes the BullMQ worker connection to prevent drawing new jobs.
   */
  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Worker received shutdown signal: ${signal || 'SIGTERM'} | Closing connection...`);
    try {
      await this.worker.close();
      this.logger.log('BullMQ worker connection closed gracefully.');
    } catch (error) {
      this.logger.error(
        'Failed to close BullMQ worker connection gracefully during shutdown',
        error instanceof Error ? error.stack : error
      );
    }
  }

  async process(job: Job<JobPayload>): Promise<void> {
    const { bookingId, requestId } = job.data;

    await correlationStorage.run(requestId || 'worker-job', async () => {
      this.logger.log(
        `Job received: name=${BOOKING_JOB_NAME}, jobId=${job.id}, attempt=${job.attemptsMade + 1}, bookingId=${bookingId}`
      );

      try {
        await this.bookingProcessingService.processBooking(bookingId);
        this.logger.log(`Job completed: jobId=${job.id}, bookingId=${bookingId}`);
      } catch (error) {
        const stack = error instanceof Error ? error.stack : String(error);
        this.logger.error(
          `Unexpected error processing job jobId=${job.id}, bookingId=${bookingId}. Attempt ${job.attemptsMade + 1}.`,
          stack
        );

        // Mark the booking FAILED with UNKNOWN_ERROR before deciding whether to re-throw.
        try {
          await this.bookingsRepository.failBooking(bookingId, FailureReason.UNKNOWN_ERROR);
          this.logger.warn(`Booking ${bookingId} marked FAILED — reason: ${FailureReason.UNKNOWN_ERROR}`);
        } catch (updateError) {
          this.logger.error(
            `Also failed to update booking status to FAILED for bookingId=${bookingId}`,
            updateError instanceof Error ? updateError.stack : updateError
          );
        }

        // Re-throw so BullMQ can retry (if attempts remain) or move to failed set.
        throw error;
      }
    });
  }
}
