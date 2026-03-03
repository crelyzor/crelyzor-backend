import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { logger } from "../logging/logger";

const execAsync = promisify(exec);

/**
 * Extract audio duration from a file using ffprobe / ffmpeg.
 *
 * Browser-recorded .webm files (MediaRecorder) do NOT embed duration in the
 * container header, so `ffprobe -show_entries format=duration` returns "N/A".
 * We fall through three strategies:
 *
 * 1. Format container duration  — fast, works for mp3/mp4/ogg/etc.
 * 2. First audio stream duration — sometimes set even when format isn't.
 * 3. Full decode via ffmpeg -f null — slow but handles all browser webm.
 */
export const getAudioDuration = async (filePath: string): Promise<number> => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  logger.info("Extracting audio duration", { filePath });

  // Strategy 1 & 2: ffprobe metadata (fast path)
  const probeCommands = [
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
    `ffprobe -v error -select_streams a:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
  ];

  for (const cmd of probeCommands) {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 30_000 });
      const d = parseFloat(stdout.trim());
      if (isFinite(d) && d > 0) {
        logger.info("Audio duration extracted via ffprobe", {
          filePath,
          duration: d,
        });
        return Math.round(d);
      }
    } catch {
      // try next strategy
    }
  }

  // Strategy 3: full decode — reads every frame and reports final timestamp.
  // Required for browser-recorded webm where the container has no duration header.
  try {
    const { stderr } = await execAsync(
      `ffmpeg -i "${filePath}" -f null /dev/null 2>&1 || true`,
      { timeout: 120_000 },
    );
    const match = stderr.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) {
      const duration =
        parseInt(match[1]) * 3600 +
        parseInt(match[2]) * 60 +
        parseFloat(match[3]);
      if (duration > 0) {
        logger.info("Audio duration extracted via ffmpeg decode", {
          filePath,
          duration,
        });
        return Math.round(duration);
      }
    }
  } catch (err) {
    logger.warn("ffmpeg decode strategy failed", {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  throw new Error(`Could not extract duration from: ${filePath}`);
};
