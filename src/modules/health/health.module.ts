import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { HealthService } from './services/health.service';
import { DatabaseHealthService } from './services/database-health.service';
import { RedisHealthService } from './services/redis-health.service';
import { QueueHealthService } from './services/queue-health.service';
import { MetricsService } from './services/metrics.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    DatabaseHealthService,
    RedisHealthService,
    QueueHealthService,
    MetricsService,
  ],
})
export class HealthModule {}
