import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import { getLimitsForPlan } from "./billing/usageService";
import { sendEmail } from "./email/emailService";
import { adminInviteTemplate } from "./email/templates/adminInvite";
import type { Plan } from "@prisma/client";
import { createLog } from "./admin/adminAuditLogService";
import { getTranscriptionQueue } from "../config/queue";
import { getRedisClient } from "../config/redisClient";

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function adminLogin(
  email: string,
  password: string,
): Promise<string> {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    logger.error("ADMIN_JWT_SECRET is not set");
    throw new AppError("Admin portal not configured", 500);
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) throw new AppError("Invalid credentials", 401);

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw new AppError("Invalid credentials", 401);

  return jwt.sign(
    { role: "admin", adminId: admin.id, email: admin.email },
    secret,
    {
      expiresIn: "2h",
    },
  );
}

// ─── Team ────────────────────────────────────────────────────────────────────

export async function listAdmins() {
  return prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, createdAt: true },
    take: 100,
  });
}

export async function removeAdmin(targetId: string, requestingAdminId: string) {
  if (targetId === requestingAdminId) {
    throw new AppError("You cannot remove yourself", 400);
  }

  await prisma.$transaction(
    async (tx) => {
      const admin = await tx.adminUser.findUnique({ where: { id: targetId } });
      if (!admin) throw new AppError("Admin not found", 404);

      const total = await tx.adminUser.count();
      if (total <= 1) throw new AppError("Cannot remove the last admin", 400);

      await tx.adminUser.delete({ where: { id: targetId } });
    },
    { timeout: 15000 },
  );

  await createLog({
    action: "admin.admin.remove",
    adminId: requestingAdminId,
    targetType: "admin",
    targetId: targetId,
  });

  logger.info("Admin removed", { targetId, removedBy: requestingAdminId });
}

export async function sendInvite(
  email: string,
  name: string,
  invitedById: string,
) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const invitedBy = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.adminUser.findUnique({ where: { email } });
      if (existing)
        throw new AppError("An admin with this email already exists", 409);

      const pending = await tx.adminInvite.findFirst({
        where: { email, usedAt: null, expiresAt: { gt: new Date() } },
      });
      if (pending)
        throw new AppError(
          "An active invite already exists for this email",
          409,
        );

      await tx.adminInvite.create({
        data: { email, token, invitedById, expiresAt },
      });

      return tx.adminUser.findUnique({
        where: { id: invitedById },
        select: { name: true },
      });
    },
    { timeout: 15000 },
  );

  const portalUrl =
    process.env.ADMIN_PORTAL_URL ??
    (process.env.NODE_ENV !== "production" ? "http://localhost:5175" : "");
  const acceptUrl = `${portalUrl}/invite/${token}`;

  await sendEmail({
    to: email,
    subject: `${invitedBy?.name ?? "Someone"} invited you to Crelyzor Admin`,
    html: adminInviteTemplate({
      invitedByName: invitedBy?.name ?? "A Crelyzor admin",
      acceptUrl,
    }),
  });

  logger.info("Admin invite sent", { email, invitedById });
  return { email, expiresAt };
}

export async function validateInviteToken(token: string) {
  const invite = await prisma.adminInvite.findUnique({
    where: { token },
    select: { id: true, email: true, expiresAt: true, usedAt: true },
  });

  if (!invite) throw new AppError("Invalid invite link", 404);
  if (invite.usedAt)
    throw new AppError("This invite has already been used", 410);
  if (invite.expiresAt < new Date())
    throw new AppError("This invite has expired", 410);

  return { email: invite.email };
}

export async function acceptInvite(token: string, password: string) {
  const invite = await prisma.adminInvite.findUnique({ where: { token } });

  if (!invite) throw new AppError("Invalid invite link", 404);
  if (invite.usedAt)
    throw new AppError("This invite has already been used", 410);
  if (invite.expiresAt < new Date())
    throw new AppError("This invite has expired", 410);

  const existing = await prisma.adminUser.findUnique({
    where: { email: invite.email },
  });
  if (existing)
    throw new AppError("An admin with this email already exists", 409);

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.$transaction(
    async (tx) => {
      const newAdmin = await tx.adminUser.create({
        data: {
          email: invite.email,
          passwordHash,
          name: invite.email.split("@")[0],
        },
      });
      await tx.adminInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });
      return newAdmin;
    },
    { timeout: 15000 },
  );

  const secret = process.env.ADMIN_JWT_SECRET!;
  const jwtToken = jwt.sign(
    { role: "admin", adminId: admin.id, email: admin.email },
    secret,
    { expiresIn: "2h" },
  );

  logger.info("Admin invite accepted", {
    email: invite.email,
    adminId: admin.id,
  });
  return { token: jwtToken };
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function listUsers(
  page: number = 1,
  limit: number = 20,
  search?: string,
) {
  const skip = (page - 1) * limit;
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
        isDeleted: false,
      }
    : { isDeleted: false };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        createdAt: true,
        usage: {
          select: {
            transcriptionMinutesUsed: true,
            recallHoursUsed: true,
            aiCreditsUsed: true,
            storageGbUsed: true,
            resetAt: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
    select: {
      id: true,
      name: true,
      email: true,
      plan: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      username: true,
      usage: true,
      wrappedDek: true,
    },
  });

  if (!user) throw new AppError("User not found", 404);

  const limits = getLimitsForPlan(user.plan);
  const { wrappedDek, ...userWithoutDek } = user;
  return { user: { ...userWithoutDek, hasDek: wrappedDek !== null }, limits };
}

