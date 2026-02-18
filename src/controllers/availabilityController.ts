import { Request, Response } from "express";
import { TokenPayload } from "../types/authTypes";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";
import { globalErrorHandler } from "../utils/globalErrorHandler";
import { availabilityService } from "../services/meetings/availabilityService";
import {
  createRecurringAvailabilitySchema,
  updateRecurringAvailabilitySchema,
  createOverrideSchema,
  createBlockedTimeSchema,
  getAvailableSlotsSchema,
  createBatchRecurringAvailabilitySchema,
} from "../validators/availabilitySchema";

export class AvailabilityController {
  /**
   * Create recurring availability pattern for a schedule
   */
  async createRecurringAvailability(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;

      // Validate ownership
      await availabilityService.validateScheduleOwnership(
        scheduleId,
        user.userId,
      );

      const validatedData = createRecurringAvailabilitySchema.parse(req.body);

      const availability =
        await availabilityService.createRecurringAvailability({
          scheduleId,
          ...validatedData,
        });

      apiResponse(res, {
        statusCode: 201,
        message: "Recurring availability created successfully",
        data: availability,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Create multiple recurring availability patterns in batch
   */
  async createBatchRecurringAvailability(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;

      await availabilityService.validateScheduleOwnership(
        scheduleId,
        user.userId,
      );

      const validatedData = createBatchRecurringAvailabilitySchema.parse(
        req.body,
      );

      const availabilities =
        await availabilityService.createBatchRecurringAvailability(
          scheduleId,
          validatedData.slots,
        );

      apiResponse(res, {
        statusCode: 201,
        message: `${availabilities.length} recurring availability slots created successfully`,
        data: availabilities,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get recurring availability patterns for a schedule
   */
  async getRecurringAvailability(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;

      await availabilityService.validateScheduleOwnership(
        scheduleId,
        user.userId,
      );

      const availability =
        await availabilityService.getRecurringAvailability(scheduleId);

      apiResponse(res, {
        statusCode: 200,
        message: "Recurring availability retrieved successfully",
        data: availability,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Update recurring availability
   */
  async updateRecurringAvailability(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;
      const availabilityId = req.params.availabilityId as string;

      await availabilityService.validateScheduleOwnership(
        scheduleId,
        user.userId,
      );

      const validatedData = updateRecurringAvailabilitySchema.parse(req.body);

      const availability =
        await availabilityService.updateRecurringAvailability({
          availabilityId,
          scheduleId,
          ...validatedData,
        });

      apiResponse(res, {
        statusCode: 200,
        message: "Recurring availability updated successfully",
        data: availability,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Delete recurring availability
   */
  async deleteRecurringAvailability(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;
      const availabilityId = req.params.availabilityId as string;

      await availabilityService.validateScheduleOwnership(
        scheduleId,
        user.userId,
      );

      const availability =
        await availabilityService.deleteRecurringAvailability(availabilityId);

      apiResponse(res, {
        statusCode: 200,
        message: "Recurring availability deleted successfully",
        data: availability,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Create override (custom slot) for specific date
   */
  async createOverride(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;

      await availabilityService.validateScheduleOwnership(
        scheduleId,
        user.userId,
      );

      const validatedData = createOverrideSchema.parse(req.body);

      const override = await availabilityService.createOverride({
        scheduleId,
        ...validatedData,
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Override created successfully",
        data: override,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get overrides for date range
   */
  async getOverrides(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;
      const { startDate, endDate } = req.query;

      await availabilityService.validateScheduleOwnership(
        scheduleId,
        user.userId,
      );

      let start: Date;
      let end: Date;

      if (startDate && endDate) {
        start = new Date(startDate as string);
        end = new Date(endDate as string);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw ErrorFactory.validation("Invalid date format");
        }
      } else {
        start = new Date(0);
        end = new Date("2099-12-31");
      }

      const overrides = await availabilityService.getOverrides(
        scheduleId,
        start,
        end,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Overrides retrieved successfully",
        data: overrides,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Delete override
   */
  async deleteOverride(req: Request, res: Response): Promise<void> {
    try {
      const slotId = req.params.slotId as string;

      const override = await availabilityService.deleteOverride(slotId);

      apiResponse(res, {
        statusCode: 200,
        message: "Override deleted successfully",
        data: override,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Create blocked time
   */
  async createBlockedTime(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;

      await availabilityService.validateScheduleOwnership(
        scheduleId,
        user.userId,
      );

      const validatedData = createBlockedTimeSchema.parse(req.body);

      const blockedTime = await availabilityService.createBlockedTime({
        scheduleId,
        ...validatedData,
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Blocked time created successfully",
        data: blockedTime,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get blocked times
   */
  async getBlockedTimes(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const scheduleId = req.params.scheduleId as string;
      const { startDate, endDate } = req.query;

      await availabilityService.validateScheduleOwnership(
        scheduleId,
        user.userId,
      );

      let start: Date;
      let end: Date;

      if (startDate && endDate) {
        start = new Date(startDate as string);
        end = new Date(endDate as string);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw ErrorFactory.validation("Invalid date format");
        }
      } else {
        start = new Date(0);
        end = new Date("2099-12-31");
      }

      const blockedTimes = await availabilityService.getBlockedTimes(
        scheduleId,
        start,
        end,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Blocked times retrieved successfully",
        data: blockedTimes,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Delete blocked time
   */
  async deleteBlockedTime(req: Request, res: Response): Promise<void> {
    try {
      const blockedTimeId = req.params.blockedTimeId as string;

      const blockedTime =
        await availabilityService.deleteBlockedTime(blockedTimeId);

      apiResponse(res, {
        statusCode: 200,
        message: "Blocked time deleted successfully",
        data: blockedTime,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get available slots for a schedule
   */
  async getAvailableSlots(req: Request, res: Response): Promise<void> {
    try {
      const scheduleId = req.params.scheduleId as string;

      const validatedData = getAvailableSlotsSchema.parse(req.query);

      const slots = await availabilityService.getAvailableSlots(
        scheduleId,
        validatedData.startDate,
        validatedData.endDate,
        validatedData.slotDuration,
        validatedData.eventTypeId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Available slots retrieved successfully",
        data: {
          slots,
          meta: {
            count: slots.length,
            slotDuration: validatedData.slotDuration,
          },
        },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }
}

export const availabilityController = new AvailabilityController();
