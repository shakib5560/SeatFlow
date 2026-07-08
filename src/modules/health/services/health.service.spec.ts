import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { ConfigService } from '@nestjs/config';
import { DatabaseHealthService } from './database-health.service';
import { RedisHealthService } from './redis-health.service';
import { QueueHealthService } from './queue-health.service';
import { MetricsService } from './metrics.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

type QueueStatus = Awaited<ReturnType<QueueHealthService['check']>>;
type MemoryUsage = ReturnType<MetricsService['getMemoryUsage']>;
type CpuUsage = ReturnType<MetricsService['getCpuUsage']>;

describe('HealthService', () => {
  let service: HealthService;
  let configService: DeepMockProxy<ConfigService>;
  let dbHealth: DeepMockProxy<DatabaseHealthService>;
  let redisHealth: DeepMockProxy<RedisHealthService>;
  let queueHealth: DeepMockProxy<QueueHealthService>;
  let metrics: DeepMockProxy<MetricsService>;

  const mockQueueUp: QueueStatus = {
    status: 'UP',
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: false,
  };
  const mockMemory: MemoryUsage = {
    rss: '50MB',
    heapTotal: '30MB',
    heapUsed: '20MB',
    external: '1MB',
  };
  const mockCpu: CpuUsage = { user: '10ms', system: '5ms' };

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
      queueHealth.check.mockResolvedValue(mockQueueUp);
      configService.get.mockReturnValue('test');
      metrics.getMemoryUsage.mockReturnValue(mockMemory);
      metrics.getCpuUsage.mockReturnValue(mockCpu);

      const result = await service.getHealthDetails();

      expect(result.status).toEqual('UP');
      expect(result.environment).toEqual('test');
      expect(result.services.database.status).toEqual('UP');
      expect(result.services.redis.status).toEqual('UP');
      expect(result.services.queue.status).toEqual('UP');
    });

    it('should return DOWN if any dependency is DOWN', async () => {
      dbHealth.check.mockResolvedValue({ status: 'UP', latency: '5ms' });
      redisHealth.check.mockResolvedValue({
        status: 'DOWN',
        latency: 'timeout',
      });
      queueHealth.check.mockResolvedValue(mockQueueUp);

      const result = await service.getHealthDetails();

      expect(result.status).toEqual('DOWN');
      expect(result.services.redis.status).toEqual('DOWN');
    });
  });

  describe('isReady', () => {
    it('should return true if all dependencies are UP', async () => {
      dbHealth.check.mockResolvedValue({ status: 'UP', latency: '5ms' });
      redisHealth.check.mockResolvedValue({ status: 'UP', latency: '2ms' });
      queueHealth.check.mockResolvedValue(mockQueueUp);

      const result = await service.isReady();

      expect(result).toBe(true);
    });

    it('should return false if database is DOWN', async () => {
      dbHealth.check.mockResolvedValue({ status: 'DOWN', latency: 'timeout' });
      redisHealth.check.mockResolvedValue({ status: 'UP', latency: '2ms' });
      queueHealth.check.mockResolvedValue(mockQueueUp);

      const result = await service.isReady();

      expect(result).toBe(false);
    });
  });
});
