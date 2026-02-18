import { createClient, DeepgramClient } from "@deepgram/sdk";
import { logger } from "../utils/logging/logger";

// Lazy initialization to ensure dotenv.config() has run
let deepgramClient: DeepgramClient | null = null;
let initialized = false;

const initializeDeepgram = () => {
  if (initialized) return;
  initialized = true;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (apiKey) {
    deepgramClient = createClient(apiKey);
  }
};

export const isTranscriptionEnabled = (): boolean => {
  initializeDeepgram();
  return !!deepgramClient;
};

export const getDeepgramClient = (): DeepgramClient => {
  initializeDeepgram();
  if (!deepgramClient) {
    throw new Error(
      "Deepgram client not initialized - DEEPGRAM_API_KEY is required",
    );
  }
  return deepgramClient;
};
