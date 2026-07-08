import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { correlationStorage } from '../logger/correlation.store';

// Extend Express Request to allow a typed requestId property
declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Check if correlation ID or request ID header is supplied by client/proxy
    const requestId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      randomUUID();

    // Attach to request context and set the response header
    req.requestId = requestId;
    res.setHeader('x-correlation-id', requestId);

    // Run request call chain within AsyncLocalStorage context
    correlationStorage.run(requestId, () => {
      next();
    });
  }
}
