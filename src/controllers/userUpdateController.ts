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
  updateProfile: async (req: Request, res: Response) => {
    try {
      const parsedData = updateUserProfileSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }
      console.log("request body", req);
      const userId = req.user?.userId;
      console.log("userId", userId);
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
