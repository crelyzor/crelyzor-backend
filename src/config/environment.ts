import { z } from "zod";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
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
  ADMIN_JWT_SECRET: z.string().min(1).optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_LOGIN_REDIRECT_URI: z
    .string()
    .min(1, "GOOGLE_LOGIN_REDIRECT_URI is required"),

  // AI & Transcription
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  DEEPGRAM_API_KEY: z.string().min(1, "DEEPGRAM_API_KEY is required"),

  // Storage
  GCS_BUCKET_NAME: z.string().min(1, "GCS_BUCKET_NAME is required"),

  // Redis
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // Recall.ai integration
  RECALL_API_KEY: z.string().min(1).optional(),
  RECALL_WEBHOOK_SECRET: z.string().min(1).optional(),
  RECALL_BASE_URL: z.string().url().default("https://api.recall.ai/api/v1"),

  // Email (Resend) — optional; emails are skipped gracefully if absent
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().default("Crelyzor <harshkeshari100@gmail.com>"),

  // App URLs — used in email CTAs, OAuth redirects, and CORS
  FRONTEND_URL: z.string().url().default("https://app.crelyzor.com"),
  PUBLIC_URL: z.string().url().default("https://crelyzor.com"),
  ALLOWED_ORIGINS: z.string().optional(),

  // Encryption at Rest (Phase 5)
  // KMS_PROVIDER=local uses LOCAL_KMS_KEY (dev/test); KMS_PROVIDER=gcp uses Google Cloud KMS (prod)
  KMS_PROVIDER: z.enum(["local", "gcp"]).default("local"),
  LOCAL_KMS_KEY: z.string().optional(), // required when KMS_PROVIDER=local; 32-byte hex (64 chars)
  GCP_KMS_KEY_NAME: z.string().optional(), // required when KMS_PROVIDER=gcp; full GCP KMS key resource name
  HMAC_BLIND_INDEX_KEY: z.string().length(64), // required; 32-byte hex — generate: openssl rand -hex 32
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
