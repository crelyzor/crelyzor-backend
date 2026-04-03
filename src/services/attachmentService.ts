import path from "path";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import { gcsService } from "./gcs/gcsService";
import { AttachmentType } from "@prisma/client";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const GCS_FOLDER = "attachments";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttachmentResponse {
  id: string;
  meetingId: string;
  type: AttachmentType;
  name: string;
  url?: string | null;
  signedUrl?: string | null;
  signedUrlError?: boolean;
  mimeType?: string | null;
  size?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function verifyMeetingOwnership(
  meetingId: string,
  userId: string,
): Promise<void> {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);
}

function detectAttachmentType(mimeType: string): AttachmentType {
  return mimeType.startsWith("image/")
    ? AttachmentType.PHOTO
    : AttachmentType.FILE;
}

async function toResponse(attachment: {
  id: string;
  meetingId: string;
  type: AttachmentType;
  name: string;
  url: string | null;
  gcsPath: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: Date;
  updatedAt: Date;
}): Promise<AttachmentResponse> {
  let signedUrl: string | null = null;
  let signedUrlError: boolean | undefined;

  if (attachment.gcsPath) {
    // Safety guard: only serve paths under our folder
    if (attachment.gcsPath.startsWith(`${GCS_FOLDER}/`)) {
      try {
        signedUrl = await gcsService.getSignedUrl(attachment.gcsPath, {
          expiresInMinutes: 60,
        });
      } catch (err) {
        signedUrlError = true;
        logger.warn("Failed to generate signed URL", {
          attachmentId: attachment.id,
          gcsPath: attachment.gcsPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    id: attachment.id,
    meetingId: attachment.meetingId,
    type: attachment.type,
    name: attachment.name,
    url: attachment.url,
    signedUrl,
    signedUrlError,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export async function getAttachments(
  meetingId: string,
  userId: string,
): Promise<AttachmentResponse[]> {
  await verifyMeetingOwnership(meetingId, userId);

  const rows = await prisma.meetingAttachment.findMany({
    where: { meetingId, isDeleted: false },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      meetingId: true,
      type: true,
      name: true,
      url: true,
      gcsPath: true,
      mimeType: true,
      size: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return Promise.all(rows.map(toResponse));
}

export async function addLink(
  meetingId: string,
  userId: string,
  data: { url: string; name?: string },
): Promise<AttachmentResponse> {
  await verifyMeetingOwnership(meetingId, userId);

  let name: string;
  try {
    name = data.name?.trim() || new URL(data.url).hostname;
  } catch {
    throw new AppError("Invalid URL", 400);
  }

  const attachment = await prisma.meetingAttachment.create({
    data: {
      meetingId,
      userId,
      type: AttachmentType.LINK,
      name,
      url: data.url,
    },
    select: {
      id: true,
      meetingId: true,
      type: true,
      name: true,
      url: true,
      gcsPath: true,
      mimeType: true,
      size: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logger.info("Attachment link added", {
    attachmentId: attachment.id,
    meetingId,
    userId,
  });

  return toResponse(attachment);
}

export async function uploadFile(
  meetingId: string,
  userId: string,
  file: Express.Multer.File,
  name?: string,
): Promise<AttachmentResponse> {
  await verifyMeetingOwnership(meetingId, userId);

  if (file.size > MAX_FILE_SIZE) {
    throw new AppError("File too large (max 50MB)", 400);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(
      `File type not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
      400,
    );
  }

  const attachmentType = detectAttachmentType(file.mimetype);
  const displayName = name?.trim() || file.originalname;

  const result = await gcsService.uploadFile(
    file.buffer,
    file.originalname,
    GCS_FOLDER,
    file.mimetype,
  );

  const attachment = await prisma.meetingAttachment.create({
    data: {
      meetingId,
      userId,
      type: attachmentType,
      name: displayName,
      gcsPath: result.filePath,
      mimeType: file.mimetype,
      size: result.size,
    },
    select: {
      id: true,
      meetingId: true,
      type: true,
      name: true,
      url: true,
      gcsPath: true,
      mimeType: true,
      size: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logger.info("Attachment file uploaded", {
    attachmentId: attachment.id,
    meetingId,
    userId,
    type: attachmentType,
    size: result.size,
  });

  return toResponse(attachment);
}

export async function deleteAttachment(
  meetingId: string,
  attachmentId: string,
  userId: string,
): Promise<void> {
  await verifyMeetingOwnership(meetingId, userId);

  const attachment = await prisma.meetingAttachment.findFirst({
    where: { id: attachmentId, meetingId, isDeleted: false },
    select: { id: true },
  });

  if (!attachment) throw new AppError("Attachment not found", 404);

  await prisma.meetingAttachment.update({
    where: { id: attachmentId },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  logger.info("Attachment deleted", { attachmentId, meetingId, userId });
}

export const attachmentService = {
  getAttachments,
  addLink,
  uploadFile,
  deleteAttachment,
};
