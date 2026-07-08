/**
 * Health API E2E-style tests (isolated, no real infrastructure)
 * Tests the HealthController methods directly with mocked HealthService.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { HealthController } from '../../src/modules/health/controllers/health.controller';
import { HealthService } from '../../src/modules/health/services/health.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import type { Response } from 'express';

type HealthDetails = Awaited<ReturnType<HealthService['getHealthDetails']>>;

describe('HealthController (e2e)', () => {
  let app: INestApplication;
  let healthService: DeepMockProxy<HealthService>;
  let controller: HealthController;

  const createMockResponse = () =>
    ({
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    }) as unknown as Response;

  beforeAll(async () => {
    healthService = mockDeep<HealthService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    controller = app.get<HealthController>(HealthController);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health — returns full health payload with UP status', async () => {
    const mockHealth: HealthDetails = {
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
        database: { status: 'UP', latency: '3ms' },
        redis: { status: 'UP', latency: '1ms' },
        queue: { status: 'UP', waiting: 0 },
      },
    };
    healthService.getHealthDetails.mockResolvedValue(mockHealth);

    const result = await controller.getHealth();
    expect(result.status).toBe('UP');
    expect(result.services.database.status).toBe('UP');
    expect(result.services.redis.status).toBe('UP');
  });

  it('GET /health — returns DOWN when a dependency is unavailable', async () => {
    const mockHealth: HealthDetails = {
      status: 'DOWN',
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
        database: { status: 'DOWN', latency: 'timeout' },
        redis: { status: 'UP', latency: '1ms' },
        queue: { status: 'UP' },
      },
    };
    healthService.getHealthDetails.mockResolvedValue(mockHealth);

    const result = await controller.getHealth();
    expect(result.status).toBe('DOWN');
    expect(result.services.database.status).toBe('DOWN');
  });

  it('GET /health/ready — sends READY with 200 when all deps are UP', async () => {
    healthService.isReady.mockResolvedValue(true);
    const res = createMockResponse();

    await controller.checkReadiness(res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.send).toHaveBeenCalledWith('READY');
  });

  it('GET /health/ready — sends NOT_READY with 503 when a dep is DOWN', async () => {
    healthService.isReady.mockResolvedValue(false);
    const res = createMockResponse();

    await controller.checkReadiness(res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.send).toHaveBeenCalledWith('NOT_READY');
  });

  it('GET /health/live — always returns LIVENESS_UP with 200', () => {
    const res = createMockResponse();

    controller.checkLiveness(res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.send).toHaveBeenCalledWith('LIVENESS_UP');
  });
});
