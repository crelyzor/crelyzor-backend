import {
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

// ── O: Light / Inverted ───────────────────────────────────

export const light: TemplateRenderer = {
  meta: {
    id: "light",
    name: "Light",
    description: "Inverted light background with solid gold accent",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const rows = [
      cf.email
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#6669;align-items:center"><span style="color:${a};width:12px">✉</span><span style="font-family:${MONO}">${esc(cf.email)}</span></div>`
        : "",
      cf.phone
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#6669;align-items:center"><span style="color:${a};width:12px">↗</span><span style="font-family:${MONO}">${esc(cf.phone)}</span></div>`
        : "",
      cf.location
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#6669;align-items:center"><span style="color:${a};width:12px">◎</span><span style="font-family:${MONO}">${esc(cf.location)}</span></div>`
        : "",
    ].join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#f5f3ee;font-family:${DM};padding:18px 22px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #d4c9a0">
  <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${a},${a}cc)"></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:18px;font-weight:500;color:#1a1814;letter-spacing:-0.01em">${esc(displayName)}</div>
      ${title ? `<div style="font-size:10px;color:${a};letter-spacing:0.12em;text-transform:uppercase;margin-top:4px">${esc(title)}</div>` : ""}
    </div>
    <div style="width:38px;height:38px;border-radius:9px;background:${a};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;color:#f5f3ee">${initial(displayName)}</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:5px">${rows}</div>
</div>`;
  },
  back(data, qrSvg) {
    const { bio, contactFields: cf, links, accentColor: a, showQr } = data;
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#f5f3ee;font-family:${DM};padding:18px 22px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #d4c9a0">
  <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${a},${a}cc)"></div>
  ${bio ? `<div style="font-size:11.5px;color:#55559a;line-height:1.7;font-weight:300;max-width:80%;margin-top:8px">${esc(bio)}</div>` : "<div></div>"}
  <div style="display:flex;justify-content:space-between;align-items:flex-end">
    <div style="display:flex;flex-direction:column;gap:6px">
      ${siteStr ? `<div style="font-size:11px;color:${a};font-family:${MONO}">${esc(siteStr)}</div>` : ""}
      ${socialBtns(links, a, `${a}66`)}
    </div>
    ${qrImg(qrSvg, showQr, 64)}
  </div>
</div>`;
  },
};

// ── U: Brutalist ──────────────────────────────────────────

