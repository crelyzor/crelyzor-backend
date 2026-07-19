import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type GenerationConfig,
} from "@google/generative-ai";
import { logger } from "../utils/logging/logger";
import { AppError } from "../utils/errors/AppError";

// Overridable via env so the model can be swapped without a code deploy.
// gemini-2.5-flash is blocked for new API users, so default to the
// auto-updating latest stable flash alias.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  temperature: 0.3,
};

let geminiClient: GoogleGenerativeAI | null = null;
let geminiModel: GenerativeModel | null = null;

const initializeGeminiClient = (): GenerativeModel => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new AppError("GEMINI_API_KEY environment variable is required", 500);
  }

  geminiClient = new GoogleGenerativeAI(apiKey);
  geminiModel = geminiClient.getGenerativeModel({ model: GEMINI_MODEL });

  logger.info("Gemini client initialized", { model: GEMINI_MODEL });
  return geminiModel;
};

export const getGeminiModel = (): GenerativeModel => {
  if (!geminiModel) {
    return initializeGeminiClient();
  }
  return geminiModel;
};

export default getGeminiModel;
