import { emailLayout, ctaButton } from "./helpers";

export interface TaskAssignedParams {
  assigneeName: string;
  assignerName: string;
  taskTitle: string;
  taskUrl: string;
}

export function taskAssignedEmail(p: TaskAssignedParams): string {
  const body = `
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;line-height:1.3;">
      You've been assigned a task
    </h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">
      Hi ${p.assigneeName}, <strong>${p.assignerName}</strong> assigned you a task:
      <br /><br />
      <strong style="color:#111827;">${p.taskTitle}</strong>
    </p>
    ${ctaButton("View task", p.taskUrl)}
  `;
  return emailLayout(body);
}

export function taskAssignedSubject(
  p: Pick<TaskAssignedParams, "taskTitle">,
): string {
  return `You've been assigned: "${p.taskTitle}"`;
}
