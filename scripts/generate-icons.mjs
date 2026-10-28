// Generates the FokDay app icons from the vector mark (src/brand/mark.ts): node scripts/generate-icons.mjs
// Rendered with resvg, so every size stays sharp.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { markSvg } = await import(pathToFileURL(path.join(root, 'src/brand/mark.ts')).href);

const BG = '#0B0C0E';
const render = (file, opts) => {
  const png = new Resvg(markSvg(opts)).render().asPng();
  writeFileSync(path.join(root, 'assets', file), png);
  console.log(file, `${opts.size}px`, `${Math.round(png.length / 1024)} KB`);
};

render('icon.png', { size: 1024, background: BG, scale: 0.7 });
// Adaptive icons: Android crops to the inner ~66%, so the mark stays well inside it.
render('android-icon-foreground.png', { size: 1024, scale: 0.48 });
render('android-icon-monochrome.png', { size: 1024, scale: 0.48, mono: '#FFFFFF' });
render('splash-icon.png', { size: 512, scale: 0.92 });
// Notification icons must be a white silhouette on transparent.
render('notification-icon.png', { size: 96, scale: 0.86, mono: '#FFFFFF' });
render('favicon.png', { size: 64, background: BG, scale: 0.74, radius: 0.22 });
