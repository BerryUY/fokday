import { chromium } from 'playwright';
const [url, out, w='1440', h='900', full='0', wait='2500'] = process.argv.slice(2);
const b = await chromium.launch({channel:'chrome'});
const mobile = +w < 600;
const ctx = await b.newContext({ viewport:{width:+w,height:+h}, deviceScaleFactor: mobile?3:2, isMobile:mobile, hasTouch:mobile,
  userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
const p = await ctx.newPage();
await p.goto(url, { waitUntil:'networkidle', timeout:60000 }).catch(e=>console.log('nav',e.message));
// trigger lazy/scroll animations
await p.evaluate(async()=>{ for(let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120));} window.scrollTo(0,0); });
await p.waitForTimeout(+wait);
await p.screenshot({ path: out, fullPage: full==='1' });
await b.close();
