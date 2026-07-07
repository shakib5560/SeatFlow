import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../src/modules/prisma/prisma.service';

export type Context = {
  prisma: PrismaService;
};

export type MockContext = {
  prisma: DeepMockProxy<PrismaService>;
};

export const createMockContext = (): MockContext => {
  return {
    prisma: mockDeep<PrismaService>(),
  };
};
