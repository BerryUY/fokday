// Generates the Momentum app icons (no dependencies): node scripts/generate-icons.mjs
// Mark: three ascending rounded bars in lime on near-black — steady progress.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [9, 9, 10];
const LIME = [200, 245, 96];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Rounded rect hit test in unit coordinates. */
function inRoundRect(x, y, r) {
  const { x0, y0, x1, y1, rad } = r;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
}

/** Bars laid out inside a box of the given scale (1 = full canvas), centered. */
function bars(scale) {
  const w = 0.17 * scale, gap = 0.07 * scale;
  const total = 3 * w + 2 * gap;
  const left = 0.5 - total / 2;
  const bottom = 0.5 + 0.3 * scale;
  return [0.3, 0.45, 0.6].map((h, i) => ({
    x0: left + i * (w + gap), x1: left + i * (w + gap) + w,
    y0: bottom - h * scale, y1: bottom, rad: w / 2, alpha: [0.45, 0.72, 1][i],
  }));
}

function render(size, { background, scale, color = LIME, cornerRadius = 0 }) {
  const out = Buffer.alloc(size * size * 4);
  const shapes = bars(scale);
  const S = 4; // 4×4 supersampling
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S) / size;
          const y = (py + (sy + 0.5) / S) / size;
          let cr = 0, cg = 0, cb = 0, ca = 0;
          const inCanvas = !cornerRadius || inRoundRect(x, y, { x0: 0, y0: 0, x1: 1, y1: 1, rad: cornerRadius });
          if (background && inCanvas) { [cr, cg, cb] = background; ca = 1; }
          for (const s of shapes) {
            if (inRoundRect(x, y, s)) {
              const t = s.alpha;
              cr = cr * (1 - t) + color[0] * t; cg = cg * (1 - t) + color[1] * t; cb = cb * (1 - t) + color[2] * t;
              ca = ca + t * (1 - ca);
              if (!background) { cr = color[0]; cg = color[1]; cb = color[2]; }
            }
          }
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const n = S * S, i = (py * size + px) * 4;
      out[i + 3] = Math.round((a / n) * 255);
      out[i] = a ? Math.round(r / a) : 0;
      out[i + 1] = a ? Math.round(g / a) : 0;
      out[i + 2] = a ? Math.round(b / a) : 0;
    }
  }
  return png(size, out);
}

const dir = new URL('../assets/', import.meta.url);
writeFileSync(new URL('icon.png', dir), render(1024, { background: BG, scale: 1 }));
// Adaptive icon: Android crops to the inner ~66 %, so the mark is smaller.
writeFileSync(new URL('android-icon-foreground.png', dir), render(1024, { background: null, scale: 0.62 }));
writeFileSync(new URL('android-icon-monochrome.png', dir), render(1024, { background: null, scale: 0.62, color: [255, 255, 255] }));
writeFileSync(new URL('splash-icon.png', dir), render(512, { background: null, scale: 1 }));
// Android status-bar icon: white shape on transparent, as the platform requires.
writeFileSync(new URL('notification-icon.png', dir), render(96, { background: null, scale: 0.9, color: [255, 255, 255] }));
writeFileSync(new URL('favicon.png', dir), render(64, { background: BG, scale: 1, cornerRadius: 0.22 }));
console.log('Icons written to assets/');
