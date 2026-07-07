import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '../../infrastructure/redis';
import { BOOKING_QUEUE_NAME } from './queue.constants';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(BOOKING_QUEUE_NAME) private readonly bookingQueue: Queue,
    private readonly redisService: RedisService,
  ) {
    this.logger.log('QueueService initialized');
  }

  /**
   * Health check method to verify Redis connectivity via the shared RedisService.
   * Uses the underlying ioredis client which exposes a typed ping() command.
   */
  async isRedisConnected(): Promise<boolean> {
    try {
      const pingResult = await this.redisService.getClient().ping();
      this.logger.debug(`Redis queue connectivity check: ${pingResult}`);
      return pingResult === 'PONG';
    } catch (error) {
      this.logger.error(
        'Queue Redis connectivity check failed',
        error instanceof Error ? error.stack : error
      );
      return false;
    }
  }

  /**
   * Returns the number of waiting jobs in the booking queue.
   * Useful for monitoring and health dashboards.
   */
  async getQueueDepth(): Promise<number> {
    return this.bookingQueue.getWaitingCount();
  }
}
