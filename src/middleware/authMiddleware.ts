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

// Extend Express Request to include authenticated user
declare module "express" {
  export interface Request {
    user?: TokenPayload;
    sessionId?: string;
    service?: any; // For internal service tokens
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
    console.log("Decoded Token:", decoded);
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
    console.error("JWT verification error:", error);
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
    console.log("Decoded Refresh Token:", decoded);
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
  const requestCounts = new Map<string, { count: number; resetTime: Date }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = req.user?.userId || req.ip || "anonymous";
    const now = new Date();

    let userLimit = requestCounts.get(identifier);

    if (!userLimit || now > userLimit.resetTime) {
      userLimit = {
        count: 0,
        resetTime: new Date(now.getTime() + windowMs),
      };
    }

    userLimit.count++;
    requestCounts.set(identifier, userLimit);

    if (userLimit.count > maxRequests) {
      res.setHeader("X-RateLimit-Limit", maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", userLimit.resetTime.toISOString());

      return globalErrorHandler(
        ErrorFactory.forbidden(
          `Rate limit exceeded. Try again after ${userLimit.resetTime.toISOString()}`,
        ),
        req,
        res,
      );
    }

    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader(
      "X-RateLimit-Remaining",
      (maxRequests - userLimit.count).toString(),
    );
    res.setHeader("X-RateLimit-Reset", userLimit.resetTime.toISOString());

    next();
  };
};

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}

// Extract token from header OR query parameter (for OAuth flows where header auth isn't possible)
function extractTokenFromHeaderOrQuery(req: Request): string | null {
  // Try header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Fall back to query parameter
  const queryToken = req.query.accessToken as string;
  if (queryToken) {
    return queryToken;
  }

  return null;
}

// Middleware for routes that need JWT but use query parameters (like OAuth callbacks)
export const verifyJWTFromQueryOrHeader = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extractTokenFromHeaderOrQuery(req);

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
    console.error("JWT verification error:", error);
    globalErrorHandler(error as BaseError, req, res);
  }
};

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
