/**
 * Utility functions for consistent error handling and formatting
 */

/**
 * Format error message from any error type
 */
export const formatError = (error: unknown): string => {
  return error instanceof Error ? error.message : 'Unknown error';
};

export default {
  formatError,
};
