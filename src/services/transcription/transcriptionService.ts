import {
  getDeepgramClient,
  isTranscriptionEnabled,
} from "../../config/deepgram";
import { gcsService } from "../gcs/gcsService";
import { getTranscriptionQueue } from "../../config/queue";
import prisma from "../../db/prismaClient";
import { logger } from "../../utils/logging/logger";
import { TranscriptionStatus } from "@prisma/client";
import { AppError } from "../../utils/errors/AppError";

const DEEPGRAM_MODEL = "nova-2";

export interface TranscriptionResult {
  transcriptId: string;
  fullText: string;
  segments: TranscriptSegment[];
  duration: number;
}

export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
  speaker: string;
}

/**
 * Start transcription for a recording
 * @param language Optional BCP 47 language code (defaults to "en")
 */
export const transcribeRecording = async (
  recordingId: string,
  language?: string,
): Promise<TranscriptionResult> => {
  if (!isTranscriptionEnabled()) {
    throw new AppError("Transcription is not enabled - DEEPGRAM_API_KEY required", 503);
  }

  const recording = await prisma.meetingRecording.findFirst({
    where: { id: recordingId, isDeleted: false },
    include: { meeting: true },
  });

  if (!recording || recording.meeting.isDeleted) {
    throw new AppError(`Recording not found: ${recordingId}`, 404);
  }

  // Update status to processing
  await prisma.meeting.update({
    where: { id: recording.meetingId },
    data: { transcriptionStatus: TranscriptionStatus.PROCESSING },
  });

  try {
    // Download audio file from GCS
    const audioBuffer = await gcsService.downloadFile(recording.gcsPath);

    // Transcribe with Deepgram
    const deepgram = getDeepgramClient();
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: DEEPGRAM_MODEL,
        smart_format: true,
        diarize: true,
        punctuate: true,
        utterances: true,
        language: language ?? "en",
      },
    );

    if (error) {
      throw error;
    }

    const channel = result.results?.channels?.[0];
    const alternatives = channel?.alternatives?.[0];

    if (!alternatives) {
      throw new AppError("No transcription results returned from Deepgram", 502);
    }

    // Parse segments from utterances or words
    const segments: TranscriptSegment[] = [];

    if (result.results?.utterances) {
      for (const utterance of result.results.utterances) {
        segments.push({
          startTime: utterance.start,
          endTime: utterance.end,
          text: utterance.transcript,
          speaker: `Speaker ${utterance.speaker ?? 0}`,
        });
      }
    } else if (alternatives.words) {
      // Group words into segments by speaker or time gaps
      let currentSegment: TranscriptSegment | null = null;

      for (const word of alternatives.words) {
        const speaker = `Speaker ${(word as { speaker?: number }).speaker ?? 0}`;

        if (
          !currentSegment ||
          currentSegment.speaker !== speaker ||
          word.start - currentSegment.endTime > 2
        ) {
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            startTime: word.start,
            endTime: word.end,
            text: word.word,
            speaker,
          };
        } else {
          currentSegment.endTime = word.end;
          currentSegment.text += " " + word.word;
        }
      }

      if (currentSegment) {
        segments.push(currentSegment);
      }
    }

    // Persist transcript, status update, and speakers atomically
    const distinctSpeakers = [...new Set(segments.map((seg) => seg.speaker))];
    const transcript = await prisma.$transaction(
      async (tx) => {
        const created = await tx.meetingTranscript.create({
          data: {
            recordingId: recording.id,
            fullText: alternatives.transcript || "",
            deepgramJobId: null,
            processedAt: new Date(),
            segments: {
              create: segments.map((seg) => ({
                startTime: seg.startTime,
                endTime: seg.endTime,
                text: seg.text,
                speaker: seg.speaker,
              })),
            },
          },
        });

        await tx.meeting.update({
          where: { id: recording.meetingId },
          data: { transcriptionStatus: TranscriptionStatus.COMPLETED },
        });

        await Promise.all(
          distinctSpeakers.map((speakerLabel) =>
            tx.meetingSpeaker.upsert({
              where: {
                meetingId_speakerLabel: {
                  meetingId: recording.meetingId,
                  speakerLabel,
                },
              },
              create: { meetingId: recording.meetingId, speakerLabel },
              update: {},
            }),
          ),
        );

        return created;
      },
      { timeout: 15000 },
    );

    logger.info(
      `Created ${distinctSpeakers.length} speaker records for meeting ${recording.meetingId}`,
    );
    logger.info(`Transcription completed for recording ${recordingId}`);

    return {
      transcriptId: transcript.id,
      fullText: alternatives.transcript || "",
      segments,
      duration: result.metadata?.duration || 0,
    };
  } catch (error) {
    // Update status to failed
    await prisma.meeting.update({
      where: { id: recording.meetingId },
      data: { transcriptionStatus: TranscriptionStatus.FAILED },
    });

    logger.error(`Transcription failed for recording ${recordingId}:`, {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};

/**
 * Regenerate transcript for a meeting — deletes existing transcript, re-queues Deepgram.
 *
 * Deliberate hard deletes on MeetingTranscript and MeetingSpeaker: these are derivative,
 * fully reprocessable records. Hard-deleting before re-running is the correct reset
 * semantics (no data loss — the source audio in GCS is untouched).
 *
 * @param language Optional BCP 47 language code (defaults to "en")
 */
export const regenerateTranscript = async (
  meetingId: string,
  userId: string,
  language?: string,
): Promise<void> => {
  if (!isTranscriptionEnabled()) {
    throw new AppError(
      "Transcription is not enabled - DEEPGRAM_API_KEY required",
      503,
    );
  }

  // Ownership + recording check
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    include: { recording: true },
  });

  if (!meeting) throw new AppError("Meeting not found", 404);
  if (!meeting.recording)
    throw new AppError("No recording found for this meeting", 404);

  // 409 guard — do not allow re-triggering while already in progress
  if (
    meeting.transcriptionStatus === TranscriptionStatus.PROCESSING ||
    meeting.transcriptionStatus === TranscriptionStatus.UPLOADED
  ) {
    throw new AppError(
      "A transcription job is already in progress for this meeting",
      409,
    );
  }

  const recordingId = meeting.recording.id;

  await prisma.$transaction(
    async (tx) => {
      // Delete existing transcript (CASCADE handles TranscriptSegments)
      const existing = await tx.meetingTranscript.findUnique({
        where: { recordingId },
      });
      if (existing) {
        await tx.meetingTranscript.delete({ where: { id: existing.id } });
      }

      // Delete speakers (new ones will be created after re-transcription)
      await tx.meetingSpeaker.deleteMany({ where: { meetingId } });

      // Soft-delete AI-extracted tasks to prevent duplicates when AI re-runs
      await tx.task.updateMany({
        where: { meetingId, source: "AI_EXTRACTED", isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });

      // Reset transcription status
      await tx.meeting.update({
        where: { id: meetingId },
        data: { transcriptionStatus: TranscriptionStatus.UPLOADED },
      });
    },
    { timeout: 15000 },
  );

  // Queue new transcription job
  const queue = getTranscriptionQueue();
  await queue.add(
    "transcribe",
    { recordingId, meetingId, language },
    { jobId: `transcribe-regen-${recordingId}-${Date.now()}` },
  );

  logger.info(`Regenerate transcript queued for meeting ${meetingId}`, {
    language: language ?? "en",
  });
};

/**
 * Get transcript for a meeting (scoped to meeting owner)
 */
export const getTranscript = async (meetingId: string, userId: string) => {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, createdById: userId, isDeleted: false },
    select: { id: true },
  });
  if (!meeting) throw new AppError("Meeting not found", 404);

  const MAX_TRANSCRIPT_SEGMENTS = 5000;
  return prisma.meetingTranscript.findFirst({
    where: { recording: { meetingId } },
    include: {
      segments: {
        orderBy: { startTime: "asc" },
        take: MAX_TRANSCRIPT_SEGMENTS,
      },
    },
  });
};

export const transcriptionService = {
  transcribeRecording,
  regenerateTranscript,
  getTranscript,
  isEnabled: isTranscriptionEnabled,
};
