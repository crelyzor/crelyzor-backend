-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "teamId" UUID;

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "teamId" UUID;

-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "teamId" UUID;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "teamId" UUID;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "teamId" UUID;

-- AlterTable
ALTER TABLE "UserUsage" ADD COLUMN     "teamId" UUID;

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" UUID NOT NULL,
    "logoUrl" TEXT,
    "wrappedDek" BYTEA NOT NULL,
    "dekVersion" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamInvite" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "userId" UUID,
    "role" "TeamRole" NOT NULL,
    "token" TEXT NOT NULL,
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamDekHistory" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "wrappedDek" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamDekHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE INDEX "Team_ownerId_isDeleted_idx" ON "Team"("ownerId", "isDeleted");

-- CreateIndex
CREATE INDEX "TeamMember_userId_isDeleted_idx" ON "TeamMember"("userId", "isDeleted");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_isDeleted_idx" ON "TeamMember"("teamId", "isDeleted");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_role_isDeleted_idx" ON "TeamMember"("teamId", "role", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvite_token_key" ON "TeamInvite"("token");

-- CreateIndex
CREATE INDEX "TeamInvite_token_idx" ON "TeamInvite"("token");

-- CreateIndex
CREATE INDEX "TeamInvite_email_isDeleted_idx" ON "TeamInvite"("email", "isDeleted");

-- CreateIndex
CREATE INDEX "TeamInvite_teamId_isDeleted_idx" ON "TeamInvite"("teamId", "isDeleted");

-- CreateIndex
CREATE INDEX "TeamInvite_userId_idx" ON "TeamInvite"("userId");

-- CreateIndex
CREATE INDEX "TeamDekHistory_teamId_idx" ON "TeamDekHistory"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamDekHistory_teamId_version_key" ON "TeamDekHistory"("teamId", "version");

-- CreateIndex
CREATE INDEX "Booking_teamId_isDeleted_idx" ON "Booking"("teamId", "isDeleted");

-- CreateIndex
CREATE INDEX "Card_teamId_isDeleted_idx" ON "Card"("teamId", "isDeleted");

-- CreateIndex
CREATE INDEX "EventType_teamId_isDeleted_idx" ON "EventType"("teamId", "isDeleted");

-- CreateIndex
CREATE INDEX "Meeting_teamId_isDeleted_createdAt_idx" ON "Meeting"("teamId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Task_teamId_isDeleted_createdAt_idx" ON "Task"("teamId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserUsage_teamId_idx" ON "UserUsage"("teamId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventType" ADD CONSTRAINT "EventType_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUsage" ADD CONSTRAINT "UserUsage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamDekHistory" ADD CONSTRAINT "TeamDekHistory_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index — only one OPEN invite per (teamId, email).
-- Prisma 6 cannot express partial uniques natively, so it lives in raw SQL here.
-- "Open" = not soft-deleted AND not accepted AND not declined AND not cancelled.
CREATE UNIQUE INDEX "team_invite_active_uniq"
  ON "TeamInvite" ("teamId", "email")
  WHERE "isDeleted" = false
    AND "acceptedAt" IS NULL
    AND "declinedAt" IS NULL
    AND "cancelledAt" IS NULL;

-- Seed SystemConfig defaults. Re-runnable via ON CONFLICT DO NOTHING.
INSERT INTO "SystemConfig" ("key", "value", "updatedAt") VALUES
  ('max_teams_per_pro_user',       '3',  CURRENT_TIMESTAMP),
  ('max_teams_per_business_user',  '10', CURRENT_TIMESTAMP),
  ('max_members_per_team',         '50', CURRENT_TIMESTAMP),
  ('team_invite_expiry_days',      '7',  CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
