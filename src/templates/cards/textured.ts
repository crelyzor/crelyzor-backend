import {
  TemplateRenderer,
  esc,
  socialBtns,
  qrImg,
  stripUrl,
  firstLast,
  DM,
  MONO,
} from "../helpers";

// ── K: Terminal / Dot Matrix ──────────────────────────────

export const terminal: TemplateRenderer = {
  meta: {
    id: "terminal",
    name: "Terminal",
    description: "Dot grid background with terminal-style code layout",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#040407;font-family:${MONO};padding:14px 18px;border:1px solid ${a}59">
  <div style="position:absolute;inset:0;border-radius:16px;background-image:radial-gradient(circle,${a}33 1px,transparent 1px);background-size:16px 16px;pointer-events:none"></div>
  <div style="position:relative">
    <div style="font-size:10px;color:${a}88;margin-bottom:16px;letter-spacing:0.05em">&gt; card.init("${esc(displayName.toLowerCase().replace(/ /g, "-"))}")</div>
    <div style="font-size:10px;color:#aaa7;margin-bottom:3px">// name</div>
    <div style="font-size:18px;font-weight:400;color:#e8e5e0;margin-bottom:14px;letter-spacing:0.01em">${esc(displayName)}</div>
    <div style="display:flex;flex-direction:column;gap:5px">
      ${title ? `<div style="font-size:11px;color:${a}88">role<span style="color:#aaa6"> = </span><span style="color:#bbb9">"${esc(title)}"</span></div>` : ""}
      ${siteStr ? `<div style="font-size:11px;color:${a}88">web<span style="color:#aaa6"> = </span><span style="color:#bbb9">"${esc(siteStr)}"</span></div>` : ""}
      ${cf.location ? `<div style="font-size:11px;color:${a}88">loc<span style="color:#aaa6"> = </span><span style="color:#bbb9">"${esc(cf.location)}"</span></div>` : ""}
    </div>
  </div>
  <div style="position:absolute;bottom:20px;right:24px;display:flex;align-items:center;gap:5px;font-size:8.5px;color:#aaa8">
    <div style="width:5px;height:5px;background:${a};border-radius:50%;opacity:0.7"></div>
    ACTIVE
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { contactFields: cf, links, accentColor: a, showQr } = data;
    const rows = [
      cf.email ? ["email", cf.email] : null,
      cf.phone ? ["phone", cf.phone] : null,
      cf.website ? ["url", stripUrl(cf.website)] : null,
      cf.location ? ["city", cf.location] : null,
    ].filter(Boolean) as [string, string][];
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#040407;font-family:${MONO};padding:14px 18px;border:1px solid ${a}59;display:flex;flex-direction:column;justify-content:space-between">
  <div style="position:absolute;inset:0;border-radius:16px;background-image:radial-gradient(circle,${a}33 1px,transparent 1px);background-size:16px 16px;pointer-events:none"></div>
  <div style="position:relative;display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:${a}88;margin-bottom:10px">&gt; card.contact()</div>
    ${rows.map(([k, v]) => `<div style="font-size:11px"><span style="color:${a}88">${k}</span><span style="color:#aaa7"> → </span><span style="color:#bbb9">${esc(v)}</span></div>`).join("")}
  </div>
  <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-end">
    ${socialBtns(links, a)}
    ${qrImg(qrSvg, showQr, 60)}
  </div>
</div>`;
  },
};

// ── M: Ruled Stationery ───────────────────────────────────

export const ruled: TemplateRenderer = {
  meta: {
    id: "ruled",
    name: "Ruled",
    description: "Notebook ruled lines with red margin accent",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const lines = Array.from(
      { length: 8 },
      (_, i) =>
        `<div style="position:absolute;left:0;right:0;top:${28 + i * 26}px;height:1px;background:${a}${i === 3 ? "59" : "12"}"></div>`,
    ).join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#05050a;font-family:${DM}">
  ${lines}
  <div style="position:absolute;left:52px;top:0;bottom:0;width:1px;background:oklch(0.55 0.18 25 / 0.4)"></div>
  <div style="position:absolute;top:14px;left:60px;right:14px">
    <div style="font-size:15px;font-weight:500;color:#edeae5;margin-top:8px;letter-spacing:-0.01em">${esc(displayName)}</div>
    ${title ? `<div style="font-size:10px;color:${a}88;letter-spacing:0.1em;text-transform:uppercase;margin-top:24px;margin-bottom:2px">${esc(title)}</div>` : ""}
    ${cf.email ? `<div style="font-size:10px;color:#aaa8;font-family:${MONO};margin-top:24px">${esc(cf.email)}</div>` : ""}
    ${cf.phone || cf.location ? `<div style="font-size:10px;color:#aaa8;font-family:${MONO};margin-top:24px">${[cf.phone, cf.location].filter(Boolean).join(" · ")}</div>` : ""}
  </div>
  <div style="position:absolute;bottom:10px;right:20px;font-size:8.5px;color:#aaa6;font-family:${MONO}">01</div>
</div>`;
  },
  back(data, qrSvg) {
    const { bio, contactFields: cf, links, accentColor: a, showQr } = data;
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    const lines = Array.from(
      { length: 8 },
      (_, i) =>
        `<div style="position:absolute;left:0;right:0;top:${28 + i * 26}px;height:1px;background:${a}${i === 5 ? "59" : "12"}"></div>`,
    ).join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#05050a;font-family:${DM}">
  ${lines}
  <div style="position:absolute;left:52px;top:0;bottom:0;width:1px;background:oklch(0.55 0.18 25 / 0.4)"></div>
  <div style="position:absolute;top:14px;left:60px;right:14px">
    ${bio ? `<div style="font-size:10px;color:#aaa7;font-family:${MONO};margin-top:8px;line-height:1.6">${esc(bio)}</div>` : ""}
    <div style="margin-top:54px;display:flex;justify-content:space-between;align-items:center">
      ${siteStr ? `<div style="font-size:11px;color:${a}88;font-family:${MONO}">${esc(siteStr)}</div>` : ""}
      ${socialBtns(links, a)}
    </div>
  </div>
  ${qrImg(qrSvg, showQr, 52, "position:absolute;bottom:14px;right:20px")}
  <div style="position:absolute;bottom:10px;left:20px;font-size:8.5px;color:#aaa6;font-family:${MONO}">02</div>
</div>`;
  },
};

// ── T: Textile / Woven ────────────────────────────────────

export const textile: TemplateRenderer = {
  meta: {
    id: "textile",
    name: "Textile",
    description: "Woven crosshatch texture with inner frame border",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const [first, last] = firstLast(displayName);
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#070709;font-family:${DM};border:1px solid ${a}40">
  <div style="position:absolute;inset:0;border-radius:16px;opacity:0.6;background-image:repeating-linear-gradient(45deg,${a}0a 0px,${a}0a 1px,transparent 1px,transparent 8px),repeating-linear-gradient(-45deg,${a}0a 0px,${a}0a 1px,transparent 1px,transparent 8px);pointer-events:none"></div>
  <div style="position:absolute;inset:8px;border:1px solid ${a}33;border-radius:9px;pointer-events:none"></div>
  <div style="position:absolute;inset:16px 20px;display:flex;flex-direction:column;justify-content:space-between">
    <div>
      <div style="font-size:8.5px;letter-spacing:0.22em;color:${a}88;text-transform:uppercase;margin-bottom:12px">Crelyzor · 2026</div>
      <div style="font-size:21px;font-weight:400;color:#edeae5;letter-spacing:-0.01em;line-height:1.2">${esc(first)}${last ? `<br/>${esc(last)}` : ""}</div>
    </div>
    <div>
      <div style="height:1px;background:${a}2e;margin-bottom:10px"></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;font-family:${MONO}">
        ${title ? `<span style="color:${a}88">${esc(title)}</span>` : ""}
        <span style="color:#aaa8">${esc(siteStr)}</span>
      </div>
    </div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { contactFields: cf, links, accentColor: a, showQr } = data;
    const rows = [
      cf.email
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#aaa9;align-items:center"><span style="color:${a}88;width:12px">✉</span><span style="font-family:${MONO}">${esc(cf.email)}</span></div>`
        : "",
      cf.phone
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#aaa9;align-items:center"><span style="color:${a}88;width:12px">↗</span><span style="font-family:${MONO}">${esc(cf.phone)}</span></div>`
        : "",
      cf.website
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#aaa9;align-items:center"><span style="color:${a}88;width:12px">◉</span><span style="font-family:${MONO}">${esc(stripUrl(cf.website))}</span></div>`
        : "",
      cf.location
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#aaa9;align-items:center"><span style="color:${a}88;width:12px">◎</span><span style="font-family:${MONO}">${esc(cf.location)}</span></div>`
        : "",
    ].join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#070709;font-family:${DM};border:1px solid ${a}40">
  <div style="position:absolute;inset:0;border-radius:16px;opacity:0.6;background-image:repeating-linear-gradient(45deg,${a}0a 0px,${a}0a 1px,transparent 1px,transparent 8px),repeating-linear-gradient(-45deg,${a}0a 0px,${a}0a 1px,transparent 1px,transparent 8px);pointer-events:none"></div>
  <div style="position:absolute;inset:8px;border:1px solid ${a}2e;border-radius:9px;pointer-events:none"></div>
  <div style="position:absolute;inset:16px 20px;display:flex;gap:18px;align-items:center">
    ${qrImg(qrSvg, showQr, 76)}
    <div style="flex:1;display:flex;flex-direction:column;gap:7px">
      ${rows}
      <div style="margin-top:2px">${socialBtns(links, a)}</div>
    </div>
  </div>
</div>`;
  },
};
