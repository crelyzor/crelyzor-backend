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
import {
  usernameSchema,
  checkUsernameSchema,
} from "../validators/usernameSchema";
import { getClientIP, getDeviceInfo } from "../middleware/authMiddleware";
import prisma from "../db/prismaClient";
import { logger } from "../utils/logging/logger";

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
      logger.error("Token refresh error", {
        error: err instanceof Error ? err.message : String(err),
      });
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

      const result = await authService.logout(
        userId,
        parsedData.data,
        sessionId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: result.message,
        data: null,
      });
    } catch (err) {
      logger.error("Logout error", {
        error: err instanceof Error ? err.message : String(err),
      });
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
      logger.error("Get profile error", {
        error: err instanceof Error ? err.message : String(err),
      });
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

      const sessions = await authService.getUserSessions(
        userId,
        currentSessionId,
      );

      apiResponse(res, {
        statusCode: 200,
        message: "Sessions retrieved successfully",
        data: { sessions },
      });
    } catch (err) {
      logger.error("Get sessions error", {
        error: err instanceof Error ? err.message : String(err),
      });
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  revokeSession: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const sessionId = req.params.sessionId as string;

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
      logger.error("Revoke session error", {
        error: err instanceof Error ? err.message : String(err),
      });
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
      logger.error("Deactivate account error", {
        error: err instanceof Error ? err.message : String(err),
      });
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
      logger.error("Get auth status error", {
        error: err instanceof Error ? err.message : String(err),
      });
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  checkUsernameAvailability: async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      const parsed = checkUsernameSchema.safeParse(req.query);
      if (!parsed.success) {
        throw ErrorFactory.validation(parsed.error);
      }

      const existing = await prisma.user.findUnique({
        where: { username: parsed.data.username },
        select: { id: true },
      });

      const available = !existing || existing.id === userId;

      apiResponse(res, {
        statusCode: 200,
        message: available ? "Username is available" : "Username is taken",
        data: { available },
      });
    } catch (err) {
      globalErrorHandler(err as BaseError, req, res);
    }
  },

  setUsername: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw ErrorFactory.unauthorized("User not authenticated");
      }

      const parsed = usernameSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ErrorFactory.validation(parsed.error);
      }

      const { username } = parsed.data;

      // Check availability
      const existing = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (existing && existing.id !== userId) {
        throw ErrorFactory.conflict("Username is already taken");
      }

      await prisma.user.update({
        where: { id: userId },
        data: { username },
      });

      const profile = await authService.getUserProfile(userId);

      apiResponse(res, {
        statusCode: 200,
        message: "Username set successfully",
        data: profile,
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        globalErrorHandler(
          ErrorFactory.conflict("Username is already taken"),
          req,
          res,
        );
        return;
      }
      globalErrorHandler(err as BaseError, req, res);
    }
  },
};
