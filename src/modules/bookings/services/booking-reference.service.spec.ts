import { Test, TestingModule } from '@nestjs/testing';
import { BookingReferenceService } from './booking-reference.service';
import { RedisService } from '../../../infrastructure/redis';
import { createRedisMock } from '../../../../test/mocks/redis.mock';
import { DeepMockProxy } from 'jest-mock-extended';

describe('BookingReferenceService', () => {
  let service: BookingReferenceService;
  let redisService: DeepMockProxy<RedisService>;

  beforeEach(async () => {
    redisService = createRedisMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingReferenceService,
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    service = module.get<BookingReferenceService>(BookingReferenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateReference', () => {
    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-08T12:00:00Z'));
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should generate a reference and set TTL if sequence is 1', async () => {
      redisService.increment.mockResolvedValue(1);
      redisService.expire.mockResolvedValue(true);

      const ref = await service.generateReference();

      expect(ref).toEqual('BK-20260708-000001');
      expect(redisService.increment).toHaveBeenCalledWith('booking:reference:counter:20260708');
      expect(redisService.expire).toHaveBeenCalledWith('booking:reference:counter:20260708', 36 * 3600);
    });

    it('should generate a reference and NOT set TTL if sequence > 1', async () => {
      redisService.increment.mockResolvedValue(42);

      const ref = await service.generateReference();

      expect(ref).toEqual('BK-20260708-000042');
      expect(redisService.increment).toHaveBeenCalledWith('booking:reference:counter:20260708');
      expect(redisService.expire).not.toHaveBeenCalled();
    });
  });
});
