import type { Request, Response } from "express";
import { z } from "zod";
import { RRule } from "rrule";
import prisma from "../db/prismaClient";
import { logger } from "../utils/logging/logger";
import { apiResponse } from "../utils/globalResponseHandler";
import { AppError } from "../utils/errors/AppError";
import {
  createTaskSchema,
  createStandaloneTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  reorderTasksSchema,
} from "../validators/taskSchema";
import { Prisma } from "@prisma/client";
import {
  createTaskBlock,
  deleteCalendarEvent,
  createGoogleTask,
  updateGoogleTask,
  deleteGoogleTask,
  isGoogleTaskRef,
} from "../services/googleCalendarService";
import { encrypt, decrypt } from "../utils/security/crypto";
import { getTeamContext } from "../middleware/teamContext";
import { assertMeetingAccess } from "../services/meetings/meetingService";
import { assertCardAccess } from "../services/cardService";
// Phase 6 P5.5.b — task access helpers moved to a dedicated module so other
// services (currently tagService.ts for task-tag junctions) can gate task
// access without crossing into the controller layer.
import {
  TASK_NOT_FOUND_MESSAGE,
  taskScope,
  principalForTask,
  assertTaskAccess,
} from "../services/tasks/taskAccess";

// Decrypt description field in a batch of tasks. Phase 6 P5.3 — per-row
// principal derived from each task's own teamId/userId (rows in the same
// batch may come from different cards/teams under ADMIN scope).
async function decryptTaskDescriptions<
  T extends {
    description: Uint8Array | null;
    userId: string;
    teamId: string | null;
  },
>(
  tasks: T[],
): Promise<(Omit<T, "description"> & { description: string | null })[]> {
  return Promise.all(
    tasks.map(async (t) => ({
      ...t,
      description: t.description
        ? await decrypt(t.description, principalForTask(t)).catch(() => null)
        : null,
    })),
  );
}

const uuidSchema = z.string().uuid();

// Shared include for task list responses
const taskInclude = {
  meeting: { select: { id: true, title: true, type: true, isDeleted: true } },
  taskTags: {
    where: { tag: { isDeleted: false } },
    select: { tag: { select: { id: true, name: true, color: true } } },
    orderBy: { tag: { name: "asc" } },
  },
  card: { select: { id: true, displayName: true, slug: true } },
} satisfies Prisma.TaskInclude;

function flattenTags<
  T extends {
    taskTags: Array<{ tag: { id: string; name: string; color: string } }>;
    meeting?: {
      id: string;
      title: string;
      type: string;
      isDeleted: boolean;
    } | null;
  },
>(task: T) {
  const { taskTags, meeting, ...rest } = task;
  // Strip soft-deleted meetings from task responses
  const cleanMeeting =
    meeting && !meeting.isDeleted
      ? (({ isDeleted: _d, ...m }) => m)(meeting)
      : null;
  return { ...rest, meeting: cleanMeeting, tags: taskTags.map((tt) => tt.tag) };
}

/**
 * GET /sma/tasks — all tasks for the authenticated user, with filters, views, and pagination
 */
