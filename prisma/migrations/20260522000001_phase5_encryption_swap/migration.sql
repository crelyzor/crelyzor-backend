-- Phase 5: Encryption at Rest — Step 2 (swap)
--
-- Drops the original plaintext columns and renames the BYTEA "<col>_enc"
-- staging columns into their place. Run AFTER `pnpm phase5:backfill` has
-- populated the staging columns.
--
-- The DO block at the top fails fast if any plaintext row has not yet been
-- copied into its "_enc" column — this prevents accidental data loss.

DO $$
DECLARE
  missing INT;
BEGIN
  -- AI / transcript fields
  SELECT COUNT(*) INTO missing FROM "MeetingTranscript" WHERE "fullText" IS NOT NULL AND "fullText_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % MeetingTranscript.fullText rows missing ciphertext. Run "pnpm phase5:backfill" first.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "TranscriptSegment" WHERE "text" IS NOT NULL AND "text_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % TranscriptSegment.text rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "Task" WHERE "description" IS NOT NULL AND "description_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % Task.description rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "MeetingNote" WHERE "content" IS NOT NULL AND "content_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % MeetingNote.content rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "MeetingAISummary" WHERE "summary" IS NOT NULL AND "summary_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % MeetingAISummary.summary rows missing ciphertext.', missing; END IF;

  -- keyPoints is TEXT[] — only require ciphertext when the array is non-empty
  SELECT COUNT(*) INTO missing FROM "MeetingAISummary" WHERE array_length("keyPoints", 1) IS NOT NULL AND "keyPoints_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % MeetingAISummary.keyPoints rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "MeetingAIContent" WHERE "content" IS NOT NULL AND "content_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % MeetingAIContent.content rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "AskAIMessage" WHERE "content" IS NOT NULL AND "content_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % AskAIMessage.content rows missing ciphertext.', missing; END IF;

  -- PII fields
  SELECT COUNT(*) INTO missing FROM "CardContact" WHERE "email" IS NOT NULL AND "email_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % CardContact.email rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "CardContact" WHERE "phone" IS NOT NULL AND "phone_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % CardContact.phone rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "CardContact" WHERE "note" IS NOT NULL AND "note_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % CardContact.note rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "MeetingParticipant" WHERE "guestEmail" IS NOT NULL AND "guestEmail_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % MeetingParticipant.guestEmail rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "Booking" WHERE "guestName" IS NOT NULL AND "guestName_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % Booking.guestName rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "Booking" WHERE "guestEmail" IS NOT NULL AND "guestEmail_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % Booking.guestEmail rows missing ciphertext.', missing; END IF;

  SELECT COUNT(*) INTO missing FROM "Booking" WHERE "guestNote" IS NOT NULL AND "guestNote_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % Booking.guestNote rows missing ciphertext.', missing; END IF;

  -- OAuth tokens
  SELECT COUNT(*) INTO missing FROM "OAuthAccount" WHERE "accessToken" IS NOT NULL AND "accessToken_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % OAuthAccount.accessToken rows missing ciphertext.', missing; END IF;

  -- refreshToken: existing schema has it NOT NULL, so a non-empty string requires ciphertext; empty string is treated as absent.
  SELECT COUNT(*) INTO missing FROM "OAuthAccount" WHERE "refreshToken" IS NOT NULL AND length("refreshToken") > 0 AND "refreshToken_enc" IS NULL;
  IF missing > 0 THEN RAISE EXCEPTION 'Phase 5 backfill incomplete: % OAuthAccount.refreshToken rows missing ciphertext.', missing; END IF;
END $$;

-- ── Drop indexes / constraints that reference the plaintext columns ───────────

DROP INDEX IF EXISTS "CardContact_email_idx";
DROP INDEX IF EXISTS "MeetingParticipant_guestEmail_idx";
DROP INDEX IF EXISTS "Booking_guestEmail_idx";
ALTER TABLE "MeetingParticipant" DROP CONSTRAINT IF EXISTS "MeetingParticipant_meetingId_userId_guestEmail_key";

-- ── Drop plaintext columns ────────────────────────────────────────────────────

