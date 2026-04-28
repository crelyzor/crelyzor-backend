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

// ── B: Left-Anchored Minimal ──────────────────────────────

export const leftMinimal: TemplateRenderer = {
  meta: {
    id: "left-minimal",
    name: "Left Minimal",
    description: "Left gold border accent with name and contacts",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const rows = [
      cf.email
        ? `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#aaa9"><span style="color:${a};width:12px">✉</span><span style="font-family:${MONO}">${esc(cf.email)}</span></div>`
        : "",
      cf.phone
        ? `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#aaa9"><span style="color:${a};width:12px">↗</span><span style="font-family:${MONO}">${esc(cf.phone)}</span></div>`
        : "",
      cf.location
        ? `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#aaa9"><span style="color:${a};width:12px">◎</span><span style="font-family:${MONO}">${esc(cf.location)}</span></div>`
        : "",
    ].join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#080809;font-family:${DM};border:1px solid ${a}26">
  <div style="position:absolute;left:0;top:20%;bottom:20%;width:2px;background:linear-gradient(180deg,transparent,${a},transparent);border-radius:2px"></div>
  <div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:18px 22px">
    <div>
      <div style="font-size:20px;font-weight:500;color:#f2f0ec;letter-spacing:-0.02em;margin-bottom:4px">${esc(displayName)}</div>
      ${title ? `<div style="font-size:11px;color:${a}88;letter-spacing:0.1em;text-transform:uppercase">${esc(title)}</div>` : ""}
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">${rows}</div>
  </div>
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
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#080809;font-family:${DM};border:1px solid ${a}26">
  <div style="position:absolute;right:0;top:20%;bottom:20%;width:2px;background:linear-gradient(180deg,transparent,${a},transparent);border-radius:2px"></div>
  <div style="position:relative;height:100%;display:grid;grid-template-columns:auto 1fr;gap:24px;padding:18px 22px;align-items:center">
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
      ${qrImg(qrSvg, showQr, 80)}
      <div style="font-size:10px;color:${a}88;letter-spacing:0.08em;font-family:${MONO}">${esc(displayName)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${contacts.map((v) => `<div style="font-size:10.5px;color:#ccc9;font-family:${MONO}">${esc(v!)}</div>`).join("")}
      ${socialBtns(links, a)}
    </div>
  </div>
</div>`;
  },
};

// ── E: Split Gold Panel ───────────────────────────────────

export const splitPanel: TemplateRenderer = {
  meta: {
    id: "split-panel",
    name: "Split Panel",
    description: "Solid accent left panel with initial, content on the right",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const rows = [
      cf.email
        ? `<div style="display:flex;gap:7px;font-size:10px;color:#aaa8;align-items:center"><span style="color:${a};width:11px">✉</span><span style="font-family:${MONO}">${esc(cf.email)}</span></div>`
        : "",
      cf.phone
        ? `<div style="display:flex;gap:7px;font-size:10px;color:#aaa8;align-items:center"><span style="color:${a};width:11px">↗</span><span style="font-family:${MONO}">${esc(cf.phone)}</span></div>`
        : "",
      cf.location
        ? `<div style="display:flex;gap:7px;font-size:10px;color:#aaa8;align-items:center"><span style="color:${a};width:11px">◎</span><span style="font-family:${MONO}">${esc(cf.location)}</span></div>`
        : "",
    ].join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#07070a;font-family:${DM};border:1px solid ${a}33;display:flex">
  <div style="width:72px;background:linear-gradient(180deg,${a}ee,${a}cc);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;flex-shrink:0">
    <div style="font-size:24px;font-weight:600;color:#070709;letter-spacing:-0.02em">${initial(displayName)}</div>
    <div style="width:20px;height:1px;background:rgba(0,0,0,0.25)"></div>
  </div>
  <div style="flex:1;padding:18px;display:flex;flex-direction:column;justify-content:space-between">
    <div>
      <div style="font-size:17px;font-weight:500;color:#f0ede8;letter-spacing:-0.01em;margin-bottom:5px">${esc(displayName)}</div>
      ${title ? `<div style="font-size:10px;color:${a}88;letter-spacing:0.12em;text-transform:uppercase">${esc(title)}</div>` : ""}
    </div>
    <div style="display:flex;flex-direction:column;gap:5px">${rows}</div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { displayName, bio, contactFields: cf, links, accentColor: a, showQr } = data;
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#07070a;font-family:${DM};border:1px solid ${a}33;display:flex">
  <div style="flex:1;padding:18px;display:flex;flex-direction:column;justify-content:space-between">
    ${bio ? `<div style="font-size:11px;color:#bbb9;line-height:1.7;font-weight:300">${esc(bio)}</div>` : ""}
    <div style="display:flex;align-items:flex-end;justify-content:space-between">
      <div style="display:flex;flex-direction:column;gap:5px">
        ${siteStr ? `<div style="font-size:11px;color:${a}88;font-family:${MONO}">${esc(siteStr)}</div>` : ""}
        ${socialBtns(links, a)}
      </div>
      ${qrImg(qrSvg, showQr, 64)}
    </div>
  </div>
  <div style="width:72px;background:linear-gradient(180deg,${a}ee,${a}cc);display:flex;align-items:center;justify-content:center;flex-shrink:0">
    <div style="font-size:9px;font-weight:600;color:rgba(0,0,0,0.4);letter-spacing:0.15em;text-transform:uppercase;writing-mode:vertical-rl;transform:rotate(180deg)">${esc(displayName.toUpperCase())}</div>
  </div>
</div>`;
  },
};

// ── H: Horizontal Bands ───────────────────────────────────

export const horizontalBands: TemplateRenderer = {
  meta: {
    id: "horizontal-bands",
    name: "Horizontal Bands",
    description: "Three-band layout: header, name, footer contacts",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#08080b;font-family:${DM};display:flex;flex-direction:column">
  <div style="padding:10px 18px;border-bottom:1px solid ${a}26;display:flex;align-items:center;justify-content:space-between">
    <div style="font-size:10px;letter-spacing:0.18em;color:${a}88;text-transform:uppercase;font-family:${MONO}">Digital Card</div>
    <div style="font-size:10px;letter-spacing:0.12em;color:#aaa6;font-family:${MONO}">${esc(siteStr)}</div>
  </div>
  <div style="flex:1;display:flex;align-items:center;padding:0 18px;gap:16px">
    <div style="width:46px;height:46px;border-radius:50%;border:1px solid ${a}80;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:500;color:${a};flex-shrink:0">${initial(displayName)}</div>
    <div>
      <div style="font-size:18px;font-weight:400;color:#edeae5;letter-spacing:-0.01em">${esc(displayName)}</div>
      ${title ? `<div style="font-size:10px;color:${a}88;letter-spacing:0.1em;text-transform:uppercase;margin-top:3px">${esc(title)}</div>` : ""}
    </div>
  </div>
  <div style="padding:8px 18px;border-top:1px solid ${a}26;display:flex;gap:20px;font-size:10px;color:#aaa9;font-family:${MONO}">
    ${cf.phone ? `<span>${esc(cf.phone)}</span>` : ""}
    ${cf.location ? `<span>${esc(cf.location)}</span>` : ""}
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { displayName, title, contactFields: cf, links, accentColor: a, showQr } = data;
    const contacts = [
      cf.email,
      cf.phone,
      cf.website ? stripUrl(cf.website) : null,
      cf.location,
    ].filter(Boolean);
    const footer = [displayName, title].filter(Boolean).join(" · ").toUpperCase();
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#08080b;font-family:${DM};display:flex;flex-direction:column">
  <div style="padding:10px 18px;border-bottom:1px solid ${a}26;display:flex;align-items:center;justify-content:space-between">
    <div style="font-size:10px;letter-spacing:0.18em;color:${a}88;text-transform:uppercase;font-family:${MONO}">Contact</div>
    ${socialBtns(links, a)}
  </div>
  <div style="flex:1;display:flex;align-items:center;padding:0 18px;gap:20px">
    ${qrImg(qrSvg, showQr, 70)}
    <div style="display:flex;flex-direction:column;gap:7px">
      ${contacts.map((v) => `<div style="font-size:10px;color:#aaa9;font-family:${MONO}">${esc(v!)}</div>`).join("")}
    </div>
  </div>
  <div style="padding:8px 18px;border-top:1px solid ${a}26;font-size:10px;color:#aaa6;font-family:${MONO};letter-spacing:0.06em">${esc(footer)}</div>
</div>`;
  },
};
