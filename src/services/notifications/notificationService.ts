import * as SibApiV3Sdk from "@sendinblue/client";
import Handlebars from "handlebars";
import prisma from "../../db/prismaClient";
import { logger } from "../../utils/logging/logger";
import { getNotificationQueue } from "../../config/queue";
import { NotificationLogStatus } from "@prisma/client";

// Initialize Brevo/Sendinblue client
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
apiInstance.setApiKey(
  SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY || "",
);

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  templateName: string;
  templateData: Record<string, unknown>;
  from?: {
    email: string;
    name: string;
  };
  replyTo?: {
    email: string;
    name?: string;
  };
  orgId?: string;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Email templates
const templates: Record<string, string> = {
  meetingInvite: `
    <h2>Meeting Invitation</h2>
    <p>You've been invited to a meeting:</p>
    <p><strong>{{meetingTitle}}</strong></p>
    <p>📅 {{date}} at {{time}}</p>
    <p>{{#if location}}📍 {{location}}{{/if}}</p>
    <p>{{#if description}}{{description}}{{/if}}</p>
    <p><a href="{{actionUrl}}">View Meeting Details</a></p>
  `,
  meetingReminder: `
    <h2>Meeting Reminder</h2>
    <p>Reminder: You have an upcoming meeting:</p>
    <p><strong>{{meetingTitle}}</strong></p>
    <p>📅 {{date}} at {{time}}</p>
    <p>{{#if joinUrl}}<a href="{{joinUrl}}">Join Meeting</a>{{/if}}</p>
  `,
  meetingCancelled: `
    <h2>Meeting Cancelled</h2>
    <p>The following meeting has been cancelled:</p>
    <p><strong>{{meetingTitle}}</strong></p>
    <p>📅 Originally scheduled for {{date}} at {{time}}</p>
    <p>{{#if reason}}Reason: {{reason}}{{/if}}</p>
  `,
  meetingRescheduled: `
    <h2>Meeting Rescheduled</h2>
    <p>The following meeting has been rescheduled:</p>
    <p><strong>{{meetingTitle}}</strong></p>
    <p>📅 New time: {{newDate}} at {{newTime}}</p>
    <p>{{#if reason}}Reason: {{reason}}{{/if}}</p>
    <p><a href="{{actionUrl}}">View Updated Details</a></p>
  `,
  transcriptionReady: `
    <h2>Transcription Ready</h2>
    <p>The transcription for your meeting is ready:</p>
    <p><strong>{{meetingTitle}}</strong></p>
    <p><a href="{{actionUrl}}">View Transcript</a></p>
  `,
  actionItemAssigned: `
    <h2>New Action Item</h2>
    <p>You've been assigned an action item:</p>
    <p><strong>{{title}}</strong></p>
    <p>{{#if description}}{{description}}{{/if}}</p>
    <p>Category: {{category}}</p>
    <p>{{#if dueDate}}Due: {{dueDate}}{{/if}}</p>
    <p><a href="{{actionUrl}}">View Details</a></p>
  `,
};

/**
 * Render email template with data
 */
const renderTemplate = (
  templateName: string,
  data: Record<string, unknown>,
): string => {
  const templateSource = templates[templateName];
  if (!templateSource) {
    throw new Error(`Template not found: ${templateName}`);
  }

  const template = Handlebars.compile(templateSource);
  return template(data);
};

/**
 * Send email notification
 */
export const sendEmail = async (
  input: SendEmailInput,
): Promise<NotificationResult> => {
  const {
    to,
    subject,
    templateName,
    templateData,
    from = { email: "noreply@calendar.app", name: "Calendar App" },
    replyTo,
  } = input;

  const recipients = Array.isArray(to) ? to : [to];
  const htmlContent = renderTemplate(templateName, templateData);

  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = from;
    sendSmtpEmail.to = recipients.map((email) => ({ email }));

    if (replyTo) {
      sendSmtpEmail.replyTo = replyTo;
    }

    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);

    // Log notification
    for (const recipient of recipients) {
      await prisma.notificationLog.create({
        data: {
          senderEmail: from.email,
          recipientEmail: recipient,
          recipientRole: "USER",
          event: templateName,
          payload: {
            subject,
            templateData: JSON.parse(JSON.stringify(templateData)),
          },
          status: NotificationLogStatus.SENT,
          vendorResponse: { messageId: response.body.messageId },
        },
      });
    }

    logger.info(`Email sent successfully to ${recipients.join(", ")}`);

    return {
      success: true,
      messageId: response.body.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log failed notification
    for (const recipient of recipients) {
      await prisma.notificationLog.create({
        data: {
          senderEmail: from.email,
          recipientEmail: recipient,
          recipientRole: "USER",
          event: templateName,
          payload: {
            subject,
            templateData: JSON.parse(JSON.stringify(templateData)),
          },
          status: NotificationLogStatus.FAILED,
          reason: errorMessage,
        },
      });
    }

    logger.error("Failed to send email:", { error: errorMessage, recipients });

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Queue email notification for async sending
 */
export const queueEmail = async (input: SendEmailInput): Promise<void> => {
  try {
    const queue = getNotificationQueue();
    await queue.add("send-email", input, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });
    logger.info(
      `Email queued for ${Array.isArray(input.to) ? input.to.join(", ") : input.to}`,
    );
  } catch (err) {
    logger.warn("Failed to queue email (sending directly):", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fallback to direct sending
    await sendEmail(input);
  }
};

/**
 * Send meeting invite notification
 */
export const sendMeetingInvite = async (
  meetingId: string,
  recipientEmail: string,
  meetingDetails: {
    title: string;
    date: string;
    time: string;
    location?: string;
    description?: string;
    actionUrl: string;
  },
  orgId?: string,
): Promise<NotificationResult> => {
  return sendEmail({
    to: recipientEmail,
    subject: `Meeting Invitation: ${meetingDetails.title}`,
    templateName: "meetingInvite",
    templateData: { meetingTitle: meetingDetails.title, ...meetingDetails },
    orgId,
  });
};

/**
 * Send meeting reminder
 */
export const sendMeetingReminder = async (
  recipientEmail: string,
  meetingDetails: {
    meetingTitle: string;
    date: string;
    time: string;
    joinUrl?: string;
  },
  orgId?: string,
): Promise<NotificationResult> => {
  return sendEmail({
    to: recipientEmail,
    subject: `Reminder: ${meetingDetails.meetingTitle}`,
    templateName: "meetingReminder",
    templateData: meetingDetails,
    orgId,
  });
};

/**
 * Send transcription ready notification
 */
export const sendTranscriptionReady = async (
  recipientEmail: string,
  meetingDetails: {
    meetingTitle: string;
    actionUrl: string;
  },
  orgId?: string,
): Promise<NotificationResult> => {
  return sendEmail({
    to: recipientEmail,
    subject: `Transcription Ready: ${meetingDetails.meetingTitle}`,
    templateName: "transcriptionReady",
    templateData: meetingDetails,
    orgId,
  });
};

export const notificationService = {
  sendEmail,
  queueEmail,
  sendMeetingInvite,
  sendMeetingReminder,
  sendTranscriptionReady,
  renderTemplate,
};
