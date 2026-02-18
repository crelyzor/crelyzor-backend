import { Request, Response } from "express";
import { TokenPayload } from "../types/authTypes";
import { apiResponse } from "../utils/globalResponseHandler";
import { globalErrorHandler } from "../utils/globalErrorHandler";
import { eventTypeService } from "../services/meetings/eventTypeService";
import {
  createEventTypeSchema,
  updateEventTypeSchema,
} from "../validators/eventTypeSchema";

export class EventTypeController {
  async createEventType(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const validatedData = createEventTypeSchema.parse(req.body);

      const eventType = await eventTypeService.createEventType({
        userId: user.userId,
        ...validatedData,
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Event type created successfully",
        data: eventType,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async getEventTypes(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const eventTypes = await eventTypeService.getEventTypes(user.userId);

      apiResponse(res, {
        statusCode: 200,
        message: "Event types retrieved successfully",
        data: eventTypes,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async getEventTypeById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const eventTypeId = req.params.eventTypeId as string;

      const eventType = await eventTypeService.getEventTypeById(
        eventTypeId,
        user.userId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Event type retrieved successfully",
        data: eventType,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async updateEventType(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const eventTypeId = req.params.eventTypeId as string;
      const validatedData = updateEventTypeSchema.parse(req.body);

      const eventType = await eventTypeService.updateEventType(
        eventTypeId,
        user.userId,
        validatedData,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Event type updated successfully",
        data: eventType,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async deleteEventType(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const eventTypeId = req.params.eventTypeId as string;

      const eventType = await eventTypeService.deleteEventType(
        eventTypeId,
        user.userId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Event type deleted successfully",
        data: eventType,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async toggleEventType(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const eventTypeId = req.params.eventTypeId as string;

      const eventType = await eventTypeService.toggleEventType(
        eventTypeId,
        user.userId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: `Event type ${eventType.isActive ? "activated" : "deactivated"} successfully`,
        data: eventType,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }
}

export const eventTypeController = new EventTypeController();
