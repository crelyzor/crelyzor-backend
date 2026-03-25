import multer from "multer";

const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const fileFilter: NonNullable<multer.Options["fileFilter"]> = (
  _req,
  file,
  cb,
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed: images (jpg, png, gif, webp), PDF, Word documents.`,
      ),
    );
  }
};

export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

export const singleAttachmentUpload = attachmentUpload.single("file");
