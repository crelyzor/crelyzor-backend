/**
 * Pure access helpers for Tasks — extracted from taskController in P5.5.b so
 * that cross-domain callers (currently tagService for task-tag junctions;
 * potentially any future service that needs team-aware task access) can
 * gate without reaching into the controller layer.
 *
 * Mirrors the shape of bookingPrincipal.ts (P5.4.b) — single module with
 * scope helper + principal + verify + assert. No transactions, no service
 * orchestration; just slim-fetch + access check.
 */
import { Prisma, TeamRole } from "@prisma/client";
import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import type { Principal } from "../../utils/security/crypto";
import type { TeamContext } from "../../middleware/authMiddleware";

/**
 * Uniform 404 body for any Task access failure. Same enumeration-collapse
 * pattern as the rest of Phase 6.
 */
export const TASK_NOT_FOUND_MESSAGE = "Task not found";

export type TaskForAccess = {
  userId: string;
  teamId: string | null;
  isDeleted: boolean;
};

/**
 * Prisma `where` fragment scoping a task query to the caller's current
 * context.
 *
 * - Personal context (`teamContext === null`): `{teamId: null, userId: actor}`.
 *   Personal queries explicitly exclude team tasks — closes the pre-Phase-6
 *   leak where the actor's own team tasks bled into their personal list.
 * - Team + ADMIN/OWNER: `{teamId}` (all team tasks).
 * - Team + MEMBER: `{teamId, userId: actor}` (own team tasks only).
 *
 * Soft-delete is NOT part of the scope — caller must add `isDeleted: false`.
 */
export function taskScope(
  actorId: string,
  teamContext: TeamContext | null,
): Prisma.TaskWhereInput {
  if (!teamContext) {
    return { teamId: null, userId: actorId };
  }
  if (teamContext.role === TeamRole.MEMBER) {
    return { teamId: teamContext.teamId, userId: actorId };
  }
  return { teamId: teamContext.teamId };
}

/**
 * Derives the encrypt/decrypt principal for content scoped to a task
 * (currently `Task.description`). **Always read from the row, never from
 * the actor** — a team admin editing another member's team-task description
 * must re-encrypt under the team DEK so other admins can read it.
 *
 * `Task.teamId` is immutable post-creation — schema strict-mode + service-
 * layer omission in updateTask keep this invariant.
 */
export function principalForTask(task: {
  userId: string;
  teamId: string | null;
}): Principal {
  return task.teamId
    ? { type: "team", id: task.teamId }
    : { type: "user", id: task.userId };
}

/**
 * Pure access check on a pre-fetched slim row. Uniform 404 on any failure.
 *
 * Mode semantics:
 *   - `read`: scope visibility (personal own; team-any-role).
 *   - `mutate`: same as read for tasks today (no participant concept;
 *     MEMBERs can only mutate their own team tasks).
 */
export function verifyTaskAccess(
  actorId: string,
  task: TaskForAccess,
  teamContext: TeamContext | null,
  _action: "read" | "mutate",
): void {
  if (task.isDeleted) {
    throw new AppError(TASK_NOT_FOUND_MESSAGE, 404);
  }

  const isOwner = task.userId === actorId;

  if (!teamContext) {
    if (task.teamId !== null || !isOwner) {
      throw new AppError(TASK_NOT_FOUND_MESSAGE, 404);
    }
    return;
  }

  if (task.teamId !== teamContext.teamId) {
    throw new AppError(TASK_NOT_FOUND_MESSAGE, 404);
  }

  if (teamContext.role === TeamRole.MEMBER && !isOwner) {
    throw new AppError(TASK_NOT_FOUND_MESSAGE, 404);
  }
}

/**
 * Slim fetch + verify access + return. Mirrors `assertMeetingAccess` /
 * `assertCardAccess` / `assertBookingAccess`.
 */
export async function assertTaskAccess(
  actorId: string,
  taskId: string,
  teamContext: TeamContext | null,
  action: "read" | "mutate",
): Promise<TaskForAccess & { id: string }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, userId: true, teamId: true, isDeleted: true },
  });
  if (!task) {
    throw new AppError(TASK_NOT_FOUND_MESSAGE, 404);
  }
  verifyTaskAccess(actorId, task, teamContext, action);
  return task;
}
