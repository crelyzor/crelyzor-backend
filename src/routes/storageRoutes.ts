import express from "express";
import storageController from "../controllers/storage.controller";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requirePermission } from "../middleware/accessMiddleware";

const router = express.Router();

// All routes require authentication
router.use(verifyJWT);
router.use(resolveOrgContext);
router.post(
  "/generate-upload-url/image",
  requirePermission("UPLOAD_SHARED_RESOURCES"),
  storageController.generateImageUploadUrl,
);
router.post(
  "/generate-upload-url/file",
  requirePermission("UPLOAD_SHARED_RESOURCES"),
  storageController.generateFileUploadUrl,
);
router.post(
  "/generate-upload-url/pdf",
  requirePermission("UPLOAD_SHARED_RESOURCES"),
  storageController.generatePDFUploadUrl,
);
router.post(
  "/generate-upload-url/report",
  requirePermission("UPLOAD_SHARED_RESOURCES"),
  storageController.generateReportUploadUrl,
);

// Flexible endpoint - specify folder in request body
router.post(
  "/generate-upload-url",
  requirePermission("UPLOAD_SHARED_RESOURCES"),
  storageController.generateFlexibleUploadUrl,
);

// Delete file
router.delete(
  "/delete",
  requirePermission("DELETE_SHARED_RESOURCES"),
  storageController.deleteFile,
);

export default router;
