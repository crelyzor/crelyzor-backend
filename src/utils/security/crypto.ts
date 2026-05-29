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

// ── Principal ─────────────────────────────────────────────────────────────────

// A Principal identifies whose DEK to use. Phase 6 introduces team principals
// alongside the per-user principals shipped in Phase 5. Team-scoped content
// (rows where `teamId` is non-null) encrypts under the team DEK; everything
// else continues to encrypt under the row owner's user DEK.
export type Principal = { type: "user" | "team"; id: string };

// Normalise a string-or-Principal argument into a Principal. A bare string is
// always interpreted as a user principal — Phase 5's API surface assumed user
// scoping, and 200+ call sites pass userIds today. New code added during Phase
// 6 P5 and later SHOULD pass an explicit Principal to avoid silently defaulting
// team-scoped writes back to the user DEK.
export function toPrincipal(principal: Principal | string): Principal {
  return typeof principal === "string"
    ? { type: "user", id: principal }
    : principal;
}

// ── Pure crypto functions (testable without DB) ──────────────────────────────

export function encryptWithKey(
  plaintext: string,
  dek: Buffer,
  version: number,
): Buffer {
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
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new AppError(
      "Decryption failed — ciphertext is corrupted or DEK is wrong",
      500,
    );
  }
}

// Blind index: HMAC-SHA256(normalize(value), HMAC_BLIND_INDEX_KEY)
// Normalise = lowercase + trim to ensure consistent matching across different casings.
// Uses a single app-level key (never changes after initial deployment — stale indexes if changed).
export function blindIndex(value: string): Buffer {
  const hmacKey = Buffer.from(env.HMAC_BLIND_INDEX_KEY, "hex");
  const normalized = value.toLowerCase().trim();
  return crypto
    .createHmac("sha256", hmacKey)
    .update(normalized, "utf8")
    .digest();
}

// ── Prisma 6 Bytes compatibility ──────────────────────────────────────────────
// Prisma 6 types Bytes fields as Uint8Array<ArrayBuffer>, not Buffer<ArrayBufferLike>.
// At runtime, Node.js Buffers from crypto/alloc always use ArrayBuffer (never SharedArrayBuffer),
// so the cast is safe. We centralise the cast here so service code stays clean.
export function prismaBytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  return buf as unknown as Uint8Array<ArrayBuffer>;
}

function fromPrismaBytes(val: Uint8Array): Buffer {
  return Buffer.isBuffer(val)
    ? val
    : Buffer.from(val.buffer, val.byteOffset, val.byteLength);
}

// ── DEK generation ────────────────────────────────────────────────────────────

/**
 * Generates a fresh 32-byte DEK and KMS-wraps it. Always do this OUTSIDE a
 * Prisma transaction — KMS is network I/O and we don't want to hold the tx
 * for the round-trip.
 *
 * **Buffer ownership contract:**
 * - On success the caller receives both `rawDek` and `wrappedDek`. The caller
 *   is responsible for zeroing `rawDek` after it has been used (e.g. populating
 *   the in-memory cache or returning from `initDekForNewUser`).
 * - On KMS failure this function zeros `rawDek` before rethrowing so the raw
 *   key material does not leak via stack frames or unhandled error paths.
 */
export async function generateAndWrapDek(): Promise<{
  rawDek: Buffer;
  wrappedDek: Buffer;
}> {
  const rawDek = crypto.randomBytes(32);
  try {
    const wrappedDek = await getKmsProvider().wrapKey(rawDek);
    return { rawDek, wrappedDek };
  } catch (err) {
    rawDek.fill(0);
    throw err;
  }
}

// ── DEK resolution ────────────────────────────────────────────────────────────

// Fetches (and caches) the DEK for a given principal + version.
// On cache miss: reads wrappedDek from DB, unwraps via KMS.
// Versions != current version fall through to the principal's *DekHistory
// table for rotation support.
export async function getDek(
  principal: Principal | string,
  version: number,
): Promise<Buffer> {
  const p = toPrincipal(principal);

  const cached = getCachedDek(p, version);
  if (cached) return cached;

  const wrappedDek =
    p.type === "user"
      ? await loadUserWrappedDek(p.id, version)
      : await loadTeamWrappedDek(p.id, version);

  const dek = await getKmsProvider().unwrapKey(wrappedDek);
  setCachedDek(p, version, dek);
  return dek;
}

async function loadUserWrappedDek(
  userId: string,
  version: number,
): Promise<Buffer> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wrappedDek: true, dekVersion: true },
  });

  if (!user) throw new AppError("User not found for DEK resolution", 500);

  if (user.dekVersion === version && user.wrappedDek) {
    return fromPrismaBytes(user.wrappedDek);
  }

  const history = await prisma.userDekHistory.findUnique({
    where: { userId_version: { userId, version } },
    select: { wrappedDek: true },
  });
  if (!history) {
    throw new AppError(
      `DEK version ${version} not found for user ${userId}`,
      500,
    );
  }
  return fromPrismaBytes(history.wrappedDek);
}

