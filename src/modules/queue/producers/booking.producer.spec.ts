import { Test, TestingModule } from '@nestjs/testing';
import { BookingProducer } from './booking.producer';
import { getQueueToken } from '@nestjs/bullmq';
import { BOOKING_QUEUE_NAME, BOOKING_JOB_NAME } from '../queue.constants';
import { createQueueMock, createJobMock } from '../../../../test/mocks/queue.mock';
import { DeepMockProxy } from 'jest-mock-extended';
import { Queue } from 'bullmq';

describe('BookingProducer', () => {
  let producer: BookingProducer;
  let queueMock: DeepMockProxy<Queue>;

  beforeEach(async () => {
    queueMock = createQueueMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingProducer,
        {
          provide: getQueueToken(BOOKING_QUEUE_NAME),
          useValue: queueMock,
        },
      ],
    }).compile();

    producer = module.get<BookingProducer>(BookingProducer);
  });

  describe('enqueueBooking', () => {
    it('should enqueue a job and return job id', async () => {
      const mockJob = createJobMock({ bookingId: 'bk-123' });
      mockJob.id = 'job-123';
      
      queueMock.add.mockResolvedValue(mockJob as any);

      const jobId = await producer.enqueueBooking('bk-123');

      expect(jobId).toEqual('job-123');
      expect(queueMock.add).toHaveBeenCalledWith(
        BOOKING_JOB_NAME,
        { bookingId: 'bk-123', requestId: undefined },
        expect.any(Object)
      );
    });

    it('should throw an error if job ID is missing', async () => {
      const mockJob = createJobMock({ bookingId: 'bk-123' });
      // override getter to return undefined
      Object.defineProperty(mockJob, 'id', { value: undefined });
      
      queueMock.add.mockResolvedValue(mockJob as any);

      await expect(producer.enqueueBooking('bk-123')).rejects.toThrow('Enqueued job has no ID');
    });

    it('should throw an error if BullMQ fails', async () => {
      queueMock.add.mockRejectedValue(new Error('Redis down'));

      await expect(producer.enqueueBooking('bk-123')).rejects.toThrow('Redis down');
    });
  });
});
