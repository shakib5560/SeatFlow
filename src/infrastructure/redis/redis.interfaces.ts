import { Redis, RedisOptions } from 'ioredis';

/**
 * redis.interfaces.ts
 *
 * WHY THIS FILE EXISTS:
 * Interfaces define the CONTRACT between the infrastructure layer and all
 * business modules that consume Redis.
 *
 * Key principle — Dependency Inversion (the D in SOLID):
 *   • Business modules depend on IRedisService (the interface/abstraction).
 *   • They do NOT depend on RedisService (the concrete implementation).
 *
 * Benefits:
 *   1. Unit testing: inject a mock that implements IRedisService — no real Redis needed.
 *   2. Replaceability: swap ioredis → valkey → memcached without changing service code.
 *   3. Documentation: clear API surface — teams know exactly what Redis can do.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuration interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed shape of the Redis configuration object loaded from ConfigService.
 * Matches the `redis` namespace in src/config/configuration.ts.
 */
export interface IRedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory options passed to the Redis provider.
 * Extends ioredis RedisOptions so the provider can pass any ioredis config
 * while still being typed against our config namespace.
 */
export interface IRedisProviderOptions extends RedisOptions {
  keyPrefix?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The public contract of RedisService.
 *
 * Business modules inject this interface — they never touch ioredis directly.
 * This hides all ioredis implementation details behind a clean API.
 */
export interface IRedisService {
  // ── Core key-value operations ──────────────────────────────────────────────

  /**
   * Set a key with an optional TTL (in seconds).
   * Serializes non-string values to JSON automatically.
   */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * Get a value by key. Returns null if not found.
   * Deserializes JSON automatically.
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * Delete one or more keys.
   */
  delete(...keys: string[]): Promise<number>;

  /**
   * Check if a key exists.
   */
  exists(key: string): Promise<boolean>;

  /**
   * Set or update the TTL (in seconds) of an existing key.
   */
  expire(key: string, ttl: number): Promise<boolean>;

  /**
   * Get the remaining TTL of a key in seconds. Returns -1 if no TTL, -2 if key doesn't exist.
   */
  ttl(key: string): Promise<number>;

  // ── Counter operations ─────────────────────────────────────────────────────

  /**
   * Atomically increment a key. Creates the key if it doesn't exist.
   */
  increment(key: string, by?: number): Promise<number>;

  /**
   * Atomically decrement a key.
   */
  decrement(key: string, by?: number): Promise<number>;

  // ── Cache helper operations ────────────────────────────────────────────────

  /**
   * Write a value to cache (alias of set with enforced TTL).
   */
  cache(key: string, value: unknown, ttl: number): Promise<void>;

  /**
   * Read from cache or compute and store the value if absent.
   * The factory function is only called on a cache miss.
   *
   * Pattern: Check cache → return if hit → call factory → store → return.
   */
  remember<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T>;

  /**
   * Delete all keys matching a pattern (invalidate a cache namespace).
   * Example: invalidate('events:*') clears all event cache entries.
   */
  invalidate(pattern: string): Promise<void>;

  /**
   * Get a value from cache, or set it using the factory if absent.
   * Alias of remember() with a different signature for readability.
   */
  getOrSet<T>(key: string, factory: () => Promise<T>, ttl: number): Promise<T>;

  // ── Pub/Sub ───────────────────────────────────────────────────────────────

  /**
   * Publish a message to a Redis channel.
   */
  publish(channel: string, message: unknown): Promise<number>;

  // ── Admin ─────────────────────────────────────────────────────────────────

  /**
   * Flush the current database. USE WITH EXTREME CAUTION — testing only.
   */
  flush(): Promise<void>;

  /**
   * Gracefully close the Redis connection.
   */
  disconnect(): Promise<void>;

  /**
   * Get the raw ioredis client. Only use for operations not covered by the service.
   * Business modules should avoid this — it breaks the abstraction.
   */
  getClient(): Redis;
}
