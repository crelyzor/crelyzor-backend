import multer from "multer";

// Allowed audio/video mime types
const ALLOWED_MIME_TYPES = [
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
  "video/webm",
  "video/mp4",
  "video/quicktime",
];

// Max file size: 500MB
const MAX_FILE_SIZE = 500 * 1024 * 1024;

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
        `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
      ),
    );
  }
};

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

export const singleFileUpload = uploadMiddleware.single("file");
