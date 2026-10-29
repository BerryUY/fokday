// Real FokDay screens for the Play Store set: a fresh browser profile (never the person's data)
// loads demo/fokday-demo.json through Ajustes → Datos y respaldo → Importar, then captures routes.
// usage: node scripts/app-session.mjs <step>   steps: explore <path> | shoot <name> <path> [scrollY]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.APP_URL || 'http://localhost:8082';
const PROFILE = path.resolve('.app-profile');
const DEMO = path.resolve('demo/fokday-demo.json');

export async function openApp() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-UY',
    timezoneId: 'America/Montevideo',
    colorScheme: 'dark',
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  // Afternoon light: the greeting and today's meals read like a normal day.
  await page.clock.setFixedTime(new Date(process.env.APP_TIME || '2026-10-29T16:45:00-03:00'));
  return { ctx, page };
}

export async function go(page, route) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  // react-native-web gives <input> an intrinsic width that native TextInputs do not have; let flex size them like on Android.
  await page.addStyleTag({ content: 'input{min-width:0!important;width:100%!important}div:has(>input){min-width:0!important}' });
  // Let the launch animation finish.
  await page.waitForTimeout(+(process.env.WAIT || 4500));
  // Close the once-a-day streak celebration if it is up.
  const vamos = page.getByText('¡Vamos!');
  if (await vamos.count()) { await vamos.first().click(); await page.waitForTimeout(800); }
}

export async function importDemo(page) {
  await go(page, '/ajustes/respaldo');
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Importar respaldo (JSON)').click();
  await (await chooser).setFiles(DEMO);
  await page.getByText('Restaurar', { exact: true }).last().click();
  await page.waitForTimeout(2500);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Z]):/, '/$1:')}` || process.argv[1].endsWith('app-session.mjs')) {
  const [step, a, b, c] = process.argv.slice(2);
  const { ctx, page } = await openApp();
  if (step === 'explore') {
    await go(page, a || '/');
    console.log(page.url());
    console.log((await page.evaluate(() => document.body.innerText)).slice(0, 2500));
    await page.screenshot({ path: 'research/explore.png' });
  } else if (step === 'import') {
    await importDemo(page);
    console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));
    await page.screenshot({ path: 'research/import.png' });
  } else if (step === 'click') {
    await go(page, a);
    await page.getByText(b, { exact: false }).first().click();
    await page.waitForTimeout(2000);
    console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));
    await page.screenshot({ path: 'research/click.png' });
  } else if (step === 'shoot') {
    await go(page, b);
    if (c) { await page.mouse.move(206, 450); await page.mouse.wheel(0, +c); }
    await page.waitForTimeout(800);
    fs.mkdirSync('assets/shots', { recursive: true });
    await page.screenshot({ path: `assets/shots/${a}.png` });
    console.log('saved', a);
  }
  await ctx.close();
}

// Starts today's routine and completes two sets (kg, reps, done) so the workout screen looks mid-way.
if (process.argv[2] === 'session') {
  const { ctx, page } = await openApp();
  await go(page, '/entrenar');
  await page.getByText('Empezar', { exact: true }).click();
  await page.waitForTimeout(2000);
  // 20 minutes into the workout, so the timer reads like a real session.
  await page.clock.setFixedTime(new Date('2026-10-29T17:06:20-03:00'));
  for (const [i, kg, reps] of [[1, '85', '10'], [2, '85', '9']]) {
    await page.getByLabel('Peso de la serie ' + i).first().fill(kg);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1200);
    await page.getByLabel('Repeticiones de la serie ' + i).first().fill(reps);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1200);
    await page.getByLabel('Marcar serie como hecha').first().click();
    await page.waitForTimeout(1500);
  }
  await page.evaluate(() => { document.activeElement?.blur(); for (const el of document.querySelectorAll('*')) if (el.scrollLeft) el.scrollLeft = 0; window.scrollTo(0, 0); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'assets/shots/sesion.png' });
  await ctx.close();
}
