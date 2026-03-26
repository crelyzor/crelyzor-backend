import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";

const RECALL_API_BASE = "https://api.recall.ai/api/v1";

/**
 * Deploys a Recall.ai bot into a video meeting.
 *
 * Auth: Recall.ai uses "Token <key>" scheme (not Bearer).
 * The decrypted key is a local variable and must never be logged or stored.
 *
 * @returns botId assigned by Recall.ai — store on Meeting.recallBotId
 * @throws AppError 502 on Recall API failure
 */
export async function deployBot(
  meetingLink: string,
  recallApiKey: string,
): Promise<{ botId: string }> {
  let status: number;
  try {
    const res = await fetch(`${RECALL_API_BASE}/bot/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${recallApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meeting_url: meetingLink,
        bot_name: "Crelyzor",
        recording_config: { transcript: { provider: { assembly_ai: {} } } },
      }),
    });

    status = res.status;

    if (!res.ok) {
      logger.error("Recall.ai bot deployment failed", { status, meetingLink });
      throw new AppError("Failed to deploy Recall.ai bot", 502);
    }

    const body = (await res.json()) as { id?: string };
    if (!body.id) {
      throw new AppError("Recall.ai returned no bot ID", 502);
    }

    return { botId: body.id };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("Recall.ai deployBot network error", {
      error: err instanceof Error ? err.message : String(err),
      meetingLink,
    });
    throw new AppError("Failed to reach Recall.ai API", 502);
  }
}

/**
 * Fetches the audio/video download URL for a completed Recall.ai bot recording.
 *
 * @returns The download URL for the recording
 * @throws AppError 502 if the recording is not available or the API call fails
 */
export async function getRecordingUrl(
  botId: string,
  recallApiKey: string,
): Promise<string> {
  let status: number;
  try {
    const res = await fetch(`${RECALL_API_BASE}/bot/${botId}/`, {
      headers: {
        Authorization: `Token ${recallApiKey}`,
      },
    });

    status = res.status;

    if (!res.ok) {
      logger.error("Recall.ai bot fetch failed", { status, botId });
      throw new AppError("Failed to fetch Recall.ai bot recording", 502);
    }

    const body = (await res.json()) as {
      video_url?: string;
      recordings?: Array<{ media_shortcuts?: { video?: { url?: string } } }>;
    };

    // Recall.ai v1 may expose recording URL under video_url or recordings array
    const url =
      body.video_url ??
      body.recordings?.[0]?.media_shortcuts?.video?.url;

    if (!url) {
      throw new AppError("Recall.ai recording URL not available", 502);
    }

    return url;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("Recall.ai getRecordingUrl network error", {
      error: err instanceof Error ? err.message : String(err),
      botId,
    });
    throw new AppError("Failed to reach Recall.ai API", 502);
  }
}
