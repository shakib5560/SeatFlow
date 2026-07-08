import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, REDIS_NAMESPACE } from './redis.constants';
import { IRedisConfig, IRedisService } from './redis.interfaces';

/**
 * redis.service.ts
 *
 * WHY THIS FILE EXISTS:
 * RedisService is the ONLY class that business modules should ever import.
 * It acts as a facade over the raw ioredis client, providing:
 *
 * 1. A clean, typed API — no ioredis internals leak to callers.
 * 2. Automatic JSON serialisation/deserialisation.
 * 3. Structured key building with namespace prefixes.
 * 4. Higher-level patterns: remember(), getOrSet(), invalidate().
 * 5. Graceful error handling — Redis failures are logged and re-thrown;
 *    callers can decide to degrade gracefully.
 *
 * HOW DEPENDENCY INJECTION WORKS:
 * - @Inject(REDIS_CLIENT) receives the ioredis instance created by RedisProvider.
 * - This is a constructor injection pattern — the same singleton is shared
 *   across every service that injects RedisService.
 *
 * HOW GRACEFUL SHUTDOWN WORKS:
 * - OnModuleDestroy.onModuleDestroy() is called by NestJS on app shutdown.
 * - We call client.quit() which sends QUIT to Redis and waits for all pending
 *   commands to complete before closing the TCP connection.
 * - This prevents data loss if commands are in-flight during shutdown.
 *
 * SERIALISATION STRATEGY:
 * - All values are JSON.stringify'd before storage and JSON.parse'd on retrieval.
 * - This supports storing objects, arrays, numbers, booleans — not just strings.
 * - Storing raw strings (e.g. tokens) still works: JSON.stringify("abc") = '"abc"'
 *   and JSON.parse('"abc"') = 'abc'.
 */