async function loadTeamWrappedDek(
  teamId: string,
  version: number,
): Promise<Buffer> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { wrappedDek: true, dekVersion: true, isDeleted: true },
  });

  // Team.wrappedDek is NOT NULL on the schema; a null read indicates a
  // serious data invariant violation. Fail closed and log loudly — never
  // fall back to a user DEK lookup.
  if (!team || !team.wrappedDek) {
    logger.error("team.dek.missing", {
      teamId,
      teamFound: Boolean(team),
      isDeleted: team?.isDeleted ?? null,
    });
    throw new AppError("Team DEK not provisioned", 500);
  }

  if (team.dekVersion === version) {
    return fromPrismaBytes(team.wrappedDek);
  }

  const history = await prisma.teamDekHistory.findUnique({
    where: { teamId_version: { teamId, version } },
    select: { wrappedDek: true },
  });
  if (!history) {
    throw new AppError(
      `DEK version ${version} not found for team ${teamId}`,
      500,
    );
  }
  return fromPrismaBytes(history.wrappedDek);
}

// ── Public encryption API ─────────────────────────────────────────────────────

// Helper that resolves the current DEK + version for an arbitrary principal
// before encryption. Caches the result via the standard cache path.
async function resolveCurrentDek(
  principal: Principal,
): Promise<{ dek: Buffer; version: number }> {
  if (principal.type === "user") {
    const user = await prisma.user.findUnique({
      where: { id: principal.id },
      select: { wrappedDek: true, dekVersion: true },
    });
    if (!user?.wrappedDek) {
      throw new AppError(
        `Encryption not initialized for user ${principal.id} — initDekForNewUser must run first`,
        500,
      );
    }
    let dek = getCachedDek(principal, user.dekVersion);
    if (!dek) {
      dek = await getKmsProvider().unwrapKey(fromPrismaBytes(user.wrappedDek));
      setCachedDek(principal, user.dekVersion, dek);
    }
    return { dek, version: user.dekVersion };
  }

  const team = await prisma.team.findUnique({
    where: { id: principal.id },
    select: { wrappedDek: true, dekVersion: true },
  });
  if (!team?.wrappedDek) {
    logger.error("team.dek.missing", { teamId: principal.id });
    throw new AppError("Team DEK not provisioned", 500);
  }
  let dek = getCachedDek(principal, team.dekVersion);
  if (!dek) {
    dek = await getKmsProvider().unwrapKey(fromPrismaBytes(team.wrappedDek));
    setCachedDek(principal, team.dekVersion, dek);
  }
  return { dek, version: team.dekVersion };
}

/**
 * Encrypts plaintext under the given principal's current DEK.
 *
 * **Prefer the explicit `Principal` form in new code.** The bare-string overload
 * is preserved for Phase 5 back-compat (~200 existing call sites pass userIds)
 * but always routes to `{type:"user",id}`. Passing a string in a team-scoped
 * write would silently write under the wrong DEK and the row would later fail
 * to decrypt — that's the failure mode the explicit form eliminates.
 */
export async function encrypt(
  plaintext: string,
  principal: Principal | string,
): Promise<Uint8Array<ArrayBuffer>> {
  const p = toPrincipal(principal);
  const { dek, version } = await resolveCurrentDek(p);
  return prismaBytes(encryptWithKey(plaintext, dek, version));
}

/**
 * Decrypts a ciphertext under the given principal. The DEK version is read
 * from byte 0 of the ciphertext, so historical rows encrypted under a rotated
 * key are still decryptable.
 *
 * **Prefer the explicit `Principal` form in new code** — see `encrypt`.
 */
export async function decrypt(
  ciphertext: Uint8Array,
  principal: Principal | string,
): Promise<string> {
  const buf = fromPrismaBytes(ciphertext);
  const version = buf[0];
  if (!version || version < 1) {
    throw new AppError(
      "Invalid ciphertext: missing or invalid version byte",
      500,
    );
  }
  const dek = await getDek(toPrincipal(principal), version);
  return decryptWithKey(buf, dek);
}

// ── User DEK initialisation ───────────────────────────────────────────────────

// Generates a fresh DEK for a new user, wraps it via KMS, and writes it to the DB.
// MUST be called inside or after the signup transaction.
// Returns the raw DEK so the caller can populate the cache AFTER the transaction commits.
// (Caching inside the tx risks a ghost DEK if the transaction rolls back.)
export async function initDekForNewUser(
  userId: string,
  tx?: Prisma.TransactionClient,
): Promise<Buffer> {
  // KMS call happens BEFORE any DB write to minimise transaction hold time.
  // generateAndWrapDek zeroes rawDek on KMS failure; on success the caller
  // owns the buffer (signup populates the cache then drops the reference).
  const { rawDek, wrappedDek } = await generateAndWrapDek();
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
