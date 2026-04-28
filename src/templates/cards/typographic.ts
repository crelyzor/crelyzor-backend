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

// ── C: Editorial / Typographic ────────────────────────────

export const editorial: TemplateRenderer = {
  meta: {
    id: "editorial",
    name: "Editorial",
    description: "Typographic layout with grid texture and bottom-anchored name",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const [first, last] = firstLast(displayName);
    const siteStr = cf.website ? stripUrl(cf.website) : data.publicUrl ? stripUrl(data.publicUrl) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#060607;font-family:${DM};border:1px solid ${a}40">
  <div style="position:absolute;inset:0;border-radius:16px;background-image:linear-gradient(${a}0a 1px,transparent 1px),linear-gradient(90deg,${a}0a 1px,transparent 1px);background-size:32px 32px;pointer-events:none"></div>
  <div style="position:absolute;top:16px;right:20px;font-size:11px;font-weight:500;color:${a};letter-spacing:0.2em;text-transform:uppercase;font-family:${MONO}">${initial(displayName)}${last ? initial(last) : ""}</div>
  <div style="position:absolute;bottom:16px;left:20px;right:20px">
    ${title ? `<div style="font-size:11px;color:${a}88;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:10px">${esc(title)}</div>` : ""}
    <div style="font-size:26px;font-weight:300;color:#eeece8;letter-spacing:-0.03em;line-height:1.1;margin-bottom:10px">${esc(first)}${last ? `<br/>${esc(last)}` : ""}</div>
    <div style="width:100%;height:1px;background:${a}2e"></div>
    <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:11px;color:#aaa8;font-family:${MONO}">
      <span>${esc(siteStr)}</span>
      <span>${esc(cf.location ?? "")}</span>
    </div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { bio, contactFields: cf, links, accentColor: a, showQr } = data;
    const contacts = [
      cf.email,
      cf.phone,
      cf.website ? stripUrl(cf.website) : null,
    ].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#060607;font-family:${DM};border:1px solid ${a}40">
  <div style="position:absolute;inset:0;border-radius:16px;background-image:linear-gradient(${a}0a 1px,transparent 1px),linear-gradient(90deg,${a}0a 1px,transparent 1px);background-size:32px 32px;pointer-events:none"></div>
  <div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:18px 22px">
    <div>
      <div style="font-size:11px;color:${a}88;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:10px">About</div>
      ${bio ? `<div style="font-size:12px;color:#bbb9;line-height:1.65;font-weight:300;max-width:85%">${esc(bio)}</div>` : ""}
    </div>
    <div>
      <div style="height:1px;background:${a}2e;margin-bottom:16px"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div style="display:flex;flex-direction:column;gap:5px">
          ${contacts.map((v) => `<div style="font-size:11px;color:#aaa8;font-family:${MONO}">${esc(v!)}</div>`).join("")}
          ${socialBtns(links, a)}
        </div>
        ${qrImg(qrSvg, showQr, 60)}
      </div>
    </div>
  </div>
</div>`;
  },
};

// ── G: Monogram Hero ──────────────────────────────────────

export const monogramHero: TemplateRenderer = {
  meta: {
    id: "monogram-hero",
    name: "Monogram Hero",
    description: "Giant watermark monogram with name and contacts",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const [first, last] = firstLast(displayName);
    const mono = `${initial(first)}${last ? initial(last) : ""}`;
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#060608;font-family:${DM}">
  <div style="position:absolute;right:-10px;top:50%;transform:translateY(-55%);font-size:200px;font-weight:700;color:${a}0f;line-height:1;letter-spacing:-0.05em;user-select:none;pointer-events:none">${esc(mono)}</div>
  <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${a} 0%,transparent 60%)"></div>
  <div style="position:absolute;bottom:16px;left:20px;right:20px">
    <div style="font-size:18px;font-weight:500;color:#f0ede8;margin-bottom:4px;letter-spacing:-0.01em">${esc(displayName)}</div>
    ${title ? `<div style="font-size:10px;color:${a}88;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:14px">${esc(title)}</div>` : ""}
    <div style="display:flex;gap:16px;font-size:11px;color:#aaa8;font-family:${MONO}">
      ${cf.phone ? `<span>${esc(cf.phone)}</span>` : ""}
      ${cf.website ? `<span style="color:${a}88">${esc(stripUrl(cf.website))}</span>` : ""}
      ${cf.location ? `<span>${esc(cf.location)}</span>` : ""}
    </div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { displayName, contactFields: cf, links, accentColor: a, showQr } = data;
    const [first, last] = firstLast(displayName);
    const mono = `${initial(first)}${last ? initial(last) : ""}`;
    const contacts = [
      cf.email,
      cf.website ? stripUrl(cf.website) : null,
    ].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#060608;font-family:${DM}">
  <div style="position:absolute;left:-20px;top:50%;transform:translateY(-50%);font-size:200px;font-weight:700;color:${a}0a;line-height:1;user-select:none;pointer-events:none">${esc(mono)}</div>
  <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${a} 0%,transparent 60%)"></div>
  <div style="position:relative;height:100%;display:flex;align-items:center;padding:16px 20px;gap:14px">
    ${qrImg(qrSvg, showQr, 80)}
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="font-size:12px;font-weight:400;color:#e8e5e0;margin-bottom:2px">${esc(displayName)}</div>
      ${contacts.map((v) => `<div style="font-size:11px;color:#aaa8;font-family:${MONO}">${esc(v!)}</div>`).join("")}
      <div style="margin-top:4px">${socialBtns(links, a)}</div>
    </div>
  </div>
</div>`;
  },
};

// ── I: Full Bleed Type ────────────────────────────────────

