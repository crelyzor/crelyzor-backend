/**
 * Utility functions for consistent log formatting
 */

import winston from 'winston';

const { printf } = winston.format;

/**
 * Create a log format with optional metadata
 */
export const createLogFormat = (includeMetadata: boolean = false) => {
  return printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${stack || message}`;

    if (includeMetadata && Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }

    return log;
  });
};

export default {
  createLogFormat,
};
