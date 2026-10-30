// Quick visual check of several screens with the demo data (a separate browser profile).
// usage: node scripts/check-screens.mjs <outDir> <name>=<route>[@scrollY] ...
import fs from 'node:fs';
import path from 'node:path';
import { go, openApp } from './app-session.mjs';

const [outDir, ...shots] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const { ctx, page } = await openApp();
for (const shot of shots) {
  const [name, rest] = shot.split('=');
  const [route, scroll] = rest.split('@');
  await go(page, route);
  if (scroll) {
    await page.mouse.move(206, 450);
    await page.mouse.wheel(0, +scroll);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('saved', name);
}
await ctx.close();
