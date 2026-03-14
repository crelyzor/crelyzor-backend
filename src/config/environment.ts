import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "staging", "production"])
    .default("development"),
  PORT: z.string().default("3000").transform(Number),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  DEEPGRAM_API_KEY: z.string().min(1, "DEEPGRAM_API_KEY is required"),
  GCS_BUCKET_NAME: z.string().min(1, "GCS_BUCKET_NAME is required"),
  UPSTASH_REDIS_REST_URL: z
    .string()
    .min(1, "UPSTASH_REDIS_REST_URL is required"),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1, "UPSTASH_REDIS_REST_TOKEN is required"),
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
