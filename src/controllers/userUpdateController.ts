import { Request, Response } from "express";
import { userService } from "../services/userUpdateService";
import {
  BaseError,
  ErrorFactory,
  globalErrorHandler,
} from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";
import { updateUserProfileSchema } from "../validators/userUpdateSchema";

export const userController = {
  searchUsers: async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized("User not authenticated");

      const q = String(req.query.q ?? "").trim();
      if (!q) {
        apiResponse(res, {
          statusCode: 200,
          message: "Users found",
          data: { users: [] },
        });
        return;
      }

      const users = await userService.searchUsers(q, userId);
      apiResponse(res, {
        statusCode: 200,
        message: "Users found",
        data: { users },
      });
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },

  updateProfile: async (req: Request, res: Response) => {
    try {
      const parsedData = updateUserProfileSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }
      const userId = req.user?.userId;
      if (!userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }
      const updatedUser = await userService.updateUserProfile(
        userId,
        parsedData.data,
      );
      apiResponse(res, {
        statusCode: 200,
        message: "User profile updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      globalErrorHandler(error as BaseError, req, res);
    }
  },
};
