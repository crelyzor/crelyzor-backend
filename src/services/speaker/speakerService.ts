import prisma from "../../db/prismaClient";
import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import { assertMeetingAccess } from "../meetings/meetingService";
import type { TeamContext } from "../../middleware/authMiddleware";

/**
 * Get all speakers for a meeting, ordered by speakerLabel
 */
export const getSpeakers = async (
  meetingId: string,
  userId: string,
  teamContext: TeamContext | null,
) => {
  await assertMeetingAccess(userId, meetingId, teamContext, "read");

  return prisma.meetingSpeaker.findMany({
    where: { meetingId },
    orderBy: { speakerLabel: "asc" },
    take: 100,
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
  teamContext: TeamContext | null,
) => {
  await assertMeetingAccess(userId, meetingId, teamContext, "mutate");

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
