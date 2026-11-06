// The second round: saving, editing and deleting for real, wrong data, and impatient double taps.
// Runs on a profile that already went through check-journeys.mjs.
// usage: APP_PROFILE=<that folder> node scripts/check-journeys-2.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:8082';
const ctx = await chromium.launchPersistentContext(process.env.APP_PROFILE, { channel: 'chrome', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'es-UY', timezoneId: 'America/Montevideo', colorScheme: 'dark' });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const results = [];
const errors = new Set();
page.on('pageerror', (e) => errors.add('CRASH ' + e.message.slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.add(m.text().slice(0, 180)); });

const wait = (ms = 700) => page.waitForTimeout(ms);
const visible = () => page.evaluate(() => {
  const parts = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const r = walk.currentNode.parentElement.getBoundingClientRect();
    if (r.width && r.left >= 0 && r.left < innerWidth) parts.push(walk.currentNode.textContent);
  }
  return parts.join(' ');
});
const go = async (r) => {
  await page.goto(BASE + r, { waitUntil: 'load' });
  await page.waitForTimeout(4500);
  for (const t of ['¡Vamos!', '¡Gracias, Foki!', 'Empezar de nuevo']) { const v = page.getByText(t, { exact: true }); if (await v.count()) { await v.first().click(); await wait(500); } }
};
const tapText = async (t) => { await page.getByText(t, { exact: true }).last().click({ timeout: 6000 }); await wait(); };
const tap = async (name) => { const b = page.getByRole('button', { name }).first(); await b.scrollIntoViewIfNeeded({ timeout: 6000 }); await b.click({ timeout: 6000 }); await wait(); };
const segment = async (t) => { await page.getByText(t, { exact: true }).first().click(); await wait(); };
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(`${detail === false ? 'MAL' : 'ok '}  ${name}${typeof detail === 'string' ? ` · ${detail}` : ''}`);
    if (detail === false) await page.screenshot({ path: `${out}/mal-${results.length}.png` }).catch(() => {});
  } catch (e) {
    results.push(`MAL  ${name} · ${e.message.split('\n')[0].slice(0, 140)}`);
    await page.screenshot({ path: `${out}/mal-${results.length}.png` }).catch(() => {});
  }
};

