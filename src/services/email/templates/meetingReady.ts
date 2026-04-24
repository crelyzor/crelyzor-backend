import { emailLayout, ctaButton } from "./helpers";

export interface MeetingReadyParams {
  userName: string;
  meetingTitle: string;
  meetingId: string;
  appBaseUrl: string;
}

/**
 * Email sent to the host when AI finishes processing their meeting.
 */
export function meetingReadyEmail(p: MeetingReadyParams): string {
  const meetingUrl = `${p.appBaseUrl}/meetings/${p.meetingId}`;

  const body = `
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;line-height:1.3;">
      Your meeting is ready ✨
    </h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      AI has finished processing <strong>${p.meetingTitle}</strong>.
      Your transcript, summary, and extracted tasks are ready to view.
    </p>

    ${ctaButton("Open Meeting", meetingUrl)}
  `;

  return emailLayout(body);
}

export function meetingReadySubject(
  p: Pick<MeetingReadyParams, "meetingTitle">,
): string {
  return `Your meeting "${p.meetingTitle}" is ready`;
}
