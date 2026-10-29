// Preview a tall mobile full-page capture as viewport-sized frames to choose which section to show in a phone mockup.
// usage: node scripts/mobile-strips.mjs <fullpage.png> <out.png>
// NOTE: Chrome full-page captures repeat content past ~16384 device px; prefer shoot-mobile-at.mjs for the final shot.
import sharp from 'sharp';
const [inp, out] = process.argv.slice(2);
const m = await sharp(inp).metadata();
const fh = Math.round(m.width * 844 / 390), n = Math.min(12, Math.floor(m.height / fh)), tw = 260, th = Math.round(fh * tw / m.width);
const tiles = [];
for (let i = 0; i < n; i++) tiles.push({ input: await sharp(inp).extract({ left: 0, top: i * fh, width: m.width, height: fh }).resize(tw).toBuffer(), left: (i % 6) * 270, top: Math.floor(i / 6) * (th + 10) });
await sharp({ create: { width: 6 * 270, height: Math.ceil(n / 6) * (th + 10), channels: 3, background: '#888' } }).composite(tiles).png().toFile(out);
console.log(out, 'frames', n, '(frame i starts at CSS y =', 844, '* i)');
