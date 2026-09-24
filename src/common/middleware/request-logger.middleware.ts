import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.locals.requestId = requestId;
    res.on('finish', () => {
      // Route templates contain no search terms, account IDs or user input.
      const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
      console.info(JSON.stringify({
        event: 'http_request', requestId, method: req.method,
        route, status: res.statusCode, durationMs: Date.now() - start,
      }));
    });
    next();
  }
}
