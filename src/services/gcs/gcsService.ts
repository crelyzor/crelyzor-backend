import { Storage } from "@google-cloud/storage";
import { logger } from "../../utils/logging/logger";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || "calendar-recordings";
const GCS_KEY_FILE = process.env.GCS_KEY_FILE;

let storage: Storage | null = null;

const getStorage = (): Storage => {
  if (!storage) {
    const options: ConstructorParameters<typeof Storage>[0] = {};
    
    if (GCS_PROJECT_ID) {
      options.projectId = GCS_PROJECT_ID;
    }
    
    if (GCS_KEY_FILE) {
      options.keyFilename = GCS_KEY_FILE;
    }
    
    storage = new Storage(options);
  }
  return storage;
};

export interface UploadResult {
  url: string;
  fileName: string;
  filePath: string;
  bucket: string;
  contentType: string;
  size: number;
}

export interface SignedUrlOptions {
  expiresInMinutes?: number;
  contentType?: string;
}

/**
 * Upload a file buffer to GCS
 */
export const uploadFile = async (
  buffer: Buffer,
  originalFileName: string,
  folder: string = "recordings",
  contentType: string = "audio/webm"
): Promise<UploadResult> => {
  const gcs = getStorage();
  const bucket = gcs.bucket(GCS_BUCKET_NAME);
  
  const ext = path.extname(originalFileName) || ".webm";
  const uniqueFileName = `${uuidv4()}${ext}`;
  const filePath = `${folder}/${uniqueFileName}`;
  
  const file = bucket.file(filePath);
  
  await file.save(buffer, {
    contentType,
    metadata: {
      originalName: originalFileName,
      uploadedAt: new Date().toISOString(),
    },
  });
  
  const [metadata] = await file.getMetadata();
  
  logger.info(`File uploaded to GCS: ${filePath}`);
  
  return {
    url: `gs://${GCS_BUCKET_NAME}/${filePath}`,
    fileName: uniqueFileName,
    filePath,
    bucket: GCS_BUCKET_NAME,
    contentType,
    size: Number(metadata.size) || buffer.length,
  };
};

/**
 * Generate a signed URL for temporary file access
 */
export const getSignedUrl = async (
  filePath: string,
  options: SignedUrlOptions = {}
): Promise<string> => {
  const gcs = getStorage();
  const bucket = gcs.bucket(GCS_BUCKET_NAME);
  const file = bucket.file(filePath);
  
  const expiresInMs = (options.expiresInMinutes || 60) * 60 * 1000;
  
  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresInMs,
  });
  
  return signedUrl;
};

/**
 * Download a file from GCS
 */
export const downloadFile = async (filePath: string): Promise<Buffer> => {
  const gcs = getStorage();
  const bucket = gcs.bucket(GCS_BUCKET_NAME);
  const file = bucket.file(filePath);
  
  const [contents] = await file.download();
  
  return contents;
};

/**
 * Delete a file from GCS
 */
export const deleteFile = async (filePath: string): Promise<void> => {
  const gcs = getStorage();
  const bucket = gcs.bucket(GCS_BUCKET_NAME);
  const file = bucket.file(filePath);
  
  await file.delete();
  
  logger.info(`File deleted from GCS: ${filePath}`);
};

/**
 * Check if a file exists in GCS
 */
export const fileExists = async (filePath: string): Promise<boolean> => {
  const gcs = getStorage();
  const bucket = gcs.bucket(GCS_BUCKET_NAME);
  const file = bucket.file(filePath);
  
  const [exists] = await file.exists();
  
  return exists;
};

export const gcsService = {
  uploadFile,
  getSignedUrl,
  downloadFile,
  deleteFile,
  fileExists,
};
