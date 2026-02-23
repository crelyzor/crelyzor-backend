import axios from "axios";

/**
 * Brevo configuration for organization's email sending
 */
interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

interface OrgBranding {
  orgLogoUrl?: string;
  brandColor?: string;
  orgName?: string;
}

/**
 * Email attachment structure
 */
interface EmailAttachment {
  filename: string;
  base64: string;
  type?: string; // MIME type (e.g., "text/calendar")
}

/**
 * Notification payload structure for the Notification Service
 */
interface NotificationPayload {
  orgId: string;
  brevoConfig?: BrevoConfig;
  sender?: {
    email: string;
    name: string;
    role: string;
    orgMemberId?: string;
  };
  recipient: {
    email: string;
    name: string;
    role: string;
    orgMemberId?: string;
  };
  event: string;
  payload: Record<string, any>;
  attachments?: EmailAttachment[];
}

/**
 * Fetches organization's Brevo configuration from the database
 * Returns null if org doesn't have Brevo configured
 */
async function getOrgBrevoConfig(_orgId: string): Promise<BrevoConfig | null> {
  return null;
}

async function getOrgBranding(_orgId: string): Promise<OrgBranding | null> {
  return null;
}

/**
 * Sends a notification via the Notification Service
 *
 * This function handles communication with the external Notification Service.
 * It gracefully handles errors without throwing, so notifications don't block
 * critical business operations like user onboarding.
 *
 * @param payload - Notification payload including recipient, event type, and metadata
 * @returns Promise<void> - Resolves when notification is sent or fails gracefully
 *
 * @example
 * await sendNotification({
 *   orgId: "org-uuid",
 *   recipient: {
 *     email: "student@example.com",
 *     name: "John Doe",
 *     role: "STUDENT",
 *     orgMemberId: "member-uuid"
 *   },
 *   event: "studentJoined",
 *   payload: {
 *     STUDENT_NAME: "John Doe",
 *     ENTITY_NAME: "Example Org"
 *   }
 * });
 */
