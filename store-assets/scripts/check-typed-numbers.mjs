// Goes through the welcome like a person: types and taps Continuar without leaving the field, and
// checks that each step says what's missing and doesn't let you through until it's answered.
// usage: APP_PROFILE=<empty folder> node scripts/check-typed-numbers.mjs [screenshotDir]
import { go, openApp } from './app-session.mjs';

const shots = process.argv[2];
const { ctx, page } = await openApp();
const problems = [];
const tap = async (text) => {
  await page.getByText(text, { exact: true }).last().click();
  await page.waitForTimeout(600);
};
const body = () => page.evaluate(() => document.body.innerText);
const continueOff = async () => page.getByRole('button', { name: 'Continuar' }).last().isDisabled();
/** The step must block Continuar and name what's missing. */
const expectBlocked = async (step, hint) => {
  const text = await body();
  if (!text.includes(hint)) problems.push(`${step}: no dice "${hint}"`);
  if (!(await continueOff())) problems.push(`${step}: Continuar no está desactivado`);
  if (shots) await page.screenshot({ path: `${shots}/${step}.png` });
};
const expectOpen = async (step) => {
  if (await continueOff()) problems.push(`${step}: Continuar sigue desactivado`);
  if ((await body()).match(/Faltan? /)) problems.push(`${step}: sigue diciendo que falta algo`);
};

await go(page, '/');
await tap('Empecemos');
await expectBlocked('nombre', 'Falta tu nombre');
await page.locator('input').first().fill('Sofi');
await expectOpen('nombre');
await tap('Continuar');

await expectBlocked('objetivo', 'Falta elegir tu objetivo');
await tap('Bajar de peso');
await tap('Continuar');

await expectBlocked('peso', 'Falta tu peso');
await page.locator('input').first().fill('5');
await page.waitForTimeout(200);
await expectBlocked('peso-fuera-de-rango', 'entre 20 y 350');
await page.locator('input').first().fill('61');
await expectOpen('peso');
await tap('Continuar');

await expectBlocked('cuerpo', 'Faltan tu sexo, tu edad y tu altura');
await tap('Mujer');
await expectBlocked('cuerpo-2', 'Faltan tu edad y tu altura');
await page.locator('input').nth(0).fill('33');
await expectBlocked('cuerpo-3', 'Falta tu altura');
await page.locator('input').nth(1).fill('164');
await expectOpen('cuerpo');
await tap('Continuar');

await expectBlocked('actividad', 'Falta elegir cuánto te movés');
await tap('Activo');
await tap('Continuar');

await page.locator('input').first().fill('57');
await tap('Continuar');
await tap('Continuar'); // objetivos calculados

await expectBlocked('gym', 'Falta elegir tus días');
await tap('Todavía no');
await expectOpen('gym');
await tap('Continuar');

for (let i = 0; i < 4; i++) {
  const text = await body();
  if (/→/.test(text)) break;
  const next = ['Por ahora nada más', 'Ahora no', 'Continuar'].find((t) => text.includes(t));
  if (!next) break;
  await tap(next);
}
if (!/61 → 57 kg/.test(await body())) problems.push(`resumen: ${(await body()).slice(0, 200)}`);

await tap('Empezar');
await page.waitForTimeout(1500);
if (page.url().includes('bienvenida')) problems.push('no terminó el onboarding');

console.log(problems.length ? `MAL:\n${problems.join('\n')}` : 'OK: cada paso avisa qué falta y llega 61 → 57 kg');
await ctx.close();
process.exit(problems.length ? 1 : 0);
