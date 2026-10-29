import { chromium } from 'playwright';
const [url, out, text, offset='90', wait='2500'] = process.argv.slice(2);
const b = await chromium.launch({channel:'chrome'});
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const p = await ctx.newPage();
await p.goto(url, { waitUntil:'networkidle', timeout:60000 }).catch(e=>console.log(e.message));
await p.evaluate(async()=>{ for(let y=0;y<document.body.scrollHeight;y+=300){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,90));} });
const y = await p.evaluate(([t])=>{ const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n; while(n=w.nextNode()){ if(n.textContent.trim().startsWith(t)){ const r=n.parentElement.getBoundingClientRect(); if(r.height>0) return r.top+window.scrollY; } } return null; }, [text]);
console.log(out, 'y=', y);
await p.evaluate(v=>window.scrollTo(0,v), (y??0) - +offset);
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
await b.close();