export const fullBleed: TemplateRenderer = {
  meta: {
    id: "full-bleed",
    name: "Full Bleed",
    description: "Oversized name bleeds off edges with clean bottom info",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const [first, last] = firstLast(displayName);
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#050507;font-family:${DM};display:flex;flex-direction:column;justify-content:flex-end;padding:0 0 16px 0">
  <div style="position:absolute;top:50%;left:0;right:0;transform:translateY(-58%);font-size:64px;font-weight:700;color:${a}1f;letter-spacing:-0.04em;line-height:0.9;text-align:center;user-select:none;white-space:nowrap;overflow:hidden">${esc(first.toUpperCase())}${last ? `<br/>${esc(last.toUpperCase())}` : ""}</div>
  <div style="position:absolute;top:50%;left:24px;right:24px;height:1px;background:linear-gradient(90deg,transparent,${a},transparent);opacity:0.4"></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:0 18px;position:relative">
    <div>
      <div style="font-size:16px;font-weight:400;color:#edeae5;letter-spacing:-0.01em">${esc(displayName)}</div>
      ${title ? `<div style="font-size:11px;color:${a}88;letter-spacing:0.14em;text-transform:uppercase;margin-top:3px">${esc(title)}</div>` : ""}
    </div>
    <div style="font-size:11px;color:#aaa9;font-family:${MONO}">${esc(siteStr)}</div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { displayName, contactFields: cf, links, accentColor: a, showQr } = data;
    const [first, last] = firstLast(displayName);
    const contacts = [cf.email, cf.phone, cf.location].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#050507;font-family:${DM};display:flex;flex-direction:column;justify-content:flex-end;padding:0 0 16px 0">
  <div style="position:absolute;top:50%;left:0;right:0;transform:translateY(-58%);font-size:64px;font-weight:700;color:${a}0f;letter-spacing:-0.04em;line-height:0.9;text-align:center;user-select:none;white-space:nowrap;overflow:hidden">${esc(first.toUpperCase())}${last ? `<br/>${esc(last.toUpperCase())}` : ""}</div>
  <div style="position:absolute;top:50%;left:24px;right:24px;height:1px;background:linear-gradient(90deg,transparent,${a},transparent);opacity:0.4"></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:0 18px;position:relative">
    <div style="display:flex;flex-direction:column;gap:4px">
      ${contacts.map((v) => `<div style="font-size:11px;color:#aaa9;font-family:${MONO}">${esc(v!)}</div>`).join("")}
      <div style="margin-top:5px">${socialBtns(links, a)}</div>
    </div>
    ${qrImg(qrSvg, showQr, 64)}
  </div>
</div>`;
  },
};

// ── P: Deconstructed ──────────────────────────────────────

export const deconstructed: TemplateRenderer = {
  meta: {
    id: "deconstructed",
    name: "Deconstructed",
    description: "Deliberate layout tension with scattered typographic elements",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const [first, last] = firstLast(displayName);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#040407;font-family:${DM}">
  <div style="position:absolute;top:18px;left:20px;font-size:8px;letter-spacing:0.2em;color:#aaa7;text-transform:uppercase;font-family:${MONO}">v2.4.1</div>
  ${title ? `<div style="position:absolute;top:20px;right:18px;font-size:9px;color:${a}88;letter-spacing:0.12em;text-transform:uppercase;transform:rotate(90deg);transform-origin:right center;white-space:nowrap">${esc(title)}</div>` : ""}
  <div style="position:absolute;top:38px;left:20px;font-size:38px;font-weight:600;color:#e8e5e0;letter-spacing:-0.04em;line-height:1">${esc(first)}</div>
  ${last ? `<div style="position:absolute;top:80px;left:36px;font-size:22px;font-weight:300;color:${a}b3;letter-spacing:-0.01em">${esc(last)}</div>` : ""}
  <div style="position:absolute;top:118px;left:20px;width:60px;height:1px;background:${a};opacity:0.7"></div>
  <div style="position:absolute;bottom:20px;left:20px;font-size:11px;color:#aaa8;font-family:${MONO}">${cf.website ? esc(stripUrl(cf.website)) : ""}</div>
  <div style="position:absolute;bottom:20px;left:0;right:0;text-align:center;font-size:11px;color:#aaa6;font-family:${MONO}">${esc(cf.location ?? "")}</div>
  <div style="position:absolute;bottom:20px;right:20px;font-size:11px;color:#aaa8;font-family:${MONO}">${esc(cf.phone ?? "")}</div>
</div>`;
  },
  back(data, qrSvg) {
    const { contactFields: cf, links, accentColor: a, showQr } = data;
    const contacts = [
      cf.email,
      cf.phone,
      cf.website ? stripUrl(cf.website) : null,
      cf.location,
    ].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#040407;font-family:${DM}">
  <div style="position:absolute;top:18px;right:18px;font-size:8px;letter-spacing:0.2em;color:#aaa7;text-transform:uppercase;font-family:${MONO}">v2.4.1</div>
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:120px;font-weight:700;color:${a}0a;letter-spacing:-0.04em;user-select:none;pointer-events:none;line-height:1">02</div>
  <div style="position:absolute;top:36px;left:20px;display:flex;flex-direction:column;gap:6px">
    <div style="font-size:10.5px;color:${a}88;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:4px">Contact</div>
    ${contacts.map((v) => `<div style="font-size:10px;color:#aaa9;font-family:${MONO}">${esc(v!)}</div>`).join("")}
  </div>
  <div style="position:absolute;bottom:20px;left:20px">${socialBtns(links, a)}</div>
  ${qrImg(qrSvg, showQr, 60, "position:absolute;bottom:16px;right:20px")}
</div>`;
  },
};
