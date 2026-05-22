import NodeCache from "node-cache";

// 200 entries, 60s TTL. useClones:false keeps storage lean (DEKs are 32-byte Buffers).
// get() returns a copy so callers cannot mutate the cached key material.
const cache = new NodeCache({ stdTTL: 60, maxKeys: 200, useClones: false });

function cacheKey(userId: string, version: number): string {
  return `${userId}:${version}`;
}

export function getCachedDek(userId: string, version: number): Buffer | undefined {
  const val = cache.get<Buffer>(cacheKey(userId, version));
  if (!val) return undefined;
  // Return a copy — callers must not mutate the cached DEK
  return Buffer.from(val);
}

export function setCachedDek(userId: string, version: number, dek: Buffer): void {
  cache.set(cacheKey(userId, version), dek);
}

// Evict all versions for this user — called on DEK rotation
export function evictDek(userId: string): void {
  const keys = cache.keys().filter((k) => k.startsWith(`${userId}:`));
  if (keys.length > 0) cache.del(keys);
}
