import { Controller, Get, Query, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { EventsService } from '../services/events.service';
import { EventResponseDto } from '../responses/event.response.dto';
import { QueryEventsDto } from '../dto/query-events.dto';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}

  /**
   * GET /events
   * Returns a list of all upcoming events sorted by date ascending.
   * Leverages validation query DTO to accommodate future pagination/filtering options.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Events retrieved successfully.')
  @ApiOperation({
    summary: 'Retrieve all upcoming events',
    description: 'Fetches all scheduled events, sorted chronologically with soonest events appearing first.',
  })
  @ApiOkResponse({
    description: 'List of events retrieved successfully.',
    type: EventResponseDto,
    isArray: true,
  })
  async findAll(@Query() query: QueryEventsDto): Promise<EventResponseDto[]> {
    this.logger.log(
      `Incoming request: GET /events | QueryParams: page=${query.page ?? 'default'}, limit=${query.limit ?? 'default'}, search=${query.search ?? 'none'}`
    );

    const events = await this.eventsService.findAll();

    this.logger.log(`Successful request completion: GET /events | Count: ${events.length}`);
    return events;
  }
}
