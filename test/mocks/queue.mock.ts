import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Queue, Job } from 'bullmq';

export const createQueueMock = (): DeepMockProxy<Queue> => {
  return mockDeep<Queue>();
};

export const createJobMock = <T>(data: T): DeepMockProxy<Job<T>> => {
  const mockJob = mockDeep<Job<T>>();
  mockJob.data = data;
  return mockJob;
};
