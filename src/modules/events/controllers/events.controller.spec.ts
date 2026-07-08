import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from '../services/events.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { EventResponseDto } from '../responses/event.response.dto';

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: DeepMockProxy<EventsService>;

  const mockEvent: EventResponseDto = {
    id: '1',
    name: 'NestJS Masterclass',
    description: null,
    eventDate: new Date('2026-08-07T18:30:00.000Z'),
    totalSeats: 100,
    remainingSeats: 100,
    price: 0,
  };

  beforeEach(async () => {
    eventsService = mockDeep<EventsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: eventsService }],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  describe('findAll', () => {
    it('should return array of events', async () => {
      eventsService.findAll.mockResolvedValue([mockEvent]);

      const result = await controller.findAll({});

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });
});
