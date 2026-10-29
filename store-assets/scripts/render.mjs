// Render slide HTML -> 1080x1350 PNG (supersampled 2x, Lanczos downscale)
// usage: node scripts/render.mjs <slidesDir> <outDir> [onlyPrefix]   e.g. node scripts/render.mjs slides/c1 output/carousel-01 03
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// OneDrive/antivirus can briefly lock files: encode in memory, then write with retries
async function writeRetry(dest, data) {
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(dest, data); return; }
    catch (e) { if (i >= 8) throw e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
  }
}


const [src, out, only] = process.argv.slice(2);
if (!src || !out) { console.error('usage: render.mjs <slidesDir> <outDir> [onlyPrefix]'); process.exit(1); }
const W = +(process.env.W || 1080), H = +(process.env.H || 1350);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome' }); // uses installed Chrome; no browser download needed
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const files = fs.readdirSync(src).filter(f => f.endsWith('.html') && (!only || f.startsWith(only))).sort();
for (const f of files) {
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(path.resolve(src, f)).href, { waitUntil: 'networkidle' });
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
  await p.waitForTimeout(300);
  const buf = await p.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  const dest = path.join(out, f.replace('.html', '.png'));
  await sharp(buf).resize(W, H, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer().then(d => writeRetry(dest, d));
  console.log('rendered', dest);
  await p.close();
}
await b.close();
