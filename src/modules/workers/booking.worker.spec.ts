import { Test, TestingModule } from '@nestjs/testing';
import { BookingWorker } from './booking.worker';
import { BookingProcessingService } from './services/booking-processing.service';
import { BookingsRepository } from '../bookings/repositories/bookings.repository';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { createJobMock } from '../../../test/mocks/queue.mock';

describe('BookingWorker', () => {
  let worker: BookingWorker;
  let processingService: DeepMockProxy<BookingProcessingService>;
  let repository: DeepMockProxy<BookingsRepository>;

  beforeEach(async () => {
    processingService = mockDeep<BookingProcessingService>();
    repository = mockDeep<BookingsRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingWorker,
        { provide: BookingProcessingService, useValue: processingService },
        { provide: BookingsRepository, useValue: repository },
      ],
    }).compile();

    worker = module.get<BookingWorker>(BookingWorker);
  });

  describe('process', () => {
    it('should successfully process a job', async () => {
      const mockJob = createJobMock({ bookingId: 'bk-123', requestId: 'req-123' });
      mockJob.id = 'job-1';
      mockJob.attemptsMade = 0;

      await worker.process(mockJob as any);

      expect(processingService.processBooking).toHaveBeenCalledWith('bk-123');
      expect(repository.failBooking).not.toHaveBeenCalled();
    });

    it('should mark booking as FAILED and re-throw on unexpected error', async () => {
      const mockJob = createJobMock({ bookingId: 'bk-123', requestId: 'req-123' });
      mockJob.id = 'job-1';
      mockJob.attemptsMade = 0;

      const error = new Error('Database dead');
      processingService.processBooking.mockRejectedValue(error);

      await expect(worker.process(mockJob as any)).rejects.toThrow('Database dead');

      expect(processingService.processBooking).toHaveBeenCalledWith('bk-123');
      expect(repository.failBooking).toHaveBeenCalledWith('bk-123', 'UNKNOWN_ERROR');
    });
  });
});
