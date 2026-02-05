import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { logger } from "./utils/logging/logger";
import prisma from "./db/prismaClient";
import { redis } from "./config/redisClient";
import { initializeQueues, closeQueues } from "./config/queue";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  logger.info("🚀 Starting Calendar Backend Server...");

  // Test Database connection
  try {
    await prisma.$connect();
    logger.info("✅ Database connected successfully (PostgreSQL)");
  } catch (error) {
    logger.error("❌ Database connection failed:", { 
      error: error instanceof Error ? error.message : String(error) 
    });
    process.exit(1);
  }

  // Test Redis connection (Upstash cache)
  try {
    await redis.ping();
    logger.info("✅ Redis cache connected successfully (Upstash)");
  } catch (error) {
    logger.warn("⚠️ Redis cache connection failed (caching disabled):", { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }

  // Initialize Bull Queues (Redis for job processing)
  try {
    await initializeQueues();
  } catch (error) {
    logger.warn("⚠️ Queue initialization failed (job processing disabled):", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Log configured services
  logger.info("📦 Services configured:", {
    database: "Neon PostgreSQL",
    cache: process.env.UPSTASH_REDIS_REST_URL ? "Upstash Redis" : "None",
    queues: process.env.REDIS_URL ? "Bull (Upstash)" : "None",
    storage: process.env.GCS_BUCKET_NAME ? `GCS (${process.env.GCS_BUCKET_NAME})` : "None",
    ai: process.env.OPENAI_API_KEY ? "OpenAI" : "None",
    transcription: process.env.DEEPGRAM_API_KEY ? "Deepgram" : "Disabled",
  });

  // Start server
  const server = app.listen(PORT, () => {
    logger.info(`✅ Server is listening on port ${PORT}`);
    logger.info(`🌐 API Base URL: ${process.env.BASE_URL}`);
    logger.info(`📍 Environment: ${process.env.NODE_ENV}`);
  });

  // Handle port already in use error
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.error(`❌ Port ${PORT} is already in use. Please free the port or use a different one.`);
      process.exit(1);
    } else {
      logger.error("❌ Server error:", { error: error.message });
      process.exit(1);
    }
  });
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  await closeQueues();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully...");
  await closeQueues();
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
