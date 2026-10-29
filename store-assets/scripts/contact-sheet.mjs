// Contact sheet of every NN.png in a folder. usage: node scripts/contact-sheet.mjs <outDir> [cols]
import sharp from 'sharp';
import fs from 'node:fs';
const [dir, c] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter(f => /^\d+\.png$/.test(f)).sort();
const cols = +(c || Math.min(files.length, files.length > 5 ? 4 : 5));
const tw = 432, th = 540, gap = 28, pad = 56, rows = Math.ceil(files.length / cols);
const comps = await Promise.all(files.map(async (f, i) => ({ input: await sharp(`${dir}/${f}`).resize(tw, th, { kernel: 'lanczos3' }).toBuffer(),
  left: pad + (i % cols) * (tw + gap), top: pad + Math.floor(i / cols) * (th + gap) })));
await sharp({ create: { width: pad * 2 + cols * tw + (cols - 1) * gap, height: pad * 2 + rows * th + (rows - 1) * gap, channels: 3, background: '#e9e5dc' } })
  .composite(comps).png().toFile(`${dir}/contact-sheet.png`);
console.log(`${dir}/contact-sheet.png`, files.length, 'slides');