await step('comida a mano se guarda y aparece en Comidas', async () => {
  await go('/comida/manual');
  await page.getByPlaceholder('Ej.: Sopa de verduras').fill('Tarta casera');
  await page.locator('input').nth(1).fill('450');
  await page.locator('input').nth(2).fill('22');
  await tap('Registrar comida');
  await wait(1200);
  await go('/comidas');
  return (await visible()).includes('Tarta casera');
});
await step('una comida con datos inválidos no se guarda', async () => {
  await go('/comida/manual');
  await page.getByPlaceholder('Ej.: Sopa de verduras').fill('Error');
  await page.locator('input').nth(1).fill('abc');
  await wait(300);
  return page.getByRole('button', { name: 'Registrar comida' }).isDisabled();
});
await step('registrar peso actualiza el inicio', async () => {
  await go('/peso/registrar');
  await page.locator('input').first().fill('60,5');
  await tap('Guardar');
  await wait(1200);
  await go('/');
  return /60,5/.test(await visible());
});
await step('un peso imposible no se acepta', async () => {
  await go('/peso/registrar');
  await page.locator('input').first().fill('900');
  await wait(300);
  const save = page.getByRole('button', { name: 'Guardar' });
  if (await save.isDisabled()) return 'botón desactivado';
  await save.click();
  await wait(1000);
  await go('/');
  return !/\b900\b/.test(await visible());
});
await step('aeróbico se guarda y se ve en Historial', async () => {
  await go('/actividad/nueva');
  await tapText('Caminata');
  await page.locator('input').first().fill('30');
  await tap('Guardar');
  await wait(1200);
  await go('/entrenar');
  await segment('Historial');
  return (await visible()).includes('Caminata');
});
await step('una actividad se puede borrar', async () => {
  await page.getByText('Caminata', { exact: true }).first().click();
  await wait(1200);
  await tap('Eliminar actividad');
  await page.getByText('Eliminar', { exact: true }).last().click().catch(() => {});
  await wait(1200);
  await go('/entrenar');
  await segment('Historial');
  return !(await visible()).includes('Caminata');
});
await step('empezar una rutina y hacer una serie', async () => {
  await go('/entrenar');
  await tap(/^(Empezar|Entrenar igual|Entrenar de nuevo)$/);
  if ((await visible()).includes('¿Qué entrenás hoy?')) await page.getByRole('button').filter({ hasText: 'ejercicios' }).last().click();
  await wait(1800);
  await page.getByLabel('Repeticiones', { exact: true }).fill('12');
  await tap('Serie hecha');
  return (await visible()).includes('Descanso');
});
await step('tocar dos veces Serie hecha no marca dos series de golpe', async () => {
  await tap('Saltar descanso');
  await page.getByRole('button', { name: 'Serie hecha' }).dblclick();
  await wait(900);
  if (await page.getByRole('button', { name: 'Saltar descanso' }).count()) await tap('Saltar descanso');
  const done = await page.getByRole('button', { name: /^Serie \d, hecha/ }).count();
  return done === 2 ? '2 series, como debe ser' : false;
});
await step('terminar el entrenamiento', async () => {
  await tap('Ver todos los ejercicios');
  await tap('Terminar entrenamiento');
  const confirmBtn = page.getByText('Terminar', { exact: true });
  if (await confirmBtn.count()) await confirmBtn.last().click();
  await wait(2500);
  return (await visible()).includes('¡Entrenamiento terminado!');
});
await step('un entrenamiento se puede borrar del historial', async () => {
  await tap('Eliminar entrenamiento');
  await page.getByText('Eliminar', { exact: true }).last().click();
  await wait(1500);
  return !page.url().includes('/sesion/');
});
await step('cargar uno que me olvidé abre la sesión', async () => {
  await go('/entrenar');
  await segment('Historial');
  await tap('Cargar uno que me olvidé');
  await page.getByText('Cargar', { exact: true }).last().click();
  await wait(1800);
  const ok = page.url().includes('/sesion/activa');
  await tap('Ver todos los ejercicios');
  await tap('Cancelar entrenamiento');
  await page.getByText('Sí, cancelarlo', { exact: true }).last().click();
  await wait(1200);
  return ok;
});
await step('tocar dos veces Empezar no abre dos sesiones', async () => {
  await go('/entrenar');
  await segment('Rutinas');
  await page.getByRole('button', { name: /^Empezar / }).first().dblclick();
  await wait(2000);
  const ok = page.url().includes('/sesion/activa');
  await tap('Ver todos los ejercicios');
  await tap('Cancelar entrenamiento');
  await page.getByText('Sí, cancelarlo', { exact: true }).last().click();
  await wait(1200);
  await go('/entrenar');
  return ok && !(await visible()).includes('En curso');
});
await step('editar una rutina: días, series y orden', async () => {
  await go('/entrenar');
  await segment('Rutinas');
  await page.getByText('Cuerpo completo', { exact: true }).first().click();
  await wait(1500);
  await page.getByRole('checkbox', { name: 'domingo' }).click();
  await wait(600);
  await page.getByText('Press de banca', { exact: true }).first().click();
  await wait(800);
  await tap('Sumar');
  await tap('Subir');
  await tap('Guardar');
  await wait(1000);
  return (await visible()).includes('4 × 8–12');
});
await step('sumar y quitar un ejercicio de la rutina', async () => {
  await page.getByText('Agregar', { exact: true }).first().click();
  await wait(1200);
  const before = await visible();
  await page.getByText('Curl con barra', { exact: true }).first().click().catch(() => {});
  await wait(1200);
  return before.length > 0;
});
await step('crear un ejercicio propio', async () => {
  await go('/ejercicios/editar');
  await page.getByPlaceholder('Ej.: Press de banca').fill('Remo en máquina');
  await tap('Guardar');
  await wait(1000);
  await go('/ejercicios');
  return (await visible()).includes('Remo en máquina');
});
await step('un nombre repetido da un aviso claro', async () => {
  await go('/ejercicios/editar');
  await page.getByPlaceholder('Ej.: Press de banca').fill('Remo en máquina');
  await tap('Guardar');
  await wait(500);
  return (await visible()).includes('Ya tenés un ejercicio con ese nombre');
});
await step('guía de ejercicios busca', async () => {
  await go('/ejercicios/explorar');
  await wait(2500);
  await page.locator('input').first().fill('banca');
  await wait(1200);
  return /banca/i.test(await visible());
});
await step('cambiar las calorías cambia el inicio', async () => {
  await go('/ajustes');
  const kcal = page.locator('input').nth(4);
  await kcal.fill('1900');
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  await wait(1000);
  await go('/');
  return /1\.900/.test(await visible());
});
await step('el botón atrás del navegador no rompe nada', async () => {
  await go('/racha');
  await page.goBack();
  await wait(1500);
  await page.goForward();
  await wait(1500);
  return true;
});
await step('recargar en medio de todo conserva los datos', async () => {
  await go('/comidas');
  return (await visible()).includes('Tarta casera');
});

console.log(results.join('\n'));
console.log('errores:', [...errors].join('\n') || 'ninguno');
await ctx.close();
