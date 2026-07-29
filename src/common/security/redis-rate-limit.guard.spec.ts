import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RedisService } from "../../modules/redis/redis.service";
import { RedisRateLimitGuard } from "./redis-rate-limit.guard";

describe("RedisRateLimitGuard", () => {
  const options = { scope: "auth-login", limit: 2, windowSeconds: 60 };

  function setup(count: number) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(options),
    } as unknown as Reflector;
    const redis = {
      incrementWithTTL: jest
        .fn()
        .mockResolvedValue({ count, ttlSeconds: 45 }),
    } as unknown as RedisService;
    const headers = new Map<string, string>();
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ ip: "203.0.113.10", socket: {} }),
        getResponse: () => ({
          setHeader: (name: string, value: string) => headers.set(name, value),
        }),
      }),
    } as unknown as ExecutionContext;
    return {
      guard: new RedisRateLimitGuard(reflector, redis),
      context,
      headers,
    };
  }

  it("allows requests within the configured limit", async () => {
    const { guard, context, headers } = setup(2);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("returns 429 metadata after the limit is exceeded", async () => {
    const { guard, context, headers } = setup(3);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 429,
    });
    expect(headers.get("Retry-After")).toBe("45");
  });
});
