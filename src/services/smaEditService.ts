import prisma from "../db/prismaClient";
import { AppError } from "../utils/errors/AppError";
import { logger } from "../utils/logging/logger";
import type { PatchSummaryInput } from "../validators/transcriptEditSchema";
import { encrypt, decrypt } from "../utils/security/crypto";
import { principalForMeeting } from "./meetings/meetingService";

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
  // Phase 6 P5.1.c — fetch the meeting alongside the segment so we can
  // derive the correct encryption principal. Ownership remains
  // createdById-scoped here; team-aware access via assertMeetingAccess is
  // the controller's job (P5.1.b mounted resolveTeamContext upstream;
  // controller cutover for this endpoint lands with the rest of the
  // transcript surface).
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
    select: {
      id: true,
      transcript: {
        select: {
          recording: {
            select: {
              meeting: {
                select: { teamId: true, createdById: true },
              },
            },
          },
        },
      },
    },
  });

  if (!segment) {
    throw new AppError("Transcript segment not found", 404);
  }

  const meetingPrincipal = principalForMeeting(
    segment.transcript.recording.meeting,
  );
  const encryptedText = await encrypt(text, meetingPrincipal);
  await prisma.transcriptSegment.update({
    where: { id: segmentId },
    data: { text: encryptedText },
  });

  logger.info("Transcript segment updated", { segmentId, meetingId, userId });
  // Return plaintext text (not the Buffer stored in DB)
  return { id: segmentId, text };
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
    select: { id: true, teamId: true, createdById: true },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const meetingPrincipal = principalForMeeting(meeting);

  const summaryUpdateData: {
    summary?: Uint8Array<ArrayBuffer>;
    keyPoints?: Uint8Array<ArrayBuffer>;
  } = {};
  if (data.summary !== undefined)
    summaryUpdateData.summary = await encrypt(data.summary, meetingPrincipal);
  if (data.keyPoints !== undefined)
    summaryUpdateData.keyPoints = await encrypt(
      JSON.stringify(data.keyPoints),
      meetingPrincipal,
    );

  const hasSummaryUpdate = Object.keys(summaryUpdateData).length > 0;
  const hasTitleUpdate = data.title !== undefined;

  if (hasSummaryUpdate) {
    const existing = await prisma.meetingAISummary.findFirst({
      where: { meetingId, isDeleted: false },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError("No AI summary found for this meeting", 404);
    }
  }

  if (hasSummaryUpdate && hasTitleUpdate) {
    await prisma.$transaction(
      async (tx) => {
        await tx.meetingAISummary.updateMany({
          where: { meetingId, isDeleted: false },
          data: summaryUpdateData,
        });
        await tx.meeting.update({
          where: { id: meetingId },
          data: { title: data.title },
        });
      },
      { timeout: 15000 },
    );
    logger.info("Summary and title updated", { meetingId, userId });
    return {
      summary: { summary: data.summary, keyPoints: data.keyPoints },
      title: data.title,
    };
  }

  if (hasSummaryUpdate) {
    await prisma.meetingAISummary.updateMany({
      where: { meetingId, isDeleted: false },
      data: summaryUpdateData,
    });
    logger.info("Summary updated", { meetingId, userId });
    return {
      summary: { summary: data.summary, keyPoints: data.keyPoints },
      title: undefined,
    };
  }

  // Title-only update
  await prisma.meeting.update({
    where: { id: meetingId, createdById: userId },
    data: { title: data.title },
  });
  logger.info("Meeting title updated via summary edit", { meetingId, userId });
  return { summary: null, title: data.title };
}

/**
 * Merge only adjacent transcript segments that share the same speaker.
 * Example merged: S0, S0, S0 -> S0
 * Example not merged across boundary: S0, S1, S0 (kept as-is)
 */
export async function mergeConsecutiveSpeakerSegments(
  meetingId: string,
  userId: string,
) {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: {
      id: true,
      teamId: true,
      createdById: true,
      recording: {
        select: {
          transcript: {
            select: {
              id: true,
              segments: {
                select: {
                  id: true,
                  speaker: true,
                  text: true,
                  startTime: true,
                  endTime: true,
                },
                orderBy: [{ startTime: "asc" }, { id: "asc" }],
                take: 10000,
              },
            },
          },
        },
      },
    },
  });

  if (!meeting) {
    throw new AppError("Meeting not found", 404);
  }

  const meetingPrincipal = principalForMeeting(meeting);
  const transcript = meeting.recording?.transcript;
  if (!transcript) {
    throw new AppError("No transcript found for this meeting", 404);
  }

  const segments = transcript.segments;
  if (segments.length < 2) {
    return {
      mergedCount: 0,
      originalCount: segments.length,
      finalCount: segments.length,
    };
  }

  // Decrypt all segment texts before merging (under the meeting principal).
  const decryptedSegments = await Promise.all(
    segments.map(async (seg) => ({
      ...seg,
      text: seg.text ? await decrypt(seg.text, meetingPrincipal) : "",
    })),
  );

  const mergedPlaintext = decryptedSegments.reduce<
    Array<{
      speaker: string;
      text: string;
      startTime: number;
      endTime: number;
    }>
  >((acc, seg) => {
    const last = acc[acc.length - 1];
    if (!last || last.speaker !== seg.speaker) {
      acc.push({
        speaker: seg.speaker,
        text: seg.text.trim(),
        startTime: seg.startTime,
        endTime: seg.endTime,
      });
      return acc;
    }

    // Same speaker and adjacent in sequence: merge into previous segment.
    last.text = `${last.text} ${seg.text}`.trim();
    last.endTime = Math.max(last.endTime, seg.endTime);
    return acc;
  }, []);

  const mergedCount = segments.length - mergedPlaintext.length;
  if (mergedCount === 0) {
    return {
      mergedCount: 0,
      originalCount: segments.length,
      finalCount: segments.length,
    };
  }

  // Encrypt merged texts before persisting (under the meeting principal).
  const merged = await Promise.all(
    mergedPlaintext.map(async (seg) => ({
      transcriptId: transcript.id,
      speaker: seg.speaker,
      text: await encrypt(seg.text, meetingPrincipal),
      startTime: seg.startTime,
      endTime: seg.endTime,
    })),
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.transcriptSegment.deleteMany({
        where: { transcriptId: transcript.id },
      });

      await tx.transcriptSegment.createMany({
        data: merged,
      });
    },
    { timeout: 15000 },
  );

  logger.info("Merged consecutive transcript speakers", {
    meetingId,
    userId,
    originalCount: segments.length,
    finalCount: mergedPlaintext.length,
    mergedCount,
  });

  return {
    mergedCount,
    originalCount: segments.length,
    finalCount: mergedPlaintext.length,
  };
}
