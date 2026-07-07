import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from '../services/health.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { HttpStatus } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: DeepMockProxy<HealthService>;

  beforeEach(async () => {
    healthService = mockDeep<HealthService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: healthService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('getHealth', () => {
    it('should return health details', async () => {
      healthService.getHealthDetails.mockResolvedValue({ status: 'UP' } as any);
      
      const result = await controller.getHealth();
      
      expect(result.status).toBe('UP');
    });
  });

  describe('checkReadiness', () => {
    it('should return 200 READY if healthy', async () => {
      healthService.isReady.mockResolvedValue(true);
      
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      
      await controller.checkReadiness(res as any);
      
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith('READY');
    });

    it('should return 503 NOT_READY if unhealthy', async () => {
      healthService.isReady.mockResolvedValue(false);
      
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      
      await controller.checkReadiness(res as any);
      
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.send).toHaveBeenCalledWith('NOT_READY');
    });
  });

  describe('checkLiveness', () => {
    it('should return 200 LIVENESS_UP', async () => {
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      
      await controller.checkLiveness(res as any);
      
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith('LIVENESS_UP');
    });
  });
});
