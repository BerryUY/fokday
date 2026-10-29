import { go, openApp } from './app-session.mjs';
const { ctx, page } = await openApp();
await go(page, '/tour');
await page.screenshot({ path: 'research/tour-1.png' });
await page.getByText('Siguiente', { exact: true }).click();
await page.getByText('Siguiente', { exact: true }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'research/tour-3.png' });
await ctx.close();
