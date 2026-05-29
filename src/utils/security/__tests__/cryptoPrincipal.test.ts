import crypto from "crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Set required env vars before any module reads them
process.env.HMAC_BLIND_INDEX_KEY = crypto.randomBytes(32).toString("hex");
process.env.KMS_PROVIDER = "local";
process.env.LOCAL_KMS_KEY = crypto.randomBytes(32).toString("hex");

import { generateAndWrapDek, toPrincipal } from "../crypto";
import { getCachedDek, setCachedDek, evictDek } from "../dekCache";
import { LocalKmsProvider, _resetKmsProvider } from "../kmsProviders";

describe("toPrincipal", () => {
  it("normalises a bare string to a user principal", () => {
    expect(toPrincipal("user-uuid")).toEqual({ type: "user", id: "user-uuid" });
  });

  it("passes a Principal object through unchanged", () => {
    const p = { type: "team" as const, id: "team-uuid" };
    expect(toPrincipal(p)).toBe(p);
  });

  it("treats string overload as user, never team", () => {
    // Defense against silent type defaulting — a future caller passing a
    // teamId string would be routed to the user DEK and the row would later
    // fail to decrypt. The string path explicitly maps to user.
    expect(toPrincipal("any-id").type).toBe("user");
  });
});

describe("dekCache principal isolation", () => {
  beforeEach(() => {
    // Cache is process-wide; clear before each test.
    evictDek({ type: "user", id: "isolation-id" });
    evictDek({ type: "team", id: "isolation-id" });
  });

  it("isolates user and team cache entries with the same id", () => {
    const userDek = Buffer.alloc(32, 0xaa);
    const teamDek = Buffer.alloc(32, 0xbb);
    setCachedDek({ type: "user", id: "isolation-id" }, 1, userDek);
    setCachedDek({ type: "team", id: "isolation-id" }, 1, teamDek);

    const fromUser = getCachedDek({ type: "user", id: "isolation-id" }, 1);
    const fromTeam = getCachedDek({ type: "team", id: "isolation-id" }, 1);

    expect(fromUser?.equals(userDek)).toBe(true);
    expect(fromTeam?.equals(teamDek)).toBe(true);
    expect(fromUser?.equals(fromTeam!)).toBe(false);
  });

  it("string overload routes to the user cache", () => {
    const userDek = Buffer.alloc(32, 0xcc);
    setCachedDek("string-routes-user", 1, userDek);
    const viaString = getCachedDek("string-routes-user", 1);
    const viaPrincipal = getCachedDek(
      { type: "user", id: "string-routes-user" },
      1,
    );
    expect(viaString?.equals(userDek)).toBe(true);
    expect(viaPrincipal?.equals(userDek)).toBe(true);

    // And it does NOT collide with the team cache for the same id.
    const teamMiss = getCachedDek(
      { type: "team", id: "string-routes-user" },
      1,
    );
    expect(teamMiss).toBeUndefined();
  });
});

describe("evictDek prefix-boundary", () => {
  beforeEach(() => {
    evictDek({ type: "team", id: "abc1" });
    evictDek({ type: "team", id: "abc123" });
  });

  it("does not evict sibling principals whose id is a prefix-extension", () => {
    // Without the trailing colon, evicting `team:abc1` would incorrectly
    // match `team:abc123:*` because of String.prototype.startsWith.
    const shortDek = Buffer.alloc(32, 0x11);
    const longDek = Buffer.alloc(32, 0x22);
    setCachedDek({ type: "team", id: "abc1" }, 1, shortDek);
    setCachedDek({ type: "team", id: "abc123" }, 1, longDek);

    evictDek({ type: "team", id: "abc1" });

    expect(getCachedDek({ type: "team", id: "abc1" }, 1)).toBeUndefined();
    expect(
      getCachedDek({ type: "team", id: "abc123" }, 1)?.equals(longDek),
    ).toBe(true);
  });

  it("evicts all versions for a principal", () => {
    setCachedDek({ type: "user", id: "multi-v" }, 1, Buffer.alloc(32, 0x01));
    setCachedDek({ type: "user", id: "multi-v" }, 2, Buffer.alloc(32, 0x02));
    setCachedDek({ type: "user", id: "multi-v" }, 3, Buffer.alloc(32, 0x03));

    evictDek({ type: "user", id: "multi-v" });

    expect(getCachedDek({ type: "user", id: "multi-v" }, 1)).toBeUndefined();
    expect(getCachedDek({ type: "user", id: "multi-v" }, 2)).toBeUndefined();
    expect(getCachedDek({ type: "user", id: "multi-v" }, 3)).toBeUndefined();
  });
});

describe("generateAndWrapDek", () => {
  beforeEach(() => {
    _resetKmsProvider();
    vi.restoreAllMocks();
  });

  it("returns a 32-byte rawDek and a non-empty wrappedDek", async () => {
    const { rawDek, wrappedDek } = await generateAndWrapDek();
    expect(rawDek.length).toBe(32);
    expect(wrappedDek.length).toBeGreaterThan(0);
  });

  it("produces a different rawDek on each call", async () => {
    const a = await generateAndWrapDek();
    const b = await generateAndWrapDek();
    expect(a.rawDek.equals(b.rawDek)).toBe(false);
  });

  it("zeroes rawDek when KMS wrap throws", async () => {
    // We control the buffer returned by crypto.randomBytes so we can hold a
    // reference and assert the bytes are zeroed on the error path.
    const sentinelBytes = Buffer.alloc(32, 0xff);
    const randomBytesSpy = vi
      .spyOn(crypto, "randomBytes")
      // randomBytes has many overloads — the spy needs a permissive cast.
      .mockImplementationOnce(((_size: number) => sentinelBytes) as never);

    const wrapSpy = vi
      .spyOn(LocalKmsProvider.prototype, "wrapKey")
      .mockRejectedValueOnce(new Error("kms unavailable"));

    await expect(generateAndWrapDek()).rejects.toThrow("kms unavailable");
    expect(sentinelBytes.every((b) => b === 0)).toBe(true);

    randomBytesSpy.mockRestore();
    wrapSpy.mockRestore();
  });
});
