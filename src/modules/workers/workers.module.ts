import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { BookingsModule } from '../bookings/bookings.module';
import { BookingWorker } from './booking.worker';
import { BookingProcessingService } from './services/booking-processing.service';

/**
 * WorkersModule registers all BullMQ worker processors.
 *
 * Workers are consumers — they listen to queues and process jobs.
 * This module imports QueueModule to ensure the connection and queue
 * registration are in place before workers start listening.
 * It imports BookingsModule to access BookingsRepository for DB operations.
 */
@Module({
  imports: [QueueModule, BookingsModule],
  providers: [BookingWorker, BookingProcessingService],
})
export class WorkersModule {}
