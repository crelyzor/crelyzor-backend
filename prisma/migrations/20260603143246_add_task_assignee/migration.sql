-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_ASSIGNED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assigneeId" UUID,
ADD COLUMN     "assigneeName" TEXT;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "inAppTaskAssignedEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
