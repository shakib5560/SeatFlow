import { Injectable, NestMiddleware, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../../infrastructure/redis';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const ip =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      'unknown';

    // Partition limit keys by IP
    const key = `rate-limit:${ip}`;

    try {
      const current = await this.redisService.increment(key);
      if (current === 1) {
        // Set a 1-minute TTL for the rate limiting window
        await this.redisService.expire(key, 60);
      }

      // Limit to 100 requests per minute
      if (current > 100) {
        this.logger.warn(`Rate limit exceeded for IP: ${ip} | Requests count: ${current}`);
        return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
          success: false,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          timestamp: new Date().toISOString(),
          path: req.originalUrl,
        });
      }

      next();
    } catch (error) {
      // Degrade gracefully if Redis is temporarily unreachable
      this.logger.error('Failed to update rate limit registry in Redis', error);
      next();
    }
  }
}
