export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '15000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    // Optional: password for Redis AUTH command. Leave empty for open Redis.
    password: process.env.REDIS_PASSWORD || undefined,
    // Redis logical database index (0–15). Default is 0.
    db: parseInt(process.env.REDIS_DB || '0', 10),
    // Key prefix — all keys written by this app will be namespaced.
    // Prevents collisions when multiple services share a Redis instance.
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'seatflow:',
  },
});