ALTER TABLE "MeetingTranscript"  DROP COLUMN "fullText";
ALTER TABLE "TranscriptSegment"  DROP COLUMN "text";
ALTER TABLE "Task"               DROP COLUMN "description";
ALTER TABLE "MeetingNote"        DROP COLUMN "content";
ALTER TABLE "MeetingAISummary"   DROP COLUMN "summary";
ALTER TABLE "MeetingAISummary"   DROP COLUMN "keyPoints";
ALTER TABLE "MeetingAIContent"   DROP COLUMN "content";
ALTER TABLE "AskAIMessage"       DROP COLUMN "content";

ALTER TABLE "CardContact"        DROP COLUMN "email";
ALTER TABLE "CardContact"        DROP COLUMN "phone";
ALTER TABLE "CardContact"        DROP COLUMN "note";
ALTER TABLE "MeetingParticipant" DROP COLUMN "guestEmail";
ALTER TABLE "Booking"            DROP COLUMN "guestName";
ALTER TABLE "Booking"            DROP COLUMN "guestEmail";
ALTER TABLE "Booking"            DROP COLUMN "guestNote";

ALTER TABLE "OAuthAccount"       DROP COLUMN "accessToken";
ALTER TABLE "OAuthAccount"       DROP COLUMN "refreshToken";

-- ── Rename "_enc" staging columns into their final names ──────────────────────

ALTER TABLE "MeetingTranscript"  RENAME COLUMN "fullText_enc"   TO "fullText";
ALTER TABLE "TranscriptSegment"  RENAME COLUMN "text_enc"       TO "text";
ALTER TABLE "Task"               RENAME COLUMN "description_enc" TO "description";
ALTER TABLE "MeetingNote"        RENAME COLUMN "content_enc"    TO "content";
ALTER TABLE "MeetingAISummary"   RENAME COLUMN "summary_enc"    TO "summary";
ALTER TABLE "MeetingAISummary"   RENAME COLUMN "keyPoints_enc"  TO "keyPoints";
ALTER TABLE "MeetingAIContent"   RENAME COLUMN "content_enc"    TO "content";
ALTER TABLE "AskAIMessage"       RENAME COLUMN "content_enc"    TO "content";

ALTER TABLE "CardContact"        RENAME COLUMN "email_enc"      TO "email";
ALTER TABLE "CardContact"        RENAME COLUMN "phone_enc"      TO "phone";
ALTER TABLE "CardContact"        RENAME COLUMN "note_enc"       TO "note";
ALTER TABLE "MeetingParticipant" RENAME COLUMN "guestEmail_enc" TO "guestEmail";
ALTER TABLE "Booking"            RENAME COLUMN "guestName_enc"  TO "guestName";
ALTER TABLE "Booking"            RENAME COLUMN "guestEmail_enc" TO "guestEmail";
ALTER TABLE "Booking"            RENAME COLUMN "guestNote_enc"  TO "guestNote";

ALTER TABLE "OAuthAccount"       RENAME COLUMN "accessToken_enc"  TO "accessToken";
ALTER TABLE "OAuthAccount"       RENAME COLUMN "refreshToken_enc" TO "refreshToken";

-- ── Final NOT NULL constraints (match schema.prisma) ──────────────────────────
--
-- Bytes (non-nullable in schema):
--   MeetingNote.content, MeetingAISummary.summary, AskAIMessage.content,
--   Booking.guestName, Booking.guestEmail, OAuthAccount.accessToken

ALTER TABLE "MeetingNote"      ALTER COLUMN "content"    SET NOT NULL;
ALTER TABLE "MeetingAISummary" ALTER COLUMN "summary"    SET NOT NULL;
ALTER TABLE "AskAIMessage"     ALTER COLUMN "content"    SET NOT NULL;
ALTER TABLE "Booking"          ALTER COLUMN "guestName"  SET NOT NULL;
ALTER TABLE "Booking"          ALTER COLUMN "guestEmail" SET NOT NULL;
ALTER TABLE "OAuthAccount"     ALTER COLUMN "accessToken" SET NOT NULL;
