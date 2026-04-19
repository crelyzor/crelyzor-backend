import { v4 as uuidv4 } from "uuid";
import { google } from "googleapis";
import prisma from "../db/prismaClient";
import { logger } from "../utils/logging/logger";
import { getAuthedCalendarClient } from "./googleCalendarService";

const WEBHOOK_BASE_URL = process.env.GOOGLE_WEBHOOK_BASE_URL ?? "";
const WEBHOOK_SECRET = process.env.GCAL_WEBHOOK_SECRET ?? "";
const CHANNEL_LIFESPAN_DAYS = 29; // Google max is 30 — 1 day buffer for renewal

/**
 * Registers a Google Calendar push-notification watch channel for a user.
 *
 * Fail-open: any Google API error is logged and swallowed.
 * Pull-based sync still works even when this fails.
 */
export async function registerWatchChannel(userId: string): Promise<void> {
  if (!WEBHOOK_BASE_URL || !WEBHOOK_SECRET) {
    logger.warn("GCal push: GOOGLE_WEBHOOK_BASE_URL or GCAL_WEBHOOK_SECRET not set — skipping watch registration", { userId });
    return;
  }

  try {
    const { client } = await getAuthedCalendarClient(userId, false);
    const calendar = google.calendar({ version: "v3", auth: client });

    const channelId = uuidv4();
    const expiration = new Date(Date.now() + CHANNEL_LIFESPAN_DAYS * 24 * 60 * 60 * 1000);
    const address = `${WEBHOOK_BASE_URL}/api/v1/webhooks/google/calendar`;

    const watchRes = await calendar.events.watch({
      calendarId: "primary",
      requestBody: {
        id: channelId,
        type: "web_hook",
        address,
        token: WEBHOOK_SECRET,
        expiration: expiration.getTime().toString(),
      },
    });

    const resourceId = watchRes.data.resourceId ?? null;

    await prisma.gCalSyncState.upsert({
      where: { userId },
      create: { userId, channelId, resourceId, expiration, syncToken: null },
      update: { channelId, resourceId, expiration, syncToken: null },
    });

    logger.info("GCal push: watch channel registered", { userId, channelId, expiration });
  } catch (err) {
    logger.warn("GCal push: registerWatchChannel failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Stops an existing watch channel and removes the GCalSyncState row.
 * Fail-open.
 */
export async function stopWatchChannel(userId: string): Promise<void> {
  try {
    const syncState = await prisma.gCalSyncState.findUnique({ where: { userId } });
    if (!syncState) return;

    try {
      const { client } = await getAuthedCalendarClient(userId, false);
      const calendar = google.calendar({ version: "v3", auth: client });
      await calendar.channels.stop({
        requestBody: { id: syncState.channelId, resourceId: syncState.resourceId ?? undefined },
      });
    } catch (stopErr) {
      // Log but continue — we still delete the local state
      logger.warn("GCal push: channels.stop failed (continuing with local delete)", {
        userId,
        error: stopErr instanceof Error ? stopErr.message : String(stopErr),
      });
    }

    await prisma.gCalSyncState.delete({ where: { userId } });
    logger.info("GCal push: watch channel stopped", { userId });
  } catch (err) {
    logger.warn("GCal push: stopWatchChannel failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Refreshes the sync token for a user by calling events.list(syncToken).
 * Falls back to a full re-sync if the token is expired (410 Gone).
 * Fail-open.
 */
export async function refreshSyncToken(userId: string): Promise<string | null> {
  try {
    const syncState = await prisma.gCalSyncState.findUnique({ where: { userId } });
    if (!syncState) return null;

    const { client } = await getAuthedCalendarClient(userId, false);
    const calendar = google.calendar({ version: "v3", auth: client });

    let newSyncToken: string | null = null;

    try {
      const res = await calendar.events.list({
        calendarId: "primary",
        ...(syncState.syncToken ? { syncToken: syncState.syncToken } : {}),
        maxResults: 1,
      });
      newSyncToken = res.data.nextSyncToken ?? null;
    } catch (tokenErr: unknown) {
      // 410 Gone = sync token expired → full re-sync
      const status = (tokenErr as { response?: { status?: number } })?.response?.status;
      if (status === 410) {
        logger.warn("GCal push: sync token expired — full re-sync", { userId });
        const res = await calendar.events.list({ calendarId: "primary", maxResults: 1 });
        newSyncToken = res.data.nextSyncToken ?? null;
      } else {
        throw tokenErr;
      }
    }

    if (newSyncToken) {
      await prisma.gCalSyncState.update({
        where: { userId },
        data: { syncToken: newSyncToken },
      });
    }

    return newSyncToken;
  } catch (err) {
    logger.warn("GCal push: refreshSyncToken failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Processes an incoming Google push notification by channelId.
 * Fetches changed events using the stored syncToken and passes them
 * to the existing syncLinkedMeetingsFromGoogle logic.
 */
export async function processIncomingNotification(channelId: string): Promise<void> {
  const syncState = await prisma.gCalSyncState.findUnique({ where: { channelId } });
  if (!syncState) {
    logger.warn("GCal push: unknown channelId — stale or unregistered channel", { channelId });
    return;
  }

  const { userId } = syncState;

  try {
    const { client } = await getAuthedCalendarClient(userId, false);
    const calendar = google.calendar({ version: "v3", auth: client });

    let items: import("googleapis").calendar_v3.Schema$Event[] = [];
    let newSyncToken: string | null = null;

    try {
      const res = await calendar.events.list({
        calendarId: "primary",
        ...(syncState.syncToken ? { syncToken: syncState.syncToken } : {}),
        showDeleted: true,
      });
      items = res.data.items ?? [];
      newSyncToken = res.data.nextSyncToken ?? null;
    } catch (tokenErr: unknown) {
      const status = (tokenErr as { response?: { status?: number } })?.response?.status;
      if (status === 410) {
        logger.warn("GCal push: sync token expired during notify — full re-sync", { userId });
        const res = await calendar.events.list({ calendarId: "primary", showDeleted: true });
        items = res.data.items ?? [];
        newSyncToken = res.data.nextSyncToken ?? null;
      } else {
        throw tokenErr;
      }
    }

    // Dynamic import avoids circular dep (googleCalendarService imports googleCalendarPushService)
    const { syncLinkedMeetingsFromGooglePush } = await import("./googleCalendarService");
    await syncLinkedMeetingsFromGooglePush(userId, items);

    if (newSyncToken) {
      await prisma.gCalSyncState.update({
        where: { userId },
        data: { syncToken: newSyncToken },
      });
    }

    logger.info("GCal push: notification processed", { channelId, userId, eventCount: items.length });
  } catch (err) {
    logger.warn("GCal push: processIncomingNotification failed — fail-open", {
      channelId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Renews channels expiring within 5 days. Run daily via cron.
 * Fail-open per user — one bad token doesn't block the rest.
 */
export async function renewExpiringChannels(): Promise<number> {
  const threshold = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const expiring = await prisma.gCalSyncState.findMany({
    where: { expiration: { lt: threshold } },
    select: { userId: true },
  });

  let renewed = 0;
  for (const { userId } of expiring) {
    await stopWatchChannel(userId);
    await registerWatchChannel(userId);
    renewed += 1;
  }

  logger.info("GCal push: channel renewal completed", { renewed });
  return renewed;
}
