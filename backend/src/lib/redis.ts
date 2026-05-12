import Redis from "ioredis";
import { config } from "../config/index.js";

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export function tokenBlacklistKey(jti: string) {
  return `bl:jti:${jti}`;
}

export async function blacklistToken(jti: string, ttlSeconds: number) {
  await redis.set(tokenBlacklistKey(jti), "1", "EX", ttlSeconds);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const v = await redis.get(tokenBlacklistKey(jti));
  return v === "1";
}