export const brutalist: TemplateRenderer = {
  meta: {
    id: "brutalist",
    name: "Brutalist",
    description:
      "Raw bold typography on light background with black structural bars",
  },
  front(data) {
    const { displayName, title, contactFields: cf } = data;
    const [first, last] = firstLast(displayName);
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:4px;box-sizing:border-box;background:#f0ede8;font-family:${DM};border:3px solid #111;display:flex;flex-direction:column;justify-content:space-between;padding:14px 16px">
  <div style="position:absolute;top:0;left:0;right:0;height:8px;background:#111"></div>
  <div style="margin-top:14px">
    <div style="font-size:28px;font-weight:700;color:#111;letter-spacing:-0.04em;line-height:0.95;text-transform:uppercase">${esc(first)}${last ? `<br/>${esc(last)}` : ""}</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end">
    ${title ? `<div style="font-size:10px;font-weight:600;color:#111;letter-spacing:0.06em;text-transform:uppercase;line-height:1.6">${esc(title.replace(" ", "<br/>"))}</div>` : "<div></div>"}
    <div style="background:#111;color:#f0ede8;padding:6px 10px;font-size:11px;font-family:${MONO};letter-spacing:0.04em">${esc(siteStr)}</div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { displayName, contactFields: cf, showQr } = data;
    const [first, last] = firstLast(displayName);
    const contacts = [cf.email, cf.phone, cf.location].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:4px;box-sizing:border-box;background:#111;font-family:${DM};border:3px solid #111;display:flex;flex-direction:column;justify-content:space-between;padding:14px 16px">
  <div style="position:absolute;bottom:0;left:0;right:0;height:8px;background:#f0ede8"></div>
  <div style="display:flex;gap:16px;align-items:flex-start">
    ${qrImg(qrSvg, showQr, 72, "border:1px solid #f0ede8")}
    <div style="display:flex;flex-direction:column;gap:5px">
      ${contacts.map((v) => `<div style="font-size:11px;color:#f0ede8;font-family:${MONO}">${esc(v!)}</div>`).join("")}
    </div>
  </div>
  <div style="font-size:22px;font-weight:700;color:#f0ede8;letter-spacing:-0.03em;text-transform:uppercase;line-height:0.95;margin-bottom:12px">${esc(first)}${last ? `<br/>${esc(last)}` : ""}</div>
</div>`;
  },
};

// ── V: Y2K Holographic ────────────────────────────────────

export const y2k: TemplateRenderer = {
  meta: {
    id: "y2k",
    name: "Y2K",
    description: "Holographic gradient with glass-effect elements",
  },
  front(data) {
    const { displayName, title } = data;
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:14px;box-sizing:border-box;background:linear-gradient(135deg,oklch(0.85 0.15 280),oklch(0.82 0.18 320),oklch(0.88 0.14 200),oklch(0.9 0.12 60));font-family:${DM};border:1px solid rgba(255,255,255,0.6)">
  <div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,0.3) 0%,transparent 50%,rgba(255,255,255,0.1) 100%);border-radius:14px;pointer-events:none"></div>
  <div style="position:absolute;inset:14px 18px;display:flex;flex-direction:column;justify-content:space-between">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:rgba(80,0,120,0.8)">${initial(displayName)}</div>
      <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.7);letter-spacing:0.15em;text-transform:uppercase;text-align:right">Digital<br/>Business Card</div>
    </div>
    <div>
      <div style="font-size:20px;font-weight:700;color:rgba(50,0,80,0.85);letter-spacing:-0.02em;margin-bottom:4px">${esc(displayName)}</div>
      ${title ? `<div style="display:inline-block;font-size:10px;font-weight:600;color:rgba(255,255,255,0.9);letter-spacing:0.08em;background:rgba(80,0,120,0.35);padding:3px 8px;border-radius:20px;text-transform:uppercase">${esc(title)}</div>` : ""}
    </div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { contactFields: cf, links, showQr } = data;
    const contacts = [
      cf.email,
      cf.phone,
      cf.website ? stripUrl(cf.website) : null,
    ].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:14px;box-sizing:border-box;background:linear-gradient(225deg,oklch(0.85 0.15 280),oklch(0.82 0.18 320),oklch(0.88 0.14 200),oklch(0.9 0.12 60));font-family:${DM};border:1px solid rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center">
  <div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,0.25) 0%,transparent 50%);border-radius:14px;pointer-events:none"></div>
  <div style="background:rgba(255,255,255,0.35);border:1px solid rgba(255,255,255,0.6);border-radius:12px;padding:16px 20px;display:flex;gap:16px;align-items:center;position:relative">
    ${qrImg(qrSvg, showQr, 68, "border:1px solid rgba(80,0,120,0.3)")}
    <div style="display:flex;flex-direction:column;gap:5px">
      ${contacts.map((v) => `<div style="font-size:11px;color:rgba(50,0,80,0.75);font-family:${MONO}">${esc(v!)}</div>`).join("")}
      <div style="margin-top:4px">${socialBtns(links, "rgba(80,0,120,0.8)", "rgba(80,0,120,0.35)")}</div>
    </div>
  </div>
</div>`;
  },
};

// ── W: Earthy / Organic ───────────────────────────────────

