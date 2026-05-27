/**
 * Phase 5 backfill — encrypts existing plaintext rows in-place.
 *
 * Run AFTER migration 20260522000000_phase5_encryption_at_rest is applied
 * and BEFORE migration 20260522000001_phase5_encryption_swap.
 *
 * For each existing user:
 *   1. Generates + wraps a DEK if one does not yet exist
 *   2. Walks every encrypted table, reads plaintext, encrypts under the
 *      owning user's DEK, writes ciphertext to the matching "<col>_enc"
 *      staging column
 *
 * Idempotent — re-running skips rows whose ciphertext is already populated.
 * Uses `prisma.$queryRawUnsafe` / `$executeRawUnsafe` because the staging
 * columns are not in the Prisma schema during the transition window.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { PrismaClient } from "@prisma/client";
import {
  encryptWithKey,
  blindIndex,
  initDekForNewUser,
  getDek,
} from "../utils/security/crypto";
import { logger } from "../utils/logging/logger";

const prisma = new PrismaClient();

const BATCH = 200;

// In-memory cache so we unwrap each user's DEK at most once per run.
const dekCache = new Map<string, Buffer>();

async function dekFor(userId: string): Promise<Buffer> {
  const cached = dekCache.get(userId);
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wrappedDek: true, dekVersion: true },
  });
  if (!user) throw new Error(`User ${userId} not found`);

  let dek: Buffer;
  if (!user.wrappedDek) {
    dek = await initDekForNewUser(userId);
  } else {
    dek = await getDek(userId, user.dekVersion);
  }
  dekCache.set(userId, dek);
  return dek;
}

function enc(plaintext: string, dek: Buffer): Buffer {
  return encryptWithKey(plaintext, dek, 1);
}

// ── Per-table backfills ───────────────────────────────────────────────────────

async function backfillOAuthAccount() {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; userId: string; accessToken: string; refreshToken: string }>
  >(`
    SELECT id, "userId", "accessToken", "refreshToken"
    FROM "OAuthAccount"
    WHERE "accessToken_enc" IS NULL OR ("refreshToken" IS NOT NULL AND length("refreshToken") > 0 AND "refreshToken_enc" IS NULL)
  `);

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const dek = await dekFor(row.userId);
      const accEnc = enc(row.accessToken, dek);
      const refEnc = row.refreshToken && row.refreshToken.length > 0 ? enc(row.refreshToken, dek) : null;

      await prisma.$executeRawUnsafe(
        `UPDATE "OAuthAccount" SET "accessToken_enc" = $1, "refreshToken_enc" = $2 WHERE id = $3::uuid`,
        accEnc,
        refEnc,
        row.id,
      );
      processed++;
    } catch (err) {
      failed++;
      logger.error("Backfill row failed", { table: "OAuthAccount", id: row.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  logger.info("Backfill: OAuthAccount", { processed, failed });
}

async function backfillTask() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; userId: string; description: string | null }>
    >(`
      SELECT id, "userId", "description"
      FROM "Task"
      WHERE "description" IS NOT NULL AND "description_enc" IS NULL
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        if (row.description === null) continue;
        const dek = await dekFor(row.userId);
        const ct = enc(row.description, dek);
        await prisma.$executeRawUnsafe(
          `UPDATE "Task" SET "description_enc" = $1 WHERE id = $2::uuid`,
          ct,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "Task", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: Task batch had failures", { failed });
  }
  logger.info("Backfill: Task.description", { rows: processed });
}

async function backfillCardContact() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        userId: string;
        email: string | null;
        phone: string | null;
        note: string | null;
      }>
    >(`
      SELECT id, "userId", "email", "phone", "note"
      FROM "CardContact"
      WHERE
        ("email" IS NOT NULL AND "email_enc" IS NULL) OR
        ("phone" IS NOT NULL AND "phone_enc" IS NULL) OR
        ("note"  IS NOT NULL AND "note_enc"  IS NULL)
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        const dek = await dekFor(row.userId);
        const emailEnc = row.email ? enc(row.email, dek) : null;
        const phoneEnc = row.phone ? enc(row.phone, dek) : null;
        const noteEnc = row.note ? enc(row.note, dek) : null;
        const emailBidx = row.email ? blindIndex(row.email) : null;
        const phoneBidx = row.phone ? blindIndex(row.phone) : null;

        await prisma.$executeRawUnsafe(
          `UPDATE "CardContact"
             SET "email_enc" = $1, "phone_enc" = $2, "note_enc" = $3,
                 "emailBidx" = COALESCE("emailBidx", $4),
                 "phoneBidx" = COALESCE("phoneBidx", $5)
           WHERE id = $6::uuid`,
          emailEnc,
          phoneEnc,
          noteEnc,
          emailBidx,
          phoneBidx,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "CardContact", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: CardContact batch had failures", { failed });
  }
  logger.info("Backfill: CardContact", { rows: processed });
}

async function backfillBooking() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        userId: string;
        guestName: string;
        guestEmail: string;
        guestNote: string | null;
      }>
    >(`
      SELECT id, "userId", "guestName", "guestEmail", "guestNote"
      FROM "Booking"
      WHERE
        ("guestName"  IS NOT NULL AND "guestName_enc"  IS NULL) OR
        ("guestEmail" IS NOT NULL AND "guestEmail_enc" IS NULL) OR
        ("guestNote"  IS NOT NULL AND "guestNote_enc"  IS NULL)
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        const dek = await dekFor(row.userId);
        const nameEnc = enc(row.guestName, dek);
        const emailEnc = enc(row.guestEmail, dek);
        const noteEnc = row.guestNote ? enc(row.guestNote, dek) : null;
        const emailBidxBuf = blindIndex(row.guestEmail);

        await prisma.$executeRawUnsafe(
          `UPDATE "Booking"
             SET "guestName_enc" = $1, "guestEmail_enc" = $2, "guestNote_enc" = $3,
                 "guestEmailBidx" = COALESCE("guestEmailBidx", $4)
           WHERE id = $5::uuid`,
          nameEnc,
          emailEnc,
          noteEnc,
          emailBidxBuf,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "Booking", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: Booking batch had failures", { failed });
  }
  logger.info("Backfill: Booking", { rows: processed });
}

async function backfillMeetingParticipant() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; userId: string; guestEmail: string }>
    >(`
      SELECT p.id, m."createdById" AS "userId", p."guestEmail"
      FROM "MeetingParticipant" p
      JOIN "Meeting" m ON m.id = p."meetingId"
      WHERE p."guestEmail" IS NOT NULL AND p."guestEmail_enc" IS NULL
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        const dek = await dekFor(row.userId);
        const ct = enc(row.guestEmail, dek);
        const bidx = blindIndex(row.guestEmail);
        await prisma.$executeRawUnsafe(
          `UPDATE "MeetingParticipant"
             SET "guestEmail_enc" = $1,
                 "guestEmailBidx" = COALESCE("guestEmailBidx", $2)
           WHERE id = $3::uuid`,
          ct,
          bidx,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "MeetingParticipant", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: MeetingParticipant batch had failures", { failed });
  }
  logger.info("Backfill: MeetingParticipant.guestEmail", { rows: processed });
}

async function backfillMeetingNote() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; userId: string; content: string }>
    >(`
      SELECT n.id, m."createdById" AS "userId", n."content"
      FROM "MeetingNote" n
      JOIN "Meeting" m ON m.id = n."meetingId"
      WHERE n."content" IS NOT NULL AND n."content_enc" IS NULL
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        const dek = await dekFor(row.userId);
        const ct = enc(row.content, dek);
        await prisma.$executeRawUnsafe(
          `UPDATE "MeetingNote" SET "content_enc" = $1 WHERE id = $2::uuid`,
          ct,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "MeetingNote", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: MeetingNote batch had failures", { failed });
  }
  logger.info("Backfill: MeetingNote.content", { rows: processed });
}

async function backfillMeetingAISummary() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        userId: string;
        summary: string;
        keyPoints: string[] | null;
      }>
    >(`
      SELECT s.id, m."createdById" AS "userId", s."summary", s."keyPoints"
      FROM "MeetingAISummary" s
      JOIN "Meeting" m ON m.id = s."meetingId"
      WHERE
        (s."summary"   IS NOT NULL AND s."summary_enc"   IS NULL) OR
        (array_length(s."keyPoints", 1) IS NOT NULL AND s."keyPoints_enc" IS NULL)
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        const dek = await dekFor(row.userId);
        const summaryEnc = enc(row.summary, dek);
        const keyPointsEnc =
          row.keyPoints && row.keyPoints.length > 0
            ? enc(JSON.stringify(row.keyPoints), dek)
            : null;

        await prisma.$executeRawUnsafe(
          `UPDATE "MeetingAISummary"
             SET "summary_enc" = $1, "keyPoints_enc" = COALESCE("keyPoints_enc", $2)
           WHERE id = $3::uuid`,
          summaryEnc,
          keyPointsEnc,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "MeetingAISummary", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: MeetingAISummary batch had failures", { failed });
  }
  logger.info("Backfill: MeetingAISummary", { rows: processed });
}

async function backfillMeetingAIContent() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; userId: string; content: string }>
    >(`
      SELECT c.id, m."createdById" AS "userId", c."content"
      FROM "MeetingAIContent" c
      JOIN "Meeting" m ON m.id = c."meetingId"
      WHERE c."content" IS NOT NULL AND c."content_enc" IS NULL
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        const dek = await dekFor(row.userId);
        const ct = enc(row.content, dek);
        await prisma.$executeRawUnsafe(
          `UPDATE "MeetingAIContent" SET "content_enc" = $1 WHERE id = $2::uuid`,
          ct,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "MeetingAIContent", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: MeetingAIContent batch had failures", { failed });
  }
  logger.info("Backfill: MeetingAIContent.content", { rows: processed });
}

async function backfillMeetingTranscript() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; userId: string; fullText: string }>
    >(`
      SELECT t.id, m."createdById" AS "userId", t."fullText"
      FROM "MeetingTranscript" t
      JOIN "MeetingRecording" r ON r.id = t."recordingId"
      JOIN "Meeting" m ON m.id = r."meetingId"
      WHERE t."fullText" IS NOT NULL AND t."fullText_enc" IS NULL
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        const dek = await dekFor(row.userId);
        const ct = enc(row.fullText, dek);
        await prisma.$executeRawUnsafe(
          `UPDATE "MeetingTranscript" SET "fullText_enc" = $1 WHERE id = $2::uuid`,
          ct,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "MeetingTranscript", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: MeetingTranscript batch had failures", { failed });
  }
  logger.info("Backfill: MeetingTranscript.fullText", { rows: processed });
}

async function backfillTranscriptSegment() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; userId: string; text: string }>
    >(`
      SELECT s.id, m."createdById" AS "userId", s."text"
      FROM "TranscriptSegment" s
      JOIN "MeetingTranscript" t ON t.id = s."transcriptId"
      JOIN "MeetingRecording" r  ON r.id = t."recordingId"
      JOIN "Meeting" m           ON m.id = r."meetingId"
      WHERE s."text" IS NOT NULL AND s."text_enc" IS NULL
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        const dek = await dekFor(row.userId);
        const ct = enc(row.text, dek);
        await prisma.$executeRawUnsafe(
          `UPDATE "TranscriptSegment" SET "text_enc" = $1 WHERE id = $2::uuid`,
          ct,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "TranscriptSegment", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: TranscriptSegment batch had failures", { failed });
  }
  logger.info("Backfill: TranscriptSegment.text", { rows: processed });
}

async function backfillAskAIMessage() {
  let processed = 0;
  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; userId: string; content: string }>
    >(`
      SELECT msg.id, conv."userId" AS "userId", msg."content"
      FROM "AskAIMessage" msg
      JOIN "AskAIConversation" conv ON conv.id = msg."conversationId"
      WHERE msg."content" IS NOT NULL AND msg."content_enc" IS NULL
      LIMIT ${BATCH}
    `);
    if (rows.length === 0) break;

    let failed = 0;
    for (const row of rows) {
      try {
        const dek = await dekFor(row.userId);
        const ct = enc(row.content, dek);
        await prisma.$executeRawUnsafe(
          `UPDATE "AskAIMessage" SET "content_enc" = $1 WHERE id = $2::uuid`,
          ct,
          row.id,
        );
        processed++;
      } catch (err) {
        failed++;
        logger.error("Backfill row failed", { table: "AskAIMessage", id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failed > 0) logger.warn("Backfill: AskAIMessage batch had failures", { failed });
  }
  logger.info("Backfill: AskAIMessage.content", { rows: processed });
}

// ── Driver ────────────────────────────────────────────────────────────────────

async function main() {
  logger.info("Phase 5 backfill — start");

  // 1. Ensure every user has a wrappedDek before any row references one.
  const usersMissingDek = await prisma.user.findMany({
    where: { wrappedDek: null },
    select: { id: true },
  });
  for (const u of usersMissingDek) {
    await initDekForNewUser(u.id);
  }
  logger.info("Initialised DEKs for users", { count: usersMissingDek.length });

  // 2. Per-table backfills. Order doesn't matter; each is independent.
  // Each table is wrapped individually so one failure doesn't abort the rest.
  const tables = [
    { name: "OAuthAccount", fn: backfillOAuthAccount },
    { name: "Task", fn: backfillTask },
    { name: "CardContact", fn: backfillCardContact },
    { name: "Booking", fn: backfillBooking },
    { name: "MeetingParticipant", fn: backfillMeetingParticipant },
    { name: "MeetingNote", fn: backfillMeetingNote },
    { name: "MeetingAISummary", fn: backfillMeetingAISummary },
    { name: "MeetingAIContent", fn: backfillMeetingAIContent },
    { name: "MeetingTranscript", fn: backfillMeetingTranscript },
    { name: "TranscriptSegment", fn: backfillTranscriptSegment },
    { name: "AskAIMessage", fn: backfillAskAIMessage },
  ];
  let tablesFailed = 0;
  for (const { name, fn } of tables) {
    try {
      await fn();
    } catch (err) {
      tablesFailed++;
      logger.error("Backfill table failed entirely", { table: name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (tablesFailed > 0) {
    logger.error("Phase 5 backfill — completed with table-level failures", { tablesFailed });
    process.exit(1);
  }
  logger.info("Phase 5 backfill — done");
}

main()
  .catch((err) => {
    logger.error("Phase 5 backfill failed", { error: err });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
