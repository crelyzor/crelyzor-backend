-- AlterTable
ALTER TABLE "Team" ADD COLUMN "inviteLinkEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Team" ADD COLUMN "inviteLinkExpiresAt" TIMESTAMP(3);
ALTER TABLE "Team" ADD COLUMN "inviteLinkToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Team_inviteLinkToken_key" ON "Team"("inviteLinkToken");
