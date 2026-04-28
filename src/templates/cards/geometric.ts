import {
  TemplateRenderer,
  esc,
  initial,
  socialBtns,
  qrImg,
  stripUrl,
  DM,
  MONO,
} from "../helpers";

// ── J: Diagonal Split ─────────────────────────────────────

export const diagonalSplit: TemplateRenderer = {
  meta: {
    id: "diagonal-split",
    name: "Diagonal Split",
    description: "SVG diagonal accent with initial top-left, info bottom-right",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#060608;font-family:${DM}">
  <svg style="position:absolute;inset:0;width:100%;height:100%;border-radius:16px" viewBox="0 0 380 240" preserveAspectRatio="none">
    <polygon points="0,0 175,0 0,240" fill="${a}" opacity="0.18"/>
    <line x1="175" y1="0" x2="0" y2="240" stroke="${a}" stroke-width="0.8" opacity="0.6"/>
  </svg>
  <div style="position:absolute;top:22px;left:22px;font-size:36px;font-weight:700;color:${a}b3;line-height:1">${initial(displayName)}</div>
  <div style="position:absolute;bottom:22px;right:24px;text-align:right">
    <div style="font-size:17px;font-weight:500;color:#edeae5;letter-spacing:-0.01em;margin-bottom:4px">${esc(displayName)}</div>
    ${title ? `<div style="font-size:10px;color:${a}88;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">${esc(title)}</div>` : ""}
    <div style="font-size:11px;color:#aaa8;font-family:${MONO}">${esc(siteStr)}</div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { contactFields: cf, links, accentColor: a, showQr } = data;
    const contacts = [cf.email, cf.phone, cf.location].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#060608;font-family:${DM}">
  <svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 380 240" preserveAspectRatio="none">
    <polygon points="380,0 380,240 205,240" fill="${a}" opacity="0.1"/>
    <line x1="380" y1="0" x2="205" y2="240" stroke="${a}" stroke-width="0.8" opacity="0.5"/>
  </svg>
  <div style="position:absolute;top:22px;left:24px;display:flex;flex-direction:column;gap:8px">
    <div style="font-size:11px;color:${a}88;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px">Contact</div>
    ${contacts.map((v) => `<div style="font-size:10px;color:#aaa9;font-family:${MONO}">${esc(v!)}</div>`).join("")}
    <div style="margin-top:4px">${socialBtns(links, a)}</div>
  </div>
  <div style="position:absolute;bottom:22px;right:28px">${qrImg(qrSvg, showQr, 64)}</div>
</div>`;
  },
};

// ── R: Blueprint ──────────────────────────────────────────

export const blueprint: TemplateRenderer = {
  meta: {
    id: "blueprint",
    name: "Blueprint",
    description: "Technical blueprint aesthetic with grid and cross marks",
  },
  front(data) {
    const { displayName, title, contactFields: cf } = data;
    const BLUE = "oklch(0.5 0.1 230)";
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    const crossMarks = [
      [20, 20],
      [360, 20],
      [20, 220],
      [360, 220],
    ]
      .map(
        ([x, y], i) =>
          `<g key="${i}"><line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke="${BLUE}" stroke-width="0.8" opacity="0.5"/><line x1="${x - 6}" y1="${y}" x2="${x + 6}" y2="${y}" stroke="${BLUE}" stroke-width="0.8" opacity="0.5"/></g>`,
      )
      .join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:oklch(0.14 0.04 240);font-family:${MONO};border:1px solid oklch(0.5 0.12 230 / 0.5)">
  <div style="position:absolute;inset:0;background-image:linear-gradient(oklch(0.5 0.1 230 / 0.15) 1px,transparent 1px),linear-gradient(90deg,oklch(0.5 0.1 230 / 0.15) 1px,transparent 1px);background-size:20px 20px;border-radius:16px;pointer-events:none"></div>
  <svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 380 240">${crossMarks}</svg>
  <div style="position:absolute;top:22px;left:22px">
    <div style="font-size:8.5px;color:oklch(0.55 0.1 230 / 0.7);letter-spacing:0.1em;margin-bottom:8px">CARD_ID: ${initial(displayName)}K-2026-001</div>
    <div style="font-size:20px;font-weight:400;color:oklch(0.88 0.04 220);letter-spacing:0.04em">${esc(displayName.toUpperCase())}</div>
    ${title ? `<div style="font-size:11px;color:oklch(0.6 0.1 230 / 0.8);letter-spacing:0.1em;margin-top:6px">ROLE: ${esc(title.toUpperCase())}</div>` : ""}
  </div>
  <div style="position:absolute;bottom:14px;left:22px;right:22px">
    <div style="height:1px;background:oklch(0.5 0.1 230 / 0.3);margin-bottom:10px"></div>
    <div style="display:flex;justify-content:space-between;font-size:9.5px;color:oklch(0.55 0.1 230 / 0.65)">
      ${cf.location ? `<span>LOC: ${esc(cf.location.toUpperCase())}</span>` : ""}
      ${siteStr ? `<span>WEB: ${esc(siteStr.toUpperCase())}</span>` : ""}
      <span>REV: 1.0</span>
    </div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { contactFields: cf, showQr } = data;
    const BLUE = "oklch(0.5 0.1 230)";
    const rows = [
      cf.email ? ["EMAIL", cf.email] : null,
      cf.phone ? ["PHONE", cf.phone] : null,
      cf.website ? ["URL", stripUrl(cf.website)] : null,
      cf.location ? ["CITY", cf.location] : null,
    ].filter(Boolean) as [string, string][];
    const crossMarks = [
      [20, 20],
      [360, 20],
      [20, 220],
      [360, 220],
    ]
      .map(
        ([x, y], i) =>
          `<g key="${i}"><line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke="${BLUE}" stroke-width="0.8" opacity="0.5"/><line x1="${x - 6}" y1="${y}" x2="${x + 6}" y2="${y}" stroke="${BLUE}" stroke-width="0.8" opacity="0.5"/></g>`,
      )
      .join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:oklch(0.14 0.04 240);font-family:${MONO};border:1px solid oklch(0.5 0.12 230 / 0.5)">
  <div style="position:absolute;inset:0;background-image:linear-gradient(oklch(0.5 0.1 230 / 0.15) 1px,transparent 1px),linear-gradient(90deg,oklch(0.5 0.1 230 / 0.15) 1px,transparent 1px);background-size:20px 20px;border-radius:16px;pointer-events:none"></div>
  <svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 380 240">${crossMarks}</svg>
  <div style="position:absolute;inset:20px;display:flex;gap:20px;align-items:center">
    ${qrImg(qrSvg, showQr, 80, "border:1px solid oklch(0.5 0.1 230 / 0.5)")}
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rows.map(([k, v]) => `<div style="font-size:11px"><span style="color:oklch(0.5 0.1 230 / 0.6)">${k}: </span><span style="color:oklch(0.75 0.04 220)">${esc(v)}</span></div>`).join("")}
    </div>
  </div>
</div>`;
  },
};
