import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration';
import { validate } from './config/env.validation';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import { RateLimitMiddleware } from './common/middlewares/rate-limit.middleware';

import { EventsModule } from './modules/events/events.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { QueueModule } from './modules/queue/queue.module';
import { WorkersModule } from './modules/workers/workers.module';
import { RedisModule } from './infrastructure/redis';
import { LoggingModule } from './common/logger/logging.module';
import { HealthModule } from './modules/health/health.module';

/**
 * AppModule — root application module.
 *
 * Architecture decisions:
 *
 * 1. ConfigModule.forRoot is loaded globally so that ConfigService is available.
 * 2. Environment variables are validated at startup.
 * 3. RequestIdMiddleware (AsyncLocalStorage-based) and RateLimitMiddleware (Redis-based)
 *    are registered globally for all routes.
 * 4. Global Exception Filter, Response Interceptor, and Timeout Interceptors are bound.
 */
@Module({
  imports: [
    // Global environment configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),

    // Redis infrastructure (global — available in all modules after this)
    RedisModule,

    // Logging module
    LoggingModule,

    // Feature modules
    EventsModule,
    BookingsModule,
    HealthModule,

    // Queue infrastructure
    QueueModule,
    WorkersModule,
  ],
  providers: [
    // Global exception filter — formats ALL errors into consistent JSON
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global transform interceptor — wraps responses in standardized success format
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    // Global timeout interceptor — aborts requests running > 5s with HTTP 408
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, RateLimitMiddleware)
      .forRoutes('*');
  }
}
