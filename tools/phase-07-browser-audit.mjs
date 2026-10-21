// Optional Phase 7 checks. Supply Playwright via NODE_PATH or a local install.
/* global document, window, WebGLRenderingContext, WebGL2RenderingContext, innerWidth, innerHeight, devicePixelRatio */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs/promises';
const phase = process.argv[2] || 'before';
const routeFilter = process.argv[3];
const routes = ['index.html','_1-about/about.html','_2-videos/videos.html','_3-graphics/graphics.html','_4-games/games.html','_5-music/music.html','_6-docs/docs.html'];
const origin = 'http://127.0.0.1:8878';
(async () => {
  const out = `output/phase-07/${phase}`;
  await fs.mkdir(out, {recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
  const report = {browser: await browser.version(),origin,mode:'headless Windows Chrome / software WebGL',cache:'fresh isolated contexts, local no-store',consent:'explicit denied in disposable test contexts',results:[]};
  if (routeFilter) report.results = JSON.parse(await fs.readFile(`${out}/audit.json`,'utf8')).results.filter(r=>r.route!==routeFilter);
  for (const viewport of [{width:1280,height:720},{width:390,height:844}]) {
    for (const route of routes.filter(r=>!routeFilter||r===routeFilter)) {
      const context = await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block'});
      await context.addInitScript(() => {
        localStorage.setItem('site.audio.allowed','false');
        document.cookie = 'site_audio_allowed=false; path=/';
        window.__audit = {draws:0,raf:0,longTasks:[]};
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = cb => raf.call(window, time => { window.__audit.raf++; cb(time); });
        for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
          for (const method of ['drawElements','drawArrays']) {
            const original = prototype[method];
            prototype[method] = function(...args) { window.__audit.draws++; return original.apply(this,args); };
          }
        }
        new PerformanceObserver(list => window.__audit.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
      });
      const page = await context.newPage();
      const errors = [], failed = [];
      page.on('pageerror', e=>errors.push(e.message));
      page.on('requestfailed', r=>failed.push({url:r.url(),error:r.failure().errorText}));
      try {
        await page.goto(`${origin}/${route}`,{waitUntil:'load',timeout:45000});
        await page.waitForTimeout(4500);
        const name = route.split('/')[0].replace('.html','') + '-' + viewport.width;
        await page.screenshot({path:`${out}/${name}.png`});
        const result = await page.evaluate(() => {
          const box = e=>{ const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
          return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},title:document.title,description:document.querySelector('meta[name="description"]')?.content,mains:document.querySelectorAll('main,[role="main"]').length,
            nav:[...document.querySelectorAll('.navigation a')].map(e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {name:e.getAttribute('aria-label'),href:e.getAttribute('href'),centerUnobstructed:!!hit&&(hit===e||e.contains(hit)),...box(e)};}),
            text:document.body.innerText.slice(0,2400),canvases:[...document.querySelectorAll('canvas')].map(e=>({id:e.id,...box(e)})),
            load:performance.getEntriesByType('navigation')[0]?.toJSON(),paint:performance.getEntriesByType('paint').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>({name:e.name,duration:e.duration,transferSize:e.transferSize,decodedBodySize:e.decodedBodySize})),audit:window.__audit};
        });
        report.results.push({route,requestedViewport:viewport,screenshot:`${out}/${name}.png`,...result,errors,failed});
        console.log(phase,route,viewport.width,'nav',result.nav.length,'main',result.mains,'draws',result.audit.draws,'errors',errors.length);
      } catch(error) { report.results.push({route,viewport,error:String(error),errors,failed}); console.log('ERROR',route,String(error)); }
      await context.close();
      await fs.writeFile(`${out}/audit.json`,JSON.stringify(report,null,2));
    }
  }
  await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
