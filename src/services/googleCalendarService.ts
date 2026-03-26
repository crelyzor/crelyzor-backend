import { google } from "googleapis";
import type { Auth } from "googleapis";
import { getOAuthClient } from "./googleService";
import { getRedisClient } from "../config/redisClient";
import { logger } from "../utils/logging/logger";
import prisma from "../db/prismaClient";

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 300; // 5 minutes

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

// ── Shared OAuth client helper ────────────────────────────────────────────────

interface AuthedCalendarClient {
  client: Auth.OAuth2Client;
  providerId: string;
}

/**
 * Builds an authenticated Google OAuth2 client for the given user.
 * Refreshes the access token if it is expired (60s buffer).
 *
 * @param requireWriteScope - When true, accepts only the full `calendar` scope.
 *   When false (default), also accepts `calendar.readonly`.
 *
 * @throws if the OAuthAccount is missing, lacks the required scope, or if the
 *   token refresh fails. Callers are responsible for fail-open handling.
 *
 * NOTE: Token refresh is not race-safe under concurrent requests (two parallel
 * calls may both detect expiry and refresh simultaneously). Last-write-wins on
 * the DB update; Google ignores duplicate refreshes. Acceptable for MVP.
 */
async function getAuthedCalendarClient(
  userId: string,
  requireWriteScope: boolean,
): Promise<AuthedCalendarClient> {
  const oauthAccount = await prisma.oAuthAccount.findFirst({
    where: { userId, provider: "GOOGLE" },
    select: {
      providerId: true,
      accessToken: true,
      refreshToken: true,
      expiry: true,
      scopes: true,
    },
  });

  if (!oauthAccount) throw new Error("No Google OAuth account found");

  const hasScope = requireWriteScope
    ? oauthAccount.scopes.includes(CALENDAR_SCOPE)
    : oauthAccount.scopes.includes(CALENDAR_SCOPE) ||
      oauthAccount.scopes.includes(CALENDAR_READONLY_SCOPE);

  if (!hasScope) {
    throw new Error(
      requireWriteScope
        ? "Google Calendar write scope not granted"
        : "Google Calendar scope not granted",
    );
  }

  const client = getOAuthClient(
    `${process.env.BASE_URL}/auth/google/calendar/connect/callback`,
  );
  client.setCredentials({
    access_token: oauthAccount.accessToken,
    refresh_token: oauthAccount.refreshToken || undefined,
    expiry_date: oauthAccount.expiry ? oauthAccount.expiry * 1000 : undefined,
  });

  const isExpired = oauthAccount.expiry
    ? oauthAccount.expiry * 1000 < Date.now() + 60_000
    : false;

  if (isExpired && oauthAccount.refreshToken) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);

    await prisma.oAuthAccount.update({
      where: {
        provider_providerId: {
          provider: "GOOGLE",
          providerId: oauthAccount.providerId,
        },
      },
      data: {
        accessToken: credentials.access_token ?? oauthAccount.accessToken,
        ...(credentials.refresh_token
          ? { refreshToken: credentials.refresh_token }
          : {}),
        expiry: credentials.expiry_date
          ? Math.floor(credentials.expiry_date / 1000)
          : oauthAccount.expiry,
      },
    });
  }

  return { client, providerId: oauthAccount.providerId };
}

// ── Read sync ─────────────────────────────────────────────────────────────────

interface BusyInterval {
  startTime: Date;
  endTime: Date;
}

// Stored as ISO strings in Redis JSON; re-hydrated to Date on read
interface BusyIntervalRaw {
  startTime: string;
  endTime: string;
}

/**
 * Fetches Google Calendar busy intervals for a user's availability window.
 *
 * Fail-open: any error (missing token, API failure, Redis error) returns []
 * so slot generation is never blocked by Google Calendar issues.
 *
 * Results are cached in Redis for 5 minutes, keyed by userId + window bounds.
 */
