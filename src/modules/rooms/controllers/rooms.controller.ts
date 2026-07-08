import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
  ApiParam,
} from '@nestjs/swagger';
import { RoomsService } from '../services/rooms.service';
import { RoomAvailabilityQueryDto } from '../dto/room-availability-query.dto';
import {
  RoomDto,
  RoomAvailabilityDto,
  RoomAvailabilityCheckDto,
} from '../responses/room.response.dto';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';

@ApiTags('Rooms')
@Controller('rooms')
export class RoomsController {
  private readonly logger = new Logger(RoomsController.name);

  constructor(private readonly roomsService: RoomsService) {}

  /**
   * GET /rooms
   * List all 10 available rooms.
   */
  @Get()
  @ResponseMessage('Rooms retrieved successfully.')
  @ApiOperation({
    summary: 'List all rooms',
    description:
      'Returns the static list of all 10 conference/meeting rooms (A1 to A10).',
  })
  @ApiOkResponse({
    description: 'List of rooms.',
    type: RoomDto,
    isArray: true,
  })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  async findAll(): Promise<RoomDto[]> {
    this.logger.log('Incoming request: GET /rooms');
    return this.roomsService.findAll();
  }

  /**
   * GET /rooms/:roomId/availability
   * Get the booking calendar of a room or check availability for specific dates.
   */
  @Get(':roomId/availability')
  @ResponseMessage('Room availability status retrieved.')
  @ApiOperation({
    summary: 'Get room availability or check specific dates',
    description: [
      'If query params `startDate` and `endDate` are omitted: returns the full booking calendar ',
      'for this room containing all PENDING and CONFIRMED bookings.',
      '\n\nIf query params `startDate` and `endDate` are provided: performs a real-time availability check ',
      'for those dates, returning `available: true/false`, conflicting booking details, and the next available date.',
    ].join(''),
  })
  @ApiParam({
    name: 'roomId',
    description: 'UUID of the room',
    example: 'd3b07384-d113-4bf5-a5d9-43c3d5e2a501',
  })
  @ApiOkResponse({
    description: 'Room availability calendar or check result.',
    type: Object, // Can be RoomAvailabilityDto or RoomAvailabilityCheckDto
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters or malformed date range.',
  })
  @ApiNotFoundResponse({ description: 'Room not found.' })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server error.' })
  async getAvailability(
    @Param('roomId') roomId: string,
    @Query() query: RoomAvailabilityQueryDto,
  ): Promise<RoomAvailabilityDto | RoomAvailabilityCheckDto> {
    this.logger.log(
      `Incoming request: GET /rooms/${roomId}/availability | ` +
        `startDate=${query.startDate ?? 'none'}, endDate=${query.endDate ?? 'none'}`,
    );
    return this.roomsService.getRoomAvailability(roomId, query);
  }
}
