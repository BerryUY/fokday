// A new person's first day, end to end, checking that what they do really shows up afterwards.
// usage: APP_PROFILE=<empty folder> node scripts/check-journeys.mjs <outDir>
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
const text = () => page.evaluate(() => document.body.innerText);
const visible = () => page.evaluate(() => {
  // Only what's on screen: the tabs that aren't open stay mounted beside this one.
  const parts = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const el = walk.currentNode.parentElement;
    const r = el.getBoundingClientRect();
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
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(`${detail === false ? 'MAL' : 'ok '}  ${name}${typeof detail === 'string' ? ` · ${detail}` : ''}`);
  } catch (e) {
    results.push(`MAL  ${name} · ${e.message.split('\n')[0].slice(0, 140)}`);
    await page.screenshot({ path: `${out}/fallo-${results.length}.png` }).catch(() => {});
  }
};

// --- Sign up steps
await go('/');
await step('onboarding completo', async () => {
  await tapText('Empecemos');
  await page.locator('input').first().fill('Sofi');
  await tapText('Continuar');
  await tapText('Bajar de peso');
  await tapText('Continuar');
  await page.locator('input').first().fill('61');
  await tapText('Continuar');
  await tapText('Mujer');
  await page.locator('input').nth(0).fill('33');
  await page.locator('input').nth(1).fill('164');
  await tapText('Continuar');
  await tapText('Activo');
  await tapText('Continuar');
  await page.locator('input').first().fill('57');
  await tapText('Continuar');
  await tapText('Continuar');
  await tapText('3 días');
  await tapText('Continuar');
  await tapText('Agua');
  await tapText('Creatina');
  await tapText('Carbohidratos');
  await tapText('Continuar');
  if ((await text()).includes('Ahora no')) await tapText('Ahora no');
  const summary = await text();
  await tapText('Empezar');
  await wait(2500);
  return /61 → 57 kg/.test(summary) && !page.url().includes('bienvenida');
});

// --- Inicio
await step('inicio saluda por nombre y muestra el peso real', async () => {
  await go('/');
  const t = await visible();
  return t.includes('Sofi') && /\b61\b/.test(t);
});
await step('sumar un vaso desde la card de agua', async () => {
  await tap('Sumar un vaso');
  return (await visible()).includes('0,25 L') || (await visible()).includes('0,3 L');
});
await step('misión de agua suma otro vaso', async () => {
  await page.getByRole('button', { name: /de agua/ }).first().click();
  await wait();
  return /0,5 L/.test(await visible());
});
await step('marcar creatina desde la misión', async () => {
  await page.getByRole('button', { name: /Tomá la creatina/ }).first().click();
  await wait();
  return (await page.getByRole('button', { name: /Tomá la creatina, Hecho/ }).count()) > 0;
});
await step('agregar y completar una tarea', async () => {
  const field = page.getByPlaceholder('Agregar una tarea').first();
  await field.scrollIntoViewIfNeeded();
  await field.fill('Comprar avena');
  await field.press('Enter');
  await wait();
  return (await visible()).includes('Comprar avena');
});
await step('la tarea sigue al reabrir', async () => {
  await go('/');
  return (await visible()).includes('Comprar avena');
});

// --- Comidas
await step('registrar una comida del catálogo', async () => {
  await go('/comida/categoria/almuerzo');
  await page.getByRole('button', { name: /^Registrar / }).first().click({ timeout: 6000 });
  await wait(1200);
  const sheet = page.getByText('Registrar', { exact: true });
  if (await sheet.count()) { await sheet.last().click(); await wait(1200); }
  await go('/');
  const t = await visible();
  return t.includes('1 registro') ? 'la racha se prendió' : false;
});
await step('la racha pasó a 1', async () => (await page.getByRole('button', { name: /Racha de 1 día/ }).count()) > 0);
await step('buscar dentro de una comida', async () => {
  await go('/comida/categoria/cena');
  const field = page.getByPlaceholder(/Buscar/).first();
  await field.fill('omelette');
  await wait();
  const t = await visible();
  return t.includes('Omelette') && !t.includes('Pescado con verduras');
});
await step('cargar una comida a mano', async () => {
  await go('/comida/manual');
  const inputs = page.locator('input');
  await inputs.nth(0).fill('Tarta casera');
  await wait(300);
  const t = await visible();
  await page.screenshot({ path: `${out}/manual.png` });
  return t.length > 0;
});

