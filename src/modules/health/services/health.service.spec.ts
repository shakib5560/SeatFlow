import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseHealthService } from './database-health.service';
import { RedisHealthService } from './redis-health.service';
import { QueueHealthService } from './queue-health.service';
import { MetricsService } from './metrics.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

describe('HealthService', () => {
  let service: HealthService;
  let configService: DeepMockProxy<ConfigService>;
  let dbHealth: DeepMockProxy<DatabaseHealthService>;
  let redisHealth: DeepMockProxy<RedisHealthService>;
  let queueHealth: DeepMockProxy<QueueHealthService>;
  let metrics: DeepMockProxy<MetricsService>;

  beforeEach(async () => {
    configService = mockDeep<ConfigService>();
    dbHealth = mockDeep<DatabaseHealthService>();
    redisHealth = mockDeep<RedisHealthService>();
    queueHealth = mockDeep<QueueHealthService>();
    metrics = mockDeep<MetricsService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: ConfigService, useValue: configService },
        { provide: DatabaseHealthService, useValue: dbHealth },
        { provide: RedisHealthService, useValue: redisHealth },
        { provide: QueueHealthService, useValue: queueHealth },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('getHealthDetails', () => {
    it('should return UP if all dependencies are UP', async () => {
      dbHealth.check.mockResolvedValue({ status: 'UP', latency: '5ms' });
      redisHealth.check.mockResolvedValue({ status: 'UP', latency: '2ms' });
      queueHealth.check.mockResolvedValue({ status: 'UP' } as any);
      configService.get.mockReturnValue('test');
      metrics.getMemoryUsage.mockReturnValue({ rss: '1MB' } as any);
      metrics.getCpuUsage.mockReturnValue({ user: '1ms' } as any);

      const result = await service.getHealthDetails();

      expect(result.status).toEqual('UP');
      expect(result.environment).toEqual('test');
      expect(result.services.database.status).toEqual('UP');
      expect(result.services.redis.status).toEqual('UP');
      expect(result.services.queue.status).toEqual('UP');
    });

    it('should return DOWN if any dependency is DOWN', async () => {
      dbHealth.check.mockResolvedValue({ status: 'UP', latency: '5ms' });
      redisHealth.check.mockResolvedValue({ status: 'DOWN', latency: 'timeout' });
      queueHealth.check.mockResolvedValue({ status: 'UP' } as any);

      const result = await service.getHealthDetails();

      expect(result.status).toEqual('DOWN');
      expect(result.services.redis.status).toEqual('DOWN');
    });
  });

  describe('isReady', () => {
    it('should return true if all dependencies are UP', async () => {
      dbHealth.check.mockResolvedValue({ status: 'UP', latency: '5ms' });
      redisHealth.check.mockResolvedValue({ status: 'UP', latency: '2ms' });
      queueHealth.check.mockResolvedValue({ status: 'UP' } as any);

      const result = await service.isReady();

      expect(result).toBe(true);
    });

    it('should return false if database is DOWN', async () => {
      dbHealth.check.mockResolvedValue({ status: 'DOWN', latency: 'timeout' });
      redisHealth.check.mockResolvedValue({ status: 'UP', latency: '2ms' });
      queueHealth.check.mockResolvedValue({ status: 'UP' } as any);

      const result = await service.isReady();

      expect(result).toBe(false);
    });
  });
});
