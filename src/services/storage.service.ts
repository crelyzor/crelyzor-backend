import { Storage } from "@google-cloud/storage";

const GCS_PROJECT_ID = process.env.GCS_PROJECT_ID;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;

if (!GCS_BUCKET_NAME) {
  throw new Error("GCS_BUCKET_NAME environment variable is required");
}

// Auth via Application Default Credentials (gcloud ADC on local, VM identity on GCE)
let storage: Storage | null = null;

const getStorage = (): Storage => {
  if (!storage) {
    const options: ConstructorParameters<typeof Storage>[0] = {};
    if (GCS_PROJECT_ID) options.projectId = GCS_PROJECT_ID;
    storage = new Storage(options);
  }
  return storage;
};

const getBucket = () => getStorage().bucket(GCS_BUCKET_NAME);


interface GenerateUploadUrlRequest {
  fileName: string;
  fileType: string;
  folder: "images" | "sharedResources" | "activityReport" | "report";
  fileSize?: number;
  userId?: string;
}

interface GenerateUploadUrlResponse {
  uploadURL: string;
  downloadURL: string;
  filePath: string;
  expiresAt: string;
}

class StorageService {
  private getEnvironmentPrefix(): string {
    const env = process.env.NODE_ENV || "local";
    if (env === "production") return "production";
    if (env === "staging") return "staging";
    return "local";
  }

  // Validate file type - Allow all common file types for all folders
  private validateFileType(fileType: string, folder: string): boolean {
    // Common allowed file types across all folders
    const allowedTypes = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      // Documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
      // Videos
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
      "video/mpeg",
      "video/webm",
      // Audio
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/mp4",
      // Archives
      "application/zip",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
    ];

    return allowedTypes.includes(fileType);
  }

  // Validate file size
  private validateFileSize(fileSize: number, folder: string): boolean {
    const maxSizes: Record<string, number> = {
      images: 10 * 1024 * 1024, // 10MB
      sharedResources: 50 * 1024 * 1024, // 50MB
      activityReport: 50 * 1024 * 1024, // 50MB
      report: 50 * 1024 * 1024, // 50MB
    };

    return fileSize <= (maxSizes[folder] || 50 * 1024 * 1024);
  }

  // Generate pre-signed upload URL
  async generateUploadUrl(
    request: GenerateUploadUrlRequest,
  ): Promise<GenerateUploadUrlResponse> {
    const { fileName, fileType, folder, fileSize, userId } = request;

    // Validate file type
    if (!this.validateFileType(fileType, folder)) {
      throw new Error(`Invalid file type for ${folder}. Allowed: ${fileType}`);
    }

    // Validate file size
    if (fileSize && !this.validateFileSize(fileSize, folder)) {
      throw new Error(`File size exceeds limit for ${folder}`);
    }

    // Generate unique file path — include userId so ownership can be verified on delete
    const env = this.getEnvironmentPrefix();
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueFileName = `${timestamp}_${sanitizedFileName}`;
    const userSegment = userId ? `${userId}/` : "";
    const filePath = `${env}/${folder}/${userSegment}${uniqueFileName}`;

    const file = getBucket().file(filePath);

    // Generate signed URL for upload (valid for 15 minutes)
    const expiresAt = Date.now() + 15 * 60 * 1000;

    const [uploadURL] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: expiresAt,
      contentType: fileType,
    });

    // Generate public download URL (available after upload)
    const downloadURL = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${filePath}`;

    return {
      uploadURL,
      downloadURL,
      filePath,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  // Extract storage path from URL
  extractStoragePathFromUrl(downloadUrl: string): string | null {
    try {
      // Handle GCS URL format: https://storage.googleapis.com/bucket-name/path
      const gcsPrefix = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/`;
      if (downloadUrl.startsWith(gcsPrefix)) {
        return downloadUrl.substring(gcsPrefix.length);
      }

      // Handle Firebase URL format (legacy): /o/path?alt=media
      const start = downloadUrl.indexOf("/o/") + 3;
      const end = downloadUrl.indexOf("?alt=");
      if (start >= 3 && end > 0) {
        const encodedPath = downloadUrl.substring(start, end);
        return decodeURIComponent(encodedPath);
      }

      return null;
    } catch {
      return null;
    }
  }

  // Delete file
  async deleteFile(fileUrl: string): Promise<void> {
    const path = this.extractStoragePathFromUrl(fileUrl);

    if (!path) {
      throw new Error("Invalid file URL");
    }

    // Security: Only allow deletion from current environment
    const env = this.getEnvironmentPrefix();
    if (!path.startsWith(env)) {
      throw new Error("Cannot delete files from other environments");
    }

    const file = getBucket().file(path);
    const [exists] = await file.exists();

    if (!exists) {
      throw new Error("File not found");
    }

    await file.delete();
  }
}

export default new StorageService();
