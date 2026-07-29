import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_METADATA = "rate-limit";

export type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
  scope: string;
  byUser?: boolean;
};

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA, options);
