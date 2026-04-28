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

// ── D: Dark Luxury with Glow ──────────────────────────────

export const darkLuxury: TemplateRenderer = {
  meta: {
    id: "dark-luxury",
    name: "Dark Luxury",
    description: "Radial gold glow with avatar and name side by side",
  },
  front(data) {
    const { displayName, title, accentColor: a } = data;
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:radial-gradient(ellipse at 30% 50%,${a}26 0%,#060608 65%);font-family:${DM};border:1px solid ${a}4d">
  <div style="position:absolute;left:-40px;top:-40px;width:180px;height:180px;background:radial-gradient(circle,${a}12 0%,transparent 70%);pointer-events:none"></div>
  <div style="position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 5%,${a} 50%,transparent 95%)"></div>
  <div style="position:relative;height:100%;display:flex;align-items:center;padding:20px 26px;gap:14px">
    <div style="width:52px;height:52px;border-radius:12px;border:1px solid ${a}99;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:500;color:${a};background:${a}0d;flex-shrink:0">${initial(displayName)}</div>
    <div>
      <div style="font-size:19px;font-weight:500;color:#f0ede8;letter-spacing:-0.01em;margin-bottom:4px">${esc(displayName)}</div>
      ${title ? `<div style="font-size:11px;color:${a}88;letter-spacing:0.1em;text-transform:uppercase">${esc(title)}</div>` : ""}
      <div style="width:24px;height:1px;background:${a};margin-top:8px;opacity:0.8"></div>
    </div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { contactFields: cf, links, accentColor: a, showQr } = data;
    const rows = [
      cf.email
        ? `<div style="display:flex;align-items:center;gap:9px;font-size:10.5px;color:#bbb9"><span style="color:${a};width:12px;text-align:center">✉</span><span style="font-family:${MONO}">${esc(cf.email)}</span></div>`
        : "",
      cf.phone
        ? `<div style="display:flex;align-items:center;gap:9px;font-size:10.5px;color:#bbb9"><span style="color:${a};width:12px;text-align:center">↗</span><span style="font-family:${MONO}">${esc(cf.phone)}</span></div>`
        : "",
      cf.website
        ? `<div style="display:flex;align-items:center;gap:9px;font-size:10.5px;color:#bbb9"><span style="color:${a};width:12px;text-align:center">◉</span><span style="font-family:${MONO}">${esc(stripUrl(cf.website))}</span></div>`
        : "",
      cf.location
        ? `<div style="display:flex;align-items:center;gap:9px;font-size:10.5px;color:#bbb9"><span style="color:${a};width:12px;text-align:center">◎</span><span style="font-family:${MONO}">${esc(cf.location)}</span></div>`
        : "",
    ].join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:radial-gradient(ellipse at 70% 50%,${a}26 0%,#060608 65%);font-family:${DM};border:1px solid ${a}4d">
  <div style="position:absolute;right:-40px;bottom:-40px;width:180px;height:180px;background:radial-gradient(circle,${a}12 0%,transparent 70%);pointer-events:none"></div>
  <div style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 5%,${a} 50%,transparent 95%)"></div>
  <div style="position:relative;height:100%;display:flex;align-items:center;padding:18px 22px;gap:16px">
    <div style="display:flex;flex-direction:column;gap:10px;flex:1">${rows}
      <div style="margin-top:4px">${socialBtns(links, a)}</div>
    </div>
    ${qrImg(qrSvg, showQr, 76)}
  </div>
</div>`;
  },
};

// ── L: Atmospheric Gradient ───────────────────────────────

export const atmospheric: TemplateRenderer = {
  meta: {
    id: "atmospheric",
    name: "Atmospheric",
    description: "Radial gradient with glow orb and light typographic layout",
  },
  front(data) {
    const { displayName, title, contactFields: cf, accentColor: a } = data;
    const [first, last] = firstLast(displayName);
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:radial-gradient(ellipse at 20% 80%,${a}cc 0%,#070714 50%,#040407 100%);font-family:${DM};padding:18px 20px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid ${a}33">
  <div style="position:absolute;bottom:-30px;left:-30px;width:200px;height:200px;background:radial-gradient(circle,${a}1f 0%,transparent 70%);pointer-events:none"></div>
  <div style="position:relative">
    ${title ? `<div style="font-size:11px;letter-spacing:0.18em;color:${a}99;text-transform:uppercase;margin-bottom:8px;font-family:${MONO}">${esc(title)}</div>` : ""}
    <div style="font-size:22px;font-weight:300;color:#f0ede9;letter-spacing:-0.02em;line-height:1.15">${esc(first)}${last ? `<br/>${esc(last)}` : ""}</div>
  </div>
  <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-end">
    <div style="font-size:10px;color:${a}80;font-family:${MONO}">${esc(siteStr)}</div>
    <div style="width:32px;height:32px;border-radius:50%;background:${a}1f;border:1px solid ${a}4d;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;color:${a}">${initial(displayName)}</div>
  </div>
</div>`;
  },
  back(data, qrSvg) {
    const { bio, contactFields: cf, links, accentColor: a, showQr } = data;
    const contacts = [cf.email, cf.phone].filter(Boolean);
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:radial-gradient(ellipse at 80% 20%,${a}b3 0%,#070714 50%,#040407 100%);font-family:${DM};padding:18px 20px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid ${a}33">
  <div style="position:absolute;top:-30px;right:-30px;width:200px;height:200px;background:radial-gradient(circle,${a}1a 0%,transparent 70%);pointer-events:none"></div>
  ${bio ? `<div style="position:relative;font-size:11.5px;color:#bbb9;line-height:1.7;font-weight:300;max-width:80%">${esc(bio)}</div>` : "<div></div>"}
  <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-end">
    <div style="display:flex;flex-direction:column;gap:5px">
      ${contacts.map((v) => `<div style="font-size:11px;color:#aaa8;font-family:${MONO}">${esc(v!)}</div>`).join("")}
      <div style="margin-top:5px">${socialBtns(links, a)}</div>
    </div>
    ${qrImg(qrSvg, showQr, 64)}
  </div>
</div>`;
  },
};

// ── S: Neon Edge ──────────────────────────────────────────

export const neonEdge: TemplateRenderer = {
  meta: {
    id: "neon-edge",
    name: "Neon Edge",
    description: "Dark card with glowing teal neon border lines",
  },
  front(data) {
    const { displayName, title, contactFields: cf } = data;
    const TEAL = "oklch(0.72 0.14 185)";
    const rows = [
      cf.email
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#aaa8;align-items:center"><span style="color:${TEAL};width:12px;font-size:9px">✉</span><span style="font-family:${MONO}">${esc(cf.email)}</span></div>`
        : "",
      cf.phone
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#aaa8;align-items:center"><span style="color:${TEAL};width:12px;font-size:9px">↗</span><span style="font-family:${MONO}">${esc(cf.phone)}</span></div>`
        : "",
      cf.location
        ? `<div style="display:flex;gap:8px;font-size:10px;color:#aaa8;align-items:center"><span style="color:${TEAL};width:12px;font-size:9px">◎</span><span style="font-family:${MONO}">${esc(cf.location)}</span></div>`
        : "",
    ].join("");
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#03050a;font-family:${DM};border:1px solid oklch(0.72 0.14 185 / 0.35)">
  <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${TEAL},transparent);box-shadow:0 0 8px ${TEAL}"></div>
  <div style="position:absolute;inset:14px 18px;display:flex;flex-direction:column;justify-content:space-between">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        ${title ? `<div style="font-size:10.5px;color:oklch(0.72 0.14 185 / 0.5);letter-spacing:0.18em;text-transform:uppercase;margin-bottom:8px;font-family:${MONO}">${esc(title)}</div>` : ""}
        <div style="font-size:20px;font-weight:400;color:#e8f4f8;letter-spacing:-0.01em">${esc(displayName)}</div>
      </div>
      <div style="width:36px;height:36px;border-radius:8px;border:1px solid ${TEAL};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500;color:${TEAL};box-shadow:0 0 10px oklch(0.72 0.14 185 / 0.25)">${initial(displayName)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px">${rows}</div>
  </div>
  <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${TEAL},transparent);opacity:0.4"></div>
</div>`;
  },
  back(data, qrSvg) {
    const { bio, contactFields: cf, links, showQr } = data;
    const TEAL = "oklch(0.72 0.14 185)";
    const siteStr = cf.website ? stripUrl(cf.website) : "";
    return `<div style="width:100%;aspect-ratio:1.586/1;position:relative;overflow:hidden;border-radius:16px;box-sizing:border-box;background:#03050a;font-family:${DM};border:1px solid oklch(0.72 0.14 185 / 0.35)">
  <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${TEAL},transparent);opacity:0.4"></div>
  <div style="position:absolute;inset:14px 18px;display:flex;gap:18px;align-items:center">
    ${qrImg(qrSvg, showQr, 76, `border:1px solid oklch(0.72 0.14 185 / 0.35)`)}
    <div style="flex:1;display:flex;flex-direction:column;gap:8px">
      ${bio ? `<div style="font-size:10.5px;color:#bbb9;line-height:1.6;font-weight:300">${esc(bio)}</div>` : ""}
      ${siteStr ? `<div style="font-size:11px;color:oklch(0.72 0.14 185 / 0.5);font-family:${MONO}">${esc(siteStr)}</div>` : ""}
      ${socialBtns(links, TEAL, "oklch(0.72 0.14 185 / 0.4)")}
    </div>
  </div>
  <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${TEAL},transparent);box-shadow:0 0 8px ${TEAL}"></div>
</div>`;
  },
};
