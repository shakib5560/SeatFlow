/**
 * Events API E2E-style tests (isolated, no real infrastructure)
 * Tests the full controller → service → response pipeline with mocked service.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventsController } from '../../src/modules/events/controllers/events.controller';
import { EventsService } from '../../src/modules/events/services/events.service';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import * as http from 'http';

describe('EventsController (e2e)', () => {
  let app: INestApplication;
  let eventsService: DeepMockProxy<EventsService>;

  beforeAll(async () => {
    eventsService = mockDeep<EventsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: eventsService },
        Reflector,
      ],
    }).compile();

    app = module.createNestApplication();
    const reflector = app.get<Reflector>(Reflector);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalInterceptors(new ResponseInterceptor(reflector));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /events — wraps result in standard API envelope', async () => {
    eventsService.findAll.mockResolvedValue([
      { id: '1', name: 'Test Event' } as any,
    ]);

    const controller = app.get<EventsController>(EventsController);
    const result = await controller.findAll({} as any);

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].id).toBe('1');
    expect(eventsService.findAll).toHaveBeenCalled();
  });
});
