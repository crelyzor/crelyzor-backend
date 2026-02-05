import prisma from "../../db/prismaClient";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import {
  MemberAvailability,
  MemberCustomSlot,
  MemberBlockedTime,
  RecurrenceRule,
} from "@prisma/client";

export interface CreateRecurringAvailabilityDTO {
  orgMemberId: string;
  dayOfWeek: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  timezone?: string;
}

export interface RecurringAvailabilitySlotDTO {
  dayOfWeek: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  timezone?: string;
}

export interface UpdateRecurringAvailabilityDTO {
  availabilityId: string;
  orgMemberId: string;
  dayOfWeek?: string; // Optional for updates
  startTime?: string; // Optional for updates
  endTime?: string; // Optional for updates
  timezone?: string;
}

export interface CreateCustomSlotDTO {
  orgMemberId: string;
  date: Date;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  timezone?: string;
  notes?: string;
}

export interface CreateBlockedTimeDTO {
  orgMemberId: string;
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
   * Create recurring availability pattern
   */
  async createRecurringAvailability(
    data: CreateRecurringAvailabilityDTO,
  ): Promise<MemberAvailability> {
    const {
      orgMemberId,
      dayOfWeek,
      startTime,
      endTime,
      timezone = "UTC",
    } = data;

    // Validate time format
    if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
      throw ErrorFactory.validation("Time format must be HH:MM");
    }

    // Validate time range
    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Validate org member exists
    const member = await prisma.organizationMember.findUnique({
      where: { id: orgMemberId },
    });

    if (!member) {
      throw ErrorFactory.notFound("Organization member");
    }

