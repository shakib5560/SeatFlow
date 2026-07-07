import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
  Logger,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TimeoutInterceptor.name);
  private readonly timeoutLimit = 5000; // Configured to 5000ms

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      timeout(this.timeoutLimit),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          this.logger.error(
            `Request execution exceeded timeout limit (${this.timeoutLimit}ms) | Path: ${request.originalUrl}`
          );
          return throwError(() => new RequestTimeoutException('Request execution timed out.'));
        }
        return throwError(() => err);
      }),
    );
  }
}
