import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "./logging/logger";

export class BaseError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);

    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
  }

  public toJSON() {
    return {
      status: "error",
      code: this.code,
      message: this.message,
      ...(typeof this.details === "object" && this.details !== null
        ? { details: this.details }
        : {}),
    };
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message = "Only consultants can perform this action") {
    super(403, "FORBIDDEN", message);
  }
}
export class ValidationError extends BaseError {
  constructor(message: string);
  constructor(error: ZodError, message?: string);
  constructor(arg1: ZodError | string, message = "Invalid input data") {
    const isZod = typeof arg1 !== "string";
    const errorDetails = isZod ? arg1.flatten() : undefined;
    const finalMessage = isZod ? message : arg1;

    super(400, "VALIDATION_ERROR", finalMessage, errorDetails);
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string) {
    super(404, "NOT_FOUND", `${resource}`);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export class DbOperationError extends BaseError {
  constructor(message: string) {
    super(409, "DB_OPERATION_ERROR", message);
  }
}
export class InternalServerError extends BaseError {
  constructor(error?: unknown) {
    super(
      500,
      "INTERNAL_SERVER_ERROR",
      "An unexpected error occurred",
      process.env.NODE_ENV === "development" ? error : undefined,
    );
  }
}

export class TooManyRequestsError extends BaseError {
  constructor(message = "Too many requests — please try again later") {
    super(429, "TOO_MANY_REQUESTS", message);
  }
}

/**
 * Thrown when a user hits a plan usage limit (transcription, Recall, AI credits).
 * Carries extra billing context so the frontend can show the right upgrade prompt.
 */
export class PaymentRequiredError extends BaseError {
  constructor(
    code: string, // e.g. "TRANSCRIPTION_LIMIT_REACHED"
    details?: {
      currentUsage?: number;
      limit?: number;
      upgradeUrl?: string;
    },
  ) {
    super(
      402,
      code,
      "Plan limit reached — upgrade to continue",
      {
        ...(details ?? {}),
        upgradeUrl: details?.upgradeUrl ?? "/pricing",
      },
    );
  }
}

export const isBaseError = (error: unknown): error is BaseError => {
  return error instanceof BaseError;
};

export const handleError = (error: unknown, res: Response): void => {
  logger.error("Error", { error });

  const baseError = isBaseError(error) ? error : new InternalServerError(error);

  res.status(baseError.statusCode).json(baseError.toJSON());
};

export const ErrorFactory = {
  unauthorized: (message?: string) => new UnauthorizedError(message),
  forbidden: (message?: string) => new ForbiddenError(message),
  tooManyRequests: (message?: string) => new TooManyRequestsError(message),
  validation: (errOrMsg: ZodError | string, msg?: string) =>
    typeof errOrMsg === "string"
      ? new ValidationError(errOrMsg)
      : new ValidationError(errOrMsg, msg),
  notFound: (resource: string) => new NotFoundError(resource),
  conflict: (message: string) => new ConflictError(message),
  internal: (error?: unknown) => new InternalServerError(error),
  dbOperation: (message: string) => new DbOperationError(message),
  paymentRequired: (
    code: string,
    details?: { currentUsage?: number; limit?: number; upgradeUrl?: string },
  ) => new PaymentRequiredError(code, details),
};

export const globalErrorHandler = (
  error: Error | BaseError,
  req: Request,
  res: Response,
  _next?: NextFunction,
): void => {
  logger.error("Error", {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error instanceof BaseError && {
      statusCode: error.statusCode,
      code: error.code,
      details: error.details,
    }),
  });

  if (error instanceof ZodError) {
    const validationError = new ValidationError(error, "Invalid input data");
    res.status(validationError.statusCode).json(validationError.toJSON());
    return;
  }

  if (error instanceof BaseError) {
    res.status(error.statusCode).json(error.toJSON());
    return;
  }

  const internalError = {
    status: "error",
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : error.message,
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  };

  res.status(500).json(internalError);
};
