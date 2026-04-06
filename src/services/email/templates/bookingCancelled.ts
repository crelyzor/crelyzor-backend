import { emailLayout, infoRow, formatDateTime } from "./helpers";

export interface BookingCancelledParams {
  recipientName: string;
  cancelledByName: string;
  eventTypeTitle: string;
  startTime: Date;
  timezone: string;
  cancelReason?: string | null;
}

/**
 * Cancellation notification sent to both parties.
 */
export function bookingCancelledEmail(p: BookingCancelledParams): string {
  const when = formatDateTime(p.startTime, p.timezone ?? "UTC");

  const body = `
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;line-height:1.3;">
      Booking cancelled
    </h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      Your <strong>${p.eventTypeTitle}</strong> has been cancelled by <strong>${p.cancelledByName}</strong>.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      ${infoRow("Originally scheduled", when)}
      ${p.cancelReason ? infoRow("Reason", p.cancelReason) : ""}
    </table>

    <p style="margin:0;color:#9ca3af;font-size:13px;">
      If this was unexpected, please reach out to ${p.cancelledByName} directly.
    </p>
  `;

  return emailLayout(body);
}

export function bookingCancelledSubject(p: Pick<BookingCancelledParams, "eventTypeTitle">): string {
  return `Booking cancelled: ${p.eventTypeTitle}`;
}
