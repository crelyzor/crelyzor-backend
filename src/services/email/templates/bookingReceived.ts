import { emailLayout, infoRow, formatDateTime, ctaButton } from "./helpers";

export interface BookingReceivedParams {
  hostName: string;
  guestName: string;
  guestEmail: string;
  guestNote?: string | null;
  eventTypeTitle: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  bookingId: string;
  appBaseUrl: string;
}

/**
 * Email sent to the HOST when a guest books them.
 * Subject: "[guestName] booked [eventTypeTitle]"
 */
export function bookingReceivedEmail(p: BookingReceivedParams): string {
  const when = formatDateTime(p.startTime, p.timezone);
  const bookingUrl = `${p.appBaseUrl}/settings?tab=scheduling`;

  const body = `
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;line-height:1.3;">
      New booking from ${p.guestName}
    </h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      ${p.guestName} booked <strong>${p.eventTypeTitle}</strong> with you.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      ${infoRow("When", when)}
      ${infoRow("Guest", `${p.guestName} &lt;${p.guestEmail}&gt;`)}
      ${p.guestNote ? infoRow("Note", p.guestNote) : ""}
    </table>

    ${ctaButton("View in Crelyzor", bookingUrl)}
  `;

  return emailLayout(body);
}

export function bookingReceivedSubject(
  p: Pick<BookingReceivedParams, "guestName" | "eventTypeTitle">,
): string {
  return `${p.guestName} booked ${p.eventTypeTitle}`;
}
