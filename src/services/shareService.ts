import { nanoid } from "nanoid";
import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import type { UpdateShareInput } from "../validators/shareSchema";

/**
 * Create or return an existing share record for a meeting (idempotent).
 * Verifies the meeting belongs to the requesting user.
 */
export async function createOrGetShare(meetingId: string, userId: string) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  // Return existing share if it exists
  const existing = await prisma.meetingShare.findUnique({
    where: { meetingId },
    select: {
      shortId: true,
      isPublic: true,
      showTranscript: true,
      showSummary: true,
      showTasks: true,
    },
  });

  if (existing) {
    return existing;
  }

  const share = await prisma.meetingShare.create({
    data: {
      meetingId,
      userId,
      shortId: nanoid(8),
    },
    select: {
      shortId: true,
      isPublic: true,
      showTranscript: true,
      showSummary: true,
      showTasks: true,
    },
  });

  logger.info("Meeting share created", {
    meetingId,
    userId,
    shortId: share.shortId,
  });

  return share;
}

/**
 * Update share visibility and field flags.
 * Verifies the meeting belongs to the requesting user.
 */
export async function updateShare(
  meetingId: string,
  userId: string,
  data: UpdateShareInput,
) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const existing = await prisma.meetingShare.findUnique({
    where: { meetingId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError("Share not found — create a share first", 404);
  }

  const share = await prisma.meetingShare.update({
    where: { meetingId },
    data: {
      ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
      ...(data.showTranscript !== undefined && {
        showTranscript: data.showTranscript,
      }),
      ...(data.showSummary !== undefined && { showSummary: data.showSummary }),
      ...(data.showTasks !== undefined && { showTasks: data.showTasks }),
    },
    select: {
      shortId: true,
      isPublic: true,
      showTranscript: true,
      showSummary: true,
      showTasks: true,
    },
  });

  logger.info("Meeting share updated", { meetingId, userId });

  return share;
}

/**
 * Fetch a published meeting for public display.
 * Returns 404 if not found or isPublic is false.
 * Only returns fields the owner has enabled.
 */
export async function getPublicMeetingByShortId(shortId: string) {
  const share = await prisma.meetingShare.findFirst({
    where: {
      shortId,
      isPublic: true,
      isDeleted: false,
      meeting: { isDeleted: false },
    },
    select: {
      shortId: true,
      showTranscript: true,
      showSummary: true,
      showTasks: true,
      meeting: {
        select: {
          title: true,
          type: true,
          createdAt: true,
          startTime: true,
        },
      },
    },
  });

  if (!share) {
    throw new AppError("Meeting not found or not published", 404);
  }

  const {
    showTranscript,
    showSummary,
    showTasks,
    meeting,
    shortId: sid,
  } = share;

  // Fetch speakers always (needed to resolve speakerLabel → displayName in transcript)
  const speakers = await prisma.meetingSpeaker.findMany({
    where: { meeting: { share: { shortId } } },
    select: {
      speakerLabel: true,
      displayName: true,
    },
  });

  // Conditional fetches based on owner's field settings
  const [transcriptData, summaryData, tasksData] = await Promise.all([
    showTranscript
      ? prisma.meetingTranscript.findFirst({
          where: { recording: { meeting: { share: { shortId } } } },
          select: {
            segments: {
              select: {
                speaker: true,
                text: true,
                startTime: true,
                endTime: true,
              },
              orderBy: { startTime: "asc" },
              take: 2000,
            },
          },
        })
      : Promise.resolve(null),

    showSummary
      ? prisma.meetingAISummary.findFirst({
          where: { meeting: { share: { shortId } } },
          select: {
            summary: true,
            keyPoints: true,
          },
        })
      : Promise.resolve(null),

    showTasks
      ? prisma.task.findMany({
          where: {
            isDeleted: false,
            meeting: { share: { shortId } },
          },
          select: {
            title: true,
            isCompleted: true,
          },
          orderBy: { createdAt: "asc" },
          take: 500,
        })
      : Promise.resolve(null),
  ]);

  return {
    shortId: sid,
    meeting,
    speakers,
    transcript: transcriptData ? transcriptData.segments : null,
    summary: summaryData,
    tasks: tasksData,
  };
}
