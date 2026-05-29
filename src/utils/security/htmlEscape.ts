// Escape user-supplied text before interpolation into HTML email templates.
// Maps the five characters that have meaning inside an HTML body or attribute.
// Always run this on every interpolation site that takes user data — do not
// rely on the data being "safe" from a higher layer.
const HTML_ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ENTITY_MAP[ch] ?? ch);
}
