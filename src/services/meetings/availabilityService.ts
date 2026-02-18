import prisma from "../../db/prismaClient";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import {
  ScheduleAvailability,
  ScheduleOverride,
  ScheduleBlockedTime,
  RecurrenceRule,
} from "@prisma/client";

export interface CreateRecurringAvailabilityDTO {
  scheduleId: string;
  dayOfWeek: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface RecurringAvailabilitySlotDTO {
  dayOfWeek: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface UpdateRecurringAvailabilityDTO {
  availabilityId: string;
  scheduleId: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
}

export interface CreateOverrideDTO {
  scheduleId: string;
  date: Date;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  notes?: string;
}

export interface CreateBlockedTimeDTO {
  scheduleId: string;
  startTime: Date;
  endTime: Date;
  reason?: string;
  recurrenceRule?: RecurrenceRule;
  recurrenceEnd?: Date;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
}

const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

export const availabilityService = {
  /**
   * Validate that a schedule exists and return its userId
   */
  async validateScheduleOwnership(
    scheduleId: string,
    userId: string,
  ): Promise<void> {
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    if (schedule.userId !== userId) {
      throw ErrorFactory.forbidden("Cannot access another user's schedule");
    }
  },

  /**
   * Create recurring availability pattern
   */
  async createRecurringAvailability(
    data: CreateRecurringAvailabilityDTO,
  ): Promise<ScheduleAvailability> {
    const { scheduleId, dayOfWeek, startTime, endTime } = data;

    // Validate time format
    if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
      throw ErrorFactory.validation("Time format must be HH:MM");
    }

    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Validate schedule exists
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    // Check for overlaps on same day
    const existing = await prisma.scheduleAvailability.findMany({
      where: { scheduleId, dayOfWeek: dayOfWeek as any, isActive: true },
    });

    for (const slot of existing) {
      if (
        this.timeRangesOverlap(startTime, endTime, slot.startTime, slot.endTime)
      ) {
        throw ErrorFactory.conflict(
          "Time slot overlaps with existing availability",
        );
      }
    }

    try {
      return await prisma.scheduleAvailability.create({
        data: {
          scheduleId,
          dayOfWeek: dayOfWeek as any,
          startTime,
          endTime,
        },
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        throw ErrorFactory.conflict(
          `An availability slot already exists for ${dayOfWeek} from ${startTime} to ${endTime}.`,
        );
      }
      throw error;
    }
  },

  /**
   * Create multiple recurring availability patterns in batch
   */
  async createBatchRecurringAvailability(
    scheduleId: string,
    slots: RecurringAvailabilitySlotDTO[],
  ): Promise<ScheduleAvailability[]> {
    // Validate schedule exists
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    // Validate all slots
    for (const slot of slots) {
      if (!TIME_REGEX.test(slot.startTime) || !TIME_REGEX.test(slot.endTime)) {
        throw ErrorFactory.validation("Time format must be HH:MM");
      }
      if (slot.startTime >= slot.endTime) {
        throw ErrorFactory.validation("Start time must be before end time");
      }
    }

    // Check overlaps within the batch
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        if (slots[i].dayOfWeek === slots[j].dayOfWeek) {
          if (
            this.timeRangesOverlap(
              slots[i].startTime,
              slots[i].endTime,
              slots[j].startTime,
              slots[j].endTime,
            )
          ) {
            throw ErrorFactory.conflict(
              `Time slots overlap on ${slots[i].dayOfWeek}`,
            );
          }
        }
      }
    }

    // Check overlaps with existing availability
    const existingAvailability = await prisma.scheduleAvailability.findMany({
      where: { scheduleId, isActive: true },
    });

    for (const slot of slots) {
      for (const existing of existingAvailability) {
        if (slot.dayOfWeek === existing.dayOfWeek) {
          if (
            this.timeRangesOverlap(
              slot.startTime,
              slot.endTime,
              existing.startTime,
              existing.endTime,
            )
          ) {
            throw ErrorFactory.conflict(
              `Time slot overlaps with existing availability on ${slot.dayOfWeek}`,
            );
          }
        }
      }
    }

    try {
      return await Promise.all(
        slots.map((slot) =>
          prisma.scheduleAvailability.create({
            data: {
              scheduleId,
              dayOfWeek: slot.dayOfWeek as any,
              startTime: slot.startTime,
              endTime: slot.endTime,
            },
          }),
        ),
      );
    } catch (error: any) {
      if (error.code === "P2002") {
        throw ErrorFactory.conflict(
          "One or more availability slots already exist with the same day and time.",
        );
      }
      throw error;
    }
  },

