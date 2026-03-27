import { google } from "googleapis";
import type { Auth } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import { getOAuthClient } from "./googleService";
import { getRedisClient } from "../config/redisClient";
import { logger } from "../utils/logging/logger";
import prisma from "../db/prismaClient";

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 300; // 5 minutes

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
export const CALENDAR_READONLY_SCOPE =
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

// ── Meet link generation ──────────────────────────────────────────────────────

interface MeetLinkResult {
  meetLink: string;
  googleEventId: string;
}

/**
 * Creates a minimal Google Calendar event with conference data to obtain a
 * Google Meet URL. The resulting event ID is stored on the Meeting so that
 * Phase 1.3 P1 (write sync) can update it with the real meeting details.
 *
 * Fail-open: returns null if GCal is not connected, sync is disabled, or the
 * API call fails. Meeting creation is never blocked by Meet link generation.
 *
 * The placeholder calendar event is intentionally left in the user's calendar
 * until Phase 1.3 P1 updates it with the actual meeting title, time, and
 * participants during GCal write sync.
 */
export async function generateMeetLink(
  userId: string,
): Promise<MeetLinkResult | null> {
  try {
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

    const calendar = google.calendar({ version: "v3", auth: client });
    const now = new Date();
    const event = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary: "Meeting",
        start: { dateTime: now.toISOString(), timeZone: "UTC" },
        end: {
          dateTime: new Date(now.getTime() + 3600000).toISOString(),
          timeZone: "UTC",
        },
        conferenceData: {
          createRequest: { requestId: uuidv4() },
        },
      },
    });

    const meetLink =
      event.data.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === "video",
      )?.uri ?? null;
    const googleEventId = event.data.id ?? null;

    if (!meetLink || !googleEventId) return null;

    logger.info("Google Meet link generated", { userId, googleEventId });
    return { meetLink, googleEventId };
  } catch (err) {
    logger.warn("generateMeetLink failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ── Meeting write sync ────────────────────────────────────────────────────────

export interface CreateGCalEventParams {
  title: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  location?: string | null;
  description?: string | null;
  requestMeetLink?: boolean;
}

export interface GCalEventResult {
  googleEventId: string;
  meetLink: string | null;
}

/**
 * Creates a Google Calendar event from a Crelyzor Meeting.
 *
 * When `requestMeetLink` is true, the event is created with conference data
 * (conferenceDataVersion: 1) so Google generates a Meet URL in the same API
 * call, avoiding a separate generateMeetLink round-trip.
 *
 * Returns null on any failure (fail-open — meeting creation is never blocked).
 */
export async function createGCalEventForMeeting(
  userId: string,
  params: CreateGCalEventParams,
): Promise<GCalEventResult | null> {
  try {
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

    const calendar = google.calendar({ version: "v3", auth: client });
    const event = await calendar.events.insert({
      calendarId: "primary",
      ...(params.requestMeetLink ? { conferenceDataVersion: 1 } : {}),
      requestBody: {
        summary: params.title,
        ...(params.description ? { description: params.description } : {}),
        start: {
          dateTime: params.startTime.toISOString(),
          timeZone: params.timezone,
        },
        end: {
          dateTime: params.endTime.toISOString(),
          timeZone: params.timezone,
        },
        ...(params.location ? { location: params.location } : {}),
        ...(params.requestMeetLink
          ? {
              conferenceData: {
                createRequest: { requestId: uuidv4() },
              },
            }
          : {}),
      },
    });

    const googleEventId = event.data.id ?? null;
    if (!googleEventId) return null;

    const meetLink = params.requestMeetLink
      ? (event.data.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === "video",
        )?.uri ?? null)
      : null;

    logger.info("Google Calendar event created for meeting", {
      userId,
      googleEventId,
      hasMeetLink: !!meetLink,
    });
    return { googleEventId, meetLink };
  } catch (err) {
    logger.warn("createGCalEventForMeeting failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export interface UpdateGCalEventParams {
  title?: string;
  startTime?: Date;
  endTime?: Date;
  timezone?: string;
  location?: string | null;
  description?: string | null;
}

/**
 * Patches a Google Calendar event with updated meeting details.
 * Only fields present in `updates` are sent to the API.
 * Fail-open: any failure is logged and swallowed.
 */
export async function updateGCalEventForMeeting(
  userId: string,
  googleEventId: string,
  updates: UpdateGCalEventParams,
): Promise<void> {
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
    await calendar.events.patch({
      calendarId: "primary",
      eventId: googleEventId,
      requestBody: {
        ...(updates.title ? { summary: updates.title } : {}),
        ...(updates.description !== undefined
          ? { description: updates.description ?? "" }
          : {}),
        ...(updates.startTime
          ? {
              start: {
                dateTime: updates.startTime.toISOString(),
                timeZone: updates.timezone ?? "UTC",
              },
            }
          : {}),
        ...(updates.endTime
          ? {
              end: {
                dateTime: updates.endTime.toISOString(),
                timeZone: updates.timezone ?? "UTC",
              },
            }
          : {}),
        ...(updates.location !== undefined
          ? { location: updates.location ?? "" }
          : {}),
      },
    });

    logger.info("Google Calendar event updated", { userId, googleEventId });
  } catch (err) {
    logger.warn("updateGCalEventForMeeting failed — fail-open", {
      userId,
      googleEventId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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

// ── GCal events feed (for dashboard timeline) ─────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  meetLink?: string;
  source: "GOOGLE";
}

// Redis stores JSON — dates come back as strings and need re-hydration
interface CalendarEventRaw {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  meetLink?: string;
  source: "GOOGLE";
}

/**
 * Fetches events from the user's primary Google Calendar for a given window.
 * Only returns timed events (all-day events without dateTime are excluded).
 *
 * Results are cached in Redis for 5 minutes.
 * Fail-open: returns [] if GCal is not connected, sync is disabled, or the
 * API call fails — the dashboard never blocks on calendar availability.
 */
export async function fetchGCalEvents(
  userId: string,
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  const cacheKey = `gcal:events:${userId}:${start.toISOString()}:${end.toISOString()}`;

  try {
    const redis = getRedisClient();

    const cached = await redis.get<CalendarEventRaw[]>(cacheKey);
    if (cached) {
      return cached.map((e) => ({
        ...e,
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime),
      }));
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarSyncEnabled: true, googleCalendarEmail: true },
    });
    if (!settings?.googleCalendarSyncEnabled || !settings.googleCalendarEmail) {
      return [];
    }

    const { client } = await getAuthedCalendarClient(
      userId,
      false /* read scope sufficient */,
    );

    const calendar = google.calendar({ version: "v3", auth: client });
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events: CalendarEvent[] = (res.data.items ?? [])
      .filter((e) => e.id && e.start?.dateTime && e.end?.dateTime)
      .map((e) => ({
        id: e.id!,
        title: e.summary ?? "",
        startTime: new Date(e.start!.dateTime!),
        endTime: new Date(e.end!.dateTime!),
        ...(e.location ? { location: e.location } : {}),
        ...(e.hangoutLink ? { meetLink: e.hangoutLink } : {}),
        source: "GOOGLE" as const,
      }));

    await redis.set(cacheKey, events, { ex: CACHE_TTL_SECONDS });
    return events;
  } catch (err) {
    logger.warn("fetchGCalEvents failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ── GCal connection status ────────────────────────────────────────────────────

export interface GCalConnectionStatus {
  connected: boolean;
  email: string | null;
  syncEnabled: boolean;
}

/**
 * Returns whether the user has Google Calendar connected and sync enabled.
 * `connected` is true only when the user has both a valid Google OAuth account
 * with calendar scope AND a googleCalendarEmail stored in their settings.
 */
export async function getGCalConnectionStatus(
  userId: string,
): Promise<GCalConnectionStatus> {
  const [oauthAccount, settings] = await Promise.all([
    prisma.oAuthAccount.findFirst({
      where: { userId, provider: "GOOGLE" },
      select: { scopes: true },
    }),
    prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarEmail: true, googleCalendarSyncEnabled: true },
    }),
  ]);

  const hasCalendarScope =
    oauthAccount?.scopes.some(
      (s) => s === CALENDAR_SCOPE || s === CALENDAR_READONLY_SCOPE,
    ) ?? false;

  return {
    connected: hasCalendarScope && !!settings?.googleCalendarEmail,
    email: settings?.googleCalendarEmail ?? null,
    syncEnabled: settings?.googleCalendarSyncEnabled ?? false,
  };
}