export const getAllTasks = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  const validated = listTasksQuerySchema.safeParse(req.query);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const {
    status,
    view,
    priority,
    source,
    meetingId,
    cardId,
    hasMeeting,
    dueBefore,
    dueAfter,
    limit,
    offset,
    sortBy,
    sortOrder,
  } = validated.data;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  // Phase 6 P5.3 — taskScope replaces raw userId filter. Personal: only
  // personal tasks (teamId null + own); team + ADMIN/OWNER: all team tasks;
  // team + MEMBER: own team tasks only. Closes the team-task-in-personal-
  // list leak (same flavour as P5.2.a getUserCards).
  const where: Prisma.TaskWhereInput = {
    ...taskScope(userId, teamContext),
    isDeleted: false,
  };

  // View param takes priority over status filter
  if (view) {
    switch (view) {
      case "inbox":
        where.dueDate = null;
        where.scheduledTime = null;
        break;
      case "today":
        // Today = due today OR overdue (all tasks with dueDate <= end of today)
        where.dueDate = { lte: endOfToday };
        where.status = { not: "DONE" };
        break;
      case "upcoming":
        // Next 7 days, starting tomorrow
        where.dueDate = { gte: startOfTomorrow, lte: sevenDaysFromNow };
        where.status = { not: "DONE" };
        break;
      case "from_meetings":
        where.meetingId = { not: null };
        where.meeting = { type: { not: "VOICE_NOTE" } };
        break;
      case "from_voice_notes":
        where.meetingId = { not: null };
        where.meeting = { type: "VOICE_NOTE" };
        break;
      case "all":
      default:
        break;
    }
  } else {
    // Legacy status filter
    if (status === "completed") where.isCompleted = true;
    else if (status === "pending") where.isCompleted = false;
  }

  if (priority) where.priority = priority;
  if (source) where.source = source;
  if (meetingId) where.meetingId = meetingId;
  if (cardId) where.cardId = cardId;
  if (hasMeeting === true) where.meetingId = { not: null };
  else if (hasMeeting === false) where.meetingId = null;

  if (dueBefore || dueAfter) {
    where.dueDate = {
      ...(dueBefore ? { lte: dueBefore } : {}),
      ...(dueAfter ? { gte: dueAfter } : {}),
    };
  }

  let orderBy: Prisma.TaskOrderByWithRelationInput[];
  if (sortBy === "priority") {
    orderBy = [{ priority: sortOrder }, { createdAt: "desc" }];
  } else if (sortBy === "dueDate") {
    orderBy = [
      { dueDate: { sort: sortOrder, nulls: "last" } },
      { createdAt: "desc" },
    ];
  } else if (sortBy === "sortOrder") {
    orderBy = [{ sortOrder: sortOrder }, { createdAt: "desc" }];
  } else {
    orderBy = [{ createdAt: sortOrder }];
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: taskInclude,
    }),
    prisma.task.count({ where }),
  ]);

  const decrypted = await decryptTaskDescriptions(tasks);
  // For upcoming view, group by date
  const tasksWithTags = decrypted.map(flattenTags);

  if (view === "upcoming") {
    const grouped: Record<string, typeof tasksWithTags> = {};
    for (const task of tasksWithTags) {
      const dateKey = task.dueDate
        ? new Date(task.dueDate).toISOString().split("T")[0]
        : "no-date";
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(task);
    }
    const groupedArray = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tasks]) => ({ date, tasks }));
    return apiResponse(res, {
      statusCode: 200,
      message: "Tasks fetched",
      data: { grouped: groupedArray, pagination: { total, limit, offset } },
    });
  }

  return apiResponse(res, {
    statusCode: 200,
    message: "Tasks fetched",
    data: { tasks: tasksWithTags, pagination: { total, limit, offset } },
  });
};

/**
 * GET /sma/meetings/:meetingId/tasks
 */
export const getTasks = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  // Phase 6 P5.3 — replaces inline `meeting.findFirst({ createdById })` with
  // the team-aware gate. Then list tasks scoped by meetingId combined with
  // taskScope (MEMBER sees own; ADMIN sees all under team context).
  await assertMeetingAccess(userId, meetingId, teamContext, "read");

  const where: Prisma.TaskWhereInput = {
    meetingId,
    isDeleted: false,
    ...taskScope(userId, teamContext),
  };

  const TASK_LIMIT = 200;
  const [rawTasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: TASK_LIMIT,
    }),
    prisma.task.count({ where }),
  ]);

  const tasks = await decryptTaskDescriptions(rawTasks);

  return apiResponse(res, {
    statusCode: 200,
    message: "Tasks fetched",
    data: { tasks, total, hasMore: total > TASK_LIMIT },
  });
};

/**
 * POST /sma/meetings/:meetingId/tasks
 */
