/**
 * Email template helpers — shared base layout & utility functions.
 */

/** Formats a Date into a human-readable string in a given IANA timezone */
export function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: timezone,
  }).format(date);
}

/** Generates a gcal-compatible event link */
export function gcalLink(params: {
  title: string;
  startTime: Date;
  endTime: Date;
  description?: string;
}): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(".000", "");
  const qs = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${fmt(params.startTime)}/${fmt(params.endTime)}`,
    ...(params.description && { details: params.description }),
  });
  return `https://calendar.google.com/calendar/render?${qs.toString()}`;
}

/** Minimal branded HTML wrapper */
export function emailLayout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crelyzor</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#0a0a0a;padding:24px 32px;">
              <span style="color:#d4af61;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Crelyzor</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                You're receiving this email because you have a Crelyzor account.<br />
                &copy; ${new Date().getFullYear()} Crelyzor. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Standard CTA button */
export function ctaButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#d4af61;color:#0a0a0a;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:20px;">${label}</a>`;
}

/** Muted secondary link */
export function secondaryLink(label: string, url: string): string {
  return `<a href="${url}" style="color:#6b7280;font-size:13px;text-decoration:underline;">${label}</a>`;
}

/** Info row (label: value) */
export function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="color:#6b7280;font-size:13px;padding:6px 0;width:120px;vertical-align:top;">${label}</td>
    <td style="color:#111827;font-size:13px;padding:6px 0;font-weight:500;">${value}</td>
  </tr>`;
}
