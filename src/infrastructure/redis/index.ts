/**
 * infrastructure/redis/index.ts — Barrel export
 *
 * This is the PUBLIC API of the Redis infrastructure package.
 * Every file that needs Redis imports from this barrel, not from
 * individual files. This means internal file renames don't break callers.
 *
 * What to import for each use case:
 * - RedisModule   → import into AppModule
 * - RedisService  → inject into business services
 * - REDIS_TTL     → use for TTL constants
 * - REDIS_NAMESPACE → use for key namespace prefixes
 * - IRedisService → use as the type for mocking in unit tests
 */
export { RedisModule } from './redis.module';
export { RedisService } from './redis.service';
export { REDIS_CLIENT, REDIS_TTL, REDIS_NAMESPACE } from './redis.constants';
export type { IRedisService, IRedisConfig } from './redis.interfaces';