export const createTask = async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  if (!uuidSchema.safeParse(meetingId).success)
    throw new AppError("Invalid meetingId", 400);
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  const validated = createTaskSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  // Phase 6 P5.3 — team-aware meeting access. Returns the slim meeting row
  // so we can inherit teamId from it (security must-fix: the new task's
  // teamId comes from the linked meeting first, falls back to context;
  // prevents a personal-context caller from anchoring a personal task to
  // a team meeting). Note: MEMBER role IS allowed to create own team
  // tasks (asymmetric vs P5.2.a's MEMBER createCard rejection — tasks
  // are personal todos surfaced in a team, cards are public team identity).
  const meeting = await assertMeetingAccess(
    userId,
    meetingId,
    teamContext,
    "read",
  );

  const {
    title,
    description,
    dueDate,
    scheduledTime,
    priority,
    durationMinutes,
  } = validated.data;

  const taskTeamId = meeting.teamId ?? teamContext?.teamId ?? null;
  const taskPrincipal = principalForTask({ userId, teamId: taskTeamId });
  const encryptedDescription = description
    ? await encrypt(description, taskPrincipal)
    : undefined;

  const task = await prisma.task.create({
    data: {
      meetingId,
      userId,
      teamId: taskTeamId,
      title,
      description: encryptedDescription,
      dueDate,
      scheduledTime,
      priority,
      source: "MANUAL",
      ...(durationMinutes !== undefined && { durationMinutes }),
    },
  });

  // GCal write-back is fail-open — task already persisted; missing googleEventId is recoverable.
  if (task.scheduledTime) {
    const eventId = await createTaskBlock(userId, {
      title: task.title,
      scheduledTime: task.scheduledTime,
      durationMinutes: task.durationMinutes ?? 30,
    });

    if (eventId) {
      await prisma.task.update({
        where: { id: task.id },
        data: { googleEventId: eventId },
      });
    }
  } else if (task.dueDate) {
    const taskRef = await createGoogleTask(userId, {
      title: task.title,
      dueDate: task.dueDate,
      notes: description ?? undefined, // plaintext for Google API
    });

    if (taskRef) {
      await prisma.task.update({
        where: { id: task.id },
        data: { googleEventId: taskRef },
      });
    }
  }

  logger.info("Task created", { taskId: task.id, meetingId, userId });

  return apiResponse(res, {
    statusCode: 201,
    message: "Task created",
    data: { task: { ...task, description: description ?? null } },
  });
};

/**
 * POST /sma/tasks — create a standalone task (meetingId optional)
 */
export const createStandaloneTask = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);
  const contextTeamId = teamContext?.teamId ?? null;

  const validated = createStandaloneTaskSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const {
    title,
    description,
    dueDate,
    scheduledTime,
    priority,
    meetingId,
    parentTaskId,
    cardId,
    status,
    transcriptContext,
    durationMinutes,
  } = validated.data;

  // Phase 6 P5.3 — team-aware verification on every linked entity. Each
  // assert returns the slim row so we can derive the task's teamId from
  // the linked entity (inherit rule from security review).
  let linkedMeetingTeamId: string | null = null;
  if (meetingId) {
    const meeting = await assertMeetingAccess(
      userId,
      meetingId,
      teamContext,
      "read",
    );
    linkedMeetingTeamId = meeting.teamId;
  }

  let linkedParentTeamId: string | null = null;
  if (parentTaskId) {
    const parent = await assertTaskAccess(
      userId,
      parentTaskId,
      teamContext,
      "mutate",
    );
    // Belt-and-suspenders cross-scope check: even though assertTaskAccess
    // gates by teamContext, an explicit equality assertion prevents a
    // future bug from letting cross-team or cross-personal-vs-team links
    // slip through.
    if (parent.teamId !== contextTeamId) {
      throw new AppError("Parent task is in a different scope", 404);
    }
    linkedParentTeamId = parent.teamId;
  }

  let linkedCardTeamId: string | null = null;
  if (cardId) {
    const card = await assertCardAccess(userId, cardId, teamContext, "read");
    if (card.teamId !== contextTeamId) {
      throw new AppError("Card is in a different scope", 404);
    }
    linkedCardTeamId = card.teamId;
  }

  // Inherit teamId from the first available linked entity, falling back to
  // context. assertMeetingAccess/assertCardAccess/assertTaskAccess gate so
  // linkedXTeamId is either contextTeamId or null in all reachable code
  // paths — the explicit inherit chain is defence in depth.
  const taskTeamId =
    linkedMeetingTeamId ??
    linkedParentTeamId ??
    linkedCardTeamId ??
    contextTeamId;
  const taskPrincipal = principalForTask({ userId, teamId: taskTeamId });

  const encryptedDescriptionStandalone = description
    ? await encrypt(description, taskPrincipal)
    : undefined;

  const task = await prisma.task.create({
    data: {
      userId,
      teamId: taskTeamId,
      title,
      description: encryptedDescriptionStandalone,
      dueDate,
      scheduledTime,
      priority,
      source: "MANUAL",
      ...(status && { status }),
      ...(meetingId && { meetingId }),
      ...(parentTaskId && { parentTaskId }),
      ...(cardId && { cardId }),
      ...(transcriptContext && { transcriptContext }),
      ...(durationMinutes !== undefined && { durationMinutes }),
    },
  });

  // GCal write-back is fail-open — task already persisted; missing googleEventId is recoverable.
  if (task.scheduledTime) {
    const eventId = await createTaskBlock(userId, {
      title: task.title,
      scheduledTime: task.scheduledTime,
      durationMinutes: task.durationMinutes ?? 30,
    });

    if (eventId) {
      await prisma.task.update({
        where: { id: task.id },
        data: { googleEventId: eventId },
      });
    }
  } else if (task.dueDate) {
    const taskRef = await createGoogleTask(userId, {
      title: task.title,
      dueDate: task.dueDate,
      notes: description ?? undefined, // plaintext for Google API
    });

    if (taskRef) {
      await prisma.task.update({
        where: { id: task.id },
        data: { googleEventId: taskRef },
      });
    }
  }

  logger.info("Standalone task created", { taskId: task.id, userId });

  return apiResponse(res, {
    statusCode: 201,
    message: "Task created",
    data: { task: { ...task, description: description ?? null } },
  });
};

