import { Prisma } from "@prisma/client";
import prisma from "../../db/prismaClient";

export interface CreateLogInput {
  action: string;
  adminId?: string;
  targetType?: "user" | "team" | "admin";
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function createLog(input: CreateLogInput): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      ...input,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listLogs(opts: {
  page: number;
  pageSize: number;
  action?: string;
  targetId?: string;
}) {
  const { page, pageSize, action, targetId } = opts;
  const skip = (page - 1) * pageSize;
  const where = {
    ...(action ? { action: { contains: action } } : {}),
    ...(targetId ? { targetId } : {}),
  };

  const [logs, total] = await prisma.$transaction([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return { logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
