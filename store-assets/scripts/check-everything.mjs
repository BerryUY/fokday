// Touches every button of every screen, like an impatient person, and reports what breaks: crashes,
// console errors, the red error screen, sideways overflow, buttons nothing can reach, buttons inside
// buttons. Uses the demo profile copy it's given, never real accounts or purchases.
// usage: APP_PROFILE=<copy of .app-profile> node scripts/check-everything.mjs <outDir> [routes,comma,separated]
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:8082';
const ROUTES = (process.argv[3] ?? '/,/comidas,/entrenar,/progreso,/racha,/ajustes,/ajustes/notificaciones,/ajustes/respaldo,/asistencia,/peso,/peso/registrar,/pro,/rutina/nueva,/ejercicios,/ejercicios/explorar,/comida/manual,/comida/buscar,/comida/foto,/comida/escanear,/comida/biblioteca,/actividad/nueva,/cuenta/entrar,/tour').split(',');

// Leaves the app, spends money, wipes the test or opens a file picker: not what this check is about.
const SKIP = /borrar mis datos|eliminar mi cuenta|cerrar sesión|google|comprar|suscrib|restaurar compras|compartir|exportar|importar|csv|copia|sacar foto|galería|elegir de|tomar foto|usar la cámara|restaurar desde/i;

const ctx = await chromium.launchPersistentContext(process.env.APP_PROFILE, { channel: 'chrome', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'es-UY', timezoneId: 'America/Montevideo', colorScheme: 'dark' });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const findings = new Map();
let where = 'inicio';
const note = (kind, detail) => {
  const key = `${kind}: ${detail}`;
  if (!findings.has(key)) findings.set(key, where);
};
page.on('pageerror', (e) => note('CRASH', e.message.slice(0, 180)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // The web preview has no backend session or native modules; those aren't app bugs.
  if (/Failed to load resource|net::ERR|favicon/.test(t)) return;
  note('CONSOLA', t.slice(0, 180));
});
page.on('dialog', (d) => d.dismiss().catch(() => {}));

const load = async (route) => {
  await page.goto(BASE + route, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  await dismiss();
};
const dismiss = async () => {
  for (const t of ['¡Vamos!', '¡Gracias, Foki!', 'Empezar de nuevo']) {
    const v = page.getByText(t, { exact: true });
    if (await v.count().catch(() => 0)) await v.first().click({ timeout: 1500 }).catch(() => {});
  }
};

/** Everything tappable on the page in view, tagged so it can be found again. */
const scan = () =>
  page.evaluate(() => {
    const seen = {};
    return [...document.querySelectorAll('[role=button],[role=tab],[role=checkbox],[role=switch],button')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && !el.closest('[aria-hidden=true]') && el.getAttribute('aria-disabled') !== 'true';
      })
      .map((el, i) => {
        const label = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50) || '(sin nombre)';
        seen[label] = (seen[label] ?? 0) + 1;
        el.setAttribute('data-mk', String(i));
        return { i, label, n: seen[label] };
      });
  });

const health = async () => {
  const h = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    red: !!document.querySelector('#error-toast *') || /Uncaught Error|Console Error|Render Error/.test(document.body.innerText),
    nested: [...document.querySelectorAll('button button, [role=button] button, button [role=button], [role=button] [role=button]')].map((b) => b.getAttribute('aria-label') || b.innerText.slice(0, 30)),
    blank: document.body.innerText.trim().length < 3,
  })).catch(() => null);
  if (!h) return;
  if (h.overflow > 1) note('SE DESBORDA', `${h.overflow}px de más`);
  if (h.red) note('PANTALLA DE ERROR', (await page.evaluate(() => document.body.innerText.slice(0, 160))).replace(/\n/g, ' '));
  if (h.blank) note('PANTALLA EN BLANCO', page.url());
  for (const n of h.nested) note('BOTON ANIDADO', n);
};

let touched = 0;
for (const route of ROUTES) {
  where = route;
  await load(route);
  await health();
  const list = await scan();
  console.log(route, list.length, 'botones');
  for (const item of list) {
    if (SKIP.test(item.label)) continue;
    where = `${route} → ${item.label}`;
    const here = page.url();
    const now = await scan();
    const found = now.find((x) => x.label === item.label && x.n === item.n);
    if (!found) continue; // the screen changed since: another tap took it away
    const el = page.locator(`[data-mk="${found.i}"]`);
    try {
      await el.click({ timeout: 2500 });
      touched += 1;
    } catch {
      note('NO SE PUEDE TOCAR', item.label);
      continue;
    }
    await page.waitForTimeout(450);
    await dismiss();
    await health();
    // Close what opened, so the next tap starts from the same place.
    const cancel = page.getByText('Cancelar', { exact: true });
    if (await cancel.count().catch(() => 0)) await cancel.last().click({ timeout: 1200 }).catch(() => {});
    const closer = page.getByRole('button', { name: 'Cerrar', exact: true });
    if (await closer.count().catch(() => 0)) await closer.last().click({ timeout: 1200 }).catch(() => {});
    if (page.url() !== here) {
      await page.goBack().catch(() => {});
      await page.waitForTimeout(500);
      if (page.url() !== here) await load(route);
    }
  }
}

console.log(`\n${touched} toques en ${ROUTES.length} pantallas`);
const lines = [...findings].map(([k, v]) => `${k}\n   en ${v}`);
fs.writeFileSync(`${out}/hallazgos.txt`, lines.join('\n') + '\n');
console.log(lines.length ? lines.join('\n') : 'Sin problemas');
await ctx.close();