export async function updateUserPlan(
  userId: string,
  plan: Plan,
  adminId?: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
    select: { id: true, plan: true },
  });

  if (!user) throw new AppError("User not found", 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { plan },
    select: { id: true, email: true, plan: true },
  });

  await createLog({
    action: "admin.user.plan.update",
    adminId,
    targetType: "user",
    targetId: userId,
    metadata: { previousPlan: user.plan, plan },
  });

  // Phase 6 P8 — structured audit log entry. `previousPlan` lets a log
  // analytics query reconstruct the plan-change history for any user.
  logger.info("admin.user.plan.update", {
    adminId: adminId ?? null,
    userId,
    previousPlan: user.plan,
    plan,
  });
  return updated;
}

export async function resetUserUsage(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
    select: { id: true },
  });

  if (!user) throw new AppError("User not found", 404);

  const nextMonthStart = new Date();
  nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);
  nextMonthStart.setDate(1);
  nextMonthStart.setHours(0, 0, 0, 0);

  // Phase 6 P5.8 — UserUsage is now multi-row per user (one per scope).
  // Reset ALL rows for this user across personal + every team they own.
  // If the user has no rows yet, create the personal row in a zeroed state
  // so the admin response always includes a row to inspect.
  const updated = await prisma.userUsage.updateMany({
    where: { userId },
    data: {
      transcriptionMinutesUsed: 0,
      recallHoursUsed: 0,
      aiCreditsUsed: 0,
      periodStart: new Date(),
      resetAt: nextMonthStart,
    },
  });
  if (updated.count === 0) {
    await prisma.userUsage.create({
      data: {
        userId,
        teamId: null,
        transcriptionMinutesUsed: 0,
        recallHoursUsed: 0,
        aiCreditsUsed: 0,
        periodStart: new Date(),
        resetAt: nextMonthStart,
      },
    });
  }

  const personal = await prisma.userUsage.findFirst({
    where: { userId, teamId: null },
  });

  logger.info("Admin reset user usage", { userId, rowsReset: updated.count });
  return personal;
}

export async function suspendUser(userId: string, adminId?: string) {
  const updated = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId, isDeleted: false },
        select: { id: true, isActive: true },
      });
      if (!user) throw new AppError("User not found", 404);

      return tx.user.update({
        where: { id: userId },
        data: { isActive: !user.isActive },
        select: { id: true, isActive: true },
      });
    },
    { timeout: 15000 },
  );

  await createLog({
    action: updated.isActive ? "admin.user.unsuspend" : "admin.user.suspend",
    adminId,
    targetType: "user",
    targetId: userId,
  });

  logger.info(
    updated.isActive ? "admin.user.unsuspend" : "admin.user.suspend",
    {
      adminId: adminId ?? null,
      userId,
      isActive: updated.isActive,
    },
  );

  return updated;
}

export async function softDeleteUser(userId: string, adminId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
    select: { id: true },
  });
  if (!user) throw new AppError("User not found", 404);

  await prisma.user.update({
    where: { id: userId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  await createLog({
    action: "admin.user.delete",
    adminId,
    targetType: "user",
    targetId: userId,
  });

  logger.info("admin.user.delete", { adminId, userId });
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getPlatformStats() {
  const [totalUsers, planBreakdown, usageTotals, usersWithDek] =
    await Promise.all([
      prisma.user.count({ where: { isDeleted: false } }),
      prisma.user.groupBy({
        by: ["plan"],
        where: { isDeleted: false },
        _count: { id: true },
      }),
      prisma.userUsage.aggregate({
        _sum: {
          transcriptionMinutesUsed: true,
          recallHoursUsed: true,
          aiCreditsUsed: true,
          storageGbUsed: true,
        },
      }),
      prisma.user.count({
        where: { isDeleted: false, wrappedDek: { not: null } },
      }),
    ]);

  const planCounts = { FREE: 0, PRO: 0, BUSINESS: 0 };
  for (const row of planBreakdown) {
    planCounts[row.plan] = row._count.id;
  }

  return {
    totalUsers,
    planCounts,
    usageTotals: {
      transcriptionMinutes: usageTotals._sum.transcriptionMinutesUsed ?? 0,
      recallHours: usageTotals._sum.recallHoursUsed ?? 0,
      aiCredits: usageTotals._sum.aiCreditsUsed ?? 0,
      storageGb: usageTotals._sum.storageGbUsed ?? 0,
    },
    encryption: { usersWithDek, totalUsers },
  };
}

export async function getSystemHealth() {
  const queue = getTranscriptionQueue();

  let queueCounts = {
    waiting: -1,
    active: -1,
    failed: -1,
    delayed: -1,
    completed: -1,
  };
  try {
    const [waiting, active, failed, delayed, completed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getCompletedCount(),
    ]);
    queueCounts = { waiting, active, failed, delayed, completed };
  } catch {
    logger.warn(
      "getSystemHealth: queue unreachable, returning sentinel values",
    );
  }

  let redisOk = false;
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    redisOk = pong === "PONG";
  } catch {
    redisOk = false;
  }

  return {
    queue: queueCounts,
    redis: { ok: redisOk },
  };
}
