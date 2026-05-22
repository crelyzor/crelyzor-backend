import crypto from "crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { encryptWithKey, decryptWithKey, blindIndex } from "../crypto";
import { LocalKmsProvider, _resetKmsProvider } from "../kmsProviders";
import { getCachedDek, setCachedDek, evictDek } from "../dekCache";

// Set required env vars before any module reads them
process.env.HMAC_BLIND_INDEX_KEY = crypto.randomBytes(32).toString("hex");
process.env.KMS_PROVIDER = "local";
process.env.LOCAL_KMS_KEY = crypto.randomBytes(32).toString("hex");

const TEST_DEK = crypto.randomBytes(32);
const TEST_VERSION = 1;

describe("encryptWithKey / decryptWithKey", () => {
  it("round-trips plaintext correctly", () => {
    const ct = encryptWithKey("hello world", TEST_DEK, TEST_VERSION);
    const plain = decryptWithKey(ct, TEST_DEK);
    expect(plain).toBe("hello world");
  });

  it("encrypts empty string", () => {
    const ct = encryptWithKey("", TEST_DEK, TEST_VERSION);
    const plain = decryptWithKey(ct, TEST_DEK);
    expect(plain).toBe("");
  });

  it("encrypts unicode correctly", () => {
    const input = "Héllo wörld — 日本語テスト 🔐";
    const ct = encryptWithKey(input, TEST_DEK, TEST_VERSION);
    const plain = decryptWithKey(ct, TEST_DEK);
    expect(plain).toBe(input);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const ct1 = encryptWithKey("same plaintext", TEST_DEK, TEST_VERSION);
    const ct2 = encryptWithKey("same plaintext", TEST_DEK, TEST_VERSION);
    expect(ct1.equals(ct2)).toBe(false);
  });

  it("embeds version byte correctly", () => {
    const ct = encryptWithKey("test", TEST_DEK, TEST_VERSION);
    expect(ct[0]).toBe(TEST_VERSION);
  });

  it("ciphertext is at least version(1) + iv(12) + authTag(16) bytes", () => {
    const ct = encryptWithKey("x", TEST_DEK, TEST_VERSION);
    expect(ct.length).toBeGreaterThanOrEqual(1 + 12 + 16);
  });

  it("throws on tampered ciphertext (GCM auth tag fails)", () => {
    const ct = encryptWithKey("secret", TEST_DEK, TEST_VERSION);
    // Flip a byte in the ciphertext body (after version + iv, before auth tag)
    ct[14] ^= 0xff;
    expect(() => decryptWithKey(ct, TEST_DEK)).toThrow();
  });

  it("throws on wrong DEK", () => {
    const ct = encryptWithKey("secret", TEST_DEK, TEST_VERSION);
    const wrongDek = crypto.randomBytes(32);
    expect(() => decryptWithKey(ct, wrongDek)).toThrow();
  });

  it("throws if ciphertext is too short", () => {
    expect(() => decryptWithKey(Buffer.from([1, 2, 3]), TEST_DEK)).toThrow();
  });
});

describe("blindIndex", () => {
  it("is deterministic", () => {
    const a = blindIndex("jane@example.com");
    const b = blindIndex("jane@example.com");
    expect(a.equals(b)).toBe(true);
  });

  it("normalises to lowercase", () => {
    const lower = blindIndex("jane@example.com");
    const upper = blindIndex("JANE@EXAMPLE.COM");
    expect(lower.equals(upper)).toBe(true);
  });

  it("normalises whitespace (trim)", () => {
    const plain = blindIndex("jane@example.com");
    const padded = blindIndex("  jane@example.com  ");
    expect(plain.equals(padded)).toBe(true);
  });

  it("different values produce different indexes", () => {
    const a = blindIndex("alice@example.com");
    const b = blindIndex("bob@example.com");
    expect(a.equals(b)).toBe(false);
  });

  it("returns a 32-byte Buffer (SHA-256 output)", () => {
    const idx = blindIndex("test@test.com");
    expect(idx.length).toBe(32);
  });
});

describe("LocalKmsProvider", () => {
  const masterKey = crypto.randomBytes(32).toString("hex");
  let provider: LocalKmsProvider;

  beforeAll(() => {
    provider = new LocalKmsProvider(masterKey);
  });

  it("wraps and unwraps a DEK correctly", async () => {
    const rawDek = crypto.randomBytes(32);
    const wrapped = await provider.wrapKey(rawDek);
    const unwrapped = await provider.unwrapKey(wrapped);
    expect(rawDek.equals(unwrapped)).toBe(true);
  });

  it("produces different wrapped output each call (random IV)", async () => {
    const rawDek = crypto.randomBytes(32);
    const w1 = await provider.wrapKey(rawDek);
    const w2 = await provider.wrapKey(rawDek);
    expect(w1.equals(w2)).toBe(false);
  });

  it("throws on tampered wrapped key", async () => {
    const rawDek = crypto.randomBytes(32);
    const wrapped = await provider.wrapKey(rawDek);
    wrapped[20] ^= 0xff; // tamper body
    await expect(provider.unwrapKey(wrapped)).rejects.toThrow();
  });

  it("throws if LOCAL_KMS_KEY is not 32 bytes", () => {
    expect(() => new LocalKmsProvider("tooshort")).toThrow();
  });
});

describe("dekCache", () => {
  const userId = "test-user-123";
  const version = 1;
  const dek = crypto.randomBytes(32);

  it("returns undefined for uncached entry", () => {
    evictDek(userId);
    expect(getCachedDek(userId, version)).toBeUndefined();
  });

  it("returns a copy of the cached DEK (not the same reference)", () => {
    setCachedDek(userId, version, dek);
    const retrieved = getCachedDek(userId, version);
    expect(retrieved).toBeDefined();
    expect(retrieved!.equals(dek)).toBe(true);
    // Mutating the returned copy must not affect the cache
    retrieved![0] ^= 0xff;
    const retrieved2 = getCachedDek(userId, version);
    expect(retrieved2!.equals(dek)).toBe(true);
  });

  it("evicts all versions for a user", () => {
    setCachedDek(userId, 1, dek);
    setCachedDek(userId, 2, dek);
    evictDek(userId);
    expect(getCachedDek(userId, 1)).toBeUndefined();
    expect(getCachedDek(userId, 2)).toBeUndefined();
  });
});
