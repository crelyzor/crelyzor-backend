import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import type { PatchSummaryInput } from "../validators/transcriptEditSchema";

/**
 * Edit a single transcript segment's text.
 * Verifies ownership via the full chain: segment → transcript → recording → meeting → user.
 */
export async function updateSegment(
  meetingId: string,
  segmentId: string,
  text: string,
  userId: string,
) {
  const segment = await prisma.transcriptSegment.findFirst({
    where: {
      id: segmentId,
      transcript: {
        recording: {
          meetingId,
          meeting: {
            createdById: userId,
            isDeleted: false,
          },
        },
      },
    },
    select: { id: true },
  });

  if (!segment) {
    throw new AppError("Transcript segment not found", 404);
  }

  const updated = await prisma.transcriptSegment.update({
    where: { id: segmentId },
    data: { text },
  });

  logger.info("Transcript segment updated", { segmentId, meetingId, userId });
  return updated;
}

/**
 * Manually override AI summary fields (summary, keyPoints) and/or meeting title.
 * Uses a transaction when both summary and title are updated together.
 */
export async function updateSummary(
  meetingId: string,
  data: PatchSummaryInput,
  userId: string,
) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const summaryUpdateData: { summary?: string; keyPoints?: string[] } = {};
  if (data.summary !== undefined) summaryUpdateData.summary = data.summary;
  if (data.keyPoints !== undefined)
    summaryUpdateData.keyPoints = data.keyPoints;

  const hasSummaryUpdate = Object.keys(summaryUpdateData).length > 0;
  const hasTitleUpdate = data.title !== undefined;

  if (hasSummaryUpdate) {
    const existing = await prisma.meetingAISummary.findUnique({
      where: { meetingId },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError("No AI summary found for this meeting", 404);
    }
  }

  if (hasSummaryUpdate && hasTitleUpdate) {
    const [updatedSummary] = await prisma.$transaction(
      async (tx) => {
        const s = await tx.meetingAISummary.update({
          where: { meetingId },
          data: summaryUpdateData,
        });
        await tx.meeting.update({
          where: { id: meetingId },
          data: { title: data.title },
        });
        return [s];
      },
      { timeout: 15000 },
    );
    logger.info("Summary and title updated", { meetingId, userId });
    return { summary: updatedSummary, title: data.title };
  }

  if (hasSummaryUpdate) {
    const updatedSummary = await prisma.meetingAISummary.update({
      where: { meetingId },
      data: summaryUpdateData,
    });
    logger.info("Summary updated", { meetingId, userId });
    return { summary: updatedSummary, title: undefined };
  }

  // Title-only update
  const [, summaryData] = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.meeting.update({
        where: { id: meetingId },
        data: { title: data.title },
      });
      const s = await tx.meetingAISummary.findUnique({ where: { meetingId } });
      return [updated, s];
    },
    { timeout: 15000 },
  );
  logger.info("Meeting title updated via summary edit", { meetingId, userId });
  return { summary: summaryData, title: data.title };
}
