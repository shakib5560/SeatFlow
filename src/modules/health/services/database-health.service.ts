import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DatabaseHealthService {
  private readonly logger = new Logger(DatabaseHealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks database health by executing a simple SELECT query.
   * Measures latency and returns UP/DOWN status.
   */
  async check(): Promise<{ status: 'UP' | 'DOWN'; latency?: string }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const duration = Date.now() - start;
      return {
        status: 'UP',
        latency: `${duration}ms`,
      };
    } catch (error) {
      this.logger.error(
        'Database health check failed',
        error instanceof Error ? error.stack : error,
      );
      return {
        status: 'DOWN',
      };
    }
  }
}
