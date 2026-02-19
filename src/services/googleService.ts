import { google, calendar_v3 } from "googleapis";
import prisma from "../db/prismaClient";

const LOGIN_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.file", // For selecting files from Google Drive
];

function getOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri || process.env.GOOGLE_LOGIN_REDIRECT_URI!,
  );
}

export const googleService = {
  // 🔹 1. Google Sign-In
  getLoginUrl(redirectUrl: string) {
    const redirectUri = `${process.env.BASE_URL}/auth/google/login/callback`;
    console.log("Google Login Redirect URI:", redirectUri);
    const client = getOAuthClient(redirectUri);
    console.log("Generated Google OAuth Client:", client);
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: LOGIN_SCOPES,
      state: JSON.stringify({ redirectUrl }),
    });
  },

  async handleLoginCallback(code: string) {
    const redirectUri = `${process.env.BASE_URL}/auth/google/login/callback`;
    const client = getOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    const { data } = await oauth2.userinfo.get();

    if (!data.email || !data.id)
      throw new Error("Failed to fetch Google user info");

    return {
      email: data.email,
      name: data.name || "",
      picture: data.picture || "",
      googleId: data.id,
      tokens, // 👈 add tokens here for later DB storage
    };
  },

  // 🔹 2. Google Calendar OAuth
  async getCalendarAuthUrl(userId: string, redirectUrl: string) {
    const redirectUri = `${process.env.BASE_URL}/integrations/calendar/connect/callback`;
    const client = getOAuthClient(redirectUri);
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: CALENDAR_SCOPES,
      state: JSON.stringify({ userId, redirectUrl }),
    });
  },

  async handleCalendarOAuthCallback(userId: string, code: string) {
    const redirectUri = `${process.env.BASE_URL}/integrations/calendar/connect/callback`;
    const client = getOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    console.log("Google OAuth tokens obtained:", tokens);

    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    const { data } = await oauth2.userinfo.get();

    if (!data.id) throw new Error("Missing Google account ID");

    await prisma.oAuthAccount.upsert({
      where: {
        provider_providerId: {
          provider: "GOOGLE",
          providerId: data.id,
        },
      },
      update: {
        accessToken: tokens.access_token ?? "",
        refreshToken: tokens.refresh_token ?? "",
        expiry: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : 0,
        scopes: tokens.scope?.split(" ") ?? CALENDAR_SCOPES,
        userId,
      },
      create: {
        provider: "GOOGLE",
        providerId: data.id,
        accessToken: tokens.access_token ?? "",
        refreshToken: tokens.refresh_token ?? "",
        expiry: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : 0,
        scopes: tokens.scope?.split(" ") ?? CALENDAR_SCOPES,
        userId,
      },
    });
  },

  // 🔹 3. Authenticated Google Client
  async getAuthorizedClient(userId: string) {
    const account = await prisma.oAuthAccount.findFirst({
      where: { userId, provider: "GOOGLE" },
    });

    if (!account)
      throw Object.assign(new Error("Missing Google OAuth account"), {
        code: "NO_GOOGLE_PERMISSION",
      });

    const client = getOAuthClient();
    client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
      expiry_date: account.expiry ? account.expiry * 1000 : undefined,
    });

    const expiryDate = account.expiry ? account.expiry * 1000 : 0;
    if (Date.now() > expiryDate - 60_000 && account.refreshToken) {
      try {
        const refreshed = await client.refreshAccessToken();
        const newTokens = refreshed.credentials;
        await prisma.oAuthAccount.update({
          where: { id: account.id },
          data: {
            accessToken: newTokens.access_token ?? account.accessToken,
            refreshToken: newTokens.refresh_token ?? account.refreshToken,
            expiry: newTokens.expiry_date
              ? Math.floor(newTokens.expiry_date / 1000)
              : account.expiry,
          },
        });
        client.setCredentials(newTokens);
      } catch {
        throw Object.assign(new Error("Google token refresh failed"), {
          code: "NO_GOOGLE_PERMISSION",
        });
      }
    }

    return client;
  },

  // 🔹 4. Calendar Operations (Manual CRUD)
  async listEvents(userId: string) {
    const client = await this.getAuthorizedClient(userId);
    const calendar = google.calendar({
      version: "v3",
      auth: client,
    }) as calendar_v3.Calendar;

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: "startTime",
    });

    return res.data.items ?? [];
  },

  async createEvent(userId: string, body: any) {
    const client = await this.getAuthorizedClient(userId);
    const calendar = google.calendar({
      version: "v3",
      auth: client,
    }) as calendar_v3.Calendar;

    const event: calendar_v3.Schema$Event = {
      summary: body.summary,
      description: body.description,
      start: { dateTime: body.start },
      end: { dateTime: body.end },
      conferenceData: body.conferenceData,
      attendees: body.attendees, // Add attendees as guests
    };

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      conferenceDataVersion: body.conferenceData ? 1 : 0,
    });

    return res.data;
  },

  async deleteEvent(userId: string, eventId: string) {
    const client = await this.getAuthorizedClient(userId);
    const calendar = google.calendar({
      version: "v3",
      auth: client,
    }) as calendar_v3.Calendar;
    await calendar.events.delete({ calendarId: "primary", eventId });
  },

  async updateEvent(userId: string, eventId: string, updates: any) {
    const client = await this.getAuthorizedClient(userId);
    const calendar = google.calendar({
      version: "v3",
      auth: client,
    }) as calendar_v3.Calendar;

    // Get existing event first
    const existing = await calendar.events.get({
      calendarId: "primary",
      eventId,
    });

    const event: calendar_v3.Schema$Event = {
      ...existing.data,
      summary: updates.summary ?? existing.data.summary,
      description: updates.description ?? existing.data.description,
      start: updates.start ?? existing.data.start,
      end: updates.end ?? existing.data.end,
      conferenceData: updates.conferenceData ?? existing.data.conferenceData,
    };

    const res = await calendar.events.update({
      calendarId: "primary",
      eventId,
      requestBody: event,
      conferenceDataVersion: updates.conferenceData ? 1 : 0,
    });

    return res.data;
  },

  // 🔹 5. Check Scopes Status
  async checkScopesStatus(userId: string): Promise<{
    hasAuth: boolean;
    hasCalendar: boolean;
    hasDrive: boolean;
  }> {
    const account = await prisma.oAuthAccount.findFirst({
      where: { userId, provider: "GOOGLE" },
      select: { scopes: true },
    });

    if (!account) {
      return {
        hasAuth: false,
        hasCalendar: false,
        hasDrive: false,
      };
    }

    const grantedScopes = account.scopes || [];

    // Check for auth scopes (email and profile)
    const hasAuth =
      grantedScopes.includes(
        "https://www.googleapis.com/auth/userinfo.email",
      ) &&
      grantedScopes.includes(
        "https://www.googleapis.com/auth/userinfo.profile",
      );

    // Check for calendar scope
    const hasCalendar = grantedScopes.includes(
      "https://www.googleapis.com/auth/calendar",
    );

    // Check for drive scope
    const hasDrive = grantedScopes.includes(
      "https://www.googleapis.com/auth/drive.file",
    );

    return {
      hasAuth,
      hasCalendar,
      hasDrive,
    };
  },
};
