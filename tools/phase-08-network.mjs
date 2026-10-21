import fs from 'node:fs/promises';
const origin='https://assets.matthallportfolio.com';
const targets=['glb/card-test.glb','glb/toy-piano.glb','Renders/tablet-animation.webm','soundfonts/hypersound/hypersound.sf2','Videos/music-page/sunil-video_lq.webm','Videos/music-page/sunil-video.opus'];
const results=[];
for (const requestOrigin of ['http://127.0.0.1:8879','https://matthallportfolio.com']) for (const key of targets) for (const mode of ['head','range']) {
  const url=`${origin}/${key}`;
  try {
    const response=await fetch(url,{method:mode==='head'?'HEAD':'GET',headers:{Origin:requestOrigin,...(mode==='range'?{Range:'bytes=0-63'}:{})},signal:AbortSignal.timeout(30000)});
    const headers=Object.fromEntries(['content-type','content-length','content-range','accept-ranges','access-control-allow-origin','cross-origin-resource-policy','cache-control'].map(name=>[name,response.headers.get(name)]));
    if(response.body)await response.body.cancel();
    results.push({url,mode,requestOrigin,status:response.status,headers,passed:response.ok&&(mode!=='range'||response.status===206&&headers['content-range']?.startsWith('bytes 0-63/'))&&(headers['access-control-allow-origin']==='*'||headers['access-control-allow-origin']===requestOrigin)});
  } catch(error){results.push({url,mode,requestOrigin,error:String(error),passed:false});}
}
for(const base of ['http://127.0.0.1:8879/','http://127.0.0.1:8880/portfolio/']) {
  for(const key of ['index.html','sw.js','sw-asset-config.js','assets/glb/card-test.glb']) {
    const response=await fetch(new URL(key,base),{headers:{Range:'bytes=0-63'}});
    const bytes=await response.arrayBuffer();
    results.push({url:new URL(key,base).href,mode:'local-range',status:response.status,bytes:bytes.byteLength,contentRange:response.headers.get('content-range'),passed:response.status===206&&bytes.byteLength===64});
  }
}
await fs.writeFile('output/phase-08/network.json',JSON.stringify({scope:'Bounded HTTP probes; not production browser CORS, offline playback or all alternative/dynamic asset coverage.',results},null,2));
console.log(JSON.stringify(results,null,2));
if(results.some(result=>!result.passed))process.exitCode=1;