@Injectable()
export class RedisService
  implements IRedisService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisService.name);
  private readonly keyPrefix: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    private readonly configService: ConfigService,
  ) {
    const config = this.configService.get<IRedisConfig>('redis');
    // Store keyPrefix locally for use in pattern-based operations (SCAN).
    // Note: ioredis prepends keyPrefix automatically on individual commands,
    // but for SCAN patterns we need to handle it manually.
    this.keyPrefix = config?.keyPrefix ?? 'seatflow:';
  }

  async onModuleInit(): Promise<void> {
    // Ping Redis on startup to validate connectivity early.
    // This surfaces connection problems before the first real request arrives.
    try {
      const pong = await this.client.ping();
      this.logger.log(`Redis health check: ${pong}`);
    } catch (err) {
      this.logger.error(`Redis health check failed on startup`, err);
      // We do NOT throw here — the application starts even if Redis is down.
      // Individual operations will fail when called and callers handle it.
    }
  }

  async onModuleDestroy(): Promise<void> {
    // quit() is graceful: waits for pending commands to complete.
    // disconnect() is immediate: drops the connection instantly.
    await this.client.quit();
    this.logger.log('Redis connection closed gracefully');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build a namespaced key.
   *
   * Example: buildKey('cache', 'events', '123') → 'cache:events:123'
   *
   * The keyPrefix ('seatflow:') is prepended automatically by ioredis.
   * So the actual key in Redis will be: 'seatflow:cache:events:123'
   *
   * WHY NAMESPACING MATTERS:
   * Without namespaces, keys from different features collide:
   *   'user:1' (from UserService) vs 'user:1' (from SessionService) = chaos.
   * With namespaces: 'cache:user:1' and 'session:user:1' are distinct.
   */
  private buildKey(...parts: string[]): string {
    return parts.filter(Boolean).join(':');
  }

  /** Serialise a value to a JSON string for storage. */
  private serialise(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      throw new Error(`Redis: failed to serialise value: ${String(value)}`);
    }
  }

  /** Deserialise a JSON string back to its original type. */
  private deserialise<T>(value: string | null): T | null {
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      // If the value was stored as a plain string (not JSON), return it as-is.
      return value as unknown as T;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core key-value operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set a key with an optional TTL in seconds.
   *
   * Uses SET key value EX ttl (atomic — no separate EXPIRE call needed).
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialised = this.serialise(value);
    if (ttl !== undefined && ttl > 0) {
      await this.client.set(key, serialised, 'EX', ttl);
    } else {
      await this.client.set(key, serialised);
    }
  }

  /**
   * Get a value by key. Returns null if not found.
   * Automatically deserialises JSON.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return this.deserialise<T>(value);
  }

  /**
   * Delete one or more keys. Returns the number of keys deleted.
   */
  async delete(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  /**
   * Check if a key exists. Returns true if found.
   */
  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  /**
   * Set or refresh the TTL of a key (in seconds).
   * Returns true if the key exists and TTL was set.
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    const result = await this.client.expire(key, ttl);
    return result === 1;
  }

  /**
   * Get the remaining TTL of a key.
   * Returns -1 if no TTL is set, -2 if key does not exist.
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Counter operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Atomically increment a numeric value stored at key.
   * Creates the key at 0 if it doesn't exist, then increments.
   * Useful for: view counters, rate limiting, sequence generation.
   */
  async increment(key: string, by: number = 1): Promise<number> {
    if (by === 1) return this.client.incr(key);
    return this.client.incrby(key, by);
  }

  /**
   * Atomically decrement a numeric value stored at key.
   */
  async decrement(key: string, by: number = 1): Promise<number> {
    if (by === 1) return this.client.decr(key);
    return this.client.decrby(key, by);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cache helper operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Store a value in the cache namespace with a mandatory TTL.
   *
   * WHY MANDATORY TTL:
   * Cache entries without a TTL grow forever and can fill Redis to OOM.
   * Making TTL required forces callers to make an explicit decision about
   * how long data should live.
   */
  async cache(key: string, value: unknown, ttl: number): Promise<void> {
    const cacheKey = this.buildKey(REDIS_NAMESPACE.CACHE, key);
    await this.set(cacheKey, value, ttl);
  }

  /**
   * remember() — the fundamental cache-aside pattern.
   *
   * FLOW:
   *   1. Check Redis for the key.
   *   2. If found (cache hit): deserialise and return immediately.
   *   3. If not found (cache miss): call factory() to produce the value.
   *   4. Store the result in Redis with the given TTL.
   *   5. Return the fresh value.
   *
   * WHY THIS PATTERN:
   * Without remember(), every service would duplicate this if/else logic:
   *   const cached = await redis.get(key);
   *   if (cached) return cached;
   *   const fresh = await db.findOne(...);
   *   await redis.set(key, fresh, ttl);
   *   return fresh;
   *
   * With remember(), this collapses to one line.
   */
  async remember<T>(
    key: string,
    ttl: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cacheKey = this.buildKey(REDIS_NAMESPACE.CACHE, key);

    const cached = await this.get<T>(cacheKey);
    if (cached !== null) {
      this.logger.debug(`Cache HIT: ${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Cache MISS: ${cacheKey} — fetching from source`);
    const value = await factory();
    await this.set(cacheKey, value, ttl);
    return value;
  }

  /**
   * getOrSet() — alias for remember() with a different argument order.
   * Some teams find this signature more readable.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number,
  ): Promise<T> {
    return this.remember<T>(key, ttl, factory);
  }

  /**
   * Invalidate all keys matching a glob pattern.
   *
   * Uses SCAN instead of KEYS for production safety.
   *
   * WHY SCAN OVER KEYS:
   * KEYS is O(N) and blocks the Redis event loop while scanning.
   * On a large keyspace this can freeze Redis for seconds.
   * SCAN is O(1) per iteration and non-blocking — it scans in batches.
   *
   * Example: invalidate('events:*') deletes all event cache keys.
   */
  async invalidate(pattern: string): Promise<void> {
    // Build the full pattern including the keyPrefix so SCAN finds the right keys.
    const fullPattern = `${this.keyPrefix}${REDIS_NAMESPACE.CACHE}:${pattern}`;
    const keys = await this.scanKeys(fullPattern);

    if (keys.length === 0) {
      this.logger.debug(
        `Cache invalidate: no keys matched pattern '${fullPattern}'`,
      );
      return;
    }

    // Strip the keyPrefix from keys before calling DEL — ioredis adds it back.
    const strippedKeys = keys.map((k) => k.slice(this.keyPrefix.length));
    await this.client.del(...strippedKeys);
    this.logger.log(
      `Cache invalidated: ${keys.length} keys matching '${fullPattern}'`,
    );
  }

  /**
   * Scan all keys matching a pattern using SCAN cursor iteration.
   * Returns the full list of matching key names (with keyPrefix).
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pub/Sub
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Publish a message to a Redis channel.
   *
   * NOTE: For production Pub/Sub with multiple subscribers, use a dedicated
   * subscriber client (a separate ioredis instance). A client in subscribe
   * mode cannot execute regular commands. See the BONUS section of the readme.
   */
  async publish(channel: string, message: unknown): Promise<number> {
    return this.client.publish(channel, this.serialise(message));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Admin / lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Flush the current Redis database.
   * WARNING: Deletes ALL keys. Only use in tests or emergency cache clearing.
   */
  async flush(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'flush() is disabled in production to prevent accidental data loss.',
      );
    }
    await this.client.flushdb();
    this.logger.warn('Redis database flushed (all keys deleted)');
  }

  /**
   * Gracefully close the Redis connection.
   * NestJS calls onModuleDestroy() automatically — call this only if you
   * need to close the connection manually before app shutdown.
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Get the raw ioredis client.
   * Exposed for advanced use cases (pipelines, transactions, Lua scripts).
   * Business services should avoid using this — it breaks the abstraction.
   */
  getClient(): Redis {
    return this.client;
  }
}
