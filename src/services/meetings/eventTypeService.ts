import prisma from "../../db/prismaClient";
import { ErrorFactory } from "../../utils/globalErrorHandler";
import { EventType } from "@prisma/client";

export interface CreateEventTypeDTO {
  userId: string;
  title: string;
  slug?: string;
  description?: string;
  duration: number; // minutes
  scheduleId: string;
  bufferBefore?: number;
  bufferAfter?: number;
  minNotice?: number; // hours
  maxAdvance?: number; // days
}

export interface UpdateEventTypeDTO {
  title?: string;
  slug?: string;
  description?: string | null;
  duration?: number;
  scheduleId?: string;
  bufferBefore?: number;
  bufferAfter?: number;
  minNotice?: number;
  maxAdvance?: number;
  isActive?: boolean;
}

/**
 * Generate a URL-safe slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export const eventTypeService = {
  /**
   * Create a new event type
   */
  async createEventType(data: CreateEventTypeDTO): Promise<EventType> {
    const {
      userId,
      title,
      slug: providedSlug,
      description,
      duration,
      scheduleId,
      bufferBefore = 0,
      bufferAfter = 0,
      minNotice = 24,
      maxAdvance = 60,
    } = data;

    // Validate schedule belongs to user
    const schedule = await prisma.availabilitySchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule || schedule.userId !== userId) {
      throw ErrorFactory.notFound("Schedule not found or not owned by user");
    }

    // Generate or validate slug
    let slug = providedSlug || generateSlug(title);

    // Ensure slug uniqueness for this user
    const existingSlug = await prisma.eventType.findUnique({
      where: { userId_slug: { userId, slug } },
    });

    if (existingSlug) {
      if (providedSlug) {
        throw ErrorFactory.conflict(
          `Event type with slug "${slug}" already exists`,
        );
      }
      // Auto-append number for generated slugs
      let counter = 1;
      while (
        await prisma.eventType.findUnique({
          where: { userId_slug: { userId, slug: `${slug}-${counter}` } },
        })
      ) {
        counter++;
      }
      slug = `${slug}-${counter}`;
    }

    return prisma.eventType.create({
      data: {
        userId,
        title,
        slug,
        description,
        duration,
        scheduleId,
        bufferBefore,
        bufferAfter,
        minNotice,
        maxAdvance,
      },
    });
  },

  /**
   * Get all event types for a user
   */
  async getEventTypes(userId: string): Promise<EventType[]> {
    return prisma.eventType.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        schedule: {
          select: { id: true, name: true, timezone: true },
        },
      },
    });
  },

  /**
   * Get event type by ID
   */
  async getEventTypeById(
    eventTypeId: string,
    userId: string,
  ): Promise<EventType> {
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: {
        schedule: {
          select: { id: true, name: true, timezone: true },
        },
      },
    });

    if (!eventType) {
      throw ErrorFactory.notFound("Event type");
    }

    if (eventType.userId !== userId) {
      throw ErrorFactory.forbidden("Cannot access another user's event type");
    }

    return eventType;
  },

  /**
   * Get event type by slug for a user
   */
  async getEventTypeBySlug(userId: string, slug: string): Promise<EventType> {
    const eventType = await prisma.eventType.findUnique({
      where: { userId_slug: { userId, slug } },
      include: {
        schedule: {
          select: { id: true, name: true, timezone: true },
        },
      },
    });

    if (!eventType) {
      throw ErrorFactory.notFound("Event type");
    }

    return eventType;
  },

  /**
   * Update event type
   */
  async updateEventType(
    eventTypeId: string,
    userId: string,
    data: UpdateEventTypeDTO,
  ): Promise<EventType> {
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
    });

    if (!eventType) {
      throw ErrorFactory.notFound("Event type");
    }

    if (eventType.userId !== userId) {
      throw ErrorFactory.forbidden("Cannot update another user's event type");
    }

    // If updating slug, check uniqueness
    if (data.slug && data.slug !== eventType.slug) {
      const existing = await prisma.eventType.findUnique({
        where: { userId_slug: { userId, slug: data.slug } },
      });
      if (existing) {
        throw ErrorFactory.conflict(
          `Event type with slug "${data.slug}" already exists`,
        );
      }
    }

    // If updating scheduleId, validate ownership
    if (data.scheduleId) {
      const schedule = await prisma.availabilitySchedule.findUnique({
        where: { id: data.scheduleId },
      });
      if (!schedule || schedule.userId !== userId) {
        throw ErrorFactory.notFound("Schedule not found or not owned by user");
      }
    }

    return prisma.eventType.update({
      where: { id: eventTypeId },
      data,
      include: {
        schedule: {
          select: { id: true, name: true, timezone: true },
        },
      },
    });
  },

  /**
   * Delete event type
   */
  async deleteEventType(
    eventTypeId: string,
    userId: string,
  ): Promise<EventType> {
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
    });

    if (!eventType) {
      throw ErrorFactory.notFound("Event type");
    }

    if (eventType.userId !== userId) {
      throw ErrorFactory.forbidden("Cannot delete another user's event type");
    }

    return prisma.eventType.delete({
      where: { id: eventTypeId },
    });
  },

  /**
   * Toggle event type active/inactive
   */
  async toggleEventType(
    eventTypeId: string,
    userId: string,
  ): Promise<EventType> {
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
    });

    if (!eventType) {
      throw ErrorFactory.notFound("Event type");
    }

    if (eventType.userId !== userId) {
      throw ErrorFactory.forbidden("Cannot modify another user's event type");
    }

    return prisma.eventType.update({
      where: { id: eventTypeId },
      data: { isActive: !eventType.isActive },
      include: {
        schedule: {
          select: { id: true, name: true, timezone: true },
        },
      },
    });
  },
};
