-- Phase 5: Encryption at Rest — Step 1 (additive only)
--
-- Adds:
--   • Per-user DEK fields (User.wrappedDek, User.dekVersion)
--   • UserDekHistory table (rotation support)
--   • Blind-index columns + indexes on PII tables
--   • Staging BYTEA columns ("<col>_enc") alongside existing plaintext columns
--
-- This migration is non-destructive. Existing plaintext columns are untouched.
-- The matching backfill (src/scripts/phase5Backfill.ts) populates the *_enc
-- columns from plaintext, and migration 20260522000001 swaps them in.

-- ── User DEK fields ───────────────────────────────────────────────────────────

ALTER TABLE "User" ADD COLUMN "wrappedDek" BYTEA;
ALTER TABLE "User" ADD COLUMN "dekVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "UserDekHistory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "wrappedDek" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDekHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDekHistory_userId_version_key" ON "UserDekHistory"("userId", "version");
CREATE INDEX "UserDekHistory_userId_idx" ON "UserDekHistory"("userId");

ALTER TABLE "UserDekHistory" ADD CONSTRAINT "UserDekHistory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Blind-index columns (always BYTEA, nullable) ──────────────────────────────

ALTER TABLE "CardContact" ADD COLUMN "emailBidx" BYTEA;
ALTER TABLE "CardContact" ADD COLUMN "phoneBidx" BYTEA;
ALTER TABLE "Booking" ADD COLUMN "guestEmailBidx" BYTEA;
ALTER TABLE "MeetingParticipant" ADD COLUMN "guestEmailBidx" BYTEA;

CREATE INDEX "CardContact_emailBidx_idx" ON "CardContact"("emailBidx");
CREATE INDEX "CardContact_phoneBidx_idx" ON "CardContact"("phoneBidx");
CREATE INDEX "Booking_guestEmailBidx_idx" ON "Booking"("guestEmailBidx");
CREATE INDEX "MeetingParticipant_guestEmailBidx_idx" ON "MeetingParticipant"("guestEmailBidx");

-- ── Staging BYTEA columns ─────────────────────────────────────────────────────
-- Each "_enc" column receives encrypted ciphertext during backfill. Migration
-- 20260522000001 drops the matching plaintext column and renames "_enc" to take
-- its place.

-- AI / transcript fields
ALTER TABLE "MeetingTranscript"  ADD COLUMN "fullText_enc"   BYTEA;
ALTER TABLE "TranscriptSegment"  ADD COLUMN "text_enc"       BYTEA;
ALTER TABLE "Task"               ADD COLUMN "description_enc" BYTEA;
ALTER TABLE "MeetingNote"        ADD COLUMN "content_enc"    BYTEA;
ALTER TABLE "MeetingAISummary"   ADD COLUMN "summary_enc"    BYTEA;
ALTER TABLE "MeetingAISummary"   ADD COLUMN "keyPoints_enc"  BYTEA;
ALTER TABLE "MeetingAIContent"   ADD COLUMN "content_enc"    BYTEA;
ALTER TABLE "AskAIMessage"       ADD COLUMN "content_enc"    BYTEA;

-- PII fields
ALTER TABLE "CardContact"        ADD COLUMN "email_enc"      BYTEA;
ALTER TABLE "CardContact"        ADD COLUMN "phone_enc"      BYTEA;
ALTER TABLE "CardContact"        ADD COLUMN "note_enc"       BYTEA;
ALTER TABLE "MeetingParticipant" ADD COLUMN "guestEmail_enc" BYTEA;
ALTER TABLE "Booking"            ADD COLUMN "guestName_enc"  BYTEA;
ALTER TABLE "Booking"            ADD COLUMN "guestEmail_enc" BYTEA;
ALTER TABLE "Booking"            ADD COLUMN "guestNote_enc"  BYTEA;

-- OAuth tokens
ALTER TABLE "OAuthAccount"       ADD COLUMN "accessToken_enc"  BYTEA;
ALTER TABLE "OAuthAccount"       ADD COLUMN "refreshToken_enc" BYTEA;
