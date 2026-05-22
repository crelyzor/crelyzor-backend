import crypto from "crypto";
import { type Prisma } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { env } from "../../config/environment";
import { AppError } from "../errors/AppError";
import { logger } from "../logging/logger";
import { getKmsProvider } from "./kmsProviders";
import { getCachedDek, setCachedDek } from "./dekCache";

// Ciphertext layout: version(1) | iv(12 random) | ciphertext(variable) | authTag(16)
// The version byte maps to the DEK version that encrypted the record — enables rotation
// without re-encrypting existing data.
const CURRENT_VERSION = 1;

// ── Pure crypto functions (testable without DB) ──────────────────────────────

export function encryptWithKey(plaintext: string, dek: Buffer, version: number): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // always 16 bytes
  return Buffer.concat([Buffer.from([version]), iv, ct, tag]);
}

export function decryptWithKey(ciphertext: Buffer, dek: Buffer): string {
  if (ciphertext.length < 1 + 12 + 16) {
    throw new AppError("Invalid ciphertext: too short", 500);
  }
  // version byte is read by getDek — skip it here (we already have the correct DEK)
  const iv = ciphertext.subarray(1, 13);
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const ct = ciphertext.subarray(13, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    throw new AppError("Decryption failed — ciphertext is corrupted or DEK is wrong", 500);
  }
}

// Blind index: HMAC-SHA256(normalize(value), HMAC_BLIND_INDEX_KEY)
// Normalise = lowercase + trim to ensure consistent matching across different casings.
// Uses a single app-level key (never changes after initial deployment — stale indexes if changed).
export function blindIndex(value: string): Buffer {
  const hmacKey = Buffer.from(env.HMAC_BLIND_INDEX_KEY, "hex");
  const normalized = value.toLowerCase().trim();
  return crypto.createHmac("sha256", hmacKey).update(normalized, "utf8").digest();
}

// ── Prisma 6 Bytes compatibility ──────────────────────────────────────────────
// Prisma 6 types Bytes fields as Uint8Array<ArrayBuffer>, not Buffer<ArrayBufferLike>.
// At runtime, Node.js Buffers from crypto/alloc always use ArrayBuffer (never SharedArrayBuffer),
// so the cast is safe. We centralise the cast here so service code stays clean.
function prismaBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  return buf as unknown as Uint8Array<ArrayBuffer>;
}

function fromPrismaBytes(val: Uint8Array): Buffer {
  return Buffer.isBuffer(val)
    ? val
    : Buffer.from(val.buffer, val.byteOffset, val.byteLength);
}

// ── DEK resolution ────────────────────────────────────────────────────────────

// Fetches (and caches) the DEK for a given userId + version.
// On cache miss: reads wrappedDek from DB, unwraps via KMS.
// Versions > current version fall through to UserDekHistory for rotation support.
export async function getDek(userId: string, version: number): Promise<Buffer> {
  const cached = getCachedDek(userId, version);
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wrappedDek: true, dekVersion: true },
  });

  if (!user) throw new AppError("User not found for DEK resolution", 500);

  let wrappedDek: Buffer;

  if (user.dekVersion === version && user.wrappedDek) {
    wrappedDek = fromPrismaBytes(user.wrappedDek);
  } else {
    // Historical DEK version — look up UserDekHistory
    const history = await prisma.userDekHistory.findUnique({
      where: { userId_version: { userId, version } },
      select: { wrappedDek: true },
    });
    if (!history) {
      throw new AppError(`DEK version ${version} not found for user ${userId}`, 500);
    }
    wrappedDek = fromPrismaBytes(history.wrappedDek);
  }

  const dek = await getKmsProvider().unwrapKey(wrappedDek);
  setCachedDek(userId, version, dek);
  return dek;
}

// ── Public encryption API ─────────────────────────────────────────────────────

// Encrypts plaintext for a user. Always uses the current DEK version.
// Returns Uint8Array<ArrayBuffer> (Prisma 6 Bytes type) — safe cast; alloc uses ArrayBuffer.
export async function encrypt(
  plaintext: string,
  userId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wrappedDek: true, dekVersion: true },
  });

  if (!user?.wrappedDek) {
    throw new AppError(
      `Encryption not initialized for user ${userId} — initDekForNewUser must run first`,
      500
    );
  }

  let dek = getCachedDek(userId, user.dekVersion);
  if (!dek) {
    dek = await getKmsProvider().unwrapKey(fromPrismaBytes(user.wrappedDek));
    setCachedDek(userId, user.dekVersion, dek);
  }

  return prismaBytes(encryptWithKey(plaintext, dek, user.dekVersion));
}

// Decrypts a ciphertext. Reads the DEK version from byte 0 of the ciphertext.
// Accepts both Buffer (from tests/internal code) and Uint8Array<ArrayBuffer> (from Prisma 6).
export async function decrypt(
  ciphertext: Uint8Array,
  userId: string,
): Promise<string> {
  const buf = fromPrismaBytes(ciphertext);
  const version = buf[0];
  if (!version || version < 1) {
    throw new AppError("Invalid ciphertext: missing or invalid version byte", 500);
  }
  const dek = await getDek(userId, version);
  return decryptWithKey(buf, dek);
}

// ── User DEK initialisation ───────────────────────────────────────────────────

// Generates a fresh DEK for a new user, wraps it via KMS, and writes it to the DB.
// MUST be called inside or after the signup transaction.
// Returns the raw DEK so the caller can populate the cache AFTER the transaction commits.
// (Caching inside the tx risks a ghost DEK if the transaction rolls back.)
export async function initDekForNewUser(
  userId: string,
  tx?: Prisma.TransactionClient
): Promise<Buffer> {
  const rawDek = crypto.randomBytes(32);
  // KMS call happens BEFORE any DB write to minimise transaction hold time
  const wrappedDek = await getKmsProvider().wrapKey(rawDek);
  const db = tx ?? prisma;

  await db.user.update({
    where: { id: userId },
    data: { wrappedDek: prismaBytes(wrappedDek), dekVersion: CURRENT_VERSION },
  });

  await db.userDekHistory.create({
    data: {
      userId,
      version: CURRENT_VERSION,
      wrappedDek: prismaBytes(wrappedDek),
    },
  });

  logger.info("DEK initialised for new user", { userId });
  return rawDek;
}
