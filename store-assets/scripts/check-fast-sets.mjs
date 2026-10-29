// Regression check for "cannot commit - no transaction is active": type kg and reps and tick
// several sets as fast as possible, then look for the error toast.
// usage: node scripts/check-fast-sets.mjs   (after: node scripts/app-session.mjs import)
import { go, openApp } from './app-session.mjs';

const { ctx, page } = await openApp();
await go(page, '/entrenar');
await page.getByText('Empezar', { exact: true }).click();
await page.waitForTimeout(2000);
for (const i of [1, 2, 3]) {
  await page.getByLabel('Peso de la serie ' + i).first().fill('90');
  await page.getByLabel('Repeticiones de la serie ' + i).first().fill('8');
  await page.locator('[aria-label^="Marcar serie como"]').nth(i - 1).click();
}
await page.waitForTimeout(2500);
const text = await page.evaluate(() => document.body.innerText);
console.log(/cannot commit|no transaction/i.test(text) ? 'ERROR TOAST SHOWN' : 'no error');
console.log((text.match(/\d+\/12 series/) ?? ['?'])[0]);
await ctx.close();
