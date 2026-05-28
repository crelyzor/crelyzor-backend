/**
 * Phase 5 backfill — single-step migration variant.
 *
 * Our migration went single-step: all in-scope String columns were changed to
 * Bytes? directly, with existing rows set to NULL. There are no shadow _enc
 * columns. New writes from the service layer are already encrypted.
 *
 * This script therefore only needs to:
 *   1. Generate + wrap a DEK for any user who doesn't have one yet.
 *   2. Verify that no plaintext sneaked through (spot-check that every non-null
 *      Bytes value in the encrypted columns is valid ciphertext).
 *
 * Idempotent — safe to re-run at any time.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { initDekForNewUser, decrypt } from "../utils/security/crypto";
import { logger } from "../utils/logging/logger";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

// ── Step 1: DEK initialisation ────────────────────────────────────────────────

async function ensureAllUsersHaveDeks(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { wrappedDek: null },
    select: { id: true },
  });

  if (users.length === 0) {
    logger.info("DEK check: all users already have DEKs");
    return 0;
  }

  for (const u of users) {
    if (DRY_RUN) {
      logger.info("[dry-run] Would generate DEK for user", { userId: u.id });
    } else {
      await initDekForNewUser(u.id);
      logger.info("Generated DEK for user", { userId: u.id });
    }
  }
  return users.length;
}

// ── Step 2: Spot-check — verify encrypted columns hold valid ciphertext ───────
// Samples up to 10 non-null rows per table and attempts to decrypt them.
// A successful decrypt means the value is proper ciphertext (not stale plaintext).

async function spotCheckTable(
  label: string,
  rows: Array<{ id: string; userId: string; value: Uint8Array | null }>,
): Promise<void> {
  const sample = rows.filter((r) => r.value !== null).slice(0, 10);
  if (sample.length === 0) {
    logger.info(`Spot-check ${label}: 0 non-null rows — nothing to verify`);
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const row of sample) {
    try {
      await decrypt(row.value!, row.userId);
      ok++;
    } catch {
      failed++;
      logger.error(`Spot-check ${label}: decrypt failed`, { id: row.id });
    }
  }
  logger.info(`Spot-check ${label}`, { sampled: sample.length, ok, failed });
  if (failed > 0)
    throw new Error(
      `${label} spot-check failed — ${failed} rows could not be decrypted`,
    );
}

async function runSpotChecks(): Promise<void> {
  // Use raw SQL for Bytes? IS NOT NULL checks — Prisma 6 rejects null comparisons on Bytes filters.

  const oauthRows = await prisma.$queryRaw<
    Array<{ id: string; userId: string; accessToken: Buffer }>
  >`
    SELECT id, "userId", "accessToken" FROM "OAuthAccount"
    WHERE "accessToken" IS NOT NULL LIMIT 10
  `;
  await spotCheckTable(
    "OAuthAccount.accessToken",
    oauthRows.map((r) => ({
      id: r.id,
      userId: r.userId,
      value: r.accessToken,
    })),
  );

  const segRows = await prisma.$queryRaw<
    Array<{ id: string; userId: string; text: Buffer }>
  >`
    SELECT s.id, m."createdById" AS "userId", s."text"
    FROM "TranscriptSegment" s
    JOIN "MeetingTranscript" t ON t.id = s."transcriptId"
    JOIN "MeetingRecording" r  ON r.id = t."recordingId"
    JOIN "Meeting" m           ON m.id = r."meetingId"
    WHERE s."text" IS NOT NULL LIMIT 10
  `;
  await spotCheckTable(
    "TranscriptSegment.text",
    segRows.map((r) => ({ id: r.id, userId: r.userId, value: r.text })),
  );

  const contactRows = await prisma.$queryRaw<
    Array<{ id: string; userId: string; email: Buffer }>
  >`
    SELECT c.id, card."userId", c."email"
    FROM "CardContact" c
    JOIN "Card" card ON card.id = c."cardId"
    WHERE c."email" IS NOT NULL LIMIT 10
  `;
  await spotCheckTable(
    "CardContact.email",
    contactRows.map((r) => ({ id: r.id, userId: r.userId, value: r.email })),
  );

  logger.info("All spot-checks passed");
}

// ── Driver ────────────────────────────────────────────────────────────────────

async function main() {
  logger.info(`Phase 5 backfill — start${DRY_RUN ? " (DRY RUN)" : ""}`);

  const dekCount = await ensureAllUsersHaveDeks();
  logger.info("DEK initialisation complete", { usersFixed: dekCount });

  if (!DRY_RUN) {
    await runSpotChecks();
  } else {
    logger.info("[dry-run] Skipping spot-checks — no writes performed");
  }

  logger.info("Phase 5 backfill — done ✓");
}

main()
  .catch((err) => {
    logger.error("Phase 5 backfill failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
