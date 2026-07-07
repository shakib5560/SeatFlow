import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BOOKING_QUEUE_NAME } from '../../queue/queue.constants';

@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name);

  constructor(
    @InjectQueue(BOOKING_QUEUE_NAME) private readonly bookingQueue: Queue
  ) {}

  /**
   * Retrieves current job statistics and status from BullMQ.
   */
  async check(): Promise<{
    status: 'UP' | 'DOWN';
    waiting?: number;
    active?: number;
    completed?: number;
    failed?: number;
    delayed?: number;
    paused?: boolean;
  }> {
    try {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        this.bookingQueue.getWaitingCount(),
        this.bookingQueue.getActiveCount(),
        this.bookingQueue.getCompletedCount(),
        this.bookingQueue.getFailedCount(),
        this.bookingQueue.getDelayedCount(),
        this.bookingQueue.isPaused(),
      ]);

      return {
        status: 'UP',
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused,
      };
    } catch (error) {
      this.logger.error(
        'Queue health check failed',
        error instanceof Error ? error.stack : error
      );
      return {
        status: 'DOWN',
      };
    }
  }
}
