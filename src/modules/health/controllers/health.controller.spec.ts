import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from '../services/health.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

type HealthDetails = Awaited<ReturnType<HealthService['getHealthDetails']>>;

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: DeepMockProxy<HealthService>;

  const mockHealthDetails: HealthDetails = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: 100,
    version: '1.0.0',
    environment: 'test',
    nodeVersion: process.version,
    nestjsVersion: '11.0.1',
    timezone: 'UTC',
    metrics: {
      memory: {
        rss: '50MB',
        heapTotal: '30MB',
        heapUsed: '20MB',
        external: '1MB',
      },
      cpu: { user: '10ms', system: '5ms' },
    },
    services: {
      database: { status: 'UP', latency: '5ms' },
      redis: { status: 'UP', latency: '2ms' },
      queue: { status: 'UP', waiting: 0 },
    },
  };

  const createMockResponse = () =>
    ({
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    }) as unknown as Response;

  beforeEach(async () => {
    healthService = mockDeep<HealthService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('getHealth', () => {
    it('should return health details', async () => {
      healthService.getHealthDetails.mockResolvedValue(mockHealthDetails);

      const result = await controller.getHealth();

      expect(result.status).toBe('UP');
    });
  });

  describe('checkReadiness', () => {
    it('should return 200 READY if healthy', async () => {
      healthService.isReady.mockResolvedValue(true);
      const res = createMockResponse();

      await controller.checkReadiness(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith('READY');
    });

    it('should return 503 NOT_READY if unhealthy', async () => {
      healthService.isReady.mockResolvedValue(false);
      const res = createMockResponse();

      await controller.checkReadiness(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.send).toHaveBeenCalledWith('NOT_READY');
    });
  });

  describe('checkLiveness', () => {
    it('should return 200 LIVENESS_UP', () => {
      const res = createMockResponse();

      controller.checkLiveness(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith('LIVENESS_UP');
    });
  });
});
