import { icons, socialIconMap } from "./icons";

// ── Types ─────────────────────────────────────────────────

export type TemplateId = "executive" | "classic-bold" | "minimal";

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
  meta: {
    id: TemplateId;
    name: string;
    description: string;
  };
}

// ── Helpers ───────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initial(name: string): string {
  return name ? name.charAt(0).toUpperCase() : "?";
}

function icon(name: string, size: string, color: string): string {
  const svg = (icons as Record<string, string>)[name];
  if (!svg) return "";
  return `<span style="width:${size};height:${size};color:${color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${svg.replace(/<svg /, `<svg style="width:${size};height:${size}" `)}</span>`;
}

function socialIcon(type: string, size: string, color: string): string {
  const svg = socialIconMap[type];
  if (!svg) return "";
  return svg.replace(
    /<svg /,
    `<svg style="width:${size};height:${size};color:${color};fill:${color}" `,
  );
}

function contactRow(iconName: string, value: string, accent: string): string {
  return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
    ${icon(iconName, "10px", accent)}
    <span style="font-size:9px;color:#d1d5db;letter-spacing:0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(value)}</span>
  </div>`;
}

function stripUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

// Shared card wrapper style
const cardStyle = (bg: string = "#0a0a0a") =>
  `position:relative;aspect-ratio:1.586/1;background:${bg};font-family:Inter,system-ui,-apple-system,sans-serif;overflow:hidden;border-radius:16px;box-sizing:border-box`;

// Subtle diagonal texture overlay
const textureOverlay = `<div style="position:absolute;inset:0;opacity:0.03;background-image:repeating-linear-gradient(135deg,transparent,transparent 8px,rgba(255,255,255,0.1) 8px,rgba(255,255,255,0.1) 9px);pointer-events:none"></div>`;

// Accent bar
const accentBar = (color: string, position: "top" | "bottom") =>
  `<div style="position:absolute;${position}:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${color},${color}88)"></div>`;

// ── Template 1: Executive ─────────────────────────────────

const executive: TemplateRenderer = {
  meta: {
    id: "executive",
    name: "Executive",
    description: "Classic business card — avatar, name, and contact details",
  },

  front(data) {
    const {
      displayName,
      title,
      avatarUrl,
      contactFields,
      accentColor: a,
    } = data;

    const avatar = avatarUrl
      ? `<img src="${esc(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover" />`
      : `<span style="font-size:16px;font-weight:600;color:${a}">${initial(displayName)}</span>`;

    const contactRows = [
      contactFields.email && contactRow("email", contactFields.email, a),
      contactFields.phone && contactRow("phone", contactFields.phone, a),
      contactFields.location &&
        contactRow("location", contactFields.location, a),
    ]
      .filter(Boolean)
      .join("");

    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:20px 24px">
    <div style="display:flex;align-items:flex-start;gap:14px">
      <div style="width:44px;height:44px;border-radius:10px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#1a1a1a;box-shadow:0 0 0 2px ${a}">
        ${avatar}
      </div>
      <div style="min-width:0;padding-top:2px">
        <div style="color:#fff;font-weight:600;font-size:15px;line-height:1.2;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(displayName) || "Your Name"}</div>
        ${title ? `<div style="font-size:11px;margin-top:3px;color:${a};line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}</div>` : ""}
      </div>
    </div>
    <div style="min-width:0">
      ${contactRows}
    </div>
  </div>
  ${accentBar(a, "bottom")}
</div>`;
  },

  back(data, qrSvg) {
    const { displayName, bio, links, contactFields, accentColor: a } = data;
    const socialLinks = links.filter((l) => socialIconMap[l.type]);

    const bioSection = bio
      ? `<div style="flex:1;min-height:0;overflow:hidden"><p style="color:#d1d5db;font-size:10px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:0">${esc(bio)}</p></div>`
      : `<div style="flex:1;display:flex;align-items:center;gap:8px"><div style="height:1px;flex:1;background:${a}55"></div><span style="font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:${a}">${esc(displayName)}</span><div style="height:1px;flex:1;background:${a}55"></div></div>`;

    const socialRow =
      socialLinks.length > 0
        ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">${socialLinks
            .map(
              (l) =>
                `<span style="width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:${a}22">${socialIcon(l.type, "12px", a)}</span>`,
            )
            .join("")}</div>`
        : "";

    const bookingRow = contactFields.bookingUrl
      ? `<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;background:${a}18;margin-bottom:6px">
          ${icon("calendar", "10px", a)}
          <span style="font-size:9px;font-weight:500;color:${a}">Book a meeting</span>
        </div>`
      : "";

    const websiteRow = contactFields.website
      ? `<span style="font-size:9px;color:#d1d5db;letter-spacing:0.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:${data.showQr ? "55%" : "100%"}">${stripUrl(contactFields.website)}</span>`
      : "<span></span>";

    const qrBlock =
      data.showQr && qrSvg
        ? `<div style="width:72px;height:72px;flex-shrink:0">${qrSvg.replace(/<svg /, '<svg style="width:72px;height:72px" ')}</div>`
        : "";

    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:20px 24px">
    ${bioSection}
    ${socialRow}
    ${bookingRow}
    <div style="display:flex;align-items:flex-end;justify-content:space-between">
      ${websiteRow}
      ${qrBlock}
    </div>
  </div>
  ${accentBar(a, "top")}
</div>`;
  },
};

// ── Template 2: Classic Bold ──────────────────────────────

const classicBold: TemplateRenderer = {
  meta: {
    id: "classic-bold",
    name: "Classic Bold",
    description: "Bold centered typography with diagonal pattern",
  },

  front(data) {
    const { displayName, title, accentColor: a } = data;

    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:absolute;inset:0;opacity:0.04;background-image:repeating-linear-gradient(135deg,transparent,transparent 12px,rgba(255,255,255,0.08) 12px,rgba(255,255,255,0.08) 13px);pointer-events:none"></div>
  <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 32px;text-align:center">
    <div style="color:#fff;font-weight:700;font-size:22px;letter-spacing:-0.02em;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${esc(displayName) || "Your Name"}</div>
    ${title ? `<div style="font-size:12px;margin-top:6px;color:${a};font-weight:500;letter-spacing:0.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${esc(title)}</div>` : ""}
    <div style="width:40px;height:2px;background:${a};margin-top:14px;border-radius:1px"></div>
  </div>
  ${accentBar(a, "bottom")}
</div>`;
  },

  back(data, qrSvg) {
    const { displayName, links, contactFields, accentColor: a } = data;
    const socialLinks = links.filter((l) => socialIconMap[l.type]);

    const contactRows = [
      contactFields.email && contactRow("email", contactFields.email, a),
      contactFields.phone && contactRow("phone", contactFields.phone, a),
      contactFields.website &&
        contactRow("globe", stripUrl(contactFields.website), a),
      contactFields.location &&
        contactRow("location", contactFields.location, a),
    ]
      .filter(Boolean)
      .join("");

    const socialRow =
      socialLinks.length > 0
        ? `<div style="display:flex;align-items:center;gap:8px;margin-top:10px">${socialLinks
            .map(
              (l) =>
                `<span style="width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;background:${a}22">${socialIcon(l.type, "11px", a)}</span>`,
            )
            .join("")}</div>`
        : "";

    const qrBlock =
      data.showQr && qrSvg
        ? `<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center">
      <div style="width:90px;height:90px">${qrSvg.replace(/<svg /, '<svg style="width:90px;height:90px" ')}</div>
      <div style="font-size:8px;color:#6b7280;margin-top:4px;text-align:center;letter-spacing:0.02em">${esc(displayName)}</div>
    </div>`
        : "";

    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:relative;height:100%;display:flex;align-items:center;${data.showQr ? "padding:20px 24px;gap:20px" : "padding:20px 28px;justify-content:center"}">
    ${qrBlock}
    <div style="flex:1;min-width:0">
      ${contactRows}
      ${socialRow}
    </div>
  </div>
  ${accentBar(a, "top")}
</div>`;
  },
};

