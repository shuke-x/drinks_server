import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
@Injectable()
export class RedisService {
  constructor(@Inject("REDIS_CLIENT") private readonly client: Redis) {}
  async get<T>(key: string): Promise<T | null> {
    const x = await this.client.get(key);
    return x ? (JSON.parse(x) as T) : null;
  }
  async set(key: string, value: unknown) {
    await this.client.set(key, JSON.stringify(value));
  }
  async withTTL(key: string, value: unknown, seconds: number) {
    await this.client.set(
      key,
      JSON.stringify(value),
      "EX",
      Math.max(1, seconds),
    );
  }
  /** Atomically consume a one-time value; a concurrent replay cannot read it. */
  async take<T>(key: string): Promise<T | null> {
    const value = (await this.client.eval(
      "local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]) end; return v",
      1,
      key,
    )) as string | null;
    return value ? (JSON.parse(value) as T) : null;
  }
  /** SET NX makes request-id replay protection safe across API instances. */
  async setIfAbsent(
    key: string,
    value: unknown,
    seconds: number,
  ): Promise<boolean> {
    const result = await this.client.set(
      key,
      JSON.stringify(value),
      "EX",
      Math.max(1, seconds),
      "NX",
    );
    return result === "OK";
  }
  /** Atomically increment a fixed-window counter and return its remaining TTL. */
  async incrementWithTTL(key: string, seconds: number) {
    const result = (await this.client.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; local ttl=redis.call('TTL',KEYS[1]); return {n,ttl}",
      1,
      key,
      Math.max(1, seconds),
    )) as [number, number];
    return {
      count: Number(result[0]),
      ttlSeconds: Math.max(1, Number(result[1])),
    };
  }
  async del(pattern: string) {
    if (!pattern.includes("*")) {
      await this.client.del(pattern);
      return;
    }
    let cursor = "0";
    do {
      const [next, keys] = await this.client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100,
      );
      cursor = next;
      if (keys.length) await this.client.del(...keys);
    } while (cursor !== "0");
  }
}
