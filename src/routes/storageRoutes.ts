import express from "express";
import storageController from "../controllers/storage.controller";
import { verifyJWT } from "../middleware/authMiddleware";
import { resolveOrgContext } from "../middleware/resolveOrgContext";
import { requireRole } from "../middleware/roleMiddleware";
import { UserRoleEnum } from "@prisma/client";

const router = express.Router();

// All routes require authentication
router.use(verifyJWT);
router.use(resolveOrgContext);
router.post(
  "/generate-upload-url/image",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  storageController.generateImageUploadUrl,
);
router.post(
  "/generate-upload-url/file",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  storageController.generateFileUploadUrl,
);
router.post(
  "/generate-upload-url/pdf",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  storageController.generatePDFUploadUrl,
);
router.post(
  "/generate-upload-url/report",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  storageController.generateReportUploadUrl,
);

// Flexible endpoint - specify folder in request body
router.post(
  "/generate-upload-url",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN, UserRoleEnum.MEMBER]),
  storageController.generateFlexibleUploadUrl,
);

// Delete file
router.delete(
  "/delete",
  requireRole([UserRoleEnum.OWNER, UserRoleEnum.ADMIN]),
  storageController.deleteFile,
);

export default router;