export async function getCalendarBusyIntervals(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<BusyInterval[]> {
  const cacheKey = `gcal:busy:${userId}:${windowStart.toISOString()}:${windowEnd.toISOString()}`;

  try {
    const redis = getRedisClient();

    // Check cache — Upstash deserializes JSON natively; dates come back as strings
    const cached = await redis.get<BusyIntervalRaw[]>(cacheKey);
    if (cached) {
      return cached.map((b) => ({
        startTime: new Date(b.startTime),
        endTime: new Date(b.endTime),
      }));
    }

    const { client } = await getAuthedCalendarClient(
      userId,
      false /* read scope sufficient */,
    );

    const calendar = google.calendar({ version: "v3", auth: client });
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: windowStart.toISOString(),
        timeMax: windowEnd.toISOString(),
        items: [{ id: "primary" }],
      },
    });

    const busy = res.data.calendars?.["primary"]?.busy ?? [];
    const intervals: BusyInterval[] = busy
      .filter((b) => b.start && b.end)
      .map((b) => ({
        startTime: new Date(b.start!),
        endTime: new Date(b.end!),
      }));

    // Cache the result (Upstash serializes Date → ISO string automatically)
    await redis.set(cacheKey, intervals, { ex: CACHE_TTL_SECONDS });

    return intervals;
  } catch (err) {
    logger.warn("Google Calendar freebusy fetch failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ── Write sync ────────────────────────────────────────────────────────────────

export interface InsertCalendarEventParams {
  bookingId: string;
  startTime: Date;
  endTime: Date;
  guestTimezone: string;
  guestName: string;
  guestEmail: string;
  guestNote?: string | null;
  eventTypeTitle: string;
  locationType: string;
  meetingLink?: string | null;
  hostName: string | null;
}

/**
 * Inserts a Google Calendar event on the host's primary calendar for a
 * confirmed booking. The guest is added as an attendee.
 *
 * Returns the Google Calendar event ID to store on the Booking row,
 * or null on any failure (fail-open — the booking is already confirmed).
 *
 * Requires full calendar write scope (`calendar`, not `calendar.readonly`).
 */
export async function insertCalendarEvent(
  userId: string,
  params: InsertCalendarEventParams,
): Promise<string | null> {
  try {
    // Guard: only run when sync is explicitly enabled and an account is connected
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarSyncEnabled: true, googleCalendarEmail: true },
    });
    if (!settings?.googleCalendarSyncEnabled || !settings.googleCalendarEmail) {
      return null;
    }

    const { client } = await getAuthedCalendarClient(
      userId,
      true /* write scope required */,
    );

    // Structured plain-text description — guest note isolated with a label
    // so the host can visually distinguish system content from user-supplied text.
    const descriptionParts = [
      `Event: ${params.eventTypeTitle}`,
      `Guest: ${params.guestName} <${params.guestEmail}>`,
    ];
    if (params.guestNote) {
      descriptionParts.push("", "Guest note:", params.guestNote);
    }
    const description = descriptionParts.join("\n");

    const calendar = google.calendar({ version: "v3", auth: client });
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `${params.eventTypeTitle} with ${params.guestName}`,
        description,
        start: {
          dateTime: params.startTime.toISOString(),
          timeZone: "UTC",
        },
        end: {
          dateTime: params.endTime.toISOString(),
          timeZone: "UTC",
        },
        attendees: [
          { email: params.guestEmail, displayName: params.guestName },
        ],
        // Only set location for ONLINE events; omit entirely for IN_PERSON/PHONE
        ...(params.locationType === "ONLINE" && params.meetingLink
          ? { location: params.meetingLink }
          : {}),
      },
    });

    const eventId = event.data.id ?? null;
    logger.info("Google Calendar event created", { userId, bookingId: params.bookingId, eventId });
    return eventId;
  } catch (err) {
    logger.warn("Google Calendar event insert failed — fail-open", {
      userId,
      bookingId: params.bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Deletes a Google Calendar event when a booking is cancelled.
 *
 * Fail-open: any failure is logged and swallowed — the booking cancellation
 * has already been committed to the DB and must not be reversed.
 *
 * @param googleEventId - Fetched from the DB; never accepted from caller input.
 */
export async function deleteCalendarEvent(
  userId: string,
  googleEventId: string | null | undefined,
): Promise<void> {
  // Guard: no event to delete
  if (!googleEventId) return;

  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarSyncEnabled: true },
    });
    if (!settings?.googleCalendarSyncEnabled) return;

    const { client } = await getAuthedCalendarClient(
      userId,
      true /* write scope required */,
    );

    const calendar = google.calendar({ version: "v3", auth: client });
    await calendar.events.delete({
      calendarId: "primary",
      eventId: googleEventId,
    });

    logger.info("Google Calendar event deleted", { userId, googleEventId });
  } catch (err) {
    logger.warn("Google Calendar event delete failed — fail-open", {
      userId,
      googleEventId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
