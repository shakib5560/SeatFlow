/**
 * redis.constants.ts
 *
 * WHY THIS FILE EXISTS:
 * Constants act as the single source of truth for all Redis-related tokens and
 * string literals. Without this file, 'REDIS_CLIENT' would be a magic string
 * scattered across provider, module, and service files — a maintenance trap.
 *
 * Using Symbol() over a plain string as an injection token provides:
 * 1. Uniqueness — Symbols are always unique; no two modules can accidentally
 *    share the same injection token even if they use the same description.
 * 2. Immutability — The DI token cannot be spoofed by another module passing
 *    the string 'REDIS_CLIENT'.
 * 3. Discoverability — All tokens are defined in one place.
 */

/**
 * NestJS DI injection token for the ioredis client instance.
 * Inject via: @Inject(REDIS_CLIENT) private readonly redis: Redis
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * NestJS DI injection token for the Redis configuration object.
 * Inject via: @Inject(REDIS_CONFIG) private readonly config: IRedisConfig
 */
export const REDIS_CONFIG = Symbol('REDIS_CONFIG');

/**
 * TTL strategies (in seconds) — centralised here so every service
 * uses consistent expiry values rather than hardcoding numbers.
 */
export const REDIS_TTL = {
  /** 60 seconds — for short-lived tokens or rate-limit counters */
  SHORT: 60,
  /** 5 minutes — typical API response cache */
  MEDIUM: 5 * 60,
  /** 1 hour — infrequently-changing data (e.g. event listings) */
  LONG: 60 * 60,
  /** 24 hours — daily aggregates, dashboards */
  DAY: 24 * 60 * 60,
  /** 7 days — sessions, refresh tokens */
  WEEK: 7 * 24 * 60 * 60,
} as const;

/** Redis key namespace prefixes for logical grouping */
export const REDIS_NAMESPACE = {
  CACHE: 'cache',
  SESSION: 'session',
  RATE_LIMIT: 'rate_limit',
  LOCK: 'lock',
  QUEUE: 'queue',
} as const;