/**
 * PATCH /sma/tasks/:taskId
 */
export const updateTask = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  if (!uuidSchema.safeParse(taskId).success)
    throw new AppError("Invalid taskId", 400);
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  const validated = updateTaskSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  // Phase 6 P5.3 — assertTaskAccess gates by team scope. Then fetch the
  // full row needed by the update logic; the access check above is the
  // security gate, the full fetch is just for data the update flow needs.
  await assertTaskAccess(userId, taskId, teamContext, "mutate");

  const existing = await prisma.task.findFirst({
    where: { id: taskId, isDeleted: false },
    select: {
      id: true,
      userId: true,
      teamId: true,
      isCompleted: true,
      status: true,
      googleEventId: true,
      scheduledTime: true,
      title: true,
      durationMinutes: true,
      // Recurring task fields
      recurringRule: true,
      recurringParentId: true,
      dueDate: true,
      description: true,
      priority: true,
      meetingId: true,
      cardId: true,
    },
  });

  if (!existing) throw new AppError(TASK_NOT_FOUND_MESSAGE, 404);

  const taskPrincipal = principalForTask(existing);

  // Decrypt existing description upfront — needed for Google API fallback paths
  const existingDescriptionText = existing.description
    ? await decrypt(existing.description, taskPrincipal)
    : null;

  const existingGoogleTaskRef = isGoogleTaskRef(existing.googleEventId)
    ? existing.googleEventId
    : null;
  const existingCalendarEventId = existingGoogleTaskRef
    ? null
    : existing.googleEventId;

  const {
    title,
    description,
    isCompleted,
    dueDate,
    scheduledTime,
    priority,
    status,
    cardId,
    transcriptContext,
    durationMinutes,
    blockInCalendar,
    recurringRule,
  } = validated.data;

  // Verify card access if cardId is being set (not cleared). Phase 6 P5.3 —
  // team-aware card access + cross-scope check (card must be in the same
  // scope as the task being updated).
  if (cardId !== null && cardId !== undefined) {
    const card = await assertCardAccess(userId, cardId, teamContext, "read");
    if (card.teamId !== existing.teamId) {
      throw new AppError("Card is in a different scope", 404);
    }
  }

  // Derive completion state — keep isCompleted and status in sync
  let resolvedIsCompleted = isCompleted;
  let resolvedStatus = status;
  let completedAt: Date | null | undefined;

  if (status === "DONE" && !existing.isCompleted) {
    resolvedIsCompleted = true;
    completedAt = new Date();
  } else if (status === "TODO" || status === "IN_PROGRESS") {
    resolvedIsCompleted = false;
    completedAt = null;
  } else if (isCompleted === true && existing.status !== "DONE") {
    resolvedStatus = "DONE";
    completedAt = new Date();
  } else if (isCompleted === false && existing.status === "DONE") {
    resolvedStatus = "TODO";
    completedAt = null;
  }

  // When scheduledTime is explicitly cleared, also clear any existing GCal block
  const clearingScheduledTime =
    scheduledTime === null && !!existingCalendarEventId;

  const encryptedDescriptionUpdate =
    description !== undefined && description !== null
      ? await encrypt(description, taskPrincipal)
      : description; // null means clear, undefined means no-op

  let task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && {
        description: encryptedDescriptionUpdate,
      }),
      ...(resolvedIsCompleted !== undefined && {
        isCompleted: resolvedIsCompleted,
      }),
      ...(completedAt !== undefined && { completedAt }),
      ...(dueDate !== undefined && { dueDate }),
      ...(scheduledTime !== undefined && { scheduledTime }),
      ...(priority !== undefined && { priority }),
      ...(resolvedStatus !== undefined && { status: resolvedStatus }),
      ...(cardId !== undefined && { cardId }),
      ...(transcriptContext !== undefined && { transcriptContext }),
      ...(durationMinutes !== undefined && { durationMinutes }),
      ...(recurringRule !== undefined && { recurringRule }),
      // Clear googleEventId when scheduledTime is explicitly removed
      ...(clearingScheduledTime && { googleEventId: null }),
    },
  });

  // ── GCal block side-effects (fail-open — never block the task update) ────────

  const finalScheduledTime =
    scheduledTime !== undefined ? scheduledTime : existing.scheduledTime;
  const finalDuration =
    durationMinutes !== undefined && durationMinutes !== null
      ? durationMinutes
      : (existing.durationMinutes ?? 30);
  const finalTitle = title !== undefined ? title : existing.title;
  // Use plaintext for Google API calls — existingDescriptionText already decrypted above
  const finalDescription =
    description !== undefined ? description : existingDescriptionText;
  const finalDueDate = dueDate !== undefined ? dueDate : existing.dueDate;

  if (clearingScheduledTime) {
    // scheduledTime cleared → delete existing GCal block
    await deleteCalendarEvent(userId, existingCalendarEventId);
  } else if (
    finalScheduledTime &&
    (blockInCalendar === true ||
      blockInCalendar === undefined ||
      !!existingCalendarEventId)
  ) {
    // Request to create/replace a GCal block, or auto-sync a scheduled task.
    // Delete existing block first (replace semantics) so time/duration edits are reflected.
    if (existingCalendarEventId) {
      await deleteCalendarEvent(userId, existingCalendarEventId);
    }

    if (existingGoogleTaskRef) {
      await deleteGoogleTask(userId, existingGoogleTaskRef);
    }

    const eventId = await createTaskBlock(userId, {
      title: finalTitle,
      scheduledTime: finalScheduledTime,
      durationMinutes: finalDuration,
    });

    if (eventId) {
      task = await prisma.task.update({
        where: { id: taskId },
        data: { googleEventId: eventId },
      });
      logger.info("Task GCal block created", { taskId, userId, eventId });
    }
  } else if (blockInCalendar === false && existingCalendarEventId) {
    // Request to remove the GCal block without clearing scheduledTime
    await deleteCalendarEvent(userId, existingCalendarEventId);
    task = await prisma.task.update({
      where: { id: taskId },
      data: { googleEventId: null },
    });
    logger.info("Task GCal block removed", { taskId, userId });
  } else if (!finalScheduledTime) {
    if (finalDueDate) {
      if (existingGoogleTaskRef) {
        await updateGoogleTask(userId, existingGoogleTaskRef, {
          title: finalTitle,
          dueDate: finalDueDate,
          notes: finalDescription,
        });
      } else {
        const taskRef = await createGoogleTask(userId, {
          title: finalTitle,
          dueDate: finalDueDate,
          notes: finalDescription,
        });

        if (taskRef) {
          task = await prisma.task.update({
            where: { id: taskId },
            data: { googleEventId: taskRef },
          });
        }
      }
    } else if (dueDate === null && existingGoogleTaskRef) {
      await deleteGoogleTask(userId, existingGoogleTaskRef);
      task = await prisma.task.update({
        where: { id: taskId },
        data: { googleEventId: null },
      });
    }
  }

  // ── Recurring task spawn (fail-open) ─────────────────────────────────────
  // When a recurring task transitions to DONE for the first time, auto-create
  // the next occurrence based on the RRULE.
  const taskRecurringRule =
    recurringRule !== undefined ? recurringRule : existing.recurringRule;
  if (
    resolvedStatus === "DONE" &&
    existing.status !== "DONE" &&
    taskRecurringRule
  ) {
    try {
      const rule = RRule.fromString(taskRecurringRule);
      const baseDueDate =
        existing.dueDate ??
        (() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          return d;
        })();
      const nextDate = rule.after(baseDueDate);
      if (nextDate) {
        await prisma.task.create({
          data: {
            userId,
            // Phase 6 P5.3 — recurring chain stays team-scoped. Explicit
            // teamId carries the original task's teamId so the spawned
            // occurrence decrypts under the same principal as the source.
            teamId: existing.teamId ?? null,
            title: existing.title,
            // Copy encrypted bytes directly — same DEK decrypts the copy
            ...(existing.description && { description: existing.description }),
            ...(existing.priority && { priority: existing.priority }),
            ...(existing.meetingId && { meetingId: existing.meetingId }),
            ...(existing.cardId && { cardId: existing.cardId }),
            recurringRule: taskRecurringRule,
            recurringParentId: existing.recurringParentId ?? taskId,
            dueDate: nextDate,
            source: "MANUAL",
            status: "TODO",
            isCompleted: false,
          },
        });
        logger.info("Recurring task occurrence spawned", {
          taskId,
          userId,
          nextDate,
        });
      }
    } catch (err) {
      logger.error("Failed to spawn recurring task occurrence", {
        taskId,
        err,
      });
    }
  }

  logger.info("Task updated", { taskId, userId });

  const finalDescriptionForResponse =
    description !== undefined ? description : existingDescriptionText;

  return apiResponse(res, {
    statusCode: 200,
    message: "Task updated",
    data: { task: { ...task, description: finalDescriptionForResponse } },
  });
};

