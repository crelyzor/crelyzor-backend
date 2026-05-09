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
  adminId: string;
  email: string;
}

export const verifyAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    // Read from httpOnly cookie (preferred). Fall back to Authorization header
    // for backward compatibility during local development.
    const cookieToken = req.cookies?.admin_token as string | undefined;
    const authHeader = req.headers.authorization;
    const headerToken =
      authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

    const token = cookieToken ?? headerToken;
    if (!token) {
      throw new AppError("Admin token required", 401);
    }

    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      logger.error("ADMIN_JWT_SECRET is not set");
      throw new AppError("Admin portal not configured", 500);
    }

    const decoded = jwt.verify(token, secret) as AdminTokenPayload;

    if (decoded.role !== "admin") {
      throw new AppError("Insufficient permissions", 403);
    }

    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError")
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