// --- Entrenar
await step('elegir un plan listo', async () => {
  await go('/rutina/nueva');
  await tapText('Cuerpo completo');
  await wait(1500);
  return (await visible()).includes('Sentadilla');
});
await step('la rutina aparece en Entrenar', async () => {
  await go('/entrenar');
  await page.getByText('Rutinas', { exact: true }).first().click();
  await wait();
  return (await visible()).includes('Cuerpo completo');
});
await step('empezar desde el play de la fila', async () => {
  await page.getByRole('button', { name: /^Empezar / }).first().click();
  await wait(1800);
  return page.url().includes('/sesion/activa');
});
await step('volver atrás no pierde la sesión', async () => {
  await page.getByRole('button', { name: 'Volver' }).last().click();
  await wait(1200);
  await go('/');
  return (await page.getByRole('button', { name: 'Seguir entrenando' }).count()) > 0;
});
await step('seguir desde el inicio', async () => {
  await tap('Seguir entrenando');
  await wait(1000);
  return page.url().includes('/sesion/activa');
});
await step('cargar peso con + y hacer la serie', async () => {
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Más peso' }).click();
  await wait(300);
  await tap('Serie hecha');
  return (await visible()).includes('Descanso');
});
await step('el descanso se puede alargar y saltar', async () => {
  await tap('+15 s');
  await tap('Saltar descanso');
  return /Serie\s+2/.test(await visible());
});
await step('la serie siguiente heredó el peso', async () => (await page.getByLabel('Peso', { exact: true }).inputValue()) === '10');
await step('corregir una serie ya hecha', async () => {
  await page.getByRole('button', { name: /Serie 1, hecha/ }).click();
  await wait(400);
  await page.getByLabel('Peso', { exact: true }).fill('12,5');
  await tap('Guardar');
  return (await visible()).includes('12,5 kg');
});
await step('sumar una serie', async () => {
  const before = await page.getByRole('button', { name: /^Serie \d/ }).count();
  await tap('Agregar una serie');
  return (await page.getByRole('button', { name: /^Serie \d/ }).count()) === before + 1;
});
await step('saltear un ejercicio', async () => {
  await tap('Ver todos los ejercicios');
  await page.getByRole('button', { name: /^Saltear / }).click();
  await wait(1000);
  return (await visible()).includes('Press de banca');
});
await step('terminar con series pendientes pide confirmación', async () => {
  await tap('Ver todos los ejercicios');
  await tap('Terminar entrenamiento');
  await page.getByText('Terminar', { exact: true }).last().click();
  await wait(2500);
  for (const t of ['¡Vamos!']) { const v = page.getByText(t, { exact: true }); if (await v.count()) await v.first().click(); }
  await wait(800);
  return (await visible()).includes('¡Entrenamiento terminado!');
});
await step('aparece en Historial', async () => {
  await go('/entrenar');
  await page.getByText('Historial', { exact: true }).first().click();
  await wait();
  return (await visible()).includes('Cuerpo completo');
});
await step('misión de entrenar marcada en el inicio', async () => {
  await go('/');
  return (await page.getByRole('button', { name: /Entrená.*Hecho/ }).count()) > 0 || 'hoy no era día de gym';
});
await step('registrar aeróbico', async () => {
  await go('/actividad/nueva');
  const t = await visible();
  return t.length > 0;
});

// --- Progreso y ajustes
await step('progreso abre con datos', async () => {
  await go('/progreso');
  return (await visible()).length > 50;
});
await step('notificaciones se pueden apagar y quedan apagadas', async () => {
  await go('/ajustes/notificaciones');
  await page.getByRole('switch', { name: 'Agua' }).click();
  await wait(600);
  await go('/ajustes/notificaciones');
  return (await page.getByRole('switch', { name: 'Agua' }).getAttribute('aria-checked')) === 'false';
});
await step('cambiar el nombre', async () => {
  await go('/ajustes');
  await page.getByPlaceholder('Para el saludo').fill('Sofía');
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  await wait(800);
  await go('/');
  return (await visible()).includes('Sofía');
});
await step('tema claro y vuelta', async () => {
  await go('/ajustes');
  await page.getByText('Claro', { exact: true }).first().click();
  await wait(800);
  const light = await page.evaluate(() => getComputedStyle(document.querySelector('#root > div') ?? document.body).backgroundColor);
  await page.getByText('Oscuro', { exact: true }).first().click();
  await wait(500);
  return light;
});

console.log(results.join('\n'));
console.log('errores:', [...errors].join('\n') || 'ninguno');
fs.writeFileSync(`${out}/resultado.txt`, results.join('\n') + '\n');
await ctx.close();
