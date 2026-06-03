import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { createNotification } from "../notificationService";
import { sendEmail } from "../email/emailService";
import { taskAssignedEmail, taskAssignedSubject } from "../email/templates/taskAssigned";
import { env } from "../../config/environment";
import { logger } from "../../utils/logging/logger";

/**
 * Assert that `assigneeId` is an active member of `teamId`.
 * Returns the assignee's display name (snapshot for storage).
 * Throws AppError 400 if not a member.
 */
export async function assertAssigneeIsMember(
  assigneeId: string,
  teamId: string,
): Promise<string> {
  const membership = await prisma.teamMember.findFirst({
    where: {
      userId: assigneeId,
      teamId,
      isDeleted: false,
      team: { isDeleted: false },
    },
    select: { role: true },
  });

  if (!membership) {
    throw new AppError("Assignee is not a member of this team", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { name: true },
  });

  return user?.name ?? "Team member";
}

interface NotifyParams {
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  assignedByUserId: string;
}

/**
 * Send in-app notification + email to the assignee.
 * Skips if assignee === assigner (self-assign).
 * Always fail-open — never throws.
 */
export async function notifyTaskAssigned(params: NotifyParams): Promise<void> {
  const { taskId, taskTitle, assigneeId, assignedByUserId } = params;

  if (assigneeId === assignedByUserId) return;

  try {
    await createNotification(
      assigneeId,
      "TASK_ASSIGNED",
      "Task assigned to you",
      `"${taskTitle}" has been assigned to you`,
      "task",
      taskId,
    );
  } catch (err) {
    logger.error("notifyTaskAssigned: in-app notification failed", { taskId, assigneeId, err });
  }

  try {
    const [assignee, assigner] = await Promise.all([
      prisma.user.findUnique({ where: { id: assigneeId }, select: { email: true, name: true } }),
      prisma.user.findUnique({ where: { id: assignedByUserId }, select: { name: true } }),
    ]);

    if (!assignee?.email) return;

    await sendEmail({
      to: assignee.email,
      subject: taskAssignedSubject({ taskTitle }),
      html: taskAssignedEmail({
        assigneeName: assignee.name ?? "there",
        assignerName: assigner?.name ?? "A teammate",
        taskTitle,
        taskUrl: `${env.FRONTEND_URL}/tasks`,
      }),
    });
  } catch (err) {
    logger.error("notifyTaskAssigned: email failed", { taskId, assigneeId, err });
  }
}
