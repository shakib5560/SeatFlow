import { Test, TestingModule } from '@nestjs/testing';
import { BookingWorker } from './booking.worker';
import { BookingProcessingService } from './services/booking-processing.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { createJobMock } from '../../../test/mocks/queue.mock';
import { JobPayload } from '../../common/interfaces';
import { Job } from 'bullmq';

describe('BookingWorker', () => {
  let worker: BookingWorker;
  let processingService: DeepMockProxy<BookingProcessingService>;

  beforeEach(async () => {
    processingService = mockDeep<BookingProcessingService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingWorker,
        { provide: BookingProcessingService, useValue: processingService },
      ],
    }).compile();

    worker = module.get<BookingWorker>(BookingWorker);
  });

  describe('process', () => {
    it('should successfully process a job', async () => {
      const mockJob = createJobMock<JobPayload>({
        bookingId: 'bk-123',
        requestId: 'req-123',
      });
      mockJob.id = 'job-1';
      mockJob.attemptsMade = 0;

      await worker.process(mockJob);

      expect(processingService.processBooking).toHaveBeenCalledWith('bk-123');
    });

    it('should re-throw on unexpected error', async () => {
      const mockJob = createJobMock<JobPayload>({
        bookingId: 'bk-123',
        requestId: 'req-123',
      });
      mockJob.id = 'job-1';
      mockJob.attemptsMade = 0;

      const error = new Error('Database dead');
      processingService.processBooking.mockRejectedValue(error);

      await expect(
        worker.process(mockJob as unknown as Job<JobPayload>),
      ).rejects.toThrow('Database dead');

      expect(processingService.processBooking).toHaveBeenCalledWith('bk-123');
    });
  });
});
