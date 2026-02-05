// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/express.d.ts" />
import { Request, Response } from "express";
import { authService } from "../services/auth/authService";
import { apiResponse } from "../utils/globalResponseHandler";
import {
  BaseError,
  ErrorFactory,
  globalErrorHandler,
} from "../utils/globalErrorHandler";
import { refreshTokenSchema, logoutSchema } from "../validators/authSchema";
import { getClientIP, getDeviceInfo } from "../middleware/authMiddleware";

export const authController = {
  refreshToken: async (req: Request, res: Response): Promise<void> => {
    try {
      const parsedData = refreshTokenSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      const ipAddress = getClientIP(req);
      const result = await authService.refreshToken(parsedData.data, ipAddress);

      apiResponse(res, {
        statusCode: 200,
        message: "Token refreshed successfully",
        data: result,
      });
    } catch (err) {
      console.error("Token refresh error:", err);
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  logout: async (req: Request, res: Response): Promise<void> => {
    try {
      const parsedData = logoutSchema.safeParse(req.body);
      if (!parsedData.success) {
        throw ErrorFactory.validation(parsedData.error);
      }

      const userId = req.user?.userId;
      const sessionId = req.sessionId;

      if (!userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      const result = await authService.logout(userId, parsedData.data, sessionId);

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: null,
      });
    } catch (err) {
      console.error("Logout error:", err);
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  getProfile: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      const result = await authService.getUserProfile(userId);

      apiResponse(res, {
        statusCode: 200,
        message: "Profile retrieved successfully",
        data: result,
      });
    } catch (err) {
      console.error("Get profile error:", err);
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  getSessions: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const currentSessionId = req.sessionId;

      if (!userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      const sessions = await authService.getUserSessions(userId, currentSessionId);

      apiResponse(res, {
        statusCode: 200,
        message: "Sessions retrieved successfully",
        data: { sessions },
      });
    } catch (err) {
      console.error("Get sessions error:", err);
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  revokeSession: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { sessionId } = req.params;

      if (!userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      if (!sessionId) {
        throw ErrorFactory.validation("Session ID is required");
      }

      const result = await authService.revokeUserSession(userId, sessionId);

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: null,
      });
    } catch (err) {
      console.error("Revoke session error:", err);
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  deactivateAccount: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      const result = await authService.deactivateAccount(userId);

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: null,
      });
    } catch (err) {
      console.error("Deactivate account error:", err);
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  getAuthStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      const user = req.user;
      const sessionId = req.sessionId;

      if (!user) {
        apiResponse(res, {
          statusCode: 200,
          message: "Not authenticated",
          data: { authenticated: false },
        });
        return;
      }

      apiResponse(res, {
        statusCode: 200,
        message: "Authentication status retrieved",
        data: {
          authenticated: true,
          user: {
            id: user.userId,
            email: user.email,
          },
          sessionId,
        },
      });
    } catch (err) {
      console.error("Get auth status error:", err);
      globalErrorHandler(err as BaseError, req, res);
    }
  },
};
