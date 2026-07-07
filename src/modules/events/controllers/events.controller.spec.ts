import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from '../services/events.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: DeepMockProxy<EventsService>;

  beforeEach(async () => {
    eventsService = mockDeep<EventsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: eventsService },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  describe('findAll', () => {
    it('should return array of events', async () => {
      eventsService.findAll.mockResolvedValue([{ id: '1' } as any]);

      // Pass an empty query DTO to satisfy the parameter
      const result = await controller.findAll({} as any);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });
});
