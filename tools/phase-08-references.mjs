import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const plan=JSON.parse(await fs.readFile(path.join(root,'output/phase-08/artifact-plan.json'),'utf8'));
const files=new Set(plan.files);
const caseMap=new Map(plan.files.map(file=>[file.toLowerCase(),file]));
const references=[], missing=[], caseErrors=[];
for (const file of plan.files.filter(file=>/\.(html|css|js|mjs)$/.test(file)&&!file.startsWith('assets/vendor/')&&!file.startsWith('games/'))) {
  const raw=await fs.readFile(path.join(root,file),'utf8');
  const source=file.endsWith('.html')?raw.replace(/<!--[\s\S]*?-->/g,''):raw;
  const patterns=file.endsWith('.html') ? [/\b(?:src|href)=["']([^"']+)["']/g] : file.endsWith('.css') ? [/url\(["']?([^)'"\s]+)["']?\)/g] : [/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
    const reference=match[1];
    if (!reference || reference.startsWith('#') || reference.startsWith('?') || reference.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(reference)) continue;
    // Bare HTML/CSS URLs are relative files; bare ES-module names use import maps.
    if (/\.(js|mjs)$/.test(file) && !reference.startsWith('.') && !reference.startsWith('/')) continue;
    const url=new URL(reference,`https://site.invalid/${file}`);
    const target=decodeURIComponent(url.pathname.slice(1));
    const externallyHosted=/^(Renders|Videos|music|midi|soundfonts)\//.test(target);
    const record={file,reference,target,status:files.has(target)?'artifact':externallyHosted?'external-media-required':caseMap.has(target.toLowerCase())?'case-mismatch':'missing'};
    references.push(record);
    if(record.status==='missing')missing.push(record);
    if(record.status==='case-mismatch')caseErrors.push({...record,actual:caseMap.get(target.toLowerCase())});
  }
}
const candidates=['_0-start/stupid.js','_5-music/music-piano-controls.js','_5-music/music-piano-controls.v2(1).js','_5-music/music-2d.js','_7-shared-scripts/assets-config.js','_7-shared-scripts/shared-video-controls.js','_7-shared-scripts/media-controller.js','_7-shared-scripts/video-player-controls.js'];
const cleanup=candidates.map(candidate=>({path:candidate,incoming:references.filter(record=>record.target===candidate),disposition:'retain; public/compatibility or external use is not disproven by static imports'}));
const report={scope:'Literal HTML href/src, CSS url and JS import references outside vendor/generated games; dynamic assets, transitive vendor loads and public external consumers need runtime evidence.',references,missing,caseErrors,cleanup};
await fs.writeFile(path.join(root,'output/phase-08/references.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({references:references.length,missing:missing.length,caseErrors:caseErrors.length,details:missing},null,2));
if(missing.length||caseErrors.length)process.exitCode=1;
