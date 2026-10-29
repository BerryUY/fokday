// Starter: copy to build-<carousel>.mjs and design each slide. Writes slides/example/NN.html
import fs from 'node:fs';
import { A, head, end, wordmark, swoosh, browser, phone, testi, arrowR } from './kit.mjs';
import { BRAND } from '../brand.mjs';

const out = new URL('../slides/example/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const save = (n, html) => fs.writeFileSync(new URL(`${n}.html`, out), html);
const meta = (n, total, label, dark) => `<div class="meta">${wordmark(25, { light: dark })}<span class="mono" style="color:${dark ? 'var(--paper)' : 'var(--ink)'}">${label} &nbsp;·&nbsp; ${n}/${total}</span></div>`;

save('01', head('Hook', `.h{position:absolute;left:68px;top:160px;font-size:150px}`) + `<div class="slide dark grain">
${meta(1, 2, 'Rótulo', true)}
<div class="h display">Una idea<br>grande y<br><span class="swoosh accent-t">clara.${swoosh()}</span></div>
<div class="foot"><span class="mono" style="opacity:.55">${BRAND.web}</span><span class="mono accent-t" style="display:flex;gap:10px;align-items:center">Deslizá ${arrowR(20)}</span></div>
</div>` + end);

save('02', head('Proyecto', `.name{position:absolute;left:68px;top:186px;font-size:104px}`) + `<div class="slide light grain">
${meta(2, 2, 'Proyecto')}
<span class="mono deep-t" style="position:absolute;left:72px;top:156px">Rubro</span>
<div class="name display">Cliente</div>
${browser({ src: `${A}/shots/demo-desk.png`, url: 'cliente.com', w: 1060, h: 520, x: 72, y: 340 })}
${phone({ src: `${A}/shots/demo-mob.png`, url: 'cliente.com', w: 252, x: 736, y: 520 })}
${testi({ x: 72, y: 950, w: 600, q: 'Testimonio textual del cliente, atribuido a quien lo dijo.', who: 'Cliente' })}
</div>` + end);
console.log('example built');