/**
 * DELETE /sma/tasks/:taskId
 * Soft-deletes the task and cascades to its direct subtasks.
 */
export const deleteTask = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  if (!uuidSchema.safeParse(taskId).success)
    throw new AppError("Invalid taskId", 400);
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  // Phase 6 P5.3 — assertTaskAccess gates the delete. Then re-fetch googleEventId
  // for the calendar cleanup below.
  await assertTaskAccess(userId, taskId, teamContext, "mutate");

  const existing = await prisma.task.findFirst({
    where: { id: taskId, isDeleted: false },
    select: { id: true, googleEventId: true },
  });

  if (!existing) throw new AppError(TASK_NOT_FOUND_MESSAGE, 404);

  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      // Soft-delete parent (access gate already passed).
      await tx.task.updateMany({
        where: { id: taskId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });
      // Phase 6 P5.3 — cascade soft-delete drops the `userId` constraint.
      // Under team context, ADMIN/OWNER deleting a member's team task wipes
      // all subtasks regardless of subtask author. Under personal context,
      // all subtasks are still actor-owned by construction so behaviour is
      // identical to pre-Phase-6. Orphan subtasks pointing to a deleted
      // parent would be worse than over-cascading.
      await tx.task.updateMany({
        where: { parentTaskId: taskId, isDeleted: false },
        data: { isDeleted: true, deletedAt: now },
      });
    },
    { timeout: 15000 },
  );

  if (isGoogleTaskRef(existing.googleEventId)) {
    await deleteGoogleTask(userId, existing.googleEventId);
  } else {
    await deleteCalendarEvent(userId, existing.googleEventId);
  }

  logger.info("Task deleted", { taskId, userId });

  return apiResponse(res, { statusCode: 200, message: "Task deleted" });
};

