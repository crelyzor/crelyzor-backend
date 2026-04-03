import { Redis } from "@upstash/redis";

let _redisClient: Redis | null = null;

/**
 * Lazy Redis client initializer.
 * Returns the singleton Upstash Redis instance, creating it on first call.
 * Throws if env vars are not configured. Callers should fail-open for
 * non-critical paths (e.g. rate limiting) and fail-closed for critical paths.
 */
export function getRedisClient(): Redis {
  if (_redisClient) return _redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required",
    );
  }

  _redisClient = new Redis({ url, token });
  return _redisClient;
}
