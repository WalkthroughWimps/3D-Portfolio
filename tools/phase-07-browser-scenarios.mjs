// Optional Phase 7 checks. Supply Playwright via NODE_PATH or a local install.
/* global document, window, HTMLCanvasElement, innerWidth, innerHeight */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs/promises';
const origin='http://127.0.0.1:8878';
const routes=['index.html','_1-about/about.html','_2-videos/videos.html','_3-graphics/graphics.html','_4-games/games.html','_5-music/music.html','_6-docs/docs.html'];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 const nojsOnly=process.argv.includes('--nojs-only');
 const storageOnly=process.argv.includes('--storage-only');
 const results=nojsOnly||storageOnly
   ? JSON.parse(await fs.readFile('output/phase-07/scenarios/results.json','utf8')).results.filter(r=>r.mode!==(nojsOnly?'nojs':'blocked-storage')) : [];
 await fs.mkdir('output/phase-07/scenarios',{recursive:true});
 async function save(result){results.push(result);await fs.writeFile('output/phase-07/scenarios/results.json',JSON.stringify({browser:await browser.version(),origin,device:'Windows headless, software WebGL, DPR 1',results},null,2));console.log(result.mode,result.route,result.passed??'',result.errors??'');}
 for(const width of (storageOnly?[]:[1280,390])) for(const route of routes){
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width,height:width===390?844:720},serviceWorkers:'block'});
  const page=await context.newPage();await page.goto(`${origin}/${route}`,{waitUntil:'load'});
  const data=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],mains:document.querySelectorAll('main,[role="main"]').length,links:[...document.querySelectorAll('.navigation a')].map(e=>{const r=e.getBoundingClientRect();return{name:e.getAttribute('aria-label')||e.textContent,href:e.href,x:r.x,right:r.right,width:r.width,height:r.height}}),alternative:document.querySelector('.scene-alternative')?.textContent}));
  if(route!=='index.html') {await page.keyboard.press('Tab');await page.keyboard.press('Enter');data.skipFocus=await page.evaluate(()=>document.activeElement.id);}
  data.expectedSkip = route.includes('_4-games') ? 'model-stage' : route.includes('_6-docs') ? 'glb-viewer' : 'page-main';
  const file=`output/phase-07/scenarios/nojs-${route.split('/')[0].replace('.html','')}-${width}.png`;await page.screenshot({path:file});
  await save({mode:'nojs',route,width,...data,screenshot:file,passed:data.links.length===(route==='index.html'?6:7)&&data.links.every(e=>e.x>=0&&e.right<=width)&&data.mains===1&&(route==='index.html'||data.skipFocus===data.expectedSkip)});await context.close();
 }
 if(nojsOnly){await browser.close();return;}
 for(const mode of (storageOnly?['blocked-storage']:['webgl-unavailable','failed-glb','blocked-storage','reduced-motion']))for(const route of routes){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:mode==='reduced-motion'?'reduce':'no-preference'});
  await context.addInitScript(mode=>{
   document.cookie='site_audio_allowed=false; path=/';
   if(mode!=='blocked-storage')localStorage.setItem('site.audio.allowed','false');
   if(mode==='webgl-unavailable'){const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl|experimental-webgl/.test(type)?null:get.call(this,type,...args)}}
   if(mode==='blocked-storage')for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){const error=new DOMException('Audit blocked storage','SecurityError');error.stack=new Error('Blocked storage caller').stack;throw error}});
  },mode);
  if(mode==='failed-glb')await context.route('**/*.glb*',r=>r.abort('failed'));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
  await page.goto(`${origin}/${route}`,{waitUntil:'load',timeout:45000});await page.waitForTimeout(2000);
  const data=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],mainCount:document.querySelectorAll('main,[role="main"]').length,alternative:!!document.querySelector('.scene-alternative'),motionClass:document.documentElement.classList.contains('a11y-motion-reduced'),text:document.body.innerText.slice(0,1600),media:[...document.querySelectorAll('audio,video')].map(e=>({id:e.id,paused:e.paused,muted:e.muted,volume:e.volume})),lighting:window.__siteSettings?.get().scene.lighting}));
  const file=`output/phase-07/scenarios/${mode}-${route.split('/')[0].replace('.html','')}.png`;await page.screenshot({path:file});await save({mode,route,...data,errors,screenshot:file});await context.close();
 }
 if(storageOnly){await browser.close();return;}
 // Exercise the real Start prompts by keyboard only; deny motion and sound.
 for(const failed of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});if(failed)await context.route('**/*.glb*',r=>r.abort('failed'));
  const page=await context.newPage();await page.goto(`${origin}/index.html`,{waitUntil:'load'});
  const result={mode:'start-keyboard',route:'index.html',failedGlb:failed};
  try{
   await page.locator('#permissionModal:not(.hidden)').waitFor({state:'visible'});
   await page.waitForTimeout(100);result.initialFocus=await page.evaluate(()=>document.activeElement.id);
   await page.keyboard.press('Shift+Tab');result.shiftWrap=await page.evaluate(()=>document.activeElement.id);
   await page.keyboard.press('Tab');result.tabWrap=await page.evaluate(()=>document.activeElement.id);
   await page.keyboard.press('Escape');
   await page.getByRole('heading',{name:'Allow sound?',exact:true}).waitFor({state:'visible',timeout:45000});
   await page.waitForTimeout(150);await page.keyboard.press('Tab');result.soundDenyFocus=await page.evaluate(()=>document.activeElement.id);
   await page.keyboard.press('Enter');
   await page.locator('#permissionModal').waitFor({state:'hidden'});
   result.final=await page.evaluate(()=>({cookie:document.cookie,consent:localStorage.getItem('site.audio.allowed'),animation:localStorage.getItem('site.start.animation.allowed'),lighting:localStorage.getItem('site.scene.lighting')}));
   result.passed=result.initialFocus==='permAllow'&&result.shiftWrap==='permDeny'&&result.tabWrap==='permAllow'&&result.soundDenyFocus==='permDeny'&&result.final.consent==='false';
  }catch(e){result.error=String(e);result.passed=false;}
  result.screenshot=`output/phase-07/scenarios/start-keyboard-${failed?'failed':'normal'}.png`;await page.screenshot({path:result.screenshot});await save(result);await context.close();
 }
 // Verify the shared prompt uses its real service and a fresh disposable context.
 {
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const page=await context.newPage();await page.goto(`${origin}/_3-graphics/graphics.html`,{waitUntil:'load'});
  await page.evaluate(async()=>{const {createConsent}=await import('/_7-shared-scripts/core/consent.js');window.__prompt=createConsent();void window.__prompt.prompt().then(state=>window.__promptResult=state)});
  await page.locator('#siteAudioConsentPrompt').waitFor({state:'visible'});const label=await page.getByRole('dialog').getAttribute('aria-labelledby');
  await page.keyboard.press('Shift+Tab');const wrap=await page.evaluate(()=>document.activeElement.dataset.audioConsent);await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.__promptResult);await save({mode:'shared-dialog-keyboard',route:'_3-graphics/graphics.html',label,wrap,state:await page.evaluate(()=>window.__promptResult)});await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
