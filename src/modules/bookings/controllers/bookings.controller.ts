import { Controller, Post, Body, Query, Get, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { PaginatedBookingsDto } from '../responses/paginated-bookings.dto';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { BookingsService } from '../services/bookings.service';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { BookingResponseDto } from '../responses/booking-response.dto';
import { BookingQueryDto } from '../dto/booking-query.dto';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);

  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * POST /bookings
   * Initiates a booking request. Validates the parameters, checks for idempotency,
   * generates a reference, and saves the booking as PENDING.
   * Duplicate requests (same requestId) return the existing booking — never error.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ResponseMessage('Booking request accepted.')
  @ApiOperation({
    summary: 'Create a pending booking request',
    description: [
      'Validates user details, checks for duplicate request IDs (idempotency key), ',
      'generates a sequential daily booking reference, and registers a PENDING booking.',
      '\n\n**Idempotency:** If the same `requestId` is submitted more than once, the API ',
      'returns HTTP 202 with the existing booking and a `message` field indicating ',
      'the duplicate was detected. No new booking is created, no job is enqueued.',
    ].join(''),
  })
  @ApiAcceptedResponse({
    description:
      'Booking accepted. ' +
      'If `message` is absent — new booking created. ' +
      'If `message` is present — duplicate request; existing booking returned.',
    type: BookingResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input parameters or validation constraints failed.',
  })
  @ApiNotFoundResponse({
    description: 'The requested event does not exist.',
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected database or system failure occurred.',
  })
  async create(@Body() createBookingDto: CreateBookingDto): Promise<BookingResponseDto> {
    this.logger.log(
      `Incoming request: POST /bookings | requestId=${createBookingDto.requestId}, roomId=${createBookingDto.roomId}`
    );

    const response = await this.bookingsService.create(createBookingDto);

    const isDuplicate = !!response.message;
    this.logger.log(
      `Completed: POST /bookings | reference=${response.bookingReference}, status=${response.status}` +
      (isDuplicate ? ' [DUPLICATE — existing booking returned]' : ' [NEW booking created]')
    );
    return response;
  }

  /**
   * GET /bookings
   * Paginated, filterable, sortable booking list.
   */
  @Get()
  @ResponseMessage('Bookings retrieved successfully.')
  @ApiOperation({
    summary: 'List bookings with pagination and filters',
    description:
      'Returns a paginated list of bookings. Supports filtering by status, eventId, customerEmail, ' +
      'and bookingReference (partial, case-insensitive). Sortable by createdAt, eventDate, customerName, or status.',
  })
  @ApiOkResponse({
    description: 'Paginated list of bookings with metadata.',
    type: PaginatedBookingsDto,
  })
  async listBookings(@Query() query: BookingQueryDto): Promise<PaginatedBookingsDto> {
    this.logger.log(
      `Incoming request: GET /bookings | ` +
      `page=${query.page ?? 1}, limit=${query.limit ?? 10}, ` +
      `status=${query.status ?? 'all'}, sortBy=${query.sortBy ?? 'createdAt'}, order=${query.order ?? 'DESC'}`
    );
    return this.bookingsService.listBookings(query);
  }
}
