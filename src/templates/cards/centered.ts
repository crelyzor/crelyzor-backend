import {
  CardTemplateData,
  TemplateRenderer,
  esc,
  initial,
  socialBtns,
  qrImg,
  stripUrl,
  firstLast,
  DM,
  MONO,
} from "../helpers";

// ── A: Classic Centered ───────────────────────────────────

export const classicCentered: TemplateRenderer = {
  meta: {
    id: "classic-centered",
    name: "Classic Centered",
    description: "Centered monogram with gold top and bottom lines",
  },
  front(data) {
    const { displayName, title, accentColor: a } = data;
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#0a0a0b;font-family:${DM};border:1px solid ${a}33">
  <div style="position:absolute;top:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,${a},transparent)"></div>
  <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
    <div style="width:38px;height:38px;border-radius:9px;border:1px solid ${a};display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:16px;font-weight:600;color:${a};letter-spacing:1px">${initial(displayName)}</div>
    <div style="font-size:20px;font-weight:500;color:#f5f4f0;letter-spacing:-0.01em;margin-bottom:4px">${esc(displayName)}</div>
    ${title ? `<div style="font-size:11px;color:${a}88;letter-spacing:0.12em;text-transform:uppercase">${esc(title)}</div>` : ""}
    <div style="width:24px;height:1px;background:${a};margin:8px auto 0;opacity:0.7"></div>
  </div>
  <div style="position:absolute;bottom:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,${a},transparent)"></div>
</div>`;
  },
  back(data, qrSvg) {
    const { displayName, contactFields: cf, links, accentColor: a, showQr } = data;
    const contacts = [
      cf.email,
      cf.phone,
      cf.website ? stripUrl(cf.website) : null,
      cf.location,
    ].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#0a0a0b;font-family:${DM};border:1px solid ${a}33">
  <div style="position:absolute;top:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,${a},transparent)"></div>
  <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
    <div style="font-size:11px;letter-spacing:0.18em;color:${a}88;text-transform:uppercase;font-family:${MONO}">${esc(displayName)}</div>
    ${qrImg(qrSvg, showQr, 72)}
    <div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center">${contacts.map((v) => `<span style="font-size:11px;color:#ccc9;font-family:${MONO}">${esc(v!)}</span>`).join("")}</div>
    ${socialBtns(links, a)}
  </div>
  <div style="position:absolute;bottom:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,${a},transparent)"></div>
</div>`;
  },
};

// ── F: Ghost / Outline ────────────────────────────────────

