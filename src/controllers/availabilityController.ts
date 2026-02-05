import { Request, Response } from "express";
import { TokenPayload } from "../types/authTypes";
import { orgPayload } from "../types/orgTypes";
import { ErrorFactory } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";
import { globalErrorHandler } from "../utils/globalErrorHandler";
import { availabilityService } from "../services/meetings/availabilityService";
import {
  createRecurringAvailabilitySchema,
  updateRecurringAvailabilitySchema,
  createCustomSlotSchema,
  createBlockedTimeSchema,
  getAvailableSlotsSchema,
  createBatchRecurringAvailabilitySchema,
} from "../validators/availabilitySchema";

export class AvailabilityController {
  /**
   * Create recurring availability pattern
   */
  async createRecurringAvailability(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;

      // Validate input
      const validatedData = createRecurringAvailabilitySchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Create recurring availability
      const availability =
        await availabilityService.createRecurringAvailability({
          orgMemberId: orgMember.orgMemberId,
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
      const org = req.org as orgPayload;

      // Validate input
      const validatedData = createBatchRecurringAvailabilitySchema.parse(
        req.body,
      );

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Create batch recurring availability
      const availabilities =
        await availabilityService.createBatchRecurringAvailability(
          orgMember.orgMemberId,
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
   * Get recurring availability patterns
   */
  async getRecurringAvailability(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { orgMemberId } = req.query;

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Only allow viewing own availability or if admin
      const targetMemberId = (orgMemberId as string) || orgMember.orgMemberId;
      if (
        targetMemberId !== orgMember.orgMemberId &&
        !orgMember.role.roleName?.includes("ADMIN")
      ) {
        throw ErrorFactory.forbidden("Can only view your own availability");
      }

      // Get availability
      const availability =
        await availabilityService.getRecurringAvailability(targetMemberId);

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
      const org = req.org as orgPayload;
      const { availabilityId } = req.params;

      // Validate input
      const validatedData = updateRecurringAvailabilitySchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Update availability
      const availability =
        await availabilityService.updateRecurringAvailability({
          availabilityId,
          orgMemberId: orgMember.orgMemberId,
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
      const org = req.org as orgPayload;
      const { availabilityId } = req.params;

      // Delete availability
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
   * Create custom slot
   */
  async createCustomSlot(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;

      // Validate input
      const validatedData = createCustomSlotSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Create custom slot
      const customSlot = await availabilityService.createCustomSlot({
        orgMemberId: orgMember.orgMemberId,
        ...validatedData,
      });

      apiResponse(res, {
        statusCode: 201,
        message: "Custom slot created successfully",
        data: customSlot,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Get custom slots
   * Query params: startDate (optional), endDate (optional), orgMemberId (optional)
   * If no dates provided, returns all custom slots
   */
  async getCustomSlots(req: Request, res: Response): Promise<void> {
    try {
      const org = req.org as orgPayload;
      const { orgMemberId, startDate, endDate } = req.query;

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Determine date range
      let start: Date;
      let end: Date;

      if (startDate && endDate) {
        // Both dates provided - validate and use them
        start = new Date(startDate as string);
        end = new Date(endDate as string);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw ErrorFactory.validation("Invalid date format");
        }
      } else if (startDate || endDate) {
        // Only one date provided - error
        throw ErrorFactory.validation(
          "Both startDate and endDate must be provided together, or neither",
        );
      } else {
        // No dates provided - get all custom slots
        start = new Date(0); // Unix epoch
        end = new Date("2099-12-31"); // Far future
      }

      // Get custom slots
      const customSlots = await availabilityService.getCustomSlots(
        (orgMemberId as string) || orgMember.orgMemberId,
        start,
        end,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Custom slots retrieved successfully",
        data: customSlots,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  /**
   * Delete custom slot
   */
  async deleteCustomSlot(req: Request, res: Response): Promise<void> {
    try {
      const { slotId } = req.params;

      // Delete slot
      const customSlot = await availabilityService.deleteCustomSlot(slotId);

      apiResponse(res, {
        statusCode: 200,
        message: "Custom slot deleted successfully",
        data: customSlot,
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
      const org = req.org as orgPayload;

      // Validate input
      const validatedData = createBlockedTimeSchema.parse(req.body);

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Create blocked time
      const blockedTime = await availabilityService.createBlockedTime({
        orgMemberId: orgMember.orgMemberId,
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
   * Query params: startDate (optional), endDate (optional), orgMemberId (optional)
   * If no dates provided, returns all blocked times
   */
  async getBlockedTimes(req: Request, res: Response): Promise<void> {
    try {
      const org = req.org as orgPayload;
      const { orgMemberId, startDate, endDate } = req.query;

      // Get org member
      const orgMember = org.orgRoles[0];
      if (!orgMember) {
        throw ErrorFactory.forbidden("Organization member not found");
      }

      // Determine date range
      let start: Date;
      let end: Date;

      if (startDate && endDate) {
        // Both dates provided - validate and use them
        start = new Date(startDate as string);
        end = new Date(endDate as string);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw ErrorFactory.validation("Invalid date format");
        }
      } else if (startDate || endDate) {
        // Only one date provided - error
        throw ErrorFactory.validation(
          "Both startDate and endDate must be provided together, or neither",
        );
      } else {
        // No dates provided - get all blocked times
        start = new Date(0); // Unix epoch
        end = new Date("2099-12-31"); // Far future
      }

      // Get blocked times
      const blockedTimes = await availabilityService.getBlockedTimes(
        (orgMemberId as string) || orgMember.orgMemberId,
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
      const { blockedTimeId } = req.params;

      // Delete blocked time
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
   * Get available slots for an org member
   */
  async getAvailableSlots(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as TokenPayload;
      const org = req.org as orgPayload;
      const { orgMemberId } = req.params;

      // Validate input
      const validatedData = getAvailableSlotsSchema.parse(req.query);

      // Get available slots
      const slots = await availabilityService.getAvailableSlots(
        orgMemberId,
        validatedData.startDate,
        validatedData.endDate,
        validatedData.slotDuration,
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
