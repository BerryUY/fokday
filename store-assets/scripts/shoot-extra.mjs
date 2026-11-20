// Extra steps for the Play set after the redesign: close the tour card on Inicio, and shoot a workout mid-way.
// usage: node scripts/shoot-extra.mjs tour | explore-session
import { openApp, go } from './app-session.mjs';

const step = process.argv[2];
const { ctx, page } = await openApp();
if (step === 'tour') {
  await go(page, '/');
  const close = page.getByLabel('No, gracias');
  console.log('close buttons', await close.count());
  if (await close.count()) { await close.first().click(); await page.waitForTimeout(1200); }
  console.log((await page.evaluate(() => document.body.innerText)).slice(0, 400));
} else if (step === 'explore-session') {
  await go(page, '/entrenar');
  await page.getByText('Entrenar igual').click();
  await page.waitForTimeout(2000);
  console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));
  await page.screenshot({ path: 'research/session.png' });
}
await ctx.close();

if (step === 'open-session') {
  const r = await openApp();
  await go(r.page, '/entrenar');
  await r.page.getByText('Entrenar igual').click();
  await r.page.waitForTimeout(1500);
  await r.page.getByText('Piernas', { exact: true }).click();
  await r.page.waitForTimeout(3000);
  console.log(r.page.url());
  console.log((await r.page.evaluate(() => document.body.innerText)).slice(0, 2000));
  const labels = await r.page.evaluate(() => [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).filter(Boolean));
  console.log('LABELS', [...new Set(labels)].join(' | '));
  await r.page.screenshot({ path: 'research/session.png' });
  await r.ctx.close();
}

if (step === 'workout') {
  const r = await openApp();
  await go(r.page, '/sesion/activa');
  // 20 minutes in, so the timer reads like a real session.
  const t0 = new Date(process.env.APP_TIME || '2026-11-20T16:45:00-03:00').getTime();
  for (const [kg, reps] of [['85', '10'], ['85', '9']]) {
    await r.page.getByLabel('Peso', { exact: true }).first().fill(kg);
    await r.page.keyboard.press('Tab');
    await r.page.waitForTimeout(800);
    await r.page.getByLabel('Repeticiones', { exact: true }).first().fill(reps);
    await r.page.keyboard.press('Tab');
    await r.page.waitForTimeout(800);
    await r.page.getByLabel('Serie hecha').first().click();
    await r.page.waitForTimeout(1800);
  }
  await r.page.clock.setFixedTime(new Date(t0 + 21 * 60e3 + 20e3));
  await r.page.waitForTimeout(1500);
  await r.page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  console.log((await r.page.evaluate(() => document.body.innerText)).slice(0, 1200));
  await r.page.screenshot({ path: 'assets/shots/sesion.png' });
  await r.ctx.close();
}
