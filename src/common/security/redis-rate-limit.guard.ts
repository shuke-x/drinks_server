import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "crypto";
import { Request, Response } from "express";
import { RedisService } from "../../modules/redis/redis.service";
import {
  RATE_LIMIT_METADATA,
  RateLimitOptions,
} from "./rate-limit.decorator";

type AuthenticatedRequest = Request & {
  authUser?: { id: string; email: string };
};

@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const identity =
      options.byUser && request.authUser?.id
        ? `user:${request.authUser.id}`
        : `ip:${request.ip || request.socket.remoteAddress || "unknown"}`;
    const identityHash = createHash("sha256").update(identity).digest("hex");
    const key = `rate-limit:${options.scope}:${identityHash}`;
    const result = await this.redis.incrementWithTTL(
      key,
      options.windowSeconds,
    );

    response.setHeader("X-RateLimit-Limit", String(options.limit));
    response.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, options.limit - result.count)),
    );
    response.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(Date.now() / 1000) + result.ttlSeconds),
    );

    if (result.count <= options.limit) return true;

    response.setHeader("Retry-After", String(result.ttlSeconds));
    throw new HttpException(
      "Too many requests; please try again later",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
