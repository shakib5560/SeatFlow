import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { RedisService } from '../../src/infrastructure/redis/redis.service';

export const createRedisMock = (): DeepMockProxy<RedisService> => {
  return mockDeep<RedisService>();
};
