/* global caches */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createStaticServer } from './phase-08-server.mjs';
const root=path.resolve('tmp/videos-intro/worker-site');
await fs.mkdir(path.join(root,'Renders'),{recursive:true});
for(const file of ['sw.js','sw-asset-config.js'])await fs.copyFile(file,path.join(root,file));
await fs.copyFile('Renders/tablet-animation.webm',path.join(root,'Renders/tablet-animation.webm'));
await fs.writeFile(path.join(root,'index.html'),'<title>Disposable Phase 8 worker regression</title><main>Local worker fixture</main>');
const server=createStaticServer({root});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true});
const results=[];
try {
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(origin);
  await page.evaluate(async()=>{
    await (await caches.open('intro-cache-v2')).put('/old',new Response('old'));
    await (await caches.open('unrelated-cache')).put('/preserve',new Response('preserve'));
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(async()=>!!(await (await caches.open('intro-cache-v4')).match('/Renders/tablet-animation.webm')));
  await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const keys=await page.evaluate(()=>caches.keys());
  results.push({mode:'install-upgrade-owned-cache',keys,passed:keys.includes('intro-cache-v4')&&!keys.includes('intro-cache-v3')&&!keys.includes('intro-cache-v2')&&keys.includes('unrelated-cache')});
  const onlineRange=await page.evaluate(async()=>{
    await caches.delete('intro-cache-v4');
    try { const response=await fetch('/Renders/tablet-animation.webm',{headers:{Range:'bytes=0-63'}});return {status:response.status,contentRange:response.headers.get('content-range'),bytes:(await response.arrayBuffer()).byteLength}; }
    catch(error){return {error:String(error)};}
  });
  results.push({mode:'empty-cache-online-range',...onlineRange,passed:onlineRange.status===206&&onlineRange.bytes===64});
  // Refill using a full request so the independent offline cases start ready.
  await page.evaluate(async()=>{const response=await fetch('/Renders/tablet-animation.webm');await response.arrayBuffer();});
  await context.setOffline(true);
  const offline=await page.evaluate(async()=>{const response=await fetch('/Renders/tablet-animation.webm?phase8=offline');return {status:response.status,bytes:(await response.arrayBuffer()).byteLength};});
  results.push({mode:'cached-intro-query-offline',...offline,passed:offline.status===200&&offline.bytes===9380850});
  const range=await page.evaluate(async()=>{const response=await fetch('/Renders/tablet-animation.webm',{headers:{Range:'bytes=0-63'}});return {status:response.status,contentRange:response.headers.get('content-range'),bytes:(await response.arrayBuffer()).byteLength};});
  results.push({mode:'cached-intro-offline-range',...range,passed:range.status===206&&range.contentRange==='bytes 0-63/9380850'&&range.bytes===64});
  const miss=await page.evaluate(async()=>{try{await fetch('/Renders/not-cached.webm');return false;}catch{return true;}});
  results.push({mode:'unrelated-offline-miss',rejected:miss,passed:miss});
  await context.close();
  // Empty-cache matching request must fail offline rather than fabricate a hit.
  const empty=await browser.newContext();const emptyPage=await empty.newPage();await emptyPage.goto(origin);
  await emptyPage.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await emptyPage.reload();await emptyPage.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await emptyPage.evaluate(()=>caches.delete('intro-cache-v4'));await empty.setOffline(true);
  const emptyMiss=await emptyPage.evaluate(async()=>{try{await fetch('/Renders/tablet-animation.webm');return false;}catch{return true;}});
  results.push({mode:'matching-empty-cache-offline-miss',rejected:emptyMiss,passed:emptyMiss});
  await empty.close();
  await fs.mkdir('output/videos-intro',{recursive:true});
  await fs.writeFile('output/videos-intro/worker.json',JSON.stringify({browser:await browser.version(),origin,scope:'real classic worker in disposable local browser contexts; no production origin, decoded/audible playback, devices or complete offline site evidence',results},null,2));
  console.log(JSON.stringify(results,null,2));
  if(results.some(result=>!result.passed))process.exitCode=1;
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
