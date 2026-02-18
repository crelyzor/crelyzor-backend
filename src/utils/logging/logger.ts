import winston from "winston";
import { env } from "../../config";
import { createLogFormat } from "./logFormatter";

const { combine, timestamp, colorize, errors } = winston.format;

// Build transports based on environment
const transports: winston.transport[] = [
  // Console transport with metadata in development, without in production
  new winston.transports.Console({
    format: combine(colorize(), createLogFormat(env.NODE_ENV !== "production")),
  }),
];

// Only add file transports if not in Vercel (serverless doesn't support persistent file writes)
if (!process.env.VERCEL) {
  transports.push(
    // File transport for errors
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  ),
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

export { logger };
