import jwt from "jsonwebtoken";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import { getLimitsForPlan } from "./billing/usageService";
import type { Plan } from "@prisma/client";

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function adminLogin(
  email: string,
  password: string,
): Promise<string> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminJwtSecret = process.env.ADMIN_JWT_SECRET;

  if (!adminEmail || !adminPassword || !adminJwtSecret) {
    logger.error("Admin credentials env vars are not set");
    throw new AppError("Admin portal not configured", 500);
  }

  if (email !== adminEmail || password !== adminPassword) {
    throw new AppError("Invalid credentials", 401);
  }

  return jwt.sign({ role: "admin", email }, adminJwtSecret, {
    expiresIn: "24h",
  });
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
      createdAt: true,
      updatedAt: true,
      username: true,
      usage: true,
    },
  });

  if (!user) throw new AppError("User not found", 404);

  const limits = getLimitsForPlan(user.plan);
  return { user, limits };
}

export async function updateUserPlan(userId: string, plan: Plan) {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
    select: { id: true },
  });

  if (!user) throw new AppError("User not found", 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { plan },
    select: { id: true, email: true, plan: true },
  });

  logger.info("Admin updated user plan", { userId, plan });
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

  const usage = await prisma.userUsage.upsert({
    where: { userId },
    update: {
      transcriptionMinutesUsed: 0,
      recallHoursUsed: 0,
      aiCreditsUsed: 0,
      periodStart: new Date(),
      resetAt: nextMonthStart,
    },
    create: {
      userId,
      transcriptionMinutesUsed: 0,
      recallHoursUsed: 0,
      aiCreditsUsed: 0,
      periodStart: new Date(),
      resetAt: nextMonthStart,
    },
  });

  logger.info("Admin reset user usage", { userId });
  return usage;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getPlatformStats() {
  const [totalUsers, planBreakdown, usageTotals] = await Promise.all([
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
  };
}
