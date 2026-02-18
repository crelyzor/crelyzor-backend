import OpenAI from "openai";
import { logger } from "../utils/logging/logger";
import { AppError } from "../utils/errors/AppError";

/**
 * Initialize OpenAI client for AI-powered meeting intelligence
 * Uses OPENAI_API_KEY from environment variables
 */

let openaiClient: OpenAI | null = null;

const initializeOpenAIClient = (): OpenAI => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new AppError(
        "OPENAI_API_KEY environment variable is required",
        500,
      );
    }

    openaiClient = new OpenAI({
      apiKey,
      maxRetries: 3,
      timeout: 180000, // 180 seconds (3 minutes) - allows for large transcripts
    });

    logger.info("OpenAI client initialized successfully");
    return openaiClient;
  } catch (error) {
    logger.error("Failed to initialize OpenAI client:", error);
    throw error;
  }
};

/**
 * Get or initialize the OpenAI client
 */
export const getOpenAIClient = (): OpenAI => {
  if (!openaiClient) {
    return initializeOpenAIClient();
  }
  return openaiClient;
};

export default getOpenAIClient;
