import NodeCache from "node-cache";
import type { Principal } from "./crypto";
import { toPrincipal } from "./crypto";

// 200 entries, 60s TTL. useClones:false keeps storage lean (DEKs are 32-byte Buffers).
// get() returns a copy so callers cannot mutate the cached key material.
const cache = new NodeCache({ stdTTL: 60, maxKeys: 200, useClones: false });

// Cache key shape: `${type}:${id}:${version}`.
// The `type` prefix guarantees disjoint keyspaces between user and team
// principals, even if they happen to share a UUID (theoretical edge case;
// UUID v4 collisions are negligible but the prefix makes the invariant
// structural rather than probabilistic).
function cacheKey(principal: Principal, version: number): string {
  return `${principal.type}:${principal.id}:${version}`;
}

export function getCachedDek(
  principal: Principal | string,
  version: number,
): Buffer | undefined {
  const p = toPrincipal(principal);
  const val = cache.get<Buffer>(cacheKey(p, version));
  if (!val) return undefined;
  // Return a copy — callers must not mutate the cached DEK
  return Buffer.from(val);
}

export function setCachedDek(
  principal: Principal | string,
  version: number,
  dek: Buffer,
): void {
  const p = toPrincipal(principal);
  cache.set(cacheKey(p, version), dek);
}

// Evict all versions for this principal — called on DEK rotation or shred.
// The eviction prefix MUST include the trailing colon to prevent prefix-of
// bugs: evicting `team:abc1` would otherwise also clear `team:abc123:*`.
export function evictDek(principal: Principal | string): void {
  const p = toPrincipal(principal);
  const prefix = `${p.type}:${p.id}:`;
  const keys = cache.keys().filter((k) => k.startsWith(prefix));
  if (keys.length > 0) cache.del(keys);
}
