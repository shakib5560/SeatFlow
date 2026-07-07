import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisProvider } from './redis.provider';
import { RedisService } from './redis.service';

/**
 * redis.module.ts
 *
 * WHY @Global():
 * Without @Global, every feature module (EventsModule, BookingsModule, etc.)
 * would need to import RedisModule in its own imports array. This creates
 * repetitive boilerplate and makes adding Redis to a new feature error-prone.
 *
 * With @Global, registering RedisModule once in AppModule makes RedisService
 * injectable throughout the entire application — similar to how ConfigModule
 * is registered globally.
 *
 * WHY WE STILL EXPORT [RedisService]:
 * @Global only lifts the module's exports into the global scope. You must
 * still declare what to export. RedisProvider (the raw ioredis client) is
 * NOT exported — business modules should never inject the raw client.
 *
 * HOW THE LIFECYCLE WORKS:
 * 1. AppModule imports RedisModule.
 * 2. NestJS calls RedisProvider.useFactory() to create the ioredis client.
 * 3. RedisService is instantiated with the client injected.
 * 4. RedisService.onModuleInit() pings Redis to validate connectivity.
 * 5. On shutdown, RedisService.onModuleDestroy() calls client.quit().
 *
 * DEPENDENCY GRAPH:
 * AppModule
 *   → RedisModule (global)
 *       → ConfigModule (already global, injected by provider)
 *       → RedisProvider (creates ioredis client as REDIS_CLIENT token)
 *       → RedisService (injects REDIS_CLIENT + ConfigService)
 *   → EventsModule  ← RedisService auto-available (global scope)
 *   → BookingsModule ← RedisService auto-available (global scope)
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    // Creates and configures the ioredis singleton client.
    RedisProvider,
    // The API layer that business modules use.
    RedisService,
  ],
  exports: [
    // Only export RedisService — business modules must never touch the raw client.
    RedisService,
  ],
})
export class RedisModule {}
