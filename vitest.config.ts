import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // These env vars satisfy the Zod schema validation in environment.ts at test startup.
    // Values are test-only — not secrets.
    env: {
      NODE_ENV: "development",
      KMS_PROVIDER: "local",
      LOCAL_KMS_KEY: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", // 32 bytes hex
      HMAC_BLIND_INDEX_KEY: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", // 32 bytes hex
      // Required vars that environment.ts validates
      JWT_ACCESS_SECRET: "test-jwt-access-secret",
      JWT_REFRESH_SECRET: "test-jwt-refresh-secret",
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-client-secret",
      GOOGLE_LOGIN_REDIRECT_URI: "http://localhost:3000/auth/google/callback",
      GEMINI_API_KEY: "test-gemini-key",
      DEEPGRAM_API_KEY: "test-deepgram-key",
      GCS_BUCKET_NAME: "test-bucket",
      REDIS_URL: "redis://localhost:6379",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
    coverage: {
      provider: "v8",
      include: ["src/utils/security/**"],
    },
  },
});
