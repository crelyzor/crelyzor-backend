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
export const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
const GOOGLE_TASK_REF_PREFIX = "gtask:";

function hasCalendarWriteScope(scopes: string[] | undefined): boolean {
  return scopes?.includes(CALENDAR_SCOPE) ?? false;
}

export function isGoogleTaskRef(value: string | null | undefined): boolean {
  return !!value && value.startsWith(GOOGLE_TASK_REF_PREFIX);
}

export function extractGoogleTaskId(
  value: string | null | undefined,
): string | null {
  if (!isGoogleTaskRef(value)) return null;
  return value!.slice(GOOGLE_TASK_REF_PREFIX.length);
}

function toGoogleTaskRef(taskId: string): string {
  return `${GOOGLE_TASK_REF_PREFIX}${taskId}`;
}

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
export async function getAuthedCalendarClient(
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

async function hasGoogleTasksScope(userId: string): Promise<boolean> {
  const oauthAccount = await prisma.oAuthAccount.findFirst({
    where: { userId, provider: "GOOGLE" },
    select: { scopes: true },
  });

  return oauthAccount?.scopes.includes(TASKS_SCOPE) ?? false;
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
  attendees?: Array<{ email: string; displayName?: string }>;
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
        ...(params.attendees && params.attendees.length > 0
          ? { attendees: params.attendees }
          : {}),
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

export interface InsertCalendarEventResult {
  googleEventId: string;
  meetLink: string | null;
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
): Promise<InsertCalendarEventResult | null> {
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

    const shouldAutoGenerateMeet =
      params.locationType === "ONLINE" && !params.meetingLink;

    const calendar = google.calendar({ version: "v3", auth: client });
    const event = await calendar.events.insert({
      calendarId: "primary",
      ...(shouldAutoGenerateMeet ? { conferenceDataVersion: 1 } : {}),
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
        ...(shouldAutoGenerateMeet
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

    const meetLink = shouldAutoGenerateMeet
      ? (event.data.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === "video",
        )?.uri ?? event.data.hangoutLink ?? null)
      : null;

    logger.info("Google Calendar event created", {
      userId,
      bookingId: params.bookingId,
      googleEventId,
      hasMeetLink: !!meetLink,
    });
    return { googleEventId, meetLink };
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

// ── Task block (GCal time-block for tasks) ───────────────────────────────────

export interface CreateTaskBlockParams {
  title: string;
  scheduledTime: Date;
  durationMinutes: number;
}

/**
 * Creates a Google Calendar time-block event for a scheduled task.
 *
 * Returns the Google Calendar event ID to store on the Task row,
 * or null on any failure (fail-open — the task update is never blocked).
 *
 * Requires full calendar write scope.
 */
export async function createTaskBlock(
  userId: string,
  params: CreateTaskBlockParams,
): Promise<string | null> {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarSyncEnabled: true, googleCalendarEmail: true },
    });
    if (!settings?.googleCalendarSyncEnabled || !settings.googleCalendarEmail) {
      return null;
    }

    const { client } = await getAuthedCalendarClient(userId, true);

    const endTime = new Date(
      params.scheduledTime.getTime() + params.durationMinutes * 60_000,
    );

    const calendar = google.calendar({ version: "v3", auth: client });
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: params.title,
        start: { dateTime: params.scheduledTime.toISOString(), timeZone: "UTC" },
        end: { dateTime: endTime.toISOString(), timeZone: "UTC" },
      },
    });

    const eventId = event.data.id ?? null;
    logger.info("GCal task block created", { userId, eventId });
    return eventId;
  } catch (err) {
    logger.warn("createTaskBlock failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export interface CreateGoogleTaskParams {
  title: string;
  dueDate: Date;
  notes?: string | null;
}

/**
 * Creates a Google Task in the user's default task list for due-date tasks.
 * Returns a prefixed task ref (gtask:<id>) or null on failure.
 */
export async function createGoogleTask(
  userId: string,
  params: CreateGoogleTaskParams,
): Promise<string | null> {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarSyncEnabled: true, googleCalendarEmail: true },
    });
    if (!settings?.googleCalendarSyncEnabled || !settings.googleCalendarEmail) {
      return null;
    }

    const hasTasksScope = await hasGoogleTasksScope(userId);
    if (!hasTasksScope) {
      return null;
    }

    const { client } = await getAuthedCalendarClient(userId, true);
    const tasks = google.tasks({ version: "v1", auth: client });

    const created = await tasks.tasks.insert({
      tasklist: "@default",
      requestBody: {
        title: params.title,
        due: params.dueDate.toISOString(),
        ...(params.notes ? { notes: params.notes } : {}),
      },
    });

    const taskId = created.data.id ?? null;
    if (!taskId) return null;

    const ref = toGoogleTaskRef(taskId);
    logger.info("Google Task created", { userId, taskId });
    return ref;
  } catch (err) {
    logger.warn("createGoogleTask failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function updateGoogleTask(
  userId: string,
  googleTaskRef: string | null | undefined,
  params: CreateGoogleTaskParams,
): Promise<void> {
  const taskId = extractGoogleTaskId(googleTaskRef);
  if (!taskId) return;

  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarSyncEnabled: true, googleCalendarEmail: true },
    });
    if (!settings?.googleCalendarSyncEnabled || !settings.googleCalendarEmail) {
      return;
    }

    const hasTasksScope = await hasGoogleTasksScope(userId);
    if (!hasTasksScope) {
      return;
    }

    const { client } = await getAuthedCalendarClient(userId, true);
    const tasks = google.tasks({ version: "v1", auth: client });

    await tasks.tasks.patch({
      tasklist: "@default",
      task: taskId,
      requestBody: {
        title: params.title,
        due: params.dueDate.toISOString(),
        ...(params.notes ? { notes: params.notes } : {}),
      },
    });

    logger.info("Google Task updated", { userId, taskId });
  } catch (err) {
    logger.warn("updateGoogleTask failed — fail-open", {
      userId,
      taskId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deleteGoogleTask(
  userId: string,
  googleTaskRef: string | null | undefined,
): Promise<void> {
  const taskId = extractGoogleTaskId(googleTaskRef);
  if (!taskId) return;

  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarSyncEnabled: true, googleCalendarEmail: true },
    });
    if (!settings?.googleCalendarSyncEnabled || !settings.googleCalendarEmail) {
      return;
    }

    const hasTasksScope = await hasGoogleTasksScope(userId);
    if (!hasTasksScope) {
      return;
    }

    const { client } = await getAuthedCalendarClient(userId, true);
    const tasks = google.tasks({ version: "v1", auth: client });

    await tasks.tasks.delete({
      tasklist: "@default",
      task: taskId,
    });

    logger.info("Google Task deleted", { userId, taskId });
  } catch (err) {
    logger.warn("deleteGoogleTask failed — fail-open", {
      userId,
      taskId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Backfills existing Crelyzor meetings and tasks into Google Calendar.
 *
 * This is idempotent because it only processes rows without googleEventId.
 * It is used when Google sync is enabled or when the connection status is
 * checked, so users don't need to edit each item manually to backfill.
 */
export async function backfillGoogleCalendarWrites(userId: string): Promise<void> {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarSyncEnabled: true, googleCalendarEmail: true },
    });

    if (!settings?.googleCalendarSyncEnabled || !settings.googleCalendarEmail) {
      return;
    }

    const meetings = await prisma.meeting.findMany({
      where: {
        createdById: userId,
        isDeleted: false,
        type: "SCHEDULED",
        status: { not: "CANCELLED" },
        googleEventId: null,
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        timezone: true,
        location: true,
        description: true,
        participants: {
          select: {
            userId: true,
            guestEmail: true,
            user: { select: { email: true, name: true } },
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    const tasks = await prisma.task.findMany({
      where: {
        userId,
        isDeleted: false,
        googleEventId: null,
        OR: [
          { scheduledTime: { not: null } },
          { scheduledTime: null, dueDate: { not: null } },
        ],
      },
      select: {
        id: true,
        title: true,
        scheduledTime: true,
        dueDate: true,
        description: true,
        durationMinutes: true,
      },
      orderBy: { scheduledTime: "asc" },
    });

    let meetingCount = 0;
    for (const meeting of meetings) {
      const gcalResult = await createGCalEventForMeeting(userId, {
        title: meeting.title,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        timezone: meeting.timezone,
        location: meeting.location,
        description: meeting.description,
        attendees: meeting.participants
          .filter((participant) => participant.userId !== userId)
          .map((participant) => {
            if (participant.guestEmail) {
              return { email: participant.guestEmail };
            }
            if (participant.user?.email) {
              return {
                email: participant.user.email,
                displayName: participant.user?.name,
              };
            }
            return null;
          })
          .filter((attendee) => attendee !== null && !!attendee.email) as Array<{
          email: string;
          displayName?: string;
        }>,
        requestMeetLink: true,
      });

      if (!gcalResult) continue;

      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          googleEventId: gcalResult.googleEventId,
          ...(gcalResult.meetLink ? { meetLink: gcalResult.meetLink } : {}),
        },
      });
      meetingCount += 1;
    }

    let taskCount = 0;
    for (const task of tasks) {
      if (task.scheduledTime) {
        const eventId = await createTaskBlock(userId, {
          title: task.title,
          scheduledTime: task.scheduledTime,
          durationMinutes: task.durationMinutes ?? 30,
        });

        if (!eventId) continue;

        await prisma.task.update({
          where: { id: task.id },
          data: { googleEventId: eventId },
        });
        taskCount += 1;
        continue;
      }

      if (task.dueDate) {
        const taskRef = await createGoogleTask(userId, {
          title: task.title,
          dueDate: task.dueDate,
          notes: task.description,
        });

        if (!taskRef) continue;

        await prisma.task.update({
          where: { id: task.id },
          data: { googleEventId: taskRef },
        });
        taskCount += 1;
      }
    }

    if (meetingCount > 0 || taskCount > 0) {
      logger.info("Google Calendar backfill completed", {
        userId,
        meetingCount,
        taskCount,
      });
    }
  } catch (err) {
    logger.warn("Google Calendar backfill failed — fail-open", {
      userId,
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

function normalizeNullableString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Pull-sync inbound Google changes for meetings that are linked via googleEventId.
 *
 * Two-way sync contract:
 * - Crelyzor writes update Google Calendar immediately (existing behavior).
 * - On every timeline fetch, we also ingest Google-side edits/cancellations for
 *   the same linked events so external calendar edits are reflected in Crelyzor.
 *
 * This is intentionally fail-open and best-effort:
 * failures are logged, never thrown, and never block calendar loading.
 */
async function syncLinkedMeetingsFromGoogle(
  userId: string,
  items: Array<import("googleapis").calendar_v3.Schema$Event>,
): Promise<void> {
  try {
    const activeById = new Map<string, import("googleapis").calendar_v3.Schema$Event>();
    const cancelledIds = new Set<string>();

    for (const item of items) {
      if (!item.id) continue;

      if (item.status === "cancelled") {
        cancelledIds.add(item.id);
        continue;
      }

      if (!item.start?.dateTime || !item.end?.dateTime) continue;
      activeById.set(item.id, item);
    }

    const relevantIds = [...new Set([...activeById.keys(), ...cancelledIds])];
    if (relevantIds.length === 0) return;

    const linkedMeetings = await prisma.meeting.findMany({
      where: {
        createdById: userId,
        isDeleted: false,
        type: { not: "VOICE_NOTE" },
        googleEventId: { in: relevantIds },
      },
      select: {
        id: true,
        googleEventId: true,
        title: true,
        startTime: true,
        endTime: true,
        location: true,
        meetLink: true,
        status: true,
      },
    });

    if (linkedMeetings.length === 0) return;

    let updatedCount = 0;
    let cancelledCount = 0;

    await Promise.all(
      linkedMeetings.map(async (meeting) => {
        const eventId = meeting.googleEventId;
        if (!eventId) return;

        if (cancelledIds.has(eventId)) {
          if (meeting.status !== "CANCELLED") {
            await prisma.meeting.update({
              where: { id: meeting.id },
              data: { status: "CANCELLED" },
            });
            cancelledCount += 1;
          }
          return;
        }

        const event = activeById.get(eventId);
        if (!event) return;

        const data: {
          title?: string;
          startTime?: Date;
          endTime?: Date;
          location?: string | null;
          meetLink?: string | null;
          status?: "CREATED";
        } = {};

        const nextTitle = normalizeNullableString(event.summary);
        if (nextTitle && nextTitle !== meeting.title) {
          data.title = nextTitle;
        }

        if (event.start?.dateTime) {
          const nextStart = new Date(event.start.dateTime);
          if (nextStart.getTime() !== meeting.startTime.getTime()) {
            data.startTime = nextStart;
          }
        }

        if (event.end?.dateTime) {
          const nextEnd = new Date(event.end.dateTime);
          if (nextEnd.getTime() !== meeting.endTime.getTime()) {
            data.endTime = nextEnd;
          }
        }

        const nextLocation = normalizeNullableString(event.location);
        const currentLocation = normalizeNullableString(meeting.location);
        if (nextLocation !== currentLocation) {
          data.location = nextLocation;
        }

        const nextMeetLink = normalizeNullableString(
          event.hangoutLink ??
            event.conferenceData?.entryPoints?.find(
              (entry) => entry.entryPointType === "video",
            )?.uri,
        );
        const currentMeetLink = normalizeNullableString(meeting.meetLink);
        if (nextMeetLink !== currentMeetLink) {
          data.meetLink = nextMeetLink;
        }

        if (meeting.status === "CANCELLED") {
          data.status = "CREATED";
        }

        if (Object.keys(data).length === 0) return;

        await prisma.meeting.update({
          where: { id: meeting.id },
          data,
        });
        updatedCount += 1;
      }),
    );

    if (updatedCount > 0 || cancelledCount > 0) {
      logger.info("Inbound Google Calendar sync applied", {
        userId,
        updatedCount,
        cancelledCount,
      });
    }
  } catch (err) {
    logger.warn("Inbound Google Calendar sync failed — fail-open", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
      showDeleted: true,
    });

    // Two-way pull-sync: ingest Google-side edits/cancellations for linked meetings.
    await syncLinkedMeetingsFromGoogle(userId, res.data.items ?? []);

    const events: CalendarEvent[] = (res.data.items ?? [])
      .filter((e) => e.id && e.status !== "cancelled" && e.start?.dateTime && e.end?.dateTime)
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
  writable: boolean;
  email: string | null;
  syncEnabled: boolean;
  pushEnabled: boolean;  // Phase 4.3: true when a valid push watch channel is registered
}

/**
 * Returns whether the user has Google Calendar connected and sync enabled.
 * `connected` is true only when the user has both a valid Google OAuth account
 * with calendar scope AND a googleCalendarEmail stored in their settings.
 */
export async function getGCalConnectionStatus(
  userId: string,
): Promise<GCalConnectionStatus> {
  const [oauthAccount, settings, gcalSyncState] = await Promise.all([
    prisma.oAuthAccount.findFirst({
      where: { userId, provider: "GOOGLE" },
      select: { scopes: true },
    }),
    prisma.userSettings.findUnique({
      where: { userId },
      select: { googleCalendarEmail: true, googleCalendarSyncEnabled: true },
    }),
    prisma.gCalSyncState.findUnique({
      where: { userId },
      select: { expiration: true },
    }),
  ]);

  const hasCalendarScope =
    oauthAccount?.scopes.some(
      (s) => s === CALENDAR_SCOPE || s === CALENDAR_READONLY_SCOPE,
    ) ?? false;
  const writable = hasCalendarWriteScope(oauthAccount?.scopes);

  const pushEnabled = !!gcalSyncState && gcalSyncState.expiration > new Date();

  const status = {
    connected: hasCalendarScope && !!settings?.googleCalendarEmail,
    writable,
    email: settings?.googleCalendarEmail ?? null,
    syncEnabled: settings?.googleCalendarSyncEnabled ?? false,
    pushEnabled,
  };

  if (status.connected && status.syncEnabled && status.writable) {
    await backfillGoogleCalendarWrites(userId);
  }

  return status;
}

/**
 * Removes Google Calendar access from the user's account:
 * - Strips calendar scopes from their OAuthAccount
 * - Clears googleCalendarEmail and disables sync in UserSettings
 *
 * Does NOT revoke the Google OAuth token — the user can revoke via Google account settings.
 * Existing meetings with googleEventId retain the field; GCal sync simply stops (fail-open).
 */
export async function disconnectGCalendar(userId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.userSettings.updateMany({
        where: { userId },
        data: { googleCalendarEmail: null, googleCalendarSyncEnabled: false },
      });

      const oauthAccount = await tx.oAuthAccount.findFirst({
        where: { userId, provider: "GOOGLE" },
        select: { id: true, scopes: true },
      });

      if (oauthAccount) {
        await tx.oAuthAccount.update({
          where: { id: oauthAccount.id },
          data: {
            scopes: oauthAccount.scopes.filter(
              (s) =>
                s !== CALENDAR_SCOPE &&
                s !== CALENDAR_READONLY_SCOPE &&
                s !== TASKS_SCOPE,
            ),
          },
        });
      }
    },
    { timeout: 15000 },
  );

  logger.info("Google Calendar disconnected", { userId });
}

/**
 * Public alias for use by googleCalendarPushService (Phase 4.3).
 * Passes push-received changed events through the same inbound sync logic.
 */
export { syncLinkedMeetingsFromGoogle as syncLinkedMeetingsFromGooglePush };
