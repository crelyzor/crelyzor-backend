-- DropIndex
DROP INDEX "Notification_userId_createdAt_idx";

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);
