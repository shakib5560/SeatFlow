import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TimeoutInterceptor.name);

  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const timeoutLimit =
      this.configService.get<number>('requestTimeout') ?? 15000;

    return next.handle().pipe(
      timeout(timeoutLimit),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          this.logger.error(
            `Request execution exceeded timeout limit (${timeoutLimit}ms) | Path: ${request.originalUrl}`,
          );
          return throwError(
            () => new RequestTimeoutException('Request execution timed out.'),
          );
        }
        return throwError(() => err as Error);
      }),
    );
  }
}