// ── Template 3: Minimal ───────────────────────────────────

const minimal: TemplateRenderer = {
  meta: {
    id: "minimal",
    name: "Minimal",
    description: "Clean geometric design with prominent QR code",
  },

  front(data) {
    const { displayName, title, avatarUrl, accentColor: a } = data;

    const avatar = avatarUrl
      ? `<img src="${esc(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover" />`
      : `<span style="font-size:18px;font-weight:600;color:${a}">${initial(displayName)}</span>`;

    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:relative;height:100%;display:flex;align-items:center;padding:24px 28px;gap:20px">
    <div style="width:56px;height:56px;border:2px solid ${a};border-radius:4px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#111">
      ${avatar}
    </div>
    <div style="flex:1;min-width:0">
      <div style="color:#fff;font-weight:600;font-size:16px;letter-spacing:-0.01em;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(displayName) || "Your Name"}</div>
      ${title ? `<div style="font-size:11px;margin-top:4px;color:${a};line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}</div>` : ""}
      <div style="width:24px;height:1px;background:${a}66;margin-top:8px"></div>
    </div>
  </div>
  ${accentBar(a, "bottom")}
</div>`;
  },

  back(data, qrSvg) {
    const { displayName, contactFields, links, accentColor: a } = data;
    const socialLinks = links.filter((l) => socialIconMap[l.type]);

    const contactItems = [
      contactFields.email,
      contactFields.phone,
      contactFields.website && stripUrl(contactFields.website),
      contactFields.location,
    ].filter(Boolean);

    const contactLine =
      contactItems.length > 0
        ? `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;margin-top:10px">${contactItems
            .map(
              (c) =>
                `<span style="font-size:8px;color:#9ca3af;letter-spacing:0.02em">${esc(c!)}</span>`,
            )
            .join("")}</div>`
        : "";

    const socialRow =
      socialLinks.length > 0
        ? `<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px">${socialLinks
            .map((l) => socialIcon(l.type, "12px", a))
            .join("")}</div>`
        : "";

    const qrBlock =
      data.showQr && qrSvg
        ? `<div style="width:100px;height:100px;margin-bottom:6px">${qrSvg.replace(/<svg /, '<svg style="width:100px;height:100px" ')}</div>`
        : "";

    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 28px;text-align:center">
    <div style="font-size:9px;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px">${esc(displayName)}</div>
    ${qrBlock}
    ${contactLine}
    ${socialRow}
  </div>
  ${accentBar(a, "top")}
</div>`;
  },
};

// ── Registry ──────────────────────────────────────────────

export const templates: Record<TemplateId, TemplateRenderer> = {
  executive,
  "classic-bold": classicBold,
  minimal,
};

export const templateList = Object.values(templates).map((t) => t.meta);