export const earthy: TemplateRenderer = {
  meta: {
    id: "earthy",
    name: "Earthy",
    description: "Warm cream tones with organic grain and green moss edge",
  },
  front(data) {
    const { displayName, title, contactFields: cf } = data;
    const [first, last] = firstLast(displayName);
    const MOSS = "oklch(0.45 0.1 145)";
    const CLAY = "oklch(0.62 0.1 55)";
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:12px;box-sizing:border-box;background:oklch(0.91 0.03 80);font-family:${DM};padding:16px 20px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid oklch(0.75 0.06 70)">
  <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(92deg,oklch(0.75 0.04 70 / 0.08) 0px,transparent 1px,transparent 3px);pointer-events:none"></div>
  <div style="position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(180deg,${MOSS},oklch(0.38 0.09 145));opacity:0.8"></div>
  <div style="padding-left:8px">
    ${title ? `<div style="font-size:11px;letter-spacing:0.14em;color:${CLAY};text-transform:uppercase;margin-bottom:8px;font-weight:500">${esc(title)}</div>` : ""}
    <div style="font-size:21px;font-weight:400;color:#2d2218;letter-spacing:-0.01em;line-height:1.15">${esc(first)}${last ? `<br/>${esc(last)}` : ""}</div>
  </div>
  <div style="padding-left:8px">
    <div style="height:1px;background:oklch(0.75 0.06 70);margin-bottom:10px"></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;font-family:${MONO}">
      <span style="color:${MOSS}">${esc(siteStr)}</span>
      <span style="color:oklch(0.45 0.05 70)">${esc(cf.location ?? "")}</span>
    </div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { bio, contactFields: cf, links, showQr } = data;
    const MOSS = "oklch(0.45 0.1 145)";
    const CLAY = "oklch(0.62 0.1 55)";
    const rows = [
      cf.email
        ? `<div style="display:flex;gap:7px;font-size:10px;color:oklch(0.45 0.05 70);align-items:center"><span style="color:${CLAY};width:12px">✉</span><span style="font-family:${MONO}">${esc(cf.email)}</span></div>`
        : "",
      cf.phone
        ? `<div style="display:flex;gap:7px;font-size:10px;color:oklch(0.45 0.05 70);align-items:center"><span style="color:${CLAY};width:12px">↗</span><span style="font-family:${MONO}">${esc(cf.phone)}</span></div>`
        : "",
      cf.location
        ? `<div style="display:flex;gap:7px;font-size:10px;color:oklch(0.45 0.05 70);align-items:center"><span style="color:${CLAY};width:12px">◎</span><span style="font-family:${MONO}">${esc(cf.location)}</span></div>`
        : "",
    ].join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:12px;box-sizing:border-box;background:oklch(0.91 0.03 80);font-family:${DM};padding:16px 20px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid oklch(0.75 0.06 70)">
  <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(92deg,oklch(0.75 0.04 70 / 0.08) 0px,transparent 1px,transparent 3px);pointer-events:none"></div>
  <div style="position:absolute;right:0;top:0;bottom:0;width:5px;background:linear-gradient(180deg,${MOSS},oklch(0.38 0.09 145));opacity:0.8"></div>
  <div style="display:flex;align-items:center;gap:18px">
    ${qrImg(qrSvg, showQr, 72, `border:1px solid oklch(0.65 0.08 70)`)}
    <div style="display:flex;flex-direction:column;gap:6px">
      ${rows}
      <div style="margin-top:3px">${socialBtns(links, CLAY, `oklch(0.65 0.08 70 / 0.6)`)}</div>
    </div>
  </div>
  ${bio ? `<div style="font-size:11.5px;color:oklch(0.45 0.06 70 / 0.65);line-height:1.65;font-weight:300">${esc(bio)}</div>` : ""}
</div>`;
  },
};

// ── X: Soft Pastel ────────────────────────────────────────

export const softPastel: TemplateRenderer = {
  meta: {
    id: "soft-pastel",
    name: "Soft Pastel",
    description: "Lavender-blue gradient with soft blob and purple accents",
  },
  front(data) {
    const { displayName, title, contactFields: cf } = data;
    const PURPLE = "oklch(0.75 0.14 290)";
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:20px;box-sizing:border-box;background:linear-gradient(145deg,oklch(0.93 0.06 300),oklch(0.95 0.04 240));font-family:${DM};padding:16px 20px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid oklch(0.85 0.06 290)">
  <div style="position:absolute;bottom:-30px;right:-30px;width:160px;height:160px;border-radius:50%;background:oklch(0.9 0.08 320 / 0.35);pointer-events:none"></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div style="width:42px;height:42px;border-radius:14px;background:${PURPLE};display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;color:white;box-shadow:0 4px 12px oklch(0.75 0.14 290 / 0.35)">${initial(displayName)}</div>
    <div style="font-size:9px;color:oklch(0.6 0.08 290);letter-spacing:0.08em;text-transform:uppercase;text-align:right;line-height:1.5">Digital<br/>Business Card</div>
  </div>
  <div>
    <div style="font-size:19px;font-weight:500;color:oklch(0.25 0.06 290);letter-spacing:-0.01em;margin-bottom:4px">${esc(displayName)}</div>
    ${title ? `<div style="display:inline-block;font-size:10px;font-weight:500;color:oklch(0.65 0.12 290);background:oklch(0.75 0.12 290 / 0.15);padding:3px 10px;border-radius:20px;letter-spacing:0.05em">${esc(title)}</div>` : ""}
    <div style="margin-top:12px;display:flex;gap:14px;font-size:10px;color:oklch(0.5 0.06 290 / 0.65);font-family:${MONO}">
      ${siteStr ? `<span>${esc(siteStr)}</span>` : ""}
      ${cf.location ? `<span>${esc(cf.location)}</span>` : ""}
    </div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { bio, contactFields: cf, links, showQr } = data;
    const contacts = [cf.email, cf.phone].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:20px;box-sizing:border-box;background:linear-gradient(145deg,oklch(0.95 0.04 240),oklch(0.93 0.06 300));font-family:${DM};padding:16px 20px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid oklch(0.85 0.06 290)">
  <div style="position:absolute;top:-30px;left:-30px;width:160px;height:160px;border-radius:50%;background:oklch(0.9 0.08 240 / 0.3);pointer-events:none"></div>
  ${bio ? `<div style="font-size:11.5px;color:oklch(0.4 0.05 290 / 0.7);line-height:1.7;font-weight:300;position:relative">${esc(bio)}</div>` : "<div></div>"}
  <div style="display:flex;justify-content:space-between;align-items:flex-end;position:relative">
    <div style="display:flex;flex-direction:column;gap:5px">
      ${contacts.map((v) => `<div style="font-size:11px;color:oklch(0.55 0.06 290 / 0.7);font-family:${MONO}">${esc(v!)}</div>`).join("")}
      <div style="margin-top:5px">${socialBtns(links, "oklch(0.65 0.12 290)", "oklch(0.75 0.12 290 / 0.4)")}</div>
    </div>
    ${qrImg(qrSvg, showQr, 64, "border:1px solid oklch(0.75 0.1 290 / 0.35)")}
  </div>
</div>`;
  },
};
