import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis';

@Injectable()
export class RedisHealthService {
  private readonly logger = new Logger(RedisHealthService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Checks Redis health by pinging the Redis client.
   * Measures latency and returns UP/DOWN status.
   */
  async check(): Promise<{ status: 'UP' | 'DOWN'; latency?: string }> {
    const start = Date.now();
    try {
      const pong = await this.redisService.getClient().ping();
      const duration = Date.now() - start;
      if (pong === 'PONG') {
        return {
          status: 'UP',
          latency: `${duration}ms`,
        };
      }
      throw new Error(`Unexpected Redis ping response: ${pong as string}`);
    } catch (error) {
      this.logger.error(
        'Redis health check failed',
        error instanceof Error ? error.stack : error,
      );
      return {
        status: 'DOWN',
      };
    }
  }
}
