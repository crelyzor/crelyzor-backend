import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { logger } from '../logging/logger';

const execAsync = promisify(exec);

/**
 * Compress audio file to reduce file size
 * Uses ffmpeg to convert to lower bitrate
 * @param inputPath - Path to input audio file
 * @param outputPath - Path to save compressed audio
 * @param bitrate - Target bitrate (default: 64k for low quality, 128k for medium)
 */
export const compressAudio = async (
  inputPath: string,
  outputPath: string,
  bitrate: string = '96k'
): Promise<string> => {
  try {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    logger.info(`Starting audio compression`, {
      inputPath,
      outputPath,
      bitrate,
      inputSize: fs.statSync(inputPath).size,
    });

    // Use system ffmpeg for audio conversion
    const command = `ffmpeg -i "${inputPath}" -b:a ${bitrate} -y "${outputPath}" 2>&1`;

    await execAsync(command, { timeout: 300000 }); // 5 minute timeout

    if (!fs.existsSync(outputPath)) {
      throw new Error('Compression failed: output file not created');
    }

    const outputSize = fs.statSync(outputPath).size;
    const inputSize = fs.statSync(inputPath).size;
    const compressionRatio = ((1 - outputSize / inputSize) * 100).toFixed(2);

    logger.info(`Audio compression completed`, {
      inputSize,
      outputSize,
      compressionRatio: `${compressionRatio}%`,
      bitrate,
    });

    return outputPath;
  } catch (error) {
    logger.error(`Audio compression failed:`, error);
    // If compression fails, return original file
    logger.warn(`Falling back to original file due to compression failure`);
    return inputPath;
  }
};
