import { Request, Response } from "express";
import { z } from "zod";
import storageService from "../services/storage.service";
import { ErrorFactory, globalErrorHandler } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";
import { AppError } from "../utils/errors/AppError";

const uploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().positive().optional(),
});

const flexibleUploadUrlSchema = uploadUrlSchema.extend({
  folder: z.enum(["images", "sharedResources", "activityReport", "report"]),
});

const deleteFileSchema = z.object({
  fileUrl: z.string().url(),
});

class StorageController {
  // Generate upload URL for images
  async generateImageUploadUrl(req: Request, res: Response) {
    try {
      const parsed = uploadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError("fileName and fileType are required", 400);
      }
      const { fileName, fileType, fileSize } = parsed.data;

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder: "images",
        fileSize,
        userId: req.user?.userId,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Upload URL generated successfully",
        data: result,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  // Generate upload URL for files
  async generateFileUploadUrl(req: Request, res: Response) {
    try {
      const parsed = uploadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError("fileName and fileType are required", 400);
      }
      const { fileName, fileType, fileSize } = parsed.data;

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder: "sharedResources",
        fileSize,
        userId: req.user?.userId,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Upload URL generated successfully",
        data: result,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  // Generate upload URL for PDFs
  async generatePDFUploadUrl(req: Request, res: Response) {
    try {
      const parsed = uploadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError("fileName and fileType are required", 400);
      }
      const { fileName, fileType, fileSize } = parsed.data;

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder: "activityReport",
        fileSize,
        userId: req.user?.userId,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Upload URL generated successfully",
        data: result,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  // Generate upload URL for reports
  async generateReportUploadUrl(req: Request, res: Response) {
    try {
      const parsed = uploadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError("fileName and fileType are required", 400);
      }
      const { fileName, fileType, fileSize } = parsed.data;

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder: "report",
        fileSize,
        userId: req.user?.userId,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Upload URL generated successfully",
        data: result,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  // Flexible endpoint - Upload to any folder
  async generateFlexibleUploadUrl(req: Request, res: Response) {
    try {
      const parsed = flexibleUploadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          "fileName, fileType and a valid folder are required",
          400,
        );
      }
      const { fileName, fileType, folder, fileSize } = parsed.data;

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder,
        fileSize,
        userId: req.user?.userId,
      });

      apiResponse(res, {
        statusCode: 200,
        message: "Upload URL generated successfully",
        data: result,
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }

  // Delete file — only files owned by the requesting user may be deleted.
  // NOTE: Full per-file ownership tracking requires a storage_files DB table.
  // Until then, we restrict deletion to the user's own userId-prefixed paths only.
  async deleteFile(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) throw ErrorFactory.unauthorized("Authentication required");

      const parsed = deleteFileSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError("fileUrl must be a valid URL", 400);
      }

      const { fileUrl } = parsed.data;

      // Verify the URL points to a path that includes the requesting user's ID
      const path = storageService.extractStoragePathFromUrl(fileUrl);
      if (!path) {
        throw new AppError("Invalid file URL", 400);
      }
      if (!path.split('/').includes(userId)) {
        throw ErrorFactory.forbidden("You do not have permission to delete this file");
      }

      await storageService.deleteFile(fileUrl);

      apiResponse(res, {
        statusCode: 200,
        message: "File deleted successfully",
        data: { deleted: true },
      });
    } catch (error) {
      globalErrorHandler(error as Error, req, res);
    }
  }
}

export default new StorageController();
