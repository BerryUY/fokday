// Walks a brand-new profile through the welcome steps and saves a screenshot of each new one.
// usage: APP_PROFILE=.app-profile-new node scripts/check-onboarding.mjs   (delete the folder to start over)
import { go, openApp } from './app-session.mjs';

const { ctx, page } = await openApp();
const tap = async (text) => {
  await page.getByText(text, { exact: true }).last().click();
  await page.waitForTimeout(500);
};
const shot = (name) => page.screenshot({ path: `research/onb-${name}.png` });

await go(page, '/');
await tap('Empecemos');
await page.locator('input').first().fill('Martín');
await tap('Continuar');
await tap('Bajar de peso');
await tap('Continuar');
await page.locator('input').first().fill('92');
await page.locator('input').first().blur();
await tap('Continuar');
await tap('Hombre');
await shot('cuerpo');
await tap('Continuar');
await tap('Activo');
await shot('actividad');
await tap('Continuar');
await tap('Continuar'); // meta (suggested)
await shot('nutricion');
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 900));
await ctx.close();
