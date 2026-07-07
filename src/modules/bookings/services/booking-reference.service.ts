import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis';

@Injectable()
export class BookingReferenceService {
  private readonly logger = new Logger(BookingReferenceService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Generates a unique, thread-safe, daily sequential reference code.
   * Format: BK-YYYYMMDD-000001
   */
  async generateReference(): Promise<string> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    // Redis key is partitioned by date to reset counter every day
    const key = `booking:reference:counter:${dateStr}`;

    try {
      const sequence = await this.redisService.increment(key);
      if (sequence === 1) {
        // Set TTL of 36 hours so that old daily keys auto-expire and do not grow indefinitely
        await this.redisService.expire(key, 36 * 3600);
      }

      const sequenceStr = String(sequence).padStart(6, '0');
      const bookingReference = `BK-${dateStr}-${sequenceStr}`;

      this.logger.log(`Booking reference generated: reference=${bookingReference}`);
      return bookingReference;
    } catch (error) {
      this.logger.error(
        'Failed to generate daily sequence booking reference via Redis',
        error instanceof Error ? error.stack : error
      );
      throw error;
    }
  }
}