export async function sendNotification(
  payload: NotificationPayload,
): Promise<void> {
  try {
    console.log(
      `[NotificationService] sendNotification called for event: ${payload.event}`,
    );
    const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL;
    console.log(
      `[NotificationService] NOTIFICATION_SERVICE_URL = ${notificationServiceUrl}`,
    );

    if (!notificationServiceUrl) {
      console.warn(
        "[NotificationService] NOTIFICATION_SERVICE_URL not configured, skipping notification",
      );
      return;
    }

    // Fetch org's Brevo config if not already provided
    let brevoConfig = payload.brevoConfig;
    if (!brevoConfig && payload.orgId) {
      brevoConfig = (await getOrgBrevoConfig(payload.orgId)) || undefined;
    }

    let orgBranding: OrgBranding | null = null;
    if (payload.orgId) {
      orgBranding = await getOrgBranding(payload.orgId);
    }

    // Determine sender - use org's sender from brevoConfig if available
    const sender = payload.sender || {
      email:
        brevoConfig?.senderEmail ||
        process.env.ADMIN_EMAIL ||
        "info@experimentlabs.in",
      name: brevoConfig?.senderName || "Experiment Labs",
      role: "ADMIN",
    };

    const requestPayload: Record<string, any> = {
      ...payload,
      sender,
      payload: {
        ...payload.payload,
        ORG_LOGO_URL: orgBranding?.orgLogoUrl,
        ORG_NAME: orgBranding?.orgName,
        ORG_BRAND_COLOR: orgBranding?.brandColor,
      },
    };

    // Include brevoConfig if org has it configured
    if (brevoConfig) {
      requestPayload.brevoConfig = brevoConfig;
      console.log(
        `[NotificationService] Using org's Brevo config for ${payload.event} (sender: ${brevoConfig.senderEmail})`,
      );
    } else {
      console.log(
        `[NotificationService] Using default Brevo config for ${payload.event}`,
      );
    }

    const response = await axios.post(
      `${notificationServiceUrl}/api/v1/notifications/send`,
      requestPayload,
      {
        timeout: 10000, // 10 seconds timeout
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log(
      `[NotificationService] Notification sent successfully for event: ${payload.event}`,
      response.data,
    );
  } catch (error: any) {
    // Log error but don't throw - notifications shouldn't block critical operations
    console.error(
      `[NotificationService] Failed to send notification for event ${payload.event}:`,
      error.response?.data || error.message,
    );
  }
}

/**
 * Notification event types supported by the Notification Service
 */
export const NotificationEvents = {
  // Student events
  STUDENT_JOINED: "studentJoined",
  STUDENT_INVITED: "STUDENT_INVITED",

  // Consultant events
  ADMIN_SIGNUP: "ADMIN_SIGNUP",
  NEW_TEAM_MEMBER: "NEW_TEAM_MEMBER",

  // Admin events
  ADMIN_ADDED_NEW_TEAM: "ADMIN_ADDED_NEW_TEAM",

  // Evaluator events
  EVALUATOR_FORM: "evaluatorForm",

  // Roadmap events
  ROADMAP_PUBLISHED: "roadmapPublished",
  ROADMAP_UPDATED: "roadmapUpdated",
  COLLEGE_LIST_UPDATED: "collegeListUpdated",

  // Event scheduling
  EVENT_SCHEDULED: "eventScheduled",
  EVENT_RESCHEDULED: "eventRescheduled",

  // Reminders
  TASK_REMINDERS: "taskReminders",
  EVENT_REMINDERS: "eventReminders",
  INBOX_REMINDERS: "inboxReminders",

  // Activity events
  ACTIVITY_RECOMMENDATIONS: "activityRecommendations",
  ACTIVITY_RECOMMENDATIONS_REMINDER: "activityRecommendations_REMINDER",
  ACTIVITY_PAYMENT_PENDING: "ACTIVITY_PAYMENT_PENDING",

  // Misc
  ADHOC_NUDGE: "ADHOC_NUDGE",
  CREDIT_EXPIRY: "CREDIT_EXPIRY",
  TESTING_MAIL: "TESTING_MAIL",

  // Referral events
  REFERRAL_INVITE: "REFERRAL_INVITE",

  // Password reset events
  PASSWORD_RESET: "PASSWORD_RESET",
} as const;

/**
 * User role types for notifications
 */
export const NotificationRoles = {
  STUDENT: "STUDENT",
  CONSULTANT: "CONSULTANT",
  ADMIN: "ADMIN",
  MENTOR: "MENTOR",
  TEAM_MEMBER: "TEAM_MEMBER",
} as const;

/**
 * Send a testing mail notification to verify the notification service is working
 *
 * @param orgId - Organization ID to use for Brevo config (optional)
 * @param recipientEmail - Email address to send the test notification to
 * @param recipientName - Name of the recipient (optional, defaults to "Test Student")
 *
 * @example
 * // Run this to test:
 * await sendTestingMail("org-uuid", "msachdeva9april@gmail.com", "Mayank");
 */
export async function sendTestingMail(
  orgId?: string,
  recipientEmail: string = "msachdeva9april@gmail.com",
  recipientName: string = "Test Student",
): Promise<void> {
  console.log(
    `[NotificationService] Sending TESTING_MAIL to ${recipientEmail}`,
  );

  await sendNotification({
    orgId: orgId || "00000000-0000-0000-0000-000000000000", // Fallback org ID
    recipient: {
      email: recipientEmail,
      name: recipientName,
      role: NotificationRoles.STUDENT,
    },
    event: NotificationEvents.TESTING_MAIL,
    payload: {
      STUDENT_NAME: recipientName,
      RECIPIENT_EMAIL: recipientEmail,
      TEST_MESSAGE: "This is a test notification from auth-core service.",
      TIMESTAMP: new Date().toISOString(),
    },
  });

  console.log(`[NotificationService] TESTING_MAIL sent to ${recipientEmail}`);
}
