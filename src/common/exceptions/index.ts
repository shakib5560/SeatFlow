import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when a requested resource does not exist in the database.
 */
export class ResourceNotFoundException extends HttpException {
  constructor(resource: string, identifier: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: `${resource} with identifier '${identifier}' was not found.`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Thrown when a business rule conflict occurs, e.g. not enough seats.
 */
export class BusinessRuleException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Business Rule Violation',
        message,
      },
      HttpStatus.CONFLICT,
    );
  }
}
