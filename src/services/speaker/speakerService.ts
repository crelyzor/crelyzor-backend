import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";

/**
 * Get all speakers for a meeting, ordered by speakerLabel
 */
export const getSpeakers = async (meetingId: string, userId: string) => {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  return prisma.meetingSpeaker.findMany({
    where: { meetingId },
    orderBy: { speakerLabel: "asc" },
  });
};

/**
 * Update displayName and/or role for a speaker
 */
export const renameSpeaker = async (
  meetingId: string,
  speakerId: string,
  updates: { displayName?: string; role?: string },
  userId: string,
) => {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const speaker = await prisma.meetingSpeaker.findFirst({
    where: { id: speakerId, meetingId },
  });

  if (!speaker) {
    throw new AppError("Speaker not found", 404);
  }

  const updated = await prisma.meetingSpeaker.update({
    where: { id: speakerId },
    data: {
      ...(updates.displayName !== undefined && {
        displayName: updates.displayName,
      }),
      ...(updates.role !== undefined && { role: updates.role }),
    },
  });

  logger.info("Speaker updated", { speakerId, meetingId, updates });

  return updated;
};

export const speakerService = {
  getSpeakers,
  renameSpeaker,
};
