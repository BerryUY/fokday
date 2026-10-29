// FokDay Play Store set: 6 phone screenshots (1080x1920) + feature graphic (1024x500).
// usage: node scripts/build-play.mjs && W=1080 H=1920 node scripts/render.mjs slides/play output/play-screenshots
//        && W=1024 H=500 node scripts/render.mjs slides/feature output/play-feature
import fs from 'node:fs';
import { crop } from './kit.mjs';

const A = '../../assets';
const S = (n) => `${A}/shots/${n}.png`;
const MARK = JSON.parse(fs.readFileSync('research/mark.json', 'utf8')).MARK;

const head = (w, h, css = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=JetBrains+Mono:wght@500;600&display=block" rel="stylesheet">
<link rel="stylesheet" href="../store.css"><style>:root{--w:${w}px;--h:${h}px}${css}</style></head><body>`;
const end = '</body></html>';

// ---- Android phone: status bar + real screenshot (412x915 CSS px) + gesture bar ----
const SB = 28, SHOT_H = 915, NAV = 18;
const sig = `<svg viewBox="0 0 16 12" style="height:1em"><path fill="currentColor" d="M15 0v12H0z"/></svg>`;
const wifi = `<svg viewBox="0 0 16 12" style="height:1em"><path fill="currentColor" d="M8 12 0 3.3A11.5 11.5 0 0 1 8 0a11.5 11.5 0 0 1 8 3.3z"/></svg>`;
const bat = `<svg viewBox="0 0 9 15" style="height:1.1em"><rect x="2.5" y="0" width="4" height="2" rx=".6" fill="currentColor"/><rect x="0" y="1.6" width="9" height="13.4" rx="1.6" fill="currentColor"/></svg>`;
export function phone({ src, w, x, y, style = '', time = '16:45' }) {
  const b = Math.round(w * 0.03), sw = w - 2 * b, k = sw / 412;
  const sh = Math.round((SB + SHOT_H + NAV) * k), h = sh + 2 * b;
  const r = Math.round(w * 0.115), d = Math.round(12 * k);
  const html = `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;--b:${b}px;--r:${r}px;--sr:${r - b}px;${style}">
  <div class="screen">
    <div class="status" style="height:${SB * k}px;padding:0 ${22 * k}px;font-size:${13 * k}px"><span>${time}</span><span class="ic">${sig}${wifi}${bat}</span></div>
    <div class="hole" style="top:${(SB * k - d) / 2}px;width:${d}px;height:${d}px"></div>
    <div class="shot" style="top:${SB * k}px"><img src="${src}"></div>
    <div class="gest" style="height:${NAV * k}px"><i></i></div>
    <div class="glare"></div>
  </div></div>`;
  return { html, h, k, b };
}

// ---- Signature: the mark's chevrons, big and cropped ----
const chevrons = ({ x, y, w, rot = 0, opacity = 1, glow = true, mono = null }) => `<svg class="chev" style="left:${x}px;top:${y}px;width:${w}px;opacity:${opacity};transform:rotate(${rot}deg)" viewBox="6 2 108 84">
<defs><linearGradient id="t${x}${y}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5CFF9D"/><stop offset="1" stop-color="#16D163"/></linearGradient>
<linearGradient id="m${x}${y}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C3C7CD"/><stop offset="1" stop-color="#6A6E76"/></linearGradient>
<radialGradient id="g${x}${y}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#2CF07A" stop-opacity=".5"/><stop offset="1" stop-color="#2CF07A" stop-opacity="0"/></radialGradient></defs>
${glow ? `<ellipse cx="60" cy="40" rx="60" ry="44" fill="url(#g${x}${y})"/>` : ''}
<polygon points="${MARK.middle}" fill="${mono ?? `url(#m${x}${y})`}" stroke="${mono ?? '#9a9ea5'}" stroke-width="5" stroke-linejoin="round" ${mono ? 'opacity=".55"' : ''}/>
<polygon points="${MARK.top}" fill="${mono ?? `url(#t${x}${y})`}" stroke="${mono ?? '#2CF07A'}" stroke-width="5" stroke-linejoin="round"/></svg>`;

const up = (c = 'currentColor') => `<svg viewBox="0 0 20 14"><path d="M1 13 10 3l9 10" fill="none" stroke="${c}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
const label = (x, y, text, c) => `<div class="lbl" style="left:${x}px;top:${y}px">${up(c)}${text}</div>`;
const wordmark = (size, ink = false) => `<span class="wm" style="font-size:${size}px"><img src="${A}/brand/${ink ? 'mark-ink' : 'mark'}.svg" style="height:${ink ? 1.15 : 1.35}em;margin:0 ${ink ? 0 : -0.08}em">FokDay</span>`;
const zoom = (src, x, y, cx, cy, cw, ch, w, extra = '') => `<div class="zoom" style="left:${x}px;top:${y}px;${crop(src, 412, cx, cy, cw, ch, w)};${extra}"></div>`;

const slides = [];
const copy = ({ x = 84, y, bottom, w = 912, lbl = '', h, size = 128, sub, lblColor }) =>
  `<div class="copy" style="left:${x}px;${bottom !== undefined ? `bottom:${bottom}px` : `top:${y}px`};width:${w}px">
  ${lbl ? `<div class="lbl">${up(lblColor)}${lbl}</div>` : ''}<div class="h" style="font-size:${size}px">${h}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const brand = (y, ink = false) => `<div class="brandrow" style="left:84px;top:${y}px">${wordmark(46, ink)}</div>`;

// 01 · Hook: the whole day in one app
{
  const p = phone({ src: S('home'), w: 860, x: 110, y: 820 });
  slides.push(`${head(1080, 1920)}<div class="slide ink grain">
  ${chevrons({ x: -300, y: 600, w: 1680, opacity: 0.2 })}
  ${brand(92)}
  ${copy({ y: 220, h: 'Tu día entero, en <span class="lime">una sola app.</span>', size: 112, sub: 'Comidas, gym, peso y hábitos.<br>Sin saltar de app en app.' })}
  ${p.html}
</div>${end}`);
}

// 02 · Food: calories from a photo
{
  const p = phone({ src: S('comidas'), w: 720, x: 430, y: 820 });
  slides.push(`${head(1080, 1920)}<div class="slide ink grain">
  ${chevrons({ x: 540, y: 640, w: 900, rot: 8, opacity: 0.16 })}
  ${copy({ y: 110, lbl: 'Comidas', h: 'Calorías con <span class="lime">una foto.</span>', sub: 'La IA estima calorías y macros. Si es un paquete, escaneás el código de barras.' })}
  ${p.html}
  ${zoom(S('comidas'), 40, 640, 14, 132, 386, 82, 700)}
  <div class="sub" style="left:84px;top:1020px;width:320px;font-size:34px;color:var(--text)">2 fotos gratis por día, y más mirando un video.</div>
</div>${end}`);
}

// 03 · Gym: log every set (light)
{
  const p = phone({ src: S('sesion'), w: 820, x: 130, y: 760 });
  slides.push(`${head(1080, 1920)}<div class="slide paper grain">
  ${chevrons({ x: 420, y: 520, w: 900, rot: 6, opacity: 1, glow: false, mono: '#E4E4DF' })}
  ${copy({ y: 110, lbl: 'Gimnasio', lblColor: 'var(--lime-deep)', h: 'Anotá <span class="deep">cada serie.</span>', sub: 'Ves lo que levantaste la vez anterior y el descanso corre solo.' })}
  ${p.html}
  ${zoom(S('sesion'), 70, 1180, 22, 250, 372, 110, 940)}
</div>${end}`);
}

// 04 · Progress: phone in 3D + enlarged weight card
{
  const p = phone({ src: S('progreso'), w: 660, x: 0, y: 800, style: 'transform:perspective(2200px) rotateY(16deg) rotateZ(-2deg);transform-origin:left center' });
  slides.push(`${head(1080, 1920)}<div class="slide ink grain">
  ${chevrons({ x: 380, y: 1040, w: 1000, rot: -10, opacity: 0.14 })}
  ${copy({ y: 110, lbl: 'Progreso', h: 'Mirá cómo <span class="lime">avanzás.</span>', sub: 'Peso, calorías, proteína y constancia, en gráficos simples.' })}
  ${p.html}
  ${zoom(S('progreso'), 460, 1090, 14, 350, 384, 380, 580)}
</div>${end}`);
}

// 05 · Weight + history: two phones
{
  const a = phone({ src: S('peso'), w: 600, x: 50, y: 800 });
  const b = phone({ src: S('historial'), w: 560, x: 480, y: 930, style: 'z-index:6' });
  slides.push(`${head(1080, 1920)}<div class="slide surface grain">
  ${chevrons({ x: -200, y: 760, w: 1400, opacity: 0.12 })}
  ${copy({ y: 110, lbl: 'Seguimiento', h: 'Cada día,<br><span class="lime">a la vista.</span>', sub: 'Tu peso con metas en el camino, y el calendario de todo lo que hiciste.' })}
  ${a.html}${b.html}
</div>${end}`);
}

// 06 · Closing on lime: free basics + Pro
{
  const p = phone({ src: S('pro'), w: 680, x: 84, y: 900 });
  slides.push(`${head(1080, 1920)}<div class="slide limebg grain">
  <img src="${A}/brand/mark-ink.svg" style="position:absolute;right:-320px;bottom:-220px;width:1100px;transform:rotate(-8deg);opacity:.14;z-index:1">
  ${brand(92, true)}
  ${copy({ y: 220, h: 'Lo básico es<br>gratis.<br>Para siempre.', size: 124, sub: 'Pro suma 20 fotos con IA por día, resumen semanal y estadísticas avanzadas.' })}
  ${p.html}
</div>${end}`);
}

fs.rmSync('slides/play', { recursive: true, force: true });
fs.mkdirSync('slides/play', { recursive: true });
slides.forEach((html, i) => fs.writeFileSync(`slides/play/${String(i + 1).padStart(2, '0')}.html`, html));

// Feature graphic 1024x500
{
  const p = phone({ src: S('home'), w: 400, x: 590, y: 70, style: 'transform:rotate(-8deg)' });
  const html = `${head(1024, 500)}<div class="slide ink grain">
  ${chevrons({ x: 470, y: -80, w: 640, opacity: 0.35 })}
  <div style="position:absolute;left:64px;top:118px;z-index:10">${wordmark(92)}</div>
  <div class="h" style="left:68px;top:262px;font-size:44px;width:520px;letter-spacing:-.03em;line-height:1.1">Calorías, gym y hábitos<br><span class="lime">en una sola app.</span></div>
  ${p.html}
</div>${end}`;
  fs.rmSync('slides/feature', { recursive: true, force: true });
  fs.mkdirSync('slides/feature', { recursive: true });
  fs.writeFileSync('slides/feature/01.html', html);
}
console.log('built', slides.length, 'screenshots + feature graphic');
