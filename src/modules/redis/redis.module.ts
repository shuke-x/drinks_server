import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { RedisService } from "./redis.service";
import { RedisRateLimitGuard } from "../../common/security/redis-rate-limit.guard";
@Global()
@Module({
  providers: [
    {
      provide: "REDIS_CLIENT",
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        new Redis({
          host: c.get("REDIS_HOST", "localhost"),
          port: c.get<number>("REDIS_PORT", 6379),
          lazyConnect: false,
          maxRetriesPerRequest: 2,
        }),
    },
    RedisService,
    RedisRateLimitGuard,
  ],
  exports: [RedisService, RedisRateLimitGuard],
})
export class RedisModule {}