/**
 * PATCH /sma/tasks/reorder — bulk update sortOrder for drag-and-drop
 */
export const reorderTasks = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  const validated = reorderTasksSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const { taskIds } = validated.data;

  // Phase 6 P5.3 — verify all IDs are accessible under taskScope. Under
  // team context, ADMIN/OWNER can reorder any team task; MEMBER can only
  // reorder own. Per-row audit log captures actorId + ownerId + teamId so
  // an admin's reorder of a member's task is attributable (security must-fix).
  await prisma.$transaction(
    async (tx) => {
      const owned = await tx.task.findMany({
        where: {
          id: { in: taskIds },
          isDeleted: false,
          ...taskScope(userId, teamContext),
        },
        select: { id: true, userId: true, teamId: true },
      });

      if (owned.length !== taskIds.length) {
        throw new AppError("One or more tasks not found", 404);
      }

      const ownedById = new Map(owned.map((t) => [t.id, t]));

      await Promise.all(
        taskIds.map((id, index) =>
          tx.task.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      );

      // Per-row audit log — enables tracing an admin's reorder back to
      // the original owner of each task.
      for (const id of taskIds) {
        const row = ownedById.get(id);
        if (!row) continue;
        logger.info("task.reorder", {
          actorId: userId,
          taskId: id,
          ownerId: row.userId,
          teamId: row.teamId,
        });
      }
    },
    { timeout: 15000 },
  );

  logger.info("Tasks reordered", {
    actorId: userId,
    count: taskIds.length,
    teamId: teamContext?.teamId ?? null,
  });

  return apiResponse(res, { statusCode: 200, message: "Tasks reordered" });
};