    // Check for overlaps on same day
    const existing = await prisma.memberAvailability.findMany({
      where: {
        orgMemberId,
        dayOfWeek: dayOfWeek as any,
        isActive: true,
      },
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
      return await prisma.memberAvailability.create({
        data: {
          orgMemberId,
          dayOfWeek: dayOfWeek as any,
          startTime,
          endTime,
          timezone,
        },
      });
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === "P2002" && error.meta?.target?.includes("dayOfWeek")) {
        throw ErrorFactory.conflict(
          `An availability slot already exists for ${dayOfWeek} from ${startTime} to ${endTime}. Please delete the existing slot first or choose a different time.`,
        );
      }
      throw error;
    }
  },

  /**
   * Create multiple recurring availability patterns in batch
   */
  async createBatchRecurringAvailability(
    orgMemberId: string,
    slots: RecurringAvailabilitySlotDTO[],
  ): Promise<MemberAvailability[]> {
    // Validate org member exists
    const member = await prisma.organizationMember.findUnique({
      where: { id: orgMemberId },
    });

    if (!member) {
      throw ErrorFactory.notFound("Organization member");
    }

    // Validate all slots for format and overlaps
    for (const slot of slots) {
      // Validate time format
      if (!TIME_REGEX.test(slot.startTime) || !TIME_REGEX.test(slot.endTime)) {
        throw ErrorFactory.validation("Time format must be HH:MM");
      }

      // Validate time range
      if (slot.startTime >= slot.endTime) {
        throw ErrorFactory.validation("Start time must be before end time");
      }
    }

    // Check for overlaps within the batch and with existing availability
    const existingAvailability = await prisma.memberAvailability.findMany({
      where: {
        orgMemberId,
        isActive: true,
      },
    });

    // Check overlaps within the batch itself for the same day
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

    // Create all slots with proper error handling
    try {
      const createdSlots = await Promise.all(
        slots.map((slot) =>
          prisma.memberAvailability.create({
            data: {
              orgMemberId,
              dayOfWeek: slot.dayOfWeek as any,
              startTime: slot.startTime,
              endTime: slot.endTime,
              timezone: slot.timezone || "UTC",
            },
          }),
        ),
      );

      return createdSlots;
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === "P2002" && error.meta?.target?.includes("dayOfWeek")) {
        throw ErrorFactory.conflict(
          "One or more availability slots already exist with the same day and time. Please delete conflicting slots first or choose different times.",
        );
      }
      throw error;
    }
  },

  /**
   * Get recurring availability patterns for an org member
   */
  async getRecurringAvailability(
    orgMemberId: string,
  ): Promise<MemberAvailability[]> {
    return prisma.memberAvailability.findMany({
      where: {
        orgMemberId,
        isActive: true,
      },
      orderBy: { dayOfWeek: "asc" },
    });
  },

  /**
   * Update recurring availability
   */
  async updateRecurringAvailability(
    data: UpdateRecurringAvailabilityDTO,
  ): Promise<MemberAvailability> {
    const {
      availabilityId,
      orgMemberId,
      startTime,
      endTime,
      dayOfWeek,
      timezone,
    } = data;

    // Validate time format if times are provided
    if (startTime && !TIME_REGEX.test(startTime)) {
      throw ErrorFactory.validation("Start time format must be HH:MM");
    }
    if (endTime && !TIME_REGEX.test(endTime)) {
      throw ErrorFactory.validation("End time format must be HH:MM");
    }

    // Validate time range if both times provided
    if (startTime && endTime && startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Validate ownership
    const existing = await prisma.memberAvailability.findUnique({
      where: { id: availabilityId },
    });

    if (!existing || existing.orgMemberId !== orgMemberId) {
      throw ErrorFactory.forbidden(
        "Cannot update availability for another member",
      );
    }

    // Build update data with only provided fields
    const updateData: any = {};
    if (dayOfWeek) updateData.dayOfWeek = dayOfWeek;
    if (startTime) updateData.startTime = startTime;
    if (endTime) updateData.endTime = endTime;
    if (timezone) updateData.timezone = timezone;

    try {
      return await prisma.memberAvailability.update({
        where: { id: availabilityId },
        data: updateData,
      });
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === "P2002" && error.meta?.target?.includes("dayOfWeek")) {
        const day = dayOfWeek || existing.dayOfWeek;
        const start = startTime || existing.startTime;
        const end = endTime || existing.endTime;
        throw ErrorFactory.conflict(
          `An availability slot already exists for ${day} from ${start} to ${end}. Please choose a different time or delete the existing slot.`,
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
  ): Promise<MemberAvailability> {
    const deleted = await prisma.memberAvailability.delete({
      where: { id: availabilityId },
    });

    return deleted;
  },

  /**
   * Create custom slot for specific date
   */
  async createCustomSlot(data: CreateCustomSlotDTO): Promise<MemberCustomSlot> {
    const {
      orgMemberId,
      date,
      startTime,
      endTime,
      timezone = "UTC",
      notes,
    } = data;

    // Validate time format
    if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
      throw ErrorFactory.validation("Time format must be HH:MM");
    }

    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Validate org member exists
    const member = await prisma.organizationMember.findUnique({
      where: { id: orgMemberId },
    });

    if (!member) {
      throw ErrorFactory.notFound("Organization member");
    }

    // Check for overlaps on same date
    const existing = await prisma.memberCustomSlot.findMany({
      where: {
        orgMemberId,
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
          "Time slot overlaps with existing custom slot",
        );
      }
    }

    return prisma.memberCustomSlot.create({
      data: {
        orgMemberId,
        date,
        startTime,
        endTime,
        timezone,
        notes,
      },
    });
  },

  /**
   * Get custom slots for date range
   */
  async getCustomSlots(
    orgMemberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MemberCustomSlot[]> {
    return prisma.memberCustomSlot.findMany({
      where: {
        orgMemberId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: "asc" },
    });
  },

  /**
   * Delete custom slot (hard delete)
   */
  async deleteCustomSlot(slotId: string): Promise<MemberCustomSlot> {
    const deleted = await prisma.memberCustomSlot.delete({
      where: { id: slotId },
    });

    return deleted;
  },

  /**
   * Create blocked time
   */
  async createBlockedTime(
    data: CreateBlockedTimeDTO,
  ): Promise<MemberBlockedTime> {
    const {
      orgMemberId,
      startTime,
      endTime,
      reason,
      recurrenceRule = "NONE",
      recurrenceEnd,
    } = data;

    // Validate time range
    if (startTime >= endTime) {
      throw ErrorFactory.validation("Start time must be before end time");
    }

    // Validate org member exists
    const member = await prisma.organizationMember.findUnique({
      where: { id: orgMemberId },
    });

    if (!member) {
      throw ErrorFactory.notFound("Organization member");
    }

    return prisma.memberBlockedTime.create({
      data: {
        orgMemberId,
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
    orgMemberId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MemberBlockedTime[]> {
    return prisma.memberBlockedTime.findMany({
      where: {
        orgMemberId,
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
  async deleteBlockedTime(blockedTimeId: string): Promise<MemberBlockedTime> {
    const deleted = await prisma.memberBlockedTime.delete({
      where: { id: blockedTimeId },
    });

    return deleted;
  },

  /**
   * Calculate available slots for org member
   * Algorithm:
   * 1. Get recurring availability for each day
   * 2. Override with custom slots if exist for date
   * 3. Generate 30-min chunks from availability windows
   * 4. Exclude overlaps with meetings and blocked times
   */
  async getAvailableSlots(
    orgMemberId: string,
    startDate: Date,
    endDate: Date,
    slotDuration: number = 30, // minutes
  ): Promise<AvailableSlot[]> {
    const availableSlots: AvailableSlot[] = [];

    // Validate org member exists
    const member = await prisma.organizationMember.findUnique({
      where: { id: orgMemberId },
    });

    if (!member) {
      throw ErrorFactory.notFound("Organization member");
    }

    // Get recurring availability patterns
    const recurringAvailability =
      await this.getRecurringAvailability(orgMemberId);

    // Get custom slots
    const customSlots = await this.getCustomSlots(
      orgMemberId,
      startDate,
      endDate,
    );

    // Get blocked times
    const blockedTimes = await this.getBlockedTimes(
      orgMemberId,
      startDate,
      endDate,
    );

    // Get existing meetings
    const existingMeetings = await prisma.meeting.findMany({
      where: {
        isDeleted: false,
        status: { in: ["ACCEPTED", "PENDING_ACCEPTANCE"] },
        participants: {
          some: {
            orgMemberId: orgMemberId,
          },
        },
        startTime: { gte: startDate, lte: endDate },
      },
    });

    // Iterate through each day
    const current = new Date(startDate);
    while (current <= endDate) {
      const dayOfWeekNum = current.getDay(); // 0 = Sunday
      const dayOfWeek = this.getDayOfWeekName(dayOfWeekNum);
      const dateStr = current.toISOString().split("T")[0];

      // Step 1: Check for custom slot for this date
      const customSlot = customSlots.find((slot) => {
        const slotDate = slot.date.toISOString().split("T")[0];
        return slotDate === dateStr;
      });

      let availabilityWindows: Array<{ start: string; end: string }> = [];

      if (customSlot) {
        // Use custom slot
        availabilityWindows.push({
          start: customSlot.startTime,
          end: customSlot.endTime,
        });
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

      // Step 2: For each availability window, generate slots
      for (const window of availabilityWindows) {
        const [windowStartHour, windowStartMin] = window.start
          .split(":")
          .map(Number);
        const [windowEndHour, windowEndMin] = window.end.split(":").map(Number);

        const windowStart = new Date(current);
        windowStart.setHours(windowStartHour, windowStartMin, 0);

        const windowEnd = new Date(current);
        windowEnd.setHours(windowEndHour, windowEndMin, 0);

        // Generate chunks
        let slotStart = new Date(windowStart);
        while (slotStart < windowEnd) {
          const slotEnd = new Date(
            slotStart.getTime() + slotDuration * 60 * 1000,
          );

          // Check for conflicts
          let hasConflict = false;

          // Check meeting conflicts
          for (const meeting of existingMeetings) {
            if (meeting.startTime < slotEnd && meeting.endTime > slotStart) {
              hasConflict = true;
              break;
            }
          }

          // Check blocked time conflicts (including recurring)
          if (!hasConflict) {
            for (const blocked of blockedTimes) {
              const isBlocked = this.checkBlockedTimeOverlap(
                blocked,
                slotStart,
                slotEnd,
              );
              if (isBlocked) {
                hasConflict = true;
                break;
              }
            }
          }

          // Add slot if no conflicts
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
    blocked: MemberBlockedTime,
    slotStart: Date,
    slotEnd: Date,
  ): boolean {
    if (blocked.recurrenceRule === "NONE") {
      return blocked.startTime < slotEnd && blocked.endTime > slotStart;
    }

    // Check recurring instances
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
