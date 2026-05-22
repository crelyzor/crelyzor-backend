-- Phase 5: Encryption at Rest
-- Covers P0/P1 (DEK infrastructure), P3-A (AI/transcript fields), P3-B (PII fields with blind indexes)

-- ── P0/P1: User DEK fields ─────────────────────────────────────────────────────

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

-- ── P3-A: Blind index columns added to PII tables (nullable) ───────────────────

ALTER TABLE "CardContact" ADD COLUMN "emailBidx" BYTEA;
ALTER TABLE "CardContact" ADD COLUMN "phoneBidx" BYTEA;
ALTER TABLE "Booking" ADD COLUMN "guestEmailBidx" BYTEA;
ALTER TABLE "MeetingParticipant" ADD COLUMN "guestEmailBidx" BYTEA;

CREATE INDEX "CardContact_emailBidx_idx" ON "CardContact"("emailBidx");
CREATE INDEX "CardContact_phoneBidx_idx" ON "CardContact"("phoneBidx");
CREATE INDEX "Booking_guestEmailBidx_idx" ON "Booking"("guestEmailBidx");
CREATE INDEX "MeetingParticipant_guestEmailBidx_idx" ON "MeetingParticipant"("guestEmailBidx");

-- ── P3-A: AI/transcript fields → BYTEA ─────────────────────────────────────────

-- MeetingTranscript.fullText: TEXT NOT NULL → BYTEA NULL
ALTER TABLE "MeetingTranscript" ALTER COLUMN "fullText" TYPE BYTEA USING "fullText"::BYTEA;
ALTER TABLE "MeetingTranscript" ALTER COLUMN "fullText" DROP NOT NULL;

-- TranscriptSegment.text: TEXT NOT NULL → BYTEA NULL
ALTER TABLE "TranscriptSegment" ALTER COLUMN "text" TYPE BYTEA USING "text"::BYTEA;
ALTER TABLE "TranscriptSegment" ALTER COLUMN "text" DROP NOT NULL;

-- Task.description: TEXT NULL → BYTEA NULL
ALTER TABLE "Task" ALTER COLUMN "description" TYPE BYTEA USING "description"::BYTEA;

-- MeetingNote.content: TEXT NOT NULL → BYTEA NOT NULL
ALTER TABLE "MeetingNote" ALTER COLUMN "content" TYPE BYTEA USING "content"::BYTEA;

-- MeetingAISummary.summary: TEXT NOT NULL → BYTEA NOT NULL
ALTER TABLE "MeetingAISummary" ALTER COLUMN "summary" TYPE BYTEA USING "summary"::BYTEA;

-- MeetingAISummary.keyPoints: TEXT[] → BYTEA NULL
-- Cannot ALTER COLUMN from array to non-array type — must drop and recreate
ALTER TABLE "MeetingAISummary" DROP COLUMN "keyPoints";
ALTER TABLE "MeetingAISummary" ADD COLUMN "keyPoints" BYTEA;

-- MeetingAIContent.content: TEXT NOT NULL → BYTEA NULL
ALTER TABLE "MeetingAIContent" ALTER COLUMN "content" TYPE BYTEA USING "content"::BYTEA;
ALTER TABLE "MeetingAIContent" ALTER COLUMN "content" DROP NOT NULL;

-- AskAIMessage.content: TEXT NOT NULL → BYTEA NOT NULL
ALTER TABLE "AskAIMessage" ALTER COLUMN "content" TYPE BYTEA USING "content"::BYTEA;

-- ── P3-B: PII fields → BYTEA ───────────────────────────────────────────────────

-- CardContact.email, phone, note → BYTEA NULL
DROP INDEX "CardContact_email_idx";
ALTER TABLE "CardContact" ALTER COLUMN "email" TYPE BYTEA USING "email"::BYTEA;
ALTER TABLE "CardContact" ALTER COLUMN "phone" TYPE BYTEA USING "phone"::BYTEA;
ALTER TABLE "CardContact" ALTER COLUMN "note" TYPE BYTEA USING "note"::BYTEA;

-- MeetingParticipant.guestEmail → BYTEA NULL
DROP INDEX "MeetingParticipant_guestEmail_idx";
ALTER TABLE "MeetingParticipant" DROP CONSTRAINT "MeetingParticipant_meetingId_userId_guestEmail_key";
ALTER TABLE "MeetingParticipant" ALTER COLUMN "guestEmail" TYPE BYTEA USING "guestEmail"::BYTEA;

-- Booking.guestName, guestEmail, guestNote → BYTEA
DROP INDEX "Booking_guestEmail_idx";
ALTER TABLE "Booking" ALTER COLUMN "guestName" TYPE BYTEA USING "guestName"::BYTEA;
ALTER TABLE "Booking" ALTER COLUMN "guestEmail" TYPE BYTEA USING "guestEmail"::BYTEA;
ALTER TABLE "Booking" ALTER COLUMN "guestNote" TYPE BYTEA USING "guestNote"::BYTEA;

-- OAuthAccount.accessToken, refreshToken → BYTEA
ALTER TABLE "OAuthAccount" ALTER COLUMN "accessToken" TYPE BYTEA USING "accessToken"::BYTEA;
ALTER TABLE "OAuthAccount" ALTER COLUMN "refreshToken" TYPE BYTEA USING "refreshToken"::BYTEA;
