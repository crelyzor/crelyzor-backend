import { Request, Response } from "express";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";
import { globalErrorHandler } from "../utils/globalErrorHandler";
import { eventTypeService } from "../services/meetings/eventTypeService";
import { availabilityService } from "../services/meetings/availabilityService";
import { meetingService } from "../services/meetings/meetingService";
import { publicBookingRequestSchema } from "../validators/eventTypeSchema";
import prisma from "../db/prismaClient";

export class PublicBookingController {
  /**
   * GET /book/:username/:eventSlug — public booking page data
   */
  async getBookingPage(req: Request, res: Response): Promise<void> {
    try {
      const username = req.params.username as string;
      const eventSlug = req.params.eventSlug as string;

      // Find user by username
      const user = await prisma.user.findUnique({
        where: { username },
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
          timezone: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        throw ErrorFactory.notFound("User not found");
      }

      // Find event type
      const eventType = await eventTypeService.getEventTypeBySlug(
        user.id,
        eventSlug,
      );

      if (!eventType.isActive) {
        throw ErrorFactory.notFound("Event type not available");
      }

      apiResponse(res, {
        statusCode: 200,
        message: "Booking page data retrieved successfully",
        data: {
          user: {
            name: user.name,
            username: user.username,
            avatarUrl: user.avatarUrl,
            timezone: user.timezone,
          },
          eventType: {
            id: eventType.id,
            title: eventType.title,
            slug: eventType.slug,
            description: eventType.description,
            duration: eventType.duration,
          },
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * GET /book/:username/:eventSlug/slots — available slots for date range
   * Query params: startDate, endDate
   */
  async getBookingSlots(req: Request, res: Response): Promise<void> {
    try {
      const username = req.params.username as string;
      const eventSlug = req.params.eventSlug as string;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        throw ErrorFactory.validation("startDate and endDate are required");
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw ErrorFactory.validation("Invalid date format");
      }

      // Find user by username
      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true, isActive: true },
      });

      if (!user || !user.isActive) {
        throw ErrorFactory.notFound("User not found");
      }

      // Find event type
      const eventType = await eventTypeService.getEventTypeBySlug(
        user.id,
        eventSlug,
      );

      if (!eventType.isActive) {
        throw ErrorFactory.notFound("Event type not available");
      }

      // Get available slots using the event type's schedule
      const slots = await availabilityService.getAvailableSlots(
        eventType.scheduleId,
        start,
        end,
        eventType.duration,
        eventType.id,
      );

      // Group slots by date
      const slotsByDate: Record<
        string,
        Array<{ start: string; end: string }>
      > = {};

      for (const slot of slots) {
        const dateKey = slot.start.toISOString().split("T")[0];
        if (!slotsByDate[dateKey]) {
          slotsByDate[dateKey] = [];
        }
        slotsByDate[dateKey].push({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
        });
      }

      apiResponse(res, {
        statusCode: 200,
        message: "Available slots retrieved successfully",
        data: {
          slots: slotsByDate,
          meta: {
            totalSlots: slots.length,
            duration: eventType.duration,
          },
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * POST /book/:username/:eventSlug — submit booking
   */
  async createBooking(req: Request, res: Response): Promise<void> {
    try {
      const username = req.params.username as string;
      const eventSlug = req.params.eventSlug as string;

      // Validate input
      const validatedData = publicBookingRequestSchema.parse(req.body);

      // Find user by username
      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true, isActive: true },
      });

      if (!user || !user.isActive) {
        throw ErrorFactory.notFound("User not found");
      }

      // Find event type
      const eventType = await eventTypeService.getEventTypeBySlug(
        user.id,
        eventSlug,
      );

      if (!eventType.isActive) {
        throw ErrorFactory.notFound("Event type not available");
      }

      // Create booking
      const meeting = await meetingService.createPublicBooking({
        userId: user.id,
        eventTypeId: eventType.id,
        guestEmail: validatedData.guestEmail,
        guestName: validatedData.guestName,
        startTime: validatedData.startTime,
        endTime: validatedData.endTime,
        timezone: validatedData.timezone,
        guestMessage: validatedData.guestMessage,
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Booking created successfully",
        data: {
          meetingId: meeting.id,
          title: meeting.title,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          status: meeting.status,
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }
}

export const publicBookingController = new PublicBookingController();
