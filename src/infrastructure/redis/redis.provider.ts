import { Provider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { IRedisConfig } from './redis.interfaces';

/**
 * redis.provider.ts
 *
 * WHY THIS FILE EXISTS:
 * The provider is a NestJS factory provider that constructs and configures
 * the ioredis client. Separating this from RedisService has several benefits:
 *
 * 1. Single Responsibility — RedisService handles the API; the provider
 *    handles the connection lifecycle.
 * 2. Testability — you can inject a mock Redis client by replacing this
 *    provider in a test module without touching RedisService.
 * 3. Lifecycle control — NestJS calls the factory once, creating a true
 *    singleton. ioredis is NOT re-instantiated on every injection.
 *
 * HOW DEPENDENCY INJECTION WORKS:
 * - This provider uses `inject: [ConfigService]` to receive ConfigService.
 * - NestJS resolves ConfigService (which is global) and passes it to
 *   the `useFactory` function.
 * - The returned Redis instance is stored under the REDIS_CLIENT token.
 * - Any class that declares `@Inject(REDIS_CLIENT) private redis: Redis`
 *   receives the same singleton instance.
 *
 * HOW RECONNECT WORKS (ioredis built-in):
 * - ioredis automatically tries to reconnect on connection loss.
 * - `retryStrategy` controls the delay between each attempt.
 * - We implement exponential back-off with a cap and a maximum retry count.
 * - After `MAX_RETRY_ATTEMPTS`, we log a fatal error and return null to stop
 *   retrying — the application degrades gracefully instead of crashing.
 *
 * HOW GRACEFUL SHUTDOWN WORKS:
 * - The provider returns the client; RedisService calls client.quit() on
 *   module destroy via OnModuleDestroy.
 * - ioredis's quit() sends the QUIT command and waits for pending commands
 *   to complete before closing (unlike disconnect() which is immediate).
 */

const logger = new Logger('RedisProvider');
const MAX_RETRY_ATTEMPTS = 10;

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const config = configService.get<IRedisConfig>('redis');

    if (!config) {
      throw new Error(
        'Redis configuration not found. Ensure ConfigModule is loaded before RedisModule.',
      );
    }

    const client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password || undefined,
      db: config.db,
      // Key prefix — ioredis prepends this to EVERY key automatically.
      // This namespaces all app keys under 'seatflow:' preventing collisions
      // when multiple services or environments share a Redis instance.
      keyPrefix: config.keyPrefix,

      // ── Connection settings ────────────────────────────────────────────────
      // How long to wait for a connection before throwing an error.
      connectTimeout: 10_000,
      // Timeout for a single command. Prevents hung operations.
      commandTimeout: 5_000,
      // Keep the connection alive with TCP keepalive pings.
      keepAlive: 10_000,
      // Buffer commands while reconnecting instead of throwing errors.
      // This prevents thundering herd — if Redis is briefly unavailable,
      // commands queue up and execute once connected.
      enableOfflineQueue: true,
      // Maximum number of queued commands when offline.
      // Prevents unbounded memory growth if Redis is down for a long time.
      maxRetriesPerRequest: 3,

      // ── TLS for production ─────────────────────────────────────────────────
      // Uncomment when using Redis with TLS (e.g., Redis Cloud, Upstash):
      // tls: process.env.NODE_ENV === 'production' ? {} : undefined,

      // ── Retry strategy (exponential back-off) ─────────────────────────────
      retryStrategy(attempt: number): number | null {
        if (attempt >= MAX_RETRY_ATTEMPTS) {
          logger.error(
            `Redis: gave up reconnecting after ${MAX_RETRY_ATTEMPTS} attempts. ` +
              `The application will continue without Redis (degraded mode).`,
          );
          // Returning null tells ioredis to stop retrying.
          return null;
        }

        // Exponential back-off: 100ms, 200ms, 400ms … capped at 30s
        const delay = Math.min(100 * Math.pow(2, attempt), 30_000);
        logger.warn(
          `Redis: reconnect attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS} in ${delay}ms`,
        );
        return delay;
      },

      // ── Reconnect-on-error strategy ────────────────────────────────────────
      // Called when a command-level error occurs. Return true to force a
      // reconnect (useful for READONLY errors in Redis Cluster failover).
      reconnectOnError(err: Error): boolean | 1 | 2 {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        const shouldReconnect = targetErrors.some((e) => err.message.includes(e));
        if (shouldReconnect) {
          logger.warn(`Redis: reconnecting due to error: ${err.message}`);
        }
        return shouldReconnect;
      },
    });

    // ── Connection event logging ───────────────────────────────────────────────
    // These events allow monitoring without external APM tools during development.

    client.on('connect', () => {
      logger.log(`Redis: connecting to ${config.host}:${config.port} (db=${config.db})`);
    });

    client.on('ready', () => {
      logger.log(`Redis: connection established and ready ✓`);
    });

    client.on('error', (err: Error) => {
      logger.error(`Redis: connection error — ${err.message}`);
    });

    client.on('close', () => {
      logger.warn(`Redis: connection closed`);
    });

    client.on('reconnecting', (delay: number) => {
      logger.warn(`Redis: reconnecting in ${delay}ms…`);
    });

    client.on('end', () => {
      logger.warn(`Redis: connection ended (no more retries)`);
    });

    return client;
  },
};
