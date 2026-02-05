import dotenv from "dotenv";
dotenv.config();

import { startWorker } from "./worker/jobProcessor";
import { logger } from "./utils/logging/logger";
import { initializeQueues, closeQueues } from "./config/queue";
import prisma from "./db/prismaClient";

const main = async () => {
  logger.info("🚀 Starting Calendar Backend Worker...");

  // Test Database connection
  try {
    await prisma.$connect();
    logger.info("✅ Database connected successfully (PostgreSQL)");
  } catch (error) {
    logger.error("❌ Database connection failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  // Initialize queues first
  try {
    await initializeQueues();
  } catch (error) {
    logger.error("❌ Queue initialization failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  // Start processing jobs
  try {
    await startWorker();
    logger.info("✅ Worker is running and processing jobs");
  } catch (error) {
    logger.error("Failed to start worker:", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down worker...");
  await closeQueues();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down worker...");
  await closeQueues();
  await prisma.$disconnect();
  process.exit(0);
});

main();
