import { Request, Response } from "express";
import { TokenPayload } from "../types/authTypes";
import { apiResponse } from "../utils/globalResponseHandler";
import { globalErrorHandler } from "../utils/globalErrorHandler";
import { scheduleService } from "../services/meetings/scheduleService";
import {
  createScheduleSchema,
  updateScheduleSchema,
} from "../validators/scheduleSchema";

export class ScheduleController {
  async createSchedule(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const validatedData = createScheduleSchema.parse(req.body);

      const schedule = await scheduleService.createSchedule({
        userId: user.userId,
        ...validatedData,
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Schedule created successfully",
        data: schedule,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async getSchedules(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const schedules = await scheduleService.getSchedules(user.userId);

      apiResponse(res, {
        statusCode: 200,
        message: "Schedules retrieved successfully",
        data: schedules,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async getDefaultSchedule(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const schedule = await scheduleService.getDefaultSchedule(user.userId);

      apiResponse(res, {
        statusCode: 200,
        message: "Default schedule retrieved successfully",
        data: schedule,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async updateSchedule(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;
      const validatedData = updateScheduleSchema.parse(req.body);

      const schedule = await scheduleService.updateSchedule(
        scheduleId,
        user.userId,
        validatedData,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Schedule updated successfully",
        data: schedule,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async deleteSchedule(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;

      const schedule = await scheduleService.deleteSchedule(
        scheduleId,
        user.userId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Schedule deleted successfully",
        data: schedule,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  async setDefaultSchedule(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;

      const schedule = await scheduleService.setDefaultSchedule(
        scheduleId,
        user.userId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Default schedule updated successfully",
        data: schedule,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }
}

export const scheduleController = new ScheduleController();
