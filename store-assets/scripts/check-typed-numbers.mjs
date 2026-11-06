// Types the numbers of the welcome steps and taps Continuar without leaving the field, as people do.
// usage: APP_PROFILE=<empty folder> node scripts/check-typed-numbers.mjs
import { go, openApp } from './app-session.mjs';

const { ctx, page } = await openApp();
const tap = async (text) => {
  await page.getByText(text, { exact: true }).last().click();
  await page.waitForTimeout(600);
};

await go(page, '/');
await tap('Empecemos');
await page.locator('input').first().fill('Sofi');
await tap('Continuar');
await tap('Bajar de peso');
await tap('Continuar');
await page.locator('input').first().fill('61');
await tap('Continuar');
await tap('Mujer');
await page.locator('input').nth(0).fill('33');
await page.locator('input').nth(1).fill('164');
await tap('Continuar');
await tap('Activo');
await tap('Continuar');
await page.locator('input').first().fill('57');
await tap('Continuar');

for (let i = 0; i < 6; i++) {
  const text = await page.evaluate(() => document.body.innerText);
  if (text.includes('kg') && /Meta/.test(text) && /→/.test(text)) break;
  const next = ['Por ahora nada más', 'Ahora no', 'Continuar'].find((t) => text.includes(t));
  if (!next) break;
  await tap(next);
}
const text = await page.evaluate(() => document.body.innerText);
const ok = /61 → 57 kg/.test(text);
console.log(ok ? 'OK: 61 → 57 kg' : `MAL: ${text.slice(0, 400)}`);
await ctx.close();
process.exit(ok ? 0 : 1);
