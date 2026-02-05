import { getDeepgramClient, isTranscriptionEnabled } from "../../config/deepgram";
import { gcsService } from "../gcs/gcsService";
import prisma from "../../db/prismaClient";
import { logger } from "../../utils/logging/logger";
import { TranscriptionStatus } from "@prisma/client";

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
 */
export const transcribeRecording = async (
  recordingId: string
): Promise<TranscriptionResult> => {
  if (!isTranscriptionEnabled()) {
    throw new Error("Transcription is not enabled - DEEPGRAM_API_KEY required");
  }

  const recording = await prisma.meetingRecording.findUnique({
    where: { id: recordingId },
    include: { meeting: true },
  });

  if (!recording) {
    throw new Error(`Recording not found: ${recordingId}`);
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
        model: "nova-2",
        smart_format: true,
        diarize: true,
        punctuate: true,
        utterances: true,
        language: "en",
      }
    );

    if (error) {
      throw error;
    }

    const channel = result.results?.channels?.[0];
    const alternatives = channel?.alternatives?.[0];

    if (!alternatives) {
      throw new Error("No transcription results returned");
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
        
        if (!currentSegment || 
            currentSegment.speaker !== speaker ||
            word.start - currentSegment.endTime > 2) {
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

    // Create transcript record
    const transcript = await prisma.meetingTranscript.create({
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

    // Update meeting status
    await prisma.meeting.update({
      where: { id: recording.meetingId },
      data: { transcriptionStatus: TranscriptionStatus.COMPLETED },
    });

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
      error: error instanceof Error ? error.message : String(error) 
    });

    throw error;
  }
};

/**
 * Get transcript for a meeting
 */
export const getTranscript = async (meetingId: string) => {
  return prisma.meetingTranscript.findFirst({
    where: { recording: { meetingId } },
    include: {
      segments: {
        orderBy: { startTime: "asc" },
      },
    },
  });
};

export const transcriptionService = {
  transcribeRecording,
  getTranscript,
  isEnabled: isTranscriptionEnabled,
};
