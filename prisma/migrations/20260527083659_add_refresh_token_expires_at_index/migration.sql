/*
  Warnings:

  - Made the column `content` on table `MeetingAIContent` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "MeetingAIContent" ALTER COLUMN "content" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
