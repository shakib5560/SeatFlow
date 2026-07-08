import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

interface HttpErrorResponse {
  message?: string | string[];
  statusCode?: number;
  error?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred.';
    let errors: Array<{ field: string; message: string }> | undefined =
      undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as
        string | HttpErrorResponse;

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const errorMsg = exceptionResponse.message;
        if (Array.isArray(errorMsg)) {
          message = 'Validation failed.';
          errors = errorMsg.map((err: string) => {
            // Extract the first word as a fallback for the field name
            const firstSpace = err.indexOf(' ');
            const field =
              firstSpace !== -1 ? err.substring(0, firstSpace) : 'field';
            return {
              field,
              message: err,
            };
          });
        } else {
          message = errorMsg ?? exception.message;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message =
          'Duplicate resource: a record with the same unique identifier already exists.';
        const targets = exception.meta?.target as string[];
        if (targets) {
          errors = targets.map((t) => ({
            field: t,
            message: 'Unique constraint violation occurred.',
          }));
        }
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Resource not found.';
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = `Database constraint error: ${exception.code}`;
      }
    } else {
      // Unknown error (transient, system errors) - log details with stack trace
      const stack =
        exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        `Unknown exception caught: ${exception instanceof Error ? exception.message : String(exception)}`,
        stack,
      );
    }

    // Standardised error response format
    const errorResponse = {
      success: false,
      statusCode: status,
      message,
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      requestId,
    };

    this.logger.error(
      `[${request.method}] ${request.originalUrl} - status=${status} - message="${message}"`,
    );

    response.status(status).json(errorResponse);
  }
}
