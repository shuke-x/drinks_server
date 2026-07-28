import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly log = new Logger("HTTP");
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    res.on("finish", () =>
      this.log.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
      ),
    );
    next();
  }
}