/**
 * GET /sma/tasks/:taskId/subtasks
 */
export const getSubtasks = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  if (!uuidSchema.safeParse(taskId).success)
    throw new AppError("Invalid taskId", 400);
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  // Phase 6 P5.3 — team-aware parent access. Subtasks listed via
  // parentTaskId; taskScope applies so MEMBER under team context only
  // sees own subtasks of the parent (consistent with task list scoping).
  await assertTaskAccess(userId, taskId, teamContext, "read");

  const rawSubtasks = await prisma.task.findMany({
    where: {
      parentTaskId: taskId,
      isDeleted: false,
      ...taskScope(userId, teamContext),
    },
    orderBy: { sortOrder: "asc" },
    include: taskInclude,
    take: 100,
  });

  const decryptedSubtasks = await decryptTaskDescriptions(rawSubtasks);

  return apiResponse(res, {
    statusCode: 200,
    message: "Subtasks fetched",
    data: { subtasks: decryptedSubtasks.map(flattenTags) },
  });
};

/**
 * POST /sma/tasks/:taskId/subtasks
 */
export const createSubtask = async (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  if (!uuidSchema.safeParse(taskId).success)
    throw new AppError("Invalid taskId", 400);
  const userId = req.user!.userId;
  const teamContext = getTeamContext(req);

  // Phase 6 P5.3 — team-aware parent access. Returns the slim parent row
  // so the subtask inherits parent.teamId — team parents always have team
  // children, personal parents always have personal children. No mixed
  // states possible.
  const parent = await assertTaskAccess(userId, taskId, teamContext, "mutate");

  const validated = createTaskSchema.safeParse(req.body);
  if (!validated.success) throw new AppError("Validation failed", 400);

  const {
    title,
    description,
    dueDate,
    scheduledTime,
    priority,
    durationMinutes,
  } = validated.data;

  // Subtask inherits parent.teamId — encrypt under the matching principal.
  const subtaskPrincipal = principalForTask({
    userId,
    teamId: parent.teamId,
  });
  const encryptedSubtaskDescription = description
    ? await encrypt(description, subtaskPrincipal)
    : undefined;

  const subtask = await prisma.task.create({
    data: {
      userId, // always from req.user — never from body
      teamId: parent.teamId,
      parentTaskId: taskId,
      title,
      description: encryptedSubtaskDescription,
      dueDate,
      scheduledTime,
      priority,
      source: "MANUAL",
      ...(durationMinutes !== undefined && { durationMinutes }),
    },
  });

  logger.info("Subtask created", {
    subtaskId: subtask.id,
    parentTaskId: taskId,
    userId,
  });

  return apiResponse(res, {
    statusCode: 201,
    message: "Subtask created",
    data: { task: { ...subtask, description: description ?? null } },
  });
};
