import { icons, socialIconMap } from "./icons";

// ── Types ─────────────────────────────────────────────────

export interface CardTemplateData {
  displayName: string;
  title?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  links: Array<{ type: string; url: string; label: string }>;
  contactFields: {
    phone?: string;
    email?: string;
    location?: string;
    website?: string;
    bookingUrl?: string;
  };
  accentColor: string;
  publicUrl: string;
  showQr: boolean;
}

export interface TemplateRenderer {
  front: (data: CardTemplateData) => string;
  back: (data: CardTemplateData, qrSvg: string) => string;
  meta: { id: string; name: string; description: string };
}

// ── String helpers ────────────────────────────────────────

export function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function initial(name: string): string {
  return name ? name.charAt(0).toUpperCase() : "?";
}

export function stripUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function firstLast(name: string): [string, string] {
  const i = name.indexOf(" ");
  if (i === -1) return [name, ""];
  return [name.slice(0, i), name.slice(i + 1)];
}

// ── Icon helpers ──────────────────────────────────────────

export function icon(name: string, size: string, color: string): string {
  const svg = (icons as Record<string, string>)[name];
  if (!svg) return "";
  return `<span style="width:${size};height:${size};color:${color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${svg.replace(/<svg /, `<svg style="width:${size};height:${size}" `)}</span>`;
}

export function socialIcon(type: string, size: string, color: string): string {
  const svg = socialIconMap[type];
  if (!svg) return "";
  return svg.replace(/<svg /, `<svg style="width:${size};height:${size};color:${color};fill:${color}" `);
}

export function socialBtns(
  links: CardTemplateData["links"],
  color: string,
  borderColor?: string,
): string {
  const sl = links.filter((l) => socialIconMap[l.type]);
  if (!sl.length) return "";
  const bc = borderColor ?? `${color}88`;
  return `<div style="display:flex;gap:8px">${sl
    .map(
      (l) =>
        `<span style="width:26px;height:26px;border-radius:50%;border:1px solid ${bc};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${socialIcon(l.type, "12px", color)}</span>`,
    )
    .join("")}</div>`;
}

export function contactRow(iconName: string, value: string, accent: string): string {
  return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
    ${icon(iconName, "10px", accent)}
    <span style="font-size:9px;color:#d1d5db;letter-spacing:0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(value)}</span>
  </div>`;
}

// ── QR helper ─────────────────────────────────────────────

export function qrImg(qrSvg: string, showQr: boolean, size: number, extra = ""): string {
  if (!showQr || !qrSvg) return "";
  return `<div style="width:${size}px;height:${size}px;flex-shrink:0${extra ? ";" + extra : ""}">${qrSvg.replace(/<svg /, `<svg style="width:${size}px;height:${size}px" `)}</div>`;
}

// ── Shared style constants ────────────────────────────────

export const DM = "'DM Sans',system-ui,sans-serif";
export const MONO = "'DM Mono',monospace";

export const cardStyle = (bg = "#0a0a0a") =>
  `position:relative;aspect-ratio:1.586/1;background:${bg};font-family:Inter,system-ui,-apple-system,sans-serif;overflow:hidden;border-radius:16px;box-sizing:border-box`;

export const textureOverlay =
  `<div style="position:absolute;inset:0;opacity:0.03;background-image:repeating-linear-gradient(135deg,transparent,transparent 8px,rgba(255,255,255,0.1) 8px,rgba(255,255,255,0.1) 9px);pointer-events:none"></div>`;

export const accentBar = (color: string, position: "top" | "bottom") =>
  `<div style="position:absolute;${position}:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${color},${color}88)"></div>`;
