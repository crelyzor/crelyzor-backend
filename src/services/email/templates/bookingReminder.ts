import { emailLayout, infoRow, formatDateTime, ctaButton } from "./helpers";

export interface BookingReminderParams {
  recipientName: string;
  otherPartyName: string;
  role: "host" | "guest";
  eventTypeTitle: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  meetingLink?: string | null;
}

/**
 * Reminder email sent to both host and guest 24h before the meeting.
 */
export function bookingReminderEmail(p: BookingReminderParams): string {
  const when = formatDateTime(p.startTime, p.timezone);
  const roleLabel =
    p.role === "host" ? `with ${p.otherPartyName}` : `with ${p.otherPartyName}`;

  const body = `
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;line-height:1.3;">
      Reminder: Meeting tomorrow
    </h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      Your <strong>${p.eventTypeTitle}</strong> ${roleLabel} is coming up in ~24 hours.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      ${infoRow("When", when)}
      ${p.meetingLink ? infoRow("Join link", `<a href="${p.meetingLink}" style="color:#d4af61;">${p.meetingLink}</a>`) : ""}
    </table>

    ${p.meetingLink ? ctaButton("Join Meeting", p.meetingLink) : ""}
  `;

  return emailLayout(body);
}

export function bookingReminderSubject(
  p: Pick<BookingReminderParams, "eventTypeTitle" | "otherPartyName">,
): string {
  return `Reminder: ${p.eventTypeTitle} with ${p.otherPartyName} tomorrow`;
}
