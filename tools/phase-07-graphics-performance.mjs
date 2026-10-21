// Optional Phase 7 checks. Supply Playwright via NODE_PATH or a local install.
/* global document, window, WebGLRenderingContext, WebGL2RenderingContext, requestAnimationFrame */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs/promises';
(async()=>{
 const stage=process.argv[2]||'before';
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 const results=[];
 for(const width of [1280,390]) for(let run=1;run<=3;run++) {
  const context=await browser.newContext({viewport:{width,height:width===390?844:720},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.addInitScript(()=>{
   document.cookie='site_audio_allowed=false; path=/';localStorage.setItem('site.audio.allowed','false');
   window.__perf={draws:0,raf:0,longTasks:[]};
   const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>raf.call(window,t=>{window.__perf.raf++;cb(t)});
   for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype])for(const key of ['drawElements','drawArrays']){
    const fn=proto[key];proto[key]=function(...args){window.__perf.draws++;return fn.apply(this,args)};
   }
   new PerformanceObserver(list=>window.__perf.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
  });
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:8878/_3-graphics/graphics.html',{waitUntil:'load'});
  await page.waitForFunction(()=>document.getElementById('camera-info').textContent.includes('tgt -3.89,-0.47,6.41'));
  await page.waitForTimeout(2000);
  const startup=await page.evaluate(()=>({load:performance.getEntriesByType('navigation')[0].loadEventEnd,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,resources:performance.getEntriesByType('resource').reduce((s,r)=>s+r.transferSize,0),heap:performance.memory?.usedJSHeapSize,audit:structuredClone(window.__perf)}));
  const begin=await page.evaluate(()=>{window.__perf.draws=0;window.__perf.raf=0;window.__perf.longTasks=[];return performance.now()});
  await page.waitForTimeout(2000);
  const idle=await page.evaluate(begin=>({...window.__perf,duration:performance.now()-begin}),begin);
  const before=await page.locator('#camera-info').innerText();
  await page.getByTitle('Move left',{exact:true}).focus();await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const interaction=await page.evaluate(()=>({camera:document.getElementById('camera-info').innerText,draws:window.__perf.draws}));
  await page.screenshot({path:`output/phase-07/${stage}/graphics-settled-${width}-${run}.png`});
  results.push({stage,width,run,startup,idle,interaction:{before,...interaction},browser:await browser.version()});
  console.log(stage,width,run,'idle draws',idle.draws,'raf',idle.raf,'keyboard redraw',interaction.draws-idle.draws);
  await fs.writeFile(`output/phase-07/${stage}/graphics-performance.json`,JSON.stringify(results,null,2));await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
