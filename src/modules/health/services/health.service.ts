import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseHealthService } from './database-health.service';
import { RedisHealthService } from './redis-health.service';
import { QueueHealthService } from './queue-health.service';
import { MetricsService } from './metrics.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dbHealth: DatabaseHealthService,
    private readonly redisHealth: RedisHealthService,
    private readonly queueHealth: QueueHealthService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Aggregates details from all services to construct the /health payload.
   */
  async getHealthDetails() {
    const [dbResult, redisResult, queueResult] = await Promise.all([
      this.dbHealth.check(),
      this.redisHealth.check(),
      this.queueHealth.check(),
    ]);

    const isHealthy =
      dbResult.status === 'UP' &&
      redisResult.status === 'UP' &&
      queueResult.status === 'UP';

    return {
      status: isHealthy ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: '1.0.0',
      environment: this.configService.get<string>('NODE_ENV') || 'development',
      nodeVersion: process.version,
      nestjsVersion: '11.0.1',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      metrics: {
        memory: this.metrics.getMemoryUsage(),
        cpu: this.metrics.getCpuUsage(),
      },
      services: {
        database: dbResult,
        redis: redisResult,
        queue: queueResult,
      },
    };
  }

  /**
   * Verification check for readiness probe.
   * Returns true if all critical dependencies are UP.
   */
  async isReady(): Promise<boolean> {
    const [dbResult, redisResult, queueResult] = await Promise.all([
      this.dbHealth.check(),
      this.redisHealth.check(),
      this.queueHealth.check(),
    ]);

    const ready =
      dbResult.status === 'UP' &&
      redisResult.status === 'UP' &&
      queueResult.status === 'UP';

    if (!ready) {
      this.logger.warn(
        `Readiness verification failed | database=${dbResult.status}, redis=${redisResult.status}, queue=${queueResult.status}`,
      );
    }
    return ready;
  }
}
