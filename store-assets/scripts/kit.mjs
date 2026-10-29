// Building blocks for slide HTML: page head, brand mark, browser + phone mockups, icons.
// Slides live in slides/<carousel>/NN.html, so asset paths are relative to that folder.
import { BRAND } from '../brand.mjs';

export const A = '../../assets';

export const head = (title, extraCss = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${BRAND.fontsUrl}" rel="stylesheet">
<link rel="stylesheet" href="../base.css"><style>${extraCss}</style></head><body>`;
export const end = `</body></html>`;

// Brand mark: logo image + optional wordmark HTML (BRAND.wordmarkHtml), sized by font-size
export const wordmark = (size = 26, { light = false } = {}) =>
  `<span class="wordmark" style="font-size:${size}px"><img src="${A}/brand/${light && BRAND.logoLight ? BRAND.logoLight : BRAND.logo}" alt="">${BRAND.wordmarkHtml ? `<span>${BRAND.wordmarkHtml}</span>` : ''}</span>`;

export const swoosh = (color = 'var(--accent)', w = 8) =>
  `<svg viewBox="0 0 300 24" preserveAspectRatio="none"><path d="M4 16 C 70 7, 160 4, 296 10" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/></svg>`;

const lock = `<svg viewBox="0 0 12 14"><path fill="currentColor" d="M3 6V4.2a3 3 0 0 1 6 0V6h.6c.8 0 1.4.6 1.4 1.4v5.2c0 .8-.6 1.4-1.4 1.4H2.4C1.6 14 1 13.4 1 12.6V7.4C1 6.6 1.6 6 2.4 6zm1.5 0h3V4.2a1.5 1.5 0 0 0-3 0z"/></svg>`;

// Desktop browser window. w = window width, h = visible viewport height (image is top-aligned and cropped)
export function browser({ src, url, w, h, x, y, dark = false, style = '', cls = '', imgStyle = '', inner = '' }) {
  return `<div class="browser ${dark ? 'bar-dark' : ''} ${cls}" style="left:${x}px;top:${y}px;width:${w}px;${style}">
  <div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="url">${lock}${url}</div></div>
  <div class="view" style="height:${h}px">${inner || `<img src="${src}" style="${imgStyle}">`}</div></div>`;
}

const sig = `<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg>`;
const wifi = `<svg width="16" height="12" viewBox="0 0 16 12"><path fill="currentColor" d="M8 2.3c2.3 0 4.4.9 6 2.4l1.2-1.3A10.2 10.2 0 0 0 8 .5 10.2 10.2 0 0 0 .8 3.4L2 4.7a8.5 8.5 0 0 1 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.3-1.3A6.6 6.6 0 0 0 8 4.1a6.6 6.6 0 0 0-4.7 1.8l1.3 1.3c.9-.8 2.1-1.3 3.4-1.3zm0 3.5c-.6 0-1.1.2-1.5.6L8 11.5l1.5-1.5c-.4-.4-.9-.6-1.5-.6z"/></svg>`;
const bat = `<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="currentColor" opacity=".45"/></svg>`;

// iPhone-style mockup: status bar + screenshot + Safari bottom bar.
// Screenshot area aspect ≈ 0.56 (fits 390x700 crops or ~460x826 user screenshots exactly); taller shots are cropped from the top.
export function phone({ src, url, w = 270, x, y, statusLight = false, statusBg = '#fff', safariDark = false, shotBg = '#fff', imgStyle = '', style = '', cls = '' }) {
  const h = Math.round(w * 2.165);
  const sb = safariDark ? 'background:rgba(28,28,30,.94);color:#e5e5ea' : 'background:rgba(249,249,249,.96);color:#1c1c1e';
  return `<div class="phone ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${style}">
  <div class="screen" style="background:${shotBg}">
    <div class="status ${statusLight ? 'light' : ''}" style="background:${statusBg}"><span>9:41</span><span class="ic">${sig}${wifi}${bat}</span></div>
    <div class="island"></div>
    <div class="shot" style="bottom:66px;background:${shotBg}"><img src="${src}" style="${imgStyle}"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:66px;${sb};display:flex;flex-direction:column;align-items:center;padding-top:9px;z-index:3;border-top:1px solid rgba(0,0,0,.06)">
      <div style="width:86%;height:30px;border-radius:10px;background:${safariDark ? '#3a3a3c' : '#e9e9eb'};display:flex;align-items:center;justify-content:center;gap:5px;font:500 11.5px/1 -apple-system,var(--body)">
        <span style="opacity:.5;width:9px;display:inline-flex">${lock}</span>${url}</div>
      <div style="width:34%;height:4px;border-radius:3px;background:currentColor;opacity:.85;margin-top:13px"></div>
    </div>
    <div class="glare"></div>
  </div></div>`;
}

// Crop a region of a big screenshot (CSS px of the captured page) into a div of width cw. pageW = CSS width of the capture.
export const crop = (src, pageW, x, y, w, h, cw) => {
  const s = cw / w;
  return `width:${cw}px;height:${Math.round(h * s)}px;background:url(${src}) ${-x * s}px ${-y * s}px/${pageW * s}px auto no-repeat`;
};

export const testi = ({ x, y, w, q, who, what = 'Testimonio', size }) => `<div class="testi" style="left:${x}px;top:${y}px;width:${w}px">
  <span class="qm quote-mark">“</span><p style="${size ? `font-size:${size}px` : ''}">${q}</p>
  <div class="by"><i></i><b>${who}</b><span>${what}</span></div></div>`;

export const arrowNE = (s = 18, c = 'currentColor') =>
  `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none"><path d="M4 12L12 4M5.5 4H12v6.5" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const arrowR = (s = 22, c = 'currentColor') =>
  `<svg width="${s}" height="${s}" viewBox="0 0 20 20" fill="none"><path d="M3 10h13M11 4.5 16.5 10 11 15.5" stroke="${c}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const searchIc = (s = 34, c = 'currentColor') =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="${c}" stroke-width="2.2"/><path d="m15.5 15.5 5 5" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
export const cursor = (s = 44) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 32 32"><path d="M7 4.5v20.2l5.1-4.6 3.4 7.6 3.6-1.6-3.4-7.5 6.9-.4z" fill="#171218" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
