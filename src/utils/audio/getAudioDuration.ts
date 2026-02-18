import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { logger } from "../logging/logger";

const execAsync = promisify(exec);

/**
 * Extract audio duration from a file using ffprobe
 * @param filePath - Path to audio file
 * @returns Duration in seconds
 */
export const getAudioDuration = async (filePath: string): Promise<number> => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    logger.info(`Extracting audio duration`, { filePath });

    // Use ffprobe to extract duration
    const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1:csv=p=0 "${filePath}"`;

    const { stdout } = await execAsync(command, { timeout: 30000 }); // 30 second timeout

    const duration = parseFloat(stdout.trim());

    if (isNaN(duration) || duration <= 0) {
      throw new Error(`Invalid duration extracted: ${stdout.trim()}`);
    }

    logger.info(`Audio duration extracted successfully`, {
      filePath,
      duration: `${duration.toFixed(2)}s`,
    });

    return Math.round(duration); // Return duration in seconds as integer
  } catch (error) {
    logger.error(`Failed to extract audio duration`, {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to extract audio duration: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};
