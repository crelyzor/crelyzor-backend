import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import type {
  CreateScheduleInput,
  UpdateScheduleInput,
  CopyScheduleInput,
  PatchSlotsInput,
  CreateScheduleOverrideInput,
} from "../../validators/scheduleSchema";

const SCHEDULE_SELECT = {
  id: true,
  name: true,
  timezone: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SLOT_SELECT = {
  id: true,
  scheduleId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  updatedAt: true,
} as const;

const OVERRIDE_SELECT = {
  id: true,
  date: true,
  isBlocked: true,
  createdAt: true,
  updatedAt: true,
} as const;

function parseDateSafe(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

async function assertScheduleOwner(userId: string, scheduleId: string) {
  const schedule = await prisma.availabilitySchedule.findFirst({
    where: { id: scheduleId, userId, isDeleted: false },
    select: { id: true, isDefault: true },
  });
  if (!schedule) throw new AppError("Schedule not found", 404);
  return schedule;
}

// ── Schedule CRUD ──────────────────────────────────────────────────────────

export async function listSchedules(userId: string) {
  return prisma.availabilitySchedule.findMany({
    where: { userId, isDeleted: false },
    select: SCHEDULE_SELECT,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    take: 20,
  });
}

export async function createSchedule(userId: string, data: CreateScheduleInput) {
  const existingCount = await prisma.availabilitySchedule.count({
    where: { userId, isDeleted: false },
  });
  const isDefault = existingCount === 0;

  const schedule = await prisma.availabilitySchedule.create({
    data: { userId, name: data.name, timezone: data.timezone, isDefault },
    select: SCHEDULE_SELECT,
  });

  logger.info("Availability schedule created", {
    userId,
    scheduleId: schedule.id,
    isDefault,
  });
  return schedule;
}

export async function updateSchedule(
  userId: string,
  scheduleId: string,
  data: UpdateScheduleInput,
) {
  await assertScheduleOwner(userId, scheduleId);

  const schedule = await prisma.availabilitySchedule.update({
    where: { id: scheduleId },
    data,
    select: SCHEDULE_SELECT,
  });

  logger.info("Availability schedule updated", { userId, scheduleId });
  return schedule;
}

export async function deleteSchedule(userId: string, scheduleId: string) {
  const schedule = await assertScheduleOwner(userId, scheduleId);

  if (schedule.isDefault) {
    throw new AppError(
      "Cannot delete the default schedule. Set another as default first.",
      409,
    );
  }

  await prisma.availabilitySchedule.update({
    where: { id: scheduleId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  logger.info("Availability schedule deleted", { userId, scheduleId });
}

export async function copySchedule(
  userId: string,
  scheduleId: string,
  data: CopyScheduleInput,
) {
  const source = await prisma.availabilitySchedule.findFirst({
    where: { id: scheduleId, userId, isDeleted: false },
    include: {
      slots: {
        where: { isDeleted: false },
        select: { dayOfWeek: true, startTime: true, endTime: true },
      },
      overrides: {
        where: { isDeleted: false },
        select: { date: true, isBlocked: true },
      },
    },
  });
  if (!source) throw new AppError("Schedule not found", 404);

  const copy = await prisma.$transaction(
    async (tx) => {
      const newSchedule = await tx.availabilitySchedule.create({
        data: {
          userId,
          name: data.name,
          timezone: source.timezone,
          isDefault: false,
        },
        select: SCHEDULE_SELECT,
      });

      if (source.slots.length > 0) {
        await tx.availability.createMany({
          data: source.slots.map((s) => ({ scheduleId: newSchedule.id, ...s })),
        });
      }

      if (source.overrides.length > 0) {
        await tx.availabilityOverride.createMany({
          data: source.overrides.map((o) => ({
            scheduleId: newSchedule.id,
            ...o,
          })),
        });
      }

      return newSchedule;
    },
    { timeout: 15000 },
  );

  logger.info("Availability schedule copied", {
    userId,
    sourceId: scheduleId,
    newId: copy.id,
  });
  return copy;
}

export async function setDefaultSchedule(userId: string, scheduleId: string) {
  await assertScheduleOwner(userId, scheduleId);

  await prisma.$transaction(
    async (tx) => {
      await tx.availabilitySchedule.updateMany({
        where: { userId, isDeleted: false, isDefault: true },
        data: { isDefault: false },
      });
      await tx.availabilitySchedule.update({
        where: { id: scheduleId },
        data: { isDefault: true },
      });
    },
    { timeout: 15000 },
  );

  logger.info("Default schedule set", { userId, scheduleId });

  return prisma.availabilitySchedule.findUnique({
    where: { id: scheduleId },
    select: SCHEDULE_SELECT,
  });
}

// ── Slots ──────────────────────────────────────────────────────────────────

export async function getSlots(userId: string, scheduleId: string) {
  await assertScheduleOwner(userId, scheduleId);

  const slots = await prisma.availability.findMany({
    where: { scheduleId, isDeleted: false },
    select: SLOT_SELECT,
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  const byDay = new Map<number, typeof slots>();
  for (const slot of slots) {
    if (!byDay.has(slot.dayOfWeek)) byDay.set(slot.dayOfWeek, []);
    byDay.get(slot.dayOfWeek)!.push(slot);
  }

  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    slots: byDay.get(dayOfWeek) ?? [],
  }));
}

export async function patchSlots(
  userId: string,
  scheduleId: string,
  data: PatchSlotsInput,
) {
  await assertScheduleOwner(userId, scheduleId);

  // Validate no overlapping slots on same day
  const dayMap = new Map<number, Array<{ startTime: string; endTime: string }>>();
  for (const slot of data.slots) {
    if (!dayMap.has(slot.dayOfWeek)) dayMap.set(slot.dayOfWeek, []);
    dayMap.get(slot.dayOfWeek)!.push(slot);
  }
  for (const [day, daySlots] of dayMap) {
    const sorted = daySlots
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        throw new AppError(`Overlapping time slots on day ${day}`, 400);
      }
    }
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.availability.updateMany({
        where: { scheduleId, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      if (data.slots.length > 0) {
        await tx.availability.createMany({
          data: data.slots.map((s) => ({ scheduleId, ...s })),
        });
      }
    },
    { timeout: 15000 },
  );

  logger.info("Schedule slots updated", {
    userId,
    scheduleId,
    count: data.slots.length,
  });
}

// ── Overrides ────────────────────────────────────────────────────────────

export async function getOverrides(userId: string, scheduleId: string) {
  await assertScheduleOwner(userId, scheduleId);

  return prisma.availabilityOverride.findMany({
    where: { scheduleId, isDeleted: false },
    select: OVERRIDE_SELECT,
    orderBy: { date: "asc" },
    take: 365,
  });
}

export async function createOverride(
  userId: string,
  scheduleId: string,
  data: CreateScheduleOverrideInput,
) {
  await assertScheduleOwner(userId, scheduleId);

  const date = parseDateSafe(data.date);

  const override = await prisma.availabilityOverride.upsert({
    where: { scheduleId_date: { scheduleId, date } },
    create: { scheduleId, date, isBlocked: data.isBlocked },
    update: { isBlocked: data.isBlocked, isDeleted: false, deletedAt: null },
    select: OVERRIDE_SELECT,
  });

  logger.info("Schedule override created", { userId, scheduleId, date: data.date });
  return override;
}

export async function deleteOverride(
  userId: string,
  scheduleId: string,
  overrideId: string,
) {
  await assertScheduleOwner(userId, scheduleId);

  const existing = await prisma.availabilityOverride.findFirst({
    where: { id: overrideId, scheduleId, isDeleted: false },
    select: { id: true },
  });
  if (!existing) throw new AppError("Override not found", 404);

  await prisma.availabilityOverride.update({
    where: { id: overrideId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  logger.info("Schedule override deleted", { userId, scheduleId, overrideId });
}
