import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import {
  globalErrorHandler,
  BaseError,
  ErrorFactory,
} from "../utils/globalErrorHandler";

interface AdminTokenPayload {
  role: string;
  email: string;
}

export const verifyAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError("Admin token required", 401);
    }

    const token = authHeader.substring(7);
    const secret = process.env.ADMIN_JWT_SECRET;

    if (!secret) {
      logger.error("ADMIN_JWT_SECRET is not set");
      throw new AppError("Admin portal not configured", 500);
    }

    const decoded = jwt.verify(token, secret) as AdminTokenPayload;

    if (decoded.role !== "admin") {
      throw new AppError("Insufficient permissions", 403);
    }

    next();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TokenExpiredError" ||
        error.name === "JsonWebTokenError")
    ) {
      return globalErrorHandler(
        ErrorFactory.unauthorized("Invalid or expired admin token"),
        req,
        res,
      );
    }
    globalErrorHandler(error as BaseError, req, res);
  }
};
