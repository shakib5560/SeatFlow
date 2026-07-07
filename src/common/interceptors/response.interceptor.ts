import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { Request, Response } from 'express';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

export interface StandardApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, StandardApiResponse<T>>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardApiResponse<T>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    // Exclude health check endpoints from standard wrapping to match raw formats
    if (request.originalUrl.includes('/health')) {
      return next.handle();
    }

    // Retrieve custom message set by @ResponseMessage, fallback to a standard string
    const message =
      this.reflector.get<string>(RESPONSE_MESSAGE_KEY, context.getHandler()) ||
      'Request processed successfully.';

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: response.statusCode,
        message,
        data,
        timestamp: new Date().toISOString(),
        path: request.originalUrl,
      })),
    );
  }
}
