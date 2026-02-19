import express from "express";
import storageController from "../controllers/storage.controller";
import { verifyJWT } from "../middleware/authMiddleware";

const router = express.Router();

// All routes require authentication
router.use(verifyJWT);

router.post(
  "/generate-upload-url/image",
  storageController.generateImageUploadUrl,
);
router.post(
  "/generate-upload-url/file",
  storageController.generateFileUploadUrl,
);
router.post("/generate-upload-url/pdf", storageController.generatePDFUploadUrl);
router.post(
  "/generate-upload-url/report",
  storageController.generateReportUploadUrl,
);
router.post(
  "/generate-upload-url",
  storageController.generateFlexibleUploadUrl,
);
router.delete("/delete", storageController.deleteFile);

export default router;
