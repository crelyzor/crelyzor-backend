import { emailLayout, ctaButton } from "./helpers";

export interface DailyDigestTask {
  title: string;
  priority?: string | null;
  dueDate?: Date | null;
  isOverdue: boolean;
}

export interface DailyDigestParams {
  userName: string;
  overdueTasks: DailyDigestTask[];
  todayTasks: DailyDigestTask[];
  appBaseUrl: string;
}

function taskRow(task: DailyDigestTask): string {
  const priorityLabel =
    task.priority === "HIGH"
      ? `<span style="color:#ef4444;font-size:11px;font-weight:600;margin-left:8px;">HIGH</span>`
      : task.priority === "MEDIUM"
        ? `<span style="color:#f59e0b;font-size:11px;font-weight:600;margin-left:8px;">MED</span>`
        : "";

  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
      <span style="color:#111827;font-size:14px;">☐ ${task.title}</span>
      ${priorityLabel}
    </td>
  </tr>`;
}

/**
 * Daily task digest — sent at 08:00 UTC to opted-in users.
 */
export function dailyDigestEmail(p: DailyDigestParams): string {
  const tasksUrl = `${p.appBaseUrl}/tasks?view=today`;
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const overdueSection =
    p.overdueTasks.length > 0
      ? `
    <h2 style="margin:0 0 12px;color:#ef4444;font-size:16px;font-weight:600;">
      ⚠️ Overdue (${p.overdueTasks.length})
    </h2>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      ${p.overdueTasks.map(taskRow).join("")}
    </table>
  `
      : "";

  const todaySection =
    p.todayTasks.length > 0
      ? `
    <h2 style="margin:0 0 12px;color:#111827;font-size:16px;font-weight:600;">
      📅 Due today (${p.todayTasks.length})
    </h2>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      ${p.todayTasks.map(taskRow).join("")}
    </table>
  `
      : "";

  const body = `
    <h1 style="margin:0 0 4px;color:#111827;font-size:22px;font-weight:700;line-height:1.3;">
      Good morning, ${p.userName.split(" ")[0]} 👋
    </h1>
    <p style="margin:0 0 28px;color:#9ca3af;font-size:14px;">${today}</p>

    ${overdueSection}
    ${todaySection}

    ${p.overdueTasks.length === 0 && p.todayTasks.length === 0 ? `<p style="color:#6b7280;font-size:14px;">Nothing due today — you're clear! 🎉</p>` : ""}

    ${ctaButton("Open Tasks", tasksUrl)}
  `;

  return emailLayout(body);
}

export function dailyDigestSubject(
  p: Pick<DailyDigestParams, "overdueTasks" | "todayTasks">,
): string {
  const total = p.overdueTasks.length + p.todayTasks.length;
  if (total === 0) return "Your daily task digest";
  const overdueNote =
    p.overdueTasks.length > 0 ? ` (${p.overdueTasks.length} overdue)` : "";
  return `${total} task${total !== 1 ? "s" : ""} today${overdueNote}`;
}
