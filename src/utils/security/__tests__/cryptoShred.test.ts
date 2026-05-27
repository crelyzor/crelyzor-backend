import crypto from "crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { encryptWithKey, decryptWithKey } from "../crypto";
import { getCachedDek, setCachedDek, evictDek } from "../dekCache";
import { LocalKmsProvider } from "../kmsProviders";

// Simulates the crypto-shred path: after evictDek + wrappedDek destroyed in DB,
// no cached DEK can be retrieved and ciphertext from old DEK cannot be decrypted
// with any subsequently generated DEK.

const LOCAL_KEY = crypto.randomBytes(32).toString("hex");
const provider = new LocalKmsProvider(LOCAL_KEY);

describe("crypto-shredding behaviour", () => {
  const userId = "shred-test-user";
  const version = 1;
  let originalDek: Buffer;
  let ciphertext: Buffer;

  beforeAll(async () => {
    // Simulate a user with an active DEK
    originalDek = crypto.randomBytes(32);
    ciphertext = encryptWithKey("sensitive transcript text", originalDek, version);
    setCachedDek(userId, version, originalDek);
  });

  it("can decrypt with cached DEK before shred", () => {
    const cached = getCachedDek(userId, version);
    expect(cached).toBeDefined();
    expect(decryptWithKey(ciphertext, cached!)).toBe("sensitive transcript text");
  });

  it("cache returns undefined after evictDek (DEK shredded)", () => {
    evictDek(userId);
    expect(getCachedDek(userId, version)).toBeUndefined();
  });

  it("ciphertext cannot be decrypted with a newly generated DEK (different key)", () => {
    const newDek = crypto.randomBytes(32);
    expect(() => decryptWithKey(ciphertext, newDek)).toThrow();
  });

  it("wrapping + unwrapping a new DEK does not recover original DEK material", async () => {
    const rawDek = crypto.randomBytes(32);
    const wrapped = await provider.wrapKey(rawDek);
    const unwrapped = await provider.unwrapKey(wrapped);
    // Confirm new DEK cannot decrypt data encrypted under original DEK
    expect(() => decryptWithKey(ciphertext, unwrapped)).toThrow();
  });
});
