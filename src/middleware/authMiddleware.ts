import { Request, Response, NextFunction } from "express";
import { tokenService } from "../services/auth/tokenService";
import { sessionService } from "../services/auth/sessionService";
import { authService } from "../services/auth/authService";
import {
  ErrorFactory,
  globalErrorHandler,
  BaseError,
} from "../utils/globalErrorHandler";
import { TokenPayload } from "../types/authTypes";
import { ZodError } from "zod";
import { logger } from "../utils/logging/logger";
import { getRedisClient } from "../config/redisClient";

// Extend Express Request to include authenticated user
declare module "express" {
  export interface Request {
    user?: TokenPayload;
    sessionId?: string;
    service?: Record<string, unknown>; // For internal service tokens
  }
}

export const verifyJWT = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extractToken(req);

    if (!token) {
      throw ErrorFactory.unauthorized("Access token is required");
    }

    const decoded = tokenService.verifyAccessToken(token);
    const isSessionValid = await sessionService.validateSession(
      decoded.sessionId,
      decoded.userId,
    );

    if (!isSessionValid) {
      throw ErrorFactory.unauthorized("Session is invalid or expired");
    }

    await authService.validateUserAccess(decoded.userId);

    await sessionService.updateSessionActivity(decoded.sessionId);

    req.user = decoded;
    req.sessionId = decoded.sessionId;

    next();
  } catch (error) {
    logger.error("JWT verification error", {
      error: error instanceof Error ? error.message : String(error),
    });
    globalErrorHandler(error as BaseError, req, res);
  }
};

export const autoRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extractToken(req);

    if (token) {
      const expirationTime = tokenService.getTokenExpiration(token);

      if (expirationTime) {
        const now = new Date();
        const timeUntilExpiry = expirationTime.getTime() - now.getTime();
        const tenMinutes = 10 * 60 * 1000;

        if (timeUntilExpiry < tenMinutes && timeUntilExpiry > 0) {
          res.setHeader("X-Token-Refresh-Required", "true");
          res.setHeader("X-Token-Expires-At", expirationTime.toISOString());
        }
      }
    }

    next();
  } catch (error) {
    // Only swallow JWT-related errors (malformed/expired tokens on unauthenticated requests
    // are expected). Log unexpected errors as warnings but still fail-open.
    const isJwtError =
      error instanceof Error &&
      (error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError" ||
        error.name === "NotBeforeError");
    if (!isJwtError) {
      logger.warn("autoRefreshToken unexpected error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    next();
  }
};

export const validateRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const refreshToken =
      req.body.refreshToken || req.headers["x-refresh-token"];

    if (!refreshToken) {
      throw ErrorFactory.validation(
        new ZodError([
          {
            code: "custom",
            message: "Refresh token is required",
            path: ["refreshToken"],
          },
        ]),
      );
    }

    const decoded = tokenService.verifyRefreshToken(refreshToken);
    const isValid = await sessionService.isRefreshTokenValid(decoded.jti);

    if (!isValid) {
      throw ErrorFactory.unauthorized("Invalid or revoked refresh token");
    }

    next();
  } catch (error) {
    globalErrorHandler(error as BaseError, req, res);
  }
};

export const userRateLimit = (
  maxRequests: number = 1000,
  windowMs: number = 60 * 60 * 1000,
) => {
  const windowSeconds = Math.floor(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = req.user?.userId || req.ip || "anonymous";
    const key = `ratelimit:user:${identifier}`;

    try {
      const redis = getRedisClient();
      const count = await redis.incr(key);

      // Set TTL only on the first increment (avoids overwriting existing TTL)
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const ttl = await redis.ttl(key);
      const resetTime = new Date(Date.now() + Math.max(ttl, 0) * 1000);

      res.setHeader("X-RateLimit-Limit", maxRequests.toString());
      res.setHeader(
        "X-RateLimit-Remaining",
        Math.max(0, maxRequests - count).toString(),
      );
      res.setHeader("X-RateLimit-Reset", resetTime.toISOString());

      if (count > maxRequests) {
        return globalErrorHandler(
          ErrorFactory.forbidden(
            `Rate limit exceeded. Try again after ${resetTime.toISOString()}`,
          ),
          req,
          res,
        );
      }

      next();
    } catch (error) {
      // Fail-open: if Redis is unavailable, allow the request through
      logger.warn("userRateLimit Redis error — allowing request", {
        error: error instanceof Error ? error.message : String(error),
      });
      next();
    }
  };
};

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}

export function getClientIP(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string) ||
    (req.headers["x-real-ip"] as string) ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

export function getDeviceInfo(req: Request): string {
  const userAgent = req.get("User-Agent") || "Unknown Device";

  if (userAgent.includes("Mobile")) {
    return `Mobile Device (${userAgent.substring(0, 100)})`;
  } else if (userAgent.includes("Tablet")) {
    return `Tablet (${userAgent.substring(0, 100)})`;
  } else {
    return `Desktop (${userAgent.substring(0, 100)})`;
  }
}

export const requireEmailVerified = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    if (!req.user) {
      throw ErrorFactory.unauthorized("Authentication required");
    }

    if (!req.user.emailVerified) {
      throw ErrorFactory.forbidden("Email verification is required");
    }

    next();
  } catch (error) {
    globalErrorHandler(error as BaseError, req, res);
  }
};