  /**
   * Get recurring availability patterns for a schedule
   */
  async getRecurringAvailability(
    scheduleId: string,
  ): Promise<ScheduleAvailability[]> {
    return prisma.scheduleAvailability.findMany({
      where: { scheduleId, isActive: true },
      orderBy: { dayOfWeek: "asc" },
    });
  },

  /**
   * Update recurring availability
   */
  async updateRecurringAvailability(
    data: UpdateRecurringAvailabilityDTO,
  ): Promise<ScheduleAvailability> {
    const { availabilityId, scheduleId, startTime, endTime, dayOfWeek } = data;

    if (startTime && !TIME_REGEX.test(startTime)) {
      throw ErrorFactory.validation("Start time format must be HH:MM");
    }
    if (endTime && !TIME_REGEX.test(endTime)) {
      throw ErrorFactory.validation("End time format must be HH:MM");
    }
    if (startTime && endTime && startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    const existing = await prisma.scheduleAvailability.findUnique({
      where: { id: availabilityId },
    });

    if (!existing || existing.scheduleId !== scheduleId) {
      throw ErrorFactory.forbidden(
        "Cannot update availability for another schedule",
      );
    }

    const updateData: any = {};
    if (dayOfWeek) updateData.dayOfWeek = dayOfWeek;
    if (startTime) updateData.startTime = startTime;
    if (endTime) updateData.endTime = endTime;

    try {
      return await prisma.scheduleAvailability.update({
        where: { id: availabilityId },
        data: updateData,
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        throw ErrorFactory.conflict(
          `An availability slot already exists for that day and time.`,
        );
      }
      throw error;
    }
  },

  /**
   * Delete recurring availability (hard delete)
   */
  async deleteRecurringAvailability(
    availabilityId: string,
  ): Promise<ScheduleAvailability> {
    return prisma.scheduleAvailability.delete({
      where: { id: availabilityId },
    });
  },

  /**
   * Create override (custom slot) for specific date
   */
  async createOverride(data: CreateOverrideDTO): Promise<ScheduleOverride> {
    const { scheduleId, date, startTime, endTime, notes } = data;

    if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
      throw ErrorFactory.validation("Time format must be HH:MM");
    }

    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    // Check for overlaps on same date
    const existing = await prisma.scheduleOverride.findMany({
      where: {
        scheduleId,
        date: {
          gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
          lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
        },
        isActive: true,
      },
    });

    for (const slot of existing) {
      if (
        this.timeRangesOverlap(startTime, endTime, slot.startTime, slot.endTime)
      ) {
        throw ErrorFactory.conflict(
          "Time slot overlaps with existing override",
        );
      }
    }

    return prisma.scheduleOverride.create({
      data: { scheduleId, date, startTime, endTime, notes },
    });
  },

  /**
   * Get overrides for date range
   */
  async getOverrides(
    scheduleId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ScheduleOverride[]> {
    return prisma.scheduleOverride.findMany({
      where: {
        scheduleId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: "asc" },
    });
  },

  /**
   * Delete override (hard delete)
   */
  async deleteOverride(slotId: string): Promise<ScheduleOverride> {
    return prisma.scheduleOverride.delete({ where: { id: slotId } });
  },

  /**
   * Create blocked time
   */
  async createBlockedTime(
    data: CreateBlockedTimeDTO,
  ): Promise<ScheduleBlockedTime> {
    const {
      scheduleId,
      startTime,
      endTime,
      reason,
      recurrenceRule = "NONE",
      recurrenceEnd,
    } = data;

    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    return prisma.scheduleBlockedTime.create({
      data: {
        scheduleId,
        startTime,
        endTime,
        reason,
        recurrenceRule: recurrenceRule as RecurrenceRule,
        recurrenceEnd,
      },
    });
  },

  /**
   * Get blocked times for date range
   */
  async getBlockedTimes(
    scheduleId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ScheduleBlockedTime[]> {
    return prisma.scheduleBlockedTime.findMany({
      where: {
        scheduleId,
        OR: [
          {
            startTime: { lte: endDate },
            endTime: { gte: startDate },
          },
        ],
      },
      orderBy: { startTime: "asc" },
    });
  },

  /**
   * Delete blocked time (hard delete)
   */
  async deleteBlockedTime(blockedTimeId: string): Promise<ScheduleBlockedTime> {
    return prisma.scheduleBlockedTime.delete({
      where: { id: blockedTimeId },
    });
  },

  /**
   * Calculate available slots for a schedule
   *
   * Algorithm:
   * 1. Get recurring availability for each day
   * 2. Override with custom slots if exist for date
   * 3. Generate time chunks from availability windows
   * 4. Exclude overlaps with meetings (across ALL user contexts), blocked times, and Google Calendar events
   * 5. When eventTypeId provided: apply buffer, minNotice, maxAdvance
   */
  async getAvailableSlots(
    scheduleId: string,
    startDate: Date,
    endDate: Date,
    slotDuration: number = 30,
    eventTypeId?: string,
  ): Promise<AvailableSlot[]> {
    const availableSlots: AvailableSlot[] = [];

    // Get schedule and its user
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw ErrorFactory.notFound("Schedule");
    }

    const userId = schedule.userId;

    // Apply event type constraints if provided
    let bufferBefore = 0;
    let bufferAfter = 0;
    let effectiveSlotDuration = slotDuration;

    if (eventTypeId) {
      const eventType = await prisma.eventType.findUnique({
        where: { id: eventTypeId },
      });
      if (eventType) {
        effectiveSlotDuration = eventType.duration;
        bufferBefore = eventType.bufferBefore;
        bufferAfter = eventType.bufferAfter;

        // Apply minNotice (hours)
        const minNoticeDate = new Date(
          Date.now() + eventType.minNotice * 60 * 60 * 1000,
        );
        if (startDate < minNoticeDate) {
          startDate = minNoticeDate;
        }

        // Apply maxAdvance (days)
        const maxAdvanceDate = new Date(
          Date.now() + eventType.maxAdvance * 24 * 60 * 60 * 1000,
        );
        if (endDate > maxAdvanceDate) {
          endDate = maxAdvanceDate;
        }
      }
    }

    // Get recurring availability patterns
    const recurringAvailability =
      await this.getRecurringAvailability(scheduleId);

    // Get overrides (custom slots)
    const overrides = await this.getOverrides(scheduleId, startDate, endDate);

    // Get blocked times
    const blockedTimes = await this.getBlockedTimes(
      scheduleId,
      startDate,
      endDate,
    );

    // Get existing meetings for this user across ALL contexts
    const existingMeetings = await prisma.meeting.findMany({
      where: {
        isDeleted: false,
        status: { in: ["ACCEPTED", "PENDING_ACCEPTANCE", "CREATED"] },
        OR: [
          // Meetings user created
          { createdById: userId },
          // Meetings user participates in
          { participants: { some: { userId } } },
        ],
        startTime: { lte: endDate },
        endTime: { gte: startDate },
      },
    });

    // Get Google Calendar events for this user
    const googleEvents = await prisma.googleCalendarEvent.findMany({
      where: {
        userId,
        startTime: { lte: endDate },
        endTime: { gte: startDate },
        status: { not: "cancelled" },
      },
    });

    // Iterate through each day
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      const dayOfWeekNum = current.getDay();
      const dayOfWeek = this.getDayOfWeekName(dayOfWeekNum);
      const dateStr = current.toISOString().split("T")[0];

      // Check for override on this date
      const dateOverrides = overrides.filter((slot) => {
        const slotDate = slot.date.toISOString().split("T")[0];
        return slotDate === dateStr;
      });

      let availabilityWindows: Array<{ start: string; end: string }> = [];

      if (dateOverrides.length > 0) {
        // Use overrides for this date
        availabilityWindows = dateOverrides.map((slot) => ({
          start: slot.startTime,
          end: slot.endTime,
        }));
      } else {
        // Use recurring availability for this day
        const dayRecurring = recurringAvailability.filter(
          (av) => av.dayOfWeek === dayOfWeek,
        );
        availabilityWindows = dayRecurring.map((av) => ({
          start: av.startTime,
          end: av.endTime,
        }));
      }

      // Generate slots for each availability window
      for (const window of availabilityWindows) {
        const [windowStartHour, windowStartMin] = window.start
          .split(":")
          .map(Number);
        const [windowEndHour, windowEndMin] = window.end.split(":").map(Number);

        const windowStart = new Date(current);
        windowStart.setHours(windowStartHour, windowStartMin, 0, 0);

        const windowEnd = new Date(current);
        windowEnd.setHours(windowEndHour, windowEndMin, 0, 0);

        // Generate chunks
        let slotStart = new Date(windowStart);
        while (slotStart < windowEnd) {
          const slotEnd = new Date(
            slotStart.getTime() + effectiveSlotDuration * 60 * 1000,
          );

          // Include buffer in conflict check
          const bufferStart = new Date(
            slotStart.getTime() - bufferBefore * 60 * 1000,
          );
          const bufferEnd = new Date(
            slotEnd.getTime() + bufferAfter * 60 * 1000,
          );

          let hasConflict = false;

          // Check meeting conflicts (with buffer)
          for (const meeting of existingMeetings) {
            if (
              meeting.startTime < bufferEnd &&
              meeting.endTime > bufferStart
            ) {
              hasConflict = true;
              break;
            }
          }

          // Check Google Calendar conflicts (with buffer)
          if (!hasConflict) {
            for (const event of googleEvents) {
              if (event.startTime < bufferEnd && event.endTime > bufferStart) {
                hasConflict = true;
                break;
              }
            }
          }

          // Check blocked time conflicts
          if (!hasConflict) {
            for (const blocked of blockedTimes) {
              if (
                this.checkBlockedTimeOverlap(blocked, bufferStart, bufferEnd)
              ) {
                hasConflict = true;
                break;
              }
            }
          }

          // Skip past slots
          if (!hasConflict && slotStart < new Date()) {
            hasConflict = true;
          }

          if (!hasConflict && slotEnd <= windowEnd) {
            availableSlots.push({
              start: new Date(slotStart),
              end: new Date(slotEnd),
            });
          }

          slotStart = slotEnd;
        }
      }

      // Move to next day
      current.setDate(current.getDate() + 1);
    }

    return availableSlots;
  },

  /**
   * Helper: Check if time ranges overlap
   */
  timeRangesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean {
    return start1 < end2 && end1 > start2;
  },

  /**
   * Helper: Get day of week name from number
   */
  getDayOfWeekName(dayNum: number): string {
    const days = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ];
    return days[dayNum];
  },

  /**
   * Helper: Check if blocked time (possibly recurring) overlaps with time slot
   */
  checkBlockedTimeOverlap(
    blocked: ScheduleBlockedTime,
    slotStart: Date,
    slotEnd: Date,
  ): boolean {
    if (blocked.recurrenceRule === "NONE") {
      return blocked.startTime < slotEnd && blocked.endTime > slotStart;
    }

    let current = new Date(blocked.startTime);
    const duration = blocked.endTime.getTime() - blocked.startTime.getTime();
    const recurrenceEnd = blocked.recurrenceEnd || slotEnd;

    while (current <= recurrenceEnd) {
      const blockEnd = new Date(current.getTime() + duration);

      if (current < slotEnd && blockEnd > slotStart) {
        return true;
      }

      if (blocked.recurrenceRule === "WEEKLY") {
        current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (blocked.recurrenceRule === "MONTHLY") {
        current = new Date(
          current.getFullYear(),
          current.getMonth() + 1,
          current.getDate(),
        );
      }

      if (current > recurrenceEnd) break;
    }

    return false;
  },
};
