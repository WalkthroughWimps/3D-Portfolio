/* global document, window, HTMLCanvasElement, innerWidth, innerHeight */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const base = process.env.SITE_URL || 'http://127.0.0.1:8879/';
const out = process.env.BROWSER_OUTPUT || 'output/phase-08/browser';
const routes = ['index.html','_1-about/about.html','_2-videos/videos.html','_3-graphics/graphics.html','_4-games/games.html','_5-music/music.html','_6-docs/docs.html'];
const results = [];
const requiredLocalFailures = requests => requests.filter(request=>new URL(request.url).origin===new URL(base).origin && ['script','stylesheet','font'].includes(request.resourceType));
await fs.mkdir(out,{recursive:true});
const browser = await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true,args:['--enable-unsafe-swiftshader']});
try {
  for (const mode of ['normal','nojs','blocked-storage','reduced-motion','failed-glb','webgl-unavailable']) {
    for (const width of (['normal','nojs'].includes(mode) ? [1280,390] : [390])) for (const route of routes) {
      const context = await browser.newContext({javaScriptEnabled:mode!=='nojs',viewport:{width,height:width===390?844:720},deviceScaleFactor:1,serviceWorkers:'block',reducedMotion:mode==='reduced-motion'?'reduce':'no-preference'});
      await context.addInitScript(mode => {
        document.cookie='site_audio_allowed=false; path=/';
        if (mode === 'blocked-storage') for (const key of ['localStorage','sessionStorage']) Object.defineProperty(window,key,{get(){throw new DOMException('Blocked in disposable regression context','SecurityError');}});
        else localStorage.setItem('site.audio.allowed','false');
        if (mode === 'webgl-unavailable') {
          const get = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type,...args){return /^(webgl|experimental-webgl)/.test(type) ? null : get.call(this,type,...args);};
        }
      },mode);
      if (mode === 'failed-glb') await context.route('**/*.glb*', request => request.abort('failed'));
      const page = await context.newPage();
      const errors = [], failedRequests = [], httpErrors = [];
      page.on('pageerror',error=>errors.push({message:error.message,stack:error.stack}));
      page.on('requestfailed',request=>failedRequests.push({url:request.url(),resourceType:request.resourceType(),error:request.failure()?.errorText}));
      page.on('response',response=>{if(response.status()>=400)httpErrors.push({url:response.url(),resourceType:response.request().resourceType(),status:response.status()});});
      const result = {mode,route,width,errors,failedRequests,httpErrors};
      try {
        await page.goto(new URL(route,base).href,{waitUntil:'load',timeout:45000});
        if (mode !== 'nojs') await page.waitForTimeout(2500);
        Object.assign(result,await page.evaluate(()=>({viewport:[innerWidth,innerHeight],mains:document.querySelectorAll('main,[role="main"]').length,title:document.title,description:document.querySelector('meta[name="description"]')?.content,motionClass:document.documentElement.classList.contains('a11y-motion-reduced'),links:[...document.querySelectorAll('.navigation a')].map(a=>{const r=a.getBoundingClientRect();return {href:a.href,name:a.getAttribute('aria-label')||a.textContent,x:r.x,right:r.right,width:r.width,height:r.height};}),alternative:!!document.querySelector('.scene-alternative')})));
        if (route !== 'index.html' && mode === 'nojs') {
          await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
          result.skipFocus=await page.evaluate(()=>document.activeElement.id);
          const expected = route.includes('_4-games')?'model-stage':route.includes('_6-docs')?'glb-viewer':'page-main';
          result.skipPassed=result.skipFocus===expected;
        }
        result.screenshot=`${out}/${mode}-${route.split('/')[0].replace('.html','')}-${width}.png`;
        await page.screenshot({path:result.screenshot});
        result.requiredLocalFailures=requiredLocalFailures([...httpErrors,...failedRequests]);
        result.passed=result.mains===1 && !!result.title && !!result.description && errors.length===0 && result.requiredLocalFailures.length===0 && (mode==='nojs' ? result.links.length===(route==='index.html'?6:7)&&result.links.every(link=>link.x>=0&&link.right<=width)&&(route==='index.html'||result.skipPassed):true) && (mode!=='reduced-motion'||result.motionClass);
        // Media/fault-injection and external-host failures remain separate from this bounded local shell gate.
      } catch (error) { result.error=String(error); result.passed=false; }
      results.push(result); console.log(mode,route,width,result.passed?'PASS':'FAIL',errors.map(error=>error.message).join('; '));
      await fs.writeFile(`${out}/results.json`,JSON.stringify({browser:await browser.version(),base,cache:'disposable contexts; no-store; service workers blocked',audio:'denied',scope:'bounded page-shell/navigation/failure checks, not media/audio/device acceptance',results},null,2));
      await context.close();
    }
  }
  const negative=await browser.newContext({serviceWorkers:'block'});
  const negativePage=await negative.newPage(),negativeFailures=[];
  await negative.route('**/_3-graphics/graphics.js',request=>request.fulfill({status:404,body:'Deliberate missing-script sentinel'}));
  negativePage.on('response',response=>{if(response.status()>=400)negativeFailures.push({url:response.url(),resourceType:response.request().resourceType(),status:response.status()});});
  await negativePage.goto(new URL('_3-graphics/graphics.html',base).href,{waitUntil:'load'});
  const detected=requiredLocalFailures(negativeFailures);
  results.push({mode:'missing-script-sentinel',deliberateFault:true,requiredLocalFailures:detected,passed:detected.some(request=>request.url.endsWith('/_3-graphics/graphics.js')&&request.status===404)});
  await negative.close();
  // Validate actual settings migration, reset and other-tab refresh in isolated browser storage.
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.addCookies([{name:'site_audio_allowed',value:'false',url:base}]);
  const pages=await Promise.all([context.newPage(),context.newPage()]);
  for (const page of pages) await page.goto(new URL('_3-graphics/graphics.html',base).href,{waitUntil:'load'});
  const settingsModule=new URL('_7-shared-scripts/core/settings.js',base).href;
  for (const page of pages) await page.evaluate(async url=>{window.__testStore=(await import(url)).getSharedSettings();},settingsModule);
  await pages[0].evaluate(()=>{localStorage.setItem('site.a11y.settings',JSON.stringify({masterVolume:0.8,mute:true}));localStorage.setItem('site.audio.volume','0');localStorage.setItem('site.audio.muted','false');window.__testStore.refresh();});
  await pages[1].waitForFunction(()=>window.__testStore.get().audio.volume===0&&window.__testStore.get().audio.muted===false);
  const migration=await pages[0].evaluate(()=>window.__testStore.get().audio);
  await pages[0].evaluate(()=>window.__testStore.patch({audio:{volume:0.37}}));
  await pages[1].waitForFunction(()=>window.__testStore.get().audio.volume===0.37);
  await pages[0].reload({waitUntil:'load'});
  const reload=await pages[0].evaluate(async url=>(await import(url)).getSharedSettings().get().audio.volume,settingsModule);
  const reset=await pages[1].evaluate(()=>{window.__testStore.reset(['audio.volume']);return {volume:window.__testStore.get().audio.volume,consent:document.cookie,canonical:localStorage.getItem('site.audio.volume'),legacy:JSON.parse(localStorage.getItem('site.a11y.settings')||'{}').masterVolume};});
  const settings={mode:'settings-browser',migration,reload,reset,passed:migration.volume===0&&migration.muted===false&&reload===0.37&&reset.volume===0.25&&reset.consent.includes('site_audio_allowed=false')&&reset.canonical===null&&reset.legacy===undefined};
  results.push(settings); await context.close();
  await fs.writeFile(`${out}/results.json`,JSON.stringify({browser:await browser.version(),base,cache:'disposable contexts; no-store; service workers blocked',audio:'denied',scope:'bounded shell/navigation/failure/settings checks; no audible or full playback acceptance',results},null,2));
  if (results.some(result=>!result.passed)) process.exitCode=1;
} finally { await browser.close(); }
