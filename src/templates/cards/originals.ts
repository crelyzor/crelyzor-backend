import { socialIconMap } from "../icons";
import {
  TemplateRenderer,
  esc,
  initial,
  icon,
  socialIcon,
  stripUrl,
  cardStyle,
  textureOverlay,
  accentBar,
} from "../helpers";

// ── Executive ─────────────────────────────────────────────

export const executive: TemplateRenderer = {
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
      : `<span style="font-size:18px;font-weight:600;color:${a}">${initial(displayName)}</span>`;
    const mkRow = (iconName: string, value: string) =>
      `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${icon(iconName, "12px", a)}<span style="font-size:11px;color:#d1d5db;letter-spacing:0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(value)}</span></div>`;
    const contactRows = [
      contactFields.email && mkRow("email", contactFields.email),
      contactFields.phone && mkRow("phone", contactFields.phone),
      contactFields.location && mkRow("location", contactFields.location),
    ]
      .filter(Boolean)
      .join("");
    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;padding:16px 20px;gap:14px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:46px;height:46px;border-radius:10px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#1a1a1a;box-shadow:0 0 0 2px ${a}">
        ${avatar}
      </div>
      <div style="min-width:0">
        <div style="color:#fff;font-weight:600;font-size:18px;line-height:1.2;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(displayName) || "Your Name"}</div>
        ${title ? `<div style="font-size:12px;margin-top:3px;color:${a};line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}</div>` : ""}
      </div>
    </div>
    ${contactRows ? `<div style="min-width:0;padding-left:2px">${contactRows}</div>` : ""}
  </div>
  ${accentBar(a, "bottom")}
</div>`;
  },

  back(data, qrSvg) {
    const { displayName, bio, links, contactFields, accentColor: a } = data;
    const socialLinks = links.filter((l) => socialIconMap[l.type]);
    const bioSection = bio
      ? `<p style="color:#d1d5db;font-size:12px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;margin:0">${esc(bio)}</p>`
      : `<div style="display:flex;align-items:center;gap:8px"><div style="height:1px;flex:1;background:${a}40"></div><span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:${a}88">${esc(displayName)}</span><div style="height:1px;flex:1;background:${a}40"></div></div>`;
    const socialRow =
      socialLinks.length > 0
        ? `<div style="display:flex;align-items:center;gap:8px">${socialLinks.map((l) => `<span style="width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:${a}22">${socialIcon(l.type, "13px", a)}</span>`).join("")}</div>`
        : "";
    const bookingRow = contactFields.bookingUrl
      ? `<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:6px;background:${a}18">
          ${icon("calendar", "11px", a)}
          <span style="font-size:10px;font-weight:500;color:${a}">Book a meeting</span>
        </div>`
      : "";
    const websiteRow = contactFields.website
      ? `<span style="font-size:11px;color:#d1d5db;letter-spacing:0.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${stripUrl(contactFields.website)}</span>`
      : "";
    const qrBlock =
      data.showQr && qrSvg
        ? `<div style="width:72px;height:72px;flex-shrink:0">${qrSvg.replace(/<svg /, '<svg style="width:72px;height:72px" ')}</div>`
        : "";
    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;padding:16px 20px;gap:10px">
    ${bioSection}
    ${bookingRow}
    ${socialRow}
    ${websiteRow || qrBlock ? `<div style="display:flex;align-items:center;justify-content:space-between">${websiteRow}<div style="flex:1"></div>${qrBlock}</div>` : ""}
  </div>
  ${accentBar(a, "top")}
</div>`;
  },
};

// ── Classic Bold ──────────────────────────────────────────

export const classicBold: TemplateRenderer = {
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
  <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 28px;text-align:center">
    <div style="color:#fff;font-weight:700;font-size:21px;letter-spacing:-0.02em;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${esc(displayName) || "Your Name"}</div>
    ${title ? `<div style="font-size:11px;margin-top:5px;color:${a};font-weight:500;letter-spacing:0.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${esc(title)}</div>` : ""}
    <div style="width:36px;height:2px;background:${a};margin-top:10px;border-radius:1px"></div>
  </div>
  ${accentBar(a, "bottom")}
</div>`;
  },

  back(data, qrSvg) {
    const { displayName, links, contactFields, accentColor: a } = data;
    const socialLinks = links.filter((l) => socialIconMap[l.type]);
    const mkRow = (iconName: string, value: string) =>
      `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${icon(iconName, "12px", a)}<span style="font-size:11px;color:#d1d5db;letter-spacing:0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(value)}</span></div>`;
    const contactRows = [
      contactFields.email && mkRow("email", contactFields.email),
      contactFields.phone && mkRow("phone", contactFields.phone),
      contactFields.website && mkRow("globe", stripUrl(contactFields.website)),
      contactFields.location && mkRow("location", contactFields.location),
    ]
      .filter(Boolean)
      .join("");
    const socialRow =
      socialLinks.length > 0
        ? `<div style="display:flex;align-items:center;gap:8px;margin-top:10px">${socialLinks.map((l) => `<span style="width:24px;height:24px;border-radius:5px;display:flex;align-items:center;justify-content:center;background:${a}22">${socialIcon(l.type, "13px", a)}</span>`).join("")}</div>`
        : "";
    const qrBlock =
      data.showQr && qrSvg
        ? `<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center">
      <div style="width:90px;height:90px">${qrSvg.replace(/<svg /, '<svg style="width:90px;height:90px" ')}</div>
      <div style="font-size:9px;color:#6b7280;margin-top:4px;text-align:center;letter-spacing:0.02em">${esc(displayName)}</div>
    </div>`
        : "";
    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:relative;height:100%;display:flex;align-items:center;${data.showQr ? "padding:16px 20px;gap:16px" : "padding:16px 24px;justify-content:center"}">
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

// ── Minimal ───────────────────────────────────────────────

export const minimal: TemplateRenderer = {
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
  <div style="position:relative;height:100%;display:flex;align-items:center;padding:18px 22px;gap:16px">
    <div style="width:52px;height:52px;border:2px solid ${a};border-radius:4px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#111">
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
        ? `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;margin-top:10px">${contactItems.map((c) => `<span style="font-size:10px;color:#9ca3af;letter-spacing:0.02em">${esc(c!)}</span>`).join("")}</div>`
        : "";
    const socialRow =
      socialLinks.length > 0
        ? `<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px">${socialLinks.map((l) => socialIcon(l.type, "13px", a)).join("")}</div>`
        : "";
    const qrBlock =
      data.showQr && qrSvg
        ? `<div style="width:100px;height:100px;margin-bottom:6px">${qrSvg.replace(/<svg /, '<svg style="width:100px;height:100px" ')}</div>`
        : "";
    return `<div style="${cardStyle()}">
  ${textureOverlay}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 22px;text-align:center">
    <div style="font-size:11px;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px">${esc(displayName)}</div>
    ${qrBlock}
    ${contactLine}
    ${socialRow}
  </div>
  ${accentBar(a, "top")}
</div>`;
  },
};
