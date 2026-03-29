import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "staging", "production"])
    .default("development"),
  PORT: z.string().default("3000").transform(Number),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_LOGIN_REDIRECT_URI: z.string().min(1, "GOOGLE_LOGIN_REDIRECT_URI is required"),

  // AI & Transcription
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  DEEPGRAM_API_KEY: z.string().min(1, "DEEPGRAM_API_KEY is required"),

  // Storage
  GCS_BUCKET_NAME: z.string().min(1, "GCS_BUCKET_NAME is required"),

  // Redis
  UPSTASH_REDIS_REST_URL: z.string().min(1, "UPSTASH_REDIS_REST_URL is required"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // Recall.ai integration
  RECALL_API_KEY: z.string().min(1).optional(),
  RECALL_WEBHOOK_SECRET: z.string().min(1).optional(),
  RECALL_BASE_URL: z.string().url().default("https://api.recall.ai/api/v1"),
});

export type Environment = z.infer<typeof envSchema>;

let validatedEnv: Environment;

try {
  validatedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const errors = error.issues
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${errors}`);
  }
  throw error;
}

export const env = validatedEnv;
