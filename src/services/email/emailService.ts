import { Resend } from "resend";
import { env } from "../../config/environment";
import { logger } from "../../utils/logging/logger";

let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  /** Optional reply-to address */
  replyTo?: string;
}

/**
 * Send a transactional email via Resend.
 * Always fail-open — logs errors but never throws.
 * Returns true if the email was sent, false if skipped or failed.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    logger.debug("Email skipped — RESEND_API_KEY not configured", {
      to: options.to,
      subject: options.subject,
    });
    return false;
  }

  try {
    const { error } = await client.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      ...(options.replyTo && { replyTo: options.replyTo }),
    });

    if (error) {
      logger.error("Resend returned an error", {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });
      return false;
    }

    logger.info("Email sent", { to: options.to, subject: options.subject });
    return true;
  } catch (err) {
    logger.error("Failed to send email (non-critical)", {
      to: options.to,
      subject: options.subject,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
