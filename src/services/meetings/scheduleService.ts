import prisma from "../../db/prismaClient";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import { AvailabilitySchedule } from "@prisma/client";

export interface CreateScheduleDTO {
  userId: string;
  name?: string;
  timezone?: string;
}

export interface UpdateScheduleDTO {
  name?: string;
  timezone?: string;
  isActive?: boolean;
}

export const scheduleService = {
  /**
   * Create a new availability schedule
   * Auto-sets isDefault if it's the user's first schedule
   */
  async createSchedule(data: CreateScheduleDTO): Promise<AvailabilitySchedule> {
    const { userId, name = "Working Hours", timezone = "UTC" } = data;

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw ErrorFactory.notFound("User");
    }

    // Check if this is the first schedule (auto-set as default)
    const existingCount = await prisma.availabilitySchedule.count({
      where: { userId },
    });

    const isDefault = existingCount === 0;

    return prisma.availabilitySchedule.create({
      data: {
        userId,
        name,
        timezone,
        isDefault,
      },
    });
  },

  /**
   * Get all schedules for a user
   */
  async getSchedules(userId: string): Promise<AvailabilitySchedule[]> {
    return prisma.availabilitySchedule.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  },

  /**
   * Get default schedule for a user, auto-create if none exists
   */
  async getDefaultSchedule(userId: string): Promise<AvailabilitySchedule> {
    let schedule = await prisma.availabilitySchedule.findFirst({
      where: { userId, isDefault: true },
    });

    if (!schedule) {
      // Auto-create default schedule
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw ErrorFactory.notFound("User");
      }

      schedule = await prisma.availabilitySchedule.create({
        data: {
          userId,
          name: "Working Hours",
          timezone: user.timezone || "UTC",
          isDefault: true,
        },
      });
    }

    return schedule;
  },

  /**
   * Get schedule by ID (with ownership validation)
   */
  async getScheduleById(
    scheduleId: string,
    userId: string,
  ): Promise<AvailabilitySchedule> {
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    if (schedule.userId !== userId) {
      throw ErrorFactory.forbidden("Cannot access another user's schedule");
    }

    return schedule;
  },

  /**
   * Update a schedule
   */
  async updateSchedule(
    scheduleId: string,
    userId: string,
    data: UpdateScheduleDTO,
  ): Promise<AvailabilitySchedule> {
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    if (schedule.userId !== userId) {
      throw ErrorFactory.forbidden("Cannot update another user's schedule");
    }

    return prisma.availabilitySchedule.update({
      where: { id: scheduleId },
      data,
    });
  },

  /**
   * Delete a schedule (prevent deleting the only schedule)
   */
  async deleteSchedule(
    scheduleId: string,
    userId: string,
  ): Promise<AvailabilitySchedule> {
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    if (schedule.userId !== userId) {
      throw ErrorFactory.forbidden("Cannot delete another user's schedule");
    }

    // Check if it's the only schedule
    const scheduleCount = await prisma.availabilitySchedule.count({
      where: { userId },
    });

    if (scheduleCount <= 1) {
      throw ErrorFactory.conflict("Cannot delete your only schedule");
    }

    // If deleting the default, set another as default
    if (schedule.isDefault) {
      const nextSchedule = await prisma.availabilitySchedule.findFirst({
        where: { userId, id: { not: scheduleId } },
        orderBy: { createdAt: "asc" },
      });

      if (nextSchedule) {
        await prisma.availabilitySchedule.update({
          where: { id: nextSchedule.id },
          data: { isDefault: true },
        });
      }
    }

    return prisma.availabilitySchedule.delete({
      where: { id: scheduleId },
    });
  },

  /**
   * Set a schedule as the default (unsets others)
   */
  async setDefaultSchedule(
    scheduleId: string,
    userId: string,
  ): Promise<AvailabilitySchedule> {
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    if (schedule.userId !== userId) {
      throw ErrorFactory.forbidden("Cannot modify another user's schedule");
    }

    // Unset all defaults, then set this one
    await prisma.$transaction([
      prisma.availabilitySchedule.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.availabilitySchedule.update({
        where: { id: scheduleId },
        data: { isDefault: true },
      }),
    ]);

    return prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    }) as Promise<AvailabilitySchedule>;
  },
};
