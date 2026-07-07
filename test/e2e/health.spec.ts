/**
 * Health API E2E-style tests (isolated, no real infrastructure)
 * Tests the HealthController methods directly with mocked HealthService.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import { HealthController } from '../../src/modules/health/controllers/health.controller';
import { HealthService } from '../../src/modules/health/services/health.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

describe('HealthController (e2e)', () => {
  let app: INestApplication;
  let healthService: DeepMockProxy<HealthService>;
  let controller: HealthController;

  beforeAll(async () => {
    healthService = mockDeep<HealthService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: healthService },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    controller = app.get<HealthController>(HealthController);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health — returns full health payload with UP status', async () => {
    const mockHealth = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: 100,
      version: '1.0.0',
      environment: 'test',
      services: {
        database: { status: 'UP', latency: '3ms' },
        redis: { status: 'UP', latency: '1ms' },
        queue: { status: 'UP' },
      },
    };
    healthService.getHealthDetails.mockResolvedValue(mockHealth as any);

    const result = await controller.getHealth();
    expect(result.status).toBe('UP');
    expect(result.services.database.status).toBe('UP');
    expect(result.services.redis.status).toBe('UP');
  });

  it('GET /health — returns DOWN when a dependency is unavailable', async () => {
    healthService.getHealthDetails.mockResolvedValue({
      status: 'DOWN',
      services: {
        database: { status: 'DOWN', latency: 'timeout' },
        redis: { status: 'UP' },
        queue: { status: 'UP' },
      },
    } as any);

    const result = await controller.getHealth();
    expect(result.status).toBe('DOWN');
    expect(result.services.database.status).toBe('DOWN');
  });

  it('GET /health/ready — sends READY with 200 when all deps are UP', async () => {
    healthService.isReady.mockResolvedValue(true);

    const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await controller.checkReadiness(mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(mockRes.send).toHaveBeenCalledWith('READY');
  });

  it('GET /health/ready — sends NOT_READY with 503 when a dep is DOWN', async () => {
    healthService.isReady.mockResolvedValue(false);

    const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await controller.checkReadiness(mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mockRes.send).toHaveBeenCalledWith('NOT_READY');
  });

  it('GET /health/live — always returns LIVENESS_UP with 200', async () => {
    const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await controller.checkLiveness(mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(mockRes.send).toHaveBeenCalledWith('LIVENESS_UP');
  });
});
