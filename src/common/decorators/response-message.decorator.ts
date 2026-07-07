import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message_key';

/**
 * Custom decorator to define success response messages on controller handlers.
 *
 * Example:
 * @Get()
 * @ResponseMessage('Bookings retrieved successfully.')
 * async findAll() { ... }
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