export const ghostOutline: TemplateRenderer = {
  meta: {
    id: "ghost-outline",
    name: "Ghost Outline",
    description: "Transparent background with corner bracket marks",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    const corners = `
  <div style="position:absolute;top:14px;left:14px;width:12px;height:12px;border-top:1px solid ${a};border-left:1px solid ${a}"></div>
  <div style="position:absolute;top:14px;right:14px;width:12px;height:12px;border-top:1px solid ${a};border-right:1px solid ${a}"></div>
  <div style="position:absolute;bottom:14px;left:14px;width:12px;height:12px;border-bottom:1px solid ${a};border-left:1px solid ${a}"></div>
  <div style="position:absolute;bottom:14px;right:14px;width:12px;height:12px;border-bottom:1px solid ${a};border-right:1px solid ${a}"></div>`;
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:transparent;font-family:${DM};border:1px solid ${a}73">
  ${corners}
  <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
    <div style="font-size:10px;letter-spacing:0.22em;color:${a}88;text-transform:uppercase;margin-bottom:14px;font-family:${MONO}">${esc(title ?? "")}</div>
    <div style="font-size:24px;font-weight:300;color:#eeece8;letter-spacing:0.04em">${esc(displayName)}</div>
    <div style="width:40px;height:1px;background:${a};margin:14px auto;opacity:0.6"></div>
    <div style="font-size:11px;color:#aaa8;font-family:${MONO};letter-spacing:0.06em">${esc(siteStr)}</div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { contactFields: cf, links, accentColor: a, showQr } = data;
    const contacts = [cf.email, cf.phone, cf.location].filter(Boolean);
    const corners = `
  <div style="position:absolute;top:14px;left:14px;width:12px;height:12px;border-top:1px solid ${a};border-left:1px solid ${a}"></div>
  <div style="position:absolute;top:14px;right:14px;width:12px;height:12px;border-top:1px solid ${a};border-right:1px solid ${a}"></div>
  <div style="position:absolute;bottom:14px;left:14px;width:12px;height:12px;border-bottom:1px solid ${a};border-left:1px solid ${a}"></div>
  <div style="position:absolute;bottom:14px;right:14px;width:12px;height:12px;border-bottom:1px solid ${a};border-right:1px solid ${a}"></div>`;
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:transparent;font-family:${DM};border:1px solid ${a}73;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
  ${corners}
  ${qrImg(qrSvg, showQr, 68)}
  <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
    ${contacts.map((v) => `<div style="font-size:10px;color:#aaa8;font-family:${MONO}">${esc(v!)}</div>`).join("")}
  </div>
  ${socialBtns(links, a)}
</div>`;
  },
};

// ── N: Circle Composition ─────────────────────────────────

export const circle: TemplateRenderer = {
  meta: {
    id: "circle",
    name: "Circle",
    description: "Concentric rings with gilded monogram center",
  },
  front(data) {
    const { displayName, title, accentColor: a } = data;
    const [, last] = firstLast(displayName);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#050508;font-family:${DM};display:flex;align-items:center;justify-content:center">
  <div style="position:absolute;width:260px;height:260px;border-radius:50%;border:1px solid ${a}14"></div>
  <div style="position:absolute;width:200px;height:200px;border-radius:50%;border:1px solid ${a}1f"></div>
  <div style="position:absolute;width:144px;height:144px;border-radius:50%;border:1px solid ${a}38"></div>
  <div style="width:90px;height:90px;border-radius:50%;background:radial-gradient(circle at 35% 35%,${a}40,${a}1a);border:1px solid ${a}73;display:flex;align-items:center;justify-content:center;position:relative;z-index:1;flex-direction:column;gap:2px">
    <div style="font-size:22px;font-weight:600;color:${a};line-height:1">${initial(displayName)}</div>
    ${last ? `<div style="font-size:7px;color:${a}80;letter-spacing:0.12em">${initial(last)}</div>` : ""}
  </div>
  <div style="position:absolute;bottom:22px;left:0;right:0;text-align:center">
    <div style="font-size:16px;font-weight:400;color:#e8e5e0;letter-spacing:0.04em">${esc(displayName)}</div>
    ${title ? `<div style="font-size:10px;color:${a}88;letter-spacing:0.16em;text-transform:uppercase;margin-top:3px">${esc(title)}</div>` : ""}
  </div>
  <div style="position:absolute;top:18px;left:0;right:0;text-align:center;font-size:8.5px;color:#aaa7;font-family:${MONO};letter-spacing:0.14em">CRELYZOR</div>
</div>`;
  },
  back(data, qrSvg) {
    const { contactFields: cf, links, accentColor: a, showQr } = data;
    const contacts = [
      cf.email,
      cf.phone,
      cf.website ? stripUrl(cf.website) : null,
    ].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#050508;font-family:${DM};display:flex;align-items:center;justify-content:center">
  <div style="position:absolute;width:260px;height:260px;border-radius:50%;border:1px solid ${a}0f"></div>
  <div style="position:absolute;width:200px;height:200px;border-radius:50%;border:1px solid ${a}1a"></div>
  <div style="position:absolute;width:144px;height:144px;border-radius:50%;border:1px solid ${a}2e"></div>
  <div style="position:relative;z-index:1;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px">
    ${qrImg(qrSvg, showQr, 60)}
    <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
      ${contacts.map((v) => `<div style="font-size:11px;color:#aaa9;font-family:${MONO}">${esc(v!)}</div>`).join("")}
    </div>
    ${socialBtns(links, a)}
  </div>
</div>`;
  },
};

// ── Q: Extreme Minimal ────────────────────────────────────

export const extremeMinimal: TemplateRenderer = {
  meta: {
    id: "extreme-minimal",
    name: "Extreme Minimal",
    description: "Single gold dot, name only — absolute restraint",
  },
  front(data) {
    const { displayName, contactFields: cf, accentColor: a } = data;
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#030305;font-family:${DM};display:flex;align-items:center;justify-content:center;border:1px solid ${a}1f">
  <div style="position:absolute;top:28px;left:28px;width:6px;height:6px;border-radius:50%;background:${a}"></div>
  <div style="text-align:center">
    <div style="font-size:15px;font-weight:300;color:#d1d0cc;letter-spacing:0.22em;text-transform:uppercase">${esc(displayName)}</div>
  </div>
  <div style="position:absolute;bottom:28px;left:28px;right:28px;display:flex;justify-content:space-between;font-size:8.5px;color:#aaa7;font-family:${MONO};letter-spacing:0.06em">
    <span>${esc(siteStr)}</span>
    <span>${esc(cf.location ?? "")}</span>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { accentColor: a, showQr } = data;
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#030305;font-family:${DM};display:flex;align-items:center;justify-content:center;border:1px solid ${a}1f">
  <div style="position:absolute;bottom:28px;right:28px;width:6px;height:6px;border-radius:50%;background:${a}"></div>
  <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
    ${qrImg(qrSvg, showQr, 72)}
    <div style="font-size:9px;color:#aaa7;font-family:${MONO};letter-spacing:0.1em;text-transform:uppercase">Scan to connect</div>
  </div>
</div>`;
  },
};
