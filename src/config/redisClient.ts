import IORedis from "ioredis";

let _client: IORedis | null = null;

export function getRedisClient(): IORedis {
  if (_client) return _client;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is required");
  }

  _client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return _client;
}

export function closeRedisClient(): void {
  if (_client) {
    _client.disconnect();
    _client = null;
  }
}
