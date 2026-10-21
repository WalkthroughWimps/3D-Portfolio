// Read-only asset audit. This is evidence for manifest integration, not a runtime
// save manifest or proof of decoded-memory/recording readiness.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'espree';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const moduleText = await fs.readFile(new URL('_5-music/instruments/catalog.js', root), 'utf8');
const { createInstrumentCatalog } = await import(`data:text/javascript;base64,${Buffer.from(moduleText).toString('base64')}`);
const bases = Object.fromEntries(['musyngkite','fluidr3_gm','arachno','wappydog'].map(id => [id,`soundfonts/${id}/`]));
const catalog = createInstrumentCatalog({SOUND_FONT_BASE:bases.musyngkite,LOCAL_SOUNDFONT_BASES:bases,
  SF2_HYPERSOUND_URL:'soundfonts/hypersound/hypersound.sf2',SALAMANDER_DRUM_RANGE:{min:36,max:94}});
const entry = await fs.readFile(new URL('_5-music/music-piano-controls.v2.js', root), 'utf8');
const ast = parse(entry,{ecmaVersion:'latest',sourceType:'module',range:true});
const drumFiles = ast.body.flatMap(node => node.declarations || []).find(node => node.id.name === 'SALAMANDER_DRUM_FILES');
const drums = vm.runInNewContext(entry.slice(...drumFiles.init.range));
async function inspect(file) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), root);
  try {
    const info = await fs.stat(url);
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(url)) hash.update(bytes);
    return {path:file,size:info.size,sha256:hash.digest('hex')};
  } catch (error) { return {path:file,error:error.code}; }
}
const selections = [];
for (const config of catalog.INSTRUMENT_CONFIG) {
  const paths = config.drumSampleSet === 'salamander' ? drums.map(file => `soundfonts/salamander drums/${file}`) :
    config.engine === 'sf2' ? [config.sf2Url] : [`${config.localBase || bases.musyngkite}${config.patch}-mp3.js`];
  const files = [];
  for (const file of paths) files.push(await inspect(file));
  selections.push({instrumentId:config.id,label:config.label,backend:config.engine === 'sf2' ? 'js-synthesizer' : 'local-samples',
    files,payloadBytes:files.reduce((sum,file)=>sum+(file.size||0),0),
    ...(config.id === 'fx_dog' ? {warning:'Requested DOGBW60 absent in Hypersound; inherited program-0 fallback. Do not silently substitute WappyDog.'} : {}),
    ...(config.id === 'fx_odd' ? {warning:'Default patch only; mutable custom FX selections need stable package-specific IDs.'} : {})});
}
const report = {schemaVersion:1,status:'audit-only; not connected to saving or preparation',
  diskBudgetBytes:250000000,provisionalPreparationBudgetBytes:134217728,selections};
const destination = new URL('_8-tools-and-notes/architecture-phases/phase-06-package-inventory.json',root);
await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({selections:selections.length,missing:selections.flatMap(s=>s.files).filter(f=>f.error),payloadBytes:selections.reduce((sum,s)=>sum+s.payloadBytes,0)}));
