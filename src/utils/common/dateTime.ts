/**
 * Utility functions for date/time operations
 */

/**
 * Get current timestamp in ISO format
 */
export const getCurrentTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * Get current date
 */
export const getCurrentDate = (): Date => {
  return new Date();
};

export default {
  getCurrentTimestamp,
  getCurrentDate,
};
