import { Request, Response } from "express";
import storageService from "../services/storage.service";
import { ErrorFactory, globalErrorHandler } from "../utils/globalErrorHandler";
import { apiResponse } from "../utils/globalResponseHandler";

class StorageController {
  // Generate upload URL for images
  async generateImageUploadUrl(req: Request, res: Response) {
    try {
      const { fileName, fileType, fileSize } = req.body;

      if (!fileName || !fileType) {
        throw ErrorFactory.validation("fileName and fileType are required");
      }

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder: "images",
        fileSize,
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
      const { fileName, fileType, fileSize } = req.body;

      if (!fileName || !fileType) {
        throw ErrorFactory.validation("fileName and fileType are required");
      }

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder: "sharedResources",
        fileSize,
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
      const { fileName, fileType, fileSize } = req.body;

      if (!fileName || !fileType) {
        throw ErrorFactory.validation("fileName and fileType are required");
      }

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder: "activityReport",
        fileSize,
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
      const { fileName, fileType, fileSize } = req.body;

      if (!fileName || !fileType) {
        throw ErrorFactory.validation("fileName and fileType are required");
      }

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder: "report",
        fileSize,
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
      const { fileName, fileType, folder, fileSize } = req.body;

      if (!fileName || !fileType || !folder) {
        throw ErrorFactory.validation(
          "fileName, fileType and folder are required",
        );
      }

      // Validate folder
      const validFolders = [
        "images",
        "sharedResources",
        "activityReport",
        "report",
      ];
      if (!validFolders.includes(folder)) {
        throw ErrorFactory.validation("Invalid folder specified");
      }

      const result = await storageService.generateUploadUrl({
        fileName,
        fileType,
        folder: folder as
          | "images"
          | "sharedResources"
          | "activityReport"
          | "report",
        fileSize,
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

  // Delete file
  async deleteFile(req: Request, res: Response) {
    try {
      const { fileUrl } = req.body;

      if (!fileUrl) {
        throw ErrorFactory.validation("fileUrl is required");
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
