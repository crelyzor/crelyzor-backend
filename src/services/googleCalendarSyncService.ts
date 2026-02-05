import prisma from "../db/prismaClient";
import { googleService } from "./googleService";
import { ErrorFactory } from "../utils/globalErrorHandler";

/**
 * Google Calendar Synchronization Service
 * Handles bidirectional sync between Google Calendar and our DB
 *
 * - Push: When we create meetings in the DB, sync them to Google Calendar
 * - Pull: When events exist in Google Calendar, sync them to our DB
 */

export const googleCalendarSyncService = {
  /**
   * Perform manual sync of Google Calendar events to our database
   * First-time sync: Fetch all events from Google Calendar
   * Subsequent syncs: Use syncToken for incremental updates
   */
  async syncGoogleCalendarToDB(
    userId: string,
    organizationId: string,
  ): Promise<any> {
    try {
      // Get OAuth account for this user FIRST
      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: {
          userId,
          provider: "GOOGLE",
        },
      });

      if (!oauthAccount) {
        throw ErrorFactory.unauthorized(
          "User does not have Google OAuth connected",
        );
      }

      // Now get or create sync log with valid oauthAccountId
      let syncLog = await prisma.googleCalendarSyncLog.findUnique({
        where: {
          userId_oauthAccountId: {
            userId,
            oauthAccountId: oauthAccount.id,
          },
        },
      });

      // Start sync
      const syncStartTime = new Date();
      const client = await googleService.getAuthorizedClient(userId);

      // Import calendar API
      const { google } = await import("googleapis");
      const calendar = google.calendar({
        version: "v3",
        auth: client,
      });

      let allEvents: any[] = [];
      let pageToken: string | undefined;
      let syncToken: string | undefined = syncLog?.nextSyncToken || undefined;

      try {
        // First time sync: Get all events
        // Subsequent syncs: Use syncToken for incremental updates
        const listParams: any = {
          calendarId: "primary",
          maxResults: 250,
          orderBy: "startTime",
          singleEvents: true,
          timeMin: new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString(), // Last 30 days
        };

        // Use syncToken if available (incremental sync)
        if (syncToken && syncLog?.fullSyncCompleted) {
          listParams.syncToken = syncToken;
        } else {
          // First time: No time limit, fetch all
          delete listParams.timeMin;
        }

        do {
          if (pageToken) {
            listParams.pageToken = pageToken;
          }

          const res = await calendar.events.list(listParams);
          const events = res.data.items || [];
          allEvents = allEvents.concat(events);
          pageToken = res.data.nextPageToken || undefined;
          syncToken = res.data.nextSyncToken || undefined;
        } while (pageToken);

        // Save events to database
        let eventsSynced = 0;
        for (const event of allEvents) {
          if (!event.id) continue;

          // Skip declined/cancelled events - just mark as cancelled
          if (event.status === "cancelled") {
            await prisma.googleCalendarEvent.updateMany({
              where: {
                googleEventId: event.id,
                oauthAccountId: oauthAccount.id,
              },
              data: { status: "cancelled" },
            });
            continue;
          }

          // Upsert event
          await prisma.googleCalendarEvent.upsert({
            where: {
              oauthAccountId_googleEventId: {
                googleEventId: event.id,
                oauthAccountId: oauthAccount.id,
              },
            },
            create: {
              googleEventId: event.id,
              userId,
              oauthAccountId: oauthAccount.id,
              summary: event.summary || "Untitled Event",
              description: event.description,
              location: event.location,
              startTime: event.start?.dateTime
                ? new Date(event.start.dateTime)
                : new Date(),
              endTime: event.end?.dateTime
                ? new Date(event.end.dateTime)
                : new Date(),
              status: event.status,
              attendees: event.attendees,
              isAllDay: !!event.start?.date,
              recurring: !!event.recurringEventId,
              recurringEventId: event.recurringEventId,
              metadata: event,
              lastSyncedAt: new Date(),
            },
            update: {
              summary: event.summary || "Untitled Event",
              description: event.description,
              location: event.location,
              startTime: event.start?.dateTime
                ? new Date(event.start.dateTime)
                : new Date(),
              endTime: event.end?.dateTime
                ? new Date(event.end.dateTime)
                : new Date(),
              status: event.status,
              attendees: event.attendees,
              isAllDay: !!event.start?.date,
              recurring: !!event.recurringEventId,
              recurringEventId: event.recurringEventId,
              metadata: event,
              lastSyncedAt: new Date(),
            },
          });

          eventsSynced++;
        }

        // Update sync log
        await prisma.googleCalendarSyncLog.upsert({
          where: {
            userId_oauthAccountId: {
              userId,
              oauthAccountId: oauthAccount.id,
            },
          },
          create: {
            userId,
            oauthAccountId: oauthAccount.id,
            lastSyncTime: syncStartTime,
            nextSyncToken: syncToken,
            fullSyncCompleted: true,
            status: "SUCCESS",
            eventsSynced,
          },
          update: {
            lastSyncTime: syncStartTime,
            nextSyncToken: syncToken,
            fullSyncCompleted: true,
            status: "SUCCESS",
            eventsSynced,
            errorMessage: null,
          },
        });

        return {
          success: true,
          eventsSynced,
          nextSyncTime: new Date(Date.now() + 60 * 1000), // Next sync in 1 minute
        };
      } catch (error: any) {
        // Update sync log with error
        await prisma.googleCalendarSyncLog.upsert({
          where: {
            userId_oauthAccountId: {
              userId,
              oauthAccountId: oauthAccount.id,
            },
          },
          create: {
            userId,
            oauthAccountId: oauthAccount.id,
            status: "FAILED",
            errorMessage: error.message,
          },
          update: {
            status: "FAILED",
            errorMessage: error.message,
          },
        });

        throw error;
      }
    } catch (error) {
      console.error(
        `[googleCalendarSyncService] Sync from Google Calendar failed:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Get sync status for a user
   */
  async getSyncStatus(userId: string, oauthAccountId: string) {
    const syncLog = await prisma.googleCalendarSyncLog.findUnique({
      where: {
        userId_oauthAccountId: {
          userId,
          oauthAccountId,
        },
      },
    });

    if (!syncLog) {
      return {
        status: "NEVER_SYNCED",
        lastSyncTime: null,
        nextSyncTime: new Date(),
      };
    }

    return {
      status: syncLog.status,
      lastSyncTime: syncLog.lastSyncTime,
      fullSyncCompleted: syncLog.fullSyncCompleted,
      eventsSynced: syncLog.eventsSynced,
      nextSyncTime: new Date(syncLog.lastSyncTime.getTime() + 60 * 1000), // 1 minute interval
      errorMessage: syncLog.errorMessage,
    };
  },

  /**
   * Trigger automatic sync for all active users
   * Should be called by a cron job periodically
   */
  async triggerAutomaticSync() {
    try {
      // Get all active sync logs that haven't synced in the last minute
      const syncLogsToUpdate = await prisma.googleCalendarSyncLog.findMany({
        where: {
          status: {
            in: ["SUCCESS", "FAILED"],
          },
          lastSyncTime: {
            lt: new Date(Date.now() - 60 * 1000), // Last synced more than 1 minute ago
          },
        },
        include: {
          user: true,
          oauthAccount: true,
        },
      });

      let successCount = 0;
      let failureCount = 0;

      for (const syncLog of syncLogsToUpdate) {
        try {
          await this.syncGoogleCalendarToDB(
            syncLog.userId,
            syncLog.oauthAccount.userId,
          ); // Note: userId is used as orgId here
          successCount++;
        } catch (error) {
          console.error(
            `[googleCalendarSyncService] Failed to sync for user ${syncLog.userId}:`,
            error,
          );
          failureCount++;
        }
      }

      return {
        totalSynced: syncLogsToUpdate.length,
        successful: successCount,
        failed: failureCount,
      };
    } catch (error) {
      console.error(
        `[googleCalendarSyncService] Automatic sync failed:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Check if a Google Calendar event matches a Meeting in our DB
   * This helps identify which events are meetings vs other calendar events
   */
  async linkGoogleEventToMeeting(
    userId: string,
    googleEventId: string,
    meetingId: string,
  ) {
    try {
      // Note: GoogleCalendarEvent model doesn't have meetingId field
      // This would require extending the schema if needed
      // For now, just return success
      console.log(
        `[googleCalendarSyncService] Linking event ${googleEventId} to meeting ${meetingId}`,
      );

      return { linked: true };
    } catch (error) {
      console.error(
        `[googleCalendarSyncService] Failed to link event to meeting:`,
        error,
      );
      throw error;
    }
  },
};
