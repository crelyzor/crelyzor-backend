import { Storage } from "@google-cloud/storage";
import { logger } from "../../utils/logging/logger";
import { v4 as uuidv4 } from "uuid";
import path from "path";

let storage: Storage | null = null;

const getBucketName = (): string => {
  const name = process.env.GCS_BUCKET_NAME;
  if (!name) throw new Error("GCS_BUCKET_NAME environment variable is not set");
  return name;
};

const getStorage = (): Storage => {
  if (!storage) {
    const options: ConstructorParameters<typeof Storage>[0] = {};

    const projectId = process.env.GCS_PROJECT_ID;
    if (projectId) options.projectId = projectId;

    const keyFile = process.env.GCS_KEY_FILE;
    if (keyFile) options.keyFilename = keyFile;

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
  contentType: string = "audio/webm",
): Promise<UploadResult> => {
  const bucketName = getBucketName();
  const gcs = getStorage();
  const bucket = gcs.bucket(bucketName);

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
    url: `gs://${bucketName}/${filePath}`,
    fileName: uniqueFileName,
    filePath,
    bucket: bucketName,
    contentType,
    size: Number(metadata.size) || buffer.length,
  };
};

/**
 * Generate a signed URL for temporary file access
 */
export const getSignedUrl = async (
  filePath: string,
  options: SignedUrlOptions = {},
): Promise<string> => {
  const gcs = getStorage();
  const bucket = gcs.bucket(getBucketName());
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
  const bucket = gcs.bucket(getBucketName());
  const file = bucket.file(filePath);

  const [contents] = await file.download();

  return contents;
};

/**
 * Delete a file from GCS
 */
export const deleteFile = async (filePath: string): Promise<void> => {
  const gcs = getStorage();
  const bucket = gcs.bucket(getBucketName());
  const file = bucket.file(filePath);

  await file.delete();

  logger.info(`File deleted from GCS: ${filePath}`);
};

/**
 * Check if a file exists in GCS
 */
export const fileExists = async (filePath: string): Promise<boolean> => {
  const gcs = getStorage();
  const bucket = gcs.bucket(getBucketName());
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
