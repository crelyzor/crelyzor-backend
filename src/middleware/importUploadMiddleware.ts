import multer from "multer";

const ALLOWED_IMPORT_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/calendar",
  "application/ics",
  "text/plain",
];

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const fileFilter: NonNullable<multer.Options["fileFilter"]> = (
  _req,
  file,
  cb,
) => {
  if (ALLOWED_IMPORT_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  cb(
    new Error(
      `Invalid file type. Allowed types: ${ALLOWED_IMPORT_MIME_TYPES.join(", ")}`,
    ),
  );
};

const importUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMPORT_FILE_SIZE,
  },
  fileFilter,
});

export const singleImportUpload = importUploadMiddleware.single("file");
