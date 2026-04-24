import {
  emailLayout,
  infoRow,
  formatDateTime,
  ctaButton,
  secondaryLink,
  gcalLink,
} from "./helpers";

export interface BookingConfirmationParams {
  guestName: string;
  hostName: string;
  eventTypeTitle: string;
  startTime: Date;
  endTime: Date;
  timezone: string; // guest's timezone
  bookingId: string;
  cancelUrl: string; // public cancel URL
  rescheduleUrl: string; // public reschedule URL
}

/**
 * Email sent to the GUEST confirming their booking.
 * Subject: "Your [eventTypeTitle] with [hostName] is confirmed"
 */
export function bookingConfirmationEmail(p: BookingConfirmationParams): string {
  const when = formatDateTime(p.startTime, p.timezone);
  const calLink = gcalLink({
    title: `${p.eventTypeTitle} with ${p.hostName}`,
    startTime: p.startTime,
    endTime: p.endTime,
    description: `Booked via Crelyzor`,
  });

  const body = `
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;line-height:1.3;">
      You're booked! 🎉
    </h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      Your <strong>${p.eventTypeTitle}</strong> with <strong>${p.hostName}</strong> is confirmed.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      ${infoRow("When", when)}
      ${infoRow("With", p.hostName)}
      ${infoRow("Event", p.eventTypeTitle)}
    </table>

    ${ctaButton("Add to Google Calendar", calLink)}

    <p style="margin:28px 0 0;color:#9ca3af;font-size:13px;">
      Need to make a change? ${secondaryLink("Reschedule", p.rescheduleUrl)} or ${secondaryLink("Cancel", p.cancelUrl)}
    </p>
  `;

  return emailLayout(body);
}

export function bookingConfirmationSubject(
  p: Pick<BookingConfirmationParams, "eventTypeTitle" | "hostName">,
): string {
  return `Your ${p.eventTypeTitle} with ${p.hostName} is confirmed`;
}
