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
      expiresIn: "24h",
    },
  );
}

// ─── Team ────────────────────────────────────────────────────────────────────

export async function listAdmins() {
  return prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, createdAt: true },
  });
}

export async function removeAdmin(targetId: string, requestingAdminId: string) {
  if (targetId === requestingAdminId) {
    throw new AppError("You cannot remove yourself", 400);
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: targetId } });
  if (!admin) throw new AppError("Admin not found", 404);

  const total = await prisma.adminUser.count();
  if (total <= 1) throw new AppError("Cannot remove the last admin", 400);

  await prisma.adminUser.delete({ where: { id: targetId } });
  logger.info("Admin removed", { targetId, removedBy: requestingAdminId });
}

export async function sendInvite(
  email: string,
  name: string,
  invitedById: string,
) {
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing)
    throw new AppError("An admin with this email already exists", 409);

  const pending = await prisma.adminInvite.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (pending)
    throw new AppError("An active invite already exists for this email", 409);

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await prisma.adminInvite.create({
    data: { email, token, invitedById, expiresAt },
  });

  const invitedBy = await prisma.adminUser.findUnique({
    where: { id: invitedById },
    select: { name: true },
  });

  const portalUrl = process.env.ADMIN_PORTAL_URL ?? "http://localhost:5175";
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
    { timeout: 10000 },
  );

  const secret = process.env.ADMIN_JWT_SECRET!;
  const jwtToken = jwt.sign(
    { role: "admin", adminId: admin.id, email: admin.email },
    secret,
    { expiresIn: "24h" },
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
