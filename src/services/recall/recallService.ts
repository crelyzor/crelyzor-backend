import { AppError } from "../../utils/errors/AppError";
import { logger } from "../../utils/logging/logger";
import { env } from "../../config/environment";

const RECALL_API_BASE = env.RECALL_BASE_URL;

function getRecallApiKey(): string {
  if (!env.RECALL_API_KEY) {
    throw new AppError("Recall.ai is not configured on this instance", 503);
  }
  return env.RECALL_API_KEY;
}

/**
 * Deploys a Recall.ai bot into a video meeting.
 *
 * Auth: Recall.ai uses "Token <key>" scheme (not Bearer).
 * Reads RECALL_API_KEY from environment (platform-level key).
 *
 * @param meetingLink - The video meeting URL to join
 * @param joinAt - Optional ISO timestamp for when the bot should join
 * @returns botId assigned by Recall.ai — store on Meeting.recallBotId
 * @throws AppError 502 on Recall API failure, 503 if not configured
 */
export async function deployBot(
  meetingLink: string,
  joinAt?: string,
): Promise<{ botId: string }> {
  const apiKey = getRecallApiKey();

  try {
    const payload: Record<string, unknown> = {
      meeting_url: meetingLink,
      bot_name: "Crelyzor",
      automatic_leave: {
        waiting_room_timeout: 600,
        noone_joined_timeout: 180,
      },
    };

    if (joinAt) {
      payload.join_at = joinAt;
    }

    const res = await fetch(`${RECALL_API_BASE}/bot/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.error("Recall.ai bot deployment failed", { status: res.status, meetingLink });
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
 * Reads RECALL_API_KEY from environment (platform-level key).
 *
 * @returns The download URL for the recording
 * @throws AppError 502 if the recording is not available or the API call fails
 */
export async function getRecordingUrl(botId: string): Promise<string> {
  const apiKey = getRecallApiKey();

  try {
    const res = await fetch(`${RECALL_API_BASE}/bot/${botId}/`, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    });

    if (!res.ok) {
      logger.error("Recall.ai bot fetch failed", { status: res.status, botId });
      throw new AppError("Failed to fetch Recall.ai bot recording", 502);
    }

    const body = (await res.json()) as {
      video_url?: string;
      recordings?: Array<{ media_shortcuts?: { video?: { url?: string } } }>;
    };

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
