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
      logger.error("Recall.ai bot deployment failed", {
        status: res.status,
        meetingLink,
      });
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
 * Cancels a Recall.ai bot.
 * Tries leave_call first (works for active bots), then falls back to delete
 * for scheduled/unstarted bots.
 */
export async function cancelBot(botId: string): Promise<void> {
  const apiKey = getRecallApiKey();

  try {
    const leaveRes = await fetch(
      `${RECALL_API_BASE}/bot/${botId}/leave_call/`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    if (leaveRes.ok) {
      return;
    }

    // Some bot states cannot receive leave commands and return method/status errors.
    // In these cases we continue with delete fallback for scheduled bots or no-op.
    if (leaveRes.status === 404 || leaveRes.status === 405) {
      logger.info(
        "Recall.ai bot leave_call skipped due to non-actionable status",
        {
          status: leaveRes.status,
          botId,
        },
      );
    }

    let leaveBodyCode: string | undefined;
    try {
      const leaveBody = (await leaveRes.json()) as { code?: string };
      leaveBodyCode = leaveBody.code;
    } catch {
      // ignore JSON parse errors and fall through to error handling
    }

    if (
      leaveBodyCode === "cannot_command_unstarted_bot" ||
      leaveRes.status === 404 ||
      leaveRes.status === 405
    ) {
      const deleteRes = await fetch(`${RECALL_API_BASE}/bot/${botId}/`, {
        method: "DELETE",
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      });

      if (deleteRes.ok) {
        return;
      }

      // Bot may already be completed/not deletable depending on Recall state machine.
      // Treat as non-fatal so meeting reschedule flow can continue cleanly.
      if (deleteRes.status === 404 || deleteRes.status === 405) {
        logger.info(
          "Recall.ai bot delete skipped due to terminal/non-deletable state",
          {
            status: deleteRes.status,
            botId,
          },
        );
        return;
      }

      logger.error("Recall.ai scheduled bot delete failed", {
        status: deleteRes.status,
        botId,
      });
      throw new AppError("Failed to cancel scheduled Recall.ai bot", 502);
    }

    logger.error("Recall.ai bot leave_call failed", {
      status: leaveRes.status,
      botId,
      code: leaveBodyCode,
    });
    throw new AppError("Failed to cancel Recall.ai bot", 502);
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("Recall.ai cancelBot network error", {
      error: err instanceof Error ? err.message : String(err),
      botId,
    });
    throw new AppError("Failed to reach Recall.ai API", 502);
  }
}

/**
 * Fetches both the video download URL and the Recall recording ID from bot details.
 * Recording ID is needed to request async transcription via Recall's transcript API.
 */
export async function getBotRecordingInfo(
  botId: string,
): Promise<{ url: string; recallRecordingId: string | null }> {
  const apiKey = getRecallApiKey();

  try {
    const res = await fetch(`${RECALL_API_BASE}/bot/${botId}/`, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    if (!res.ok) {
      logger.error("Recall.ai bot fetch failed", { status: res.status, botId });
      throw new AppError("Failed to fetch Recall.ai bot recording", 502);
    }

    const body = (await res.json()) as {
      video_url?: string;
      recordings?: Array<{
        id?: string;
        url?: string;
        media_shortcuts?: {
          video?: { data?: { download_url?: string }; url?: string };
          video_mixed?: { data?: { download_url?: string }; url?: string };
        };
      }>;
    };

    const url =
      body.video_url ??
      body.recordings?.[0]?.media_shortcuts?.video_mixed?.data?.download_url ??
      body.recordings?.[0]?.media_shortcuts?.video?.data?.download_url ??
      body.recordings?.[0]?.media_shortcuts?.video_mixed?.url ??
      body.recordings?.[0]?.media_shortcuts?.video?.url ??
      body.recordings?.[0]?.url;

    const recallRecordingId = body.recordings?.[0]?.id ?? null;

    if (!url) {
      logger.warn("Recall.ai recording URL not ready yet", {
        botId,
        hasVideoUrl: !!body.video_url,
        recordingsCount: body.recordings?.length ?? 0,
        mediaShortcutKeys: Object.keys(
          body.recordings?.[0]?.media_shortcuts ?? {},
        ),
      });
      throw new AppError("Recall.ai recording URL not available", 502);
    }

    return { url, recallRecordingId };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("Recall.ai getBotRecordingInfo network error", {
      error: err instanceof Error ? err.message : String(err),
      botId,
    });
    throw new AppError("Failed to reach Recall.ai API", 502);
  }
}

/**
 * Fetches the audio/video download URL for a completed Recall.ai bot recording.
 * @deprecated Use getBotRecordingInfo() to also get the Recall recording ID.
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
      recordings?: Array<{
        url?: string;
        media_shortcuts?: {
          video?: { data?: { download_url?: string }; url?: string };
          video_mixed?: { data?: { download_url?: string }; url?: string };
        };
      }>;
    };

    const url =
      body.video_url ??
      body.recordings?.[0]?.media_shortcuts?.video_mixed?.data?.download_url ??
      body.recordings?.[0]?.media_shortcuts?.video?.data?.download_url ??
      body.recordings?.[0]?.media_shortcuts?.video_mixed?.url ??
      body.recordings?.[0]?.media_shortcuts?.video?.url ??
      body.recordings?.[0]?.url;

    if (!url) {
      logger.warn("Recall.ai recording URL not ready yet", {
        botId,
        hasVideoUrl: !!body.video_url,
        recordingsCount: body.recordings?.length ?? 0,
        mediaShortcutKeys: Object.keys(
          body.recordings?.[0]?.media_shortcuts ?? {},
        ),
      });
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
