// Hydrate only the existing real-bank contract fixture on a clean checkout.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'data/soundfont-packages.json'),'utf8'));
const bank=manifest.packages.find(item=>item.id==='hypersound-sf2').files[0];
const destination=path.join(root,decodeURIComponent(bank.path));
let bytes=await fs.readFile(destination).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const missing=!bytes;
if (!bytes) {
  const response=await fetch(`https://assets.matthallportfolio.com/${bank.path}`,{signal:AbortSignal.timeout(30000)});
  if (!response.ok) {await response.body?.cancel();throw new Error(`Hypersound fixture HTTP ${response.status}`);}
  bytes=Buffer.from(await response.arrayBuffer());
}
if (bytes.length!==bank.size || createHash('sha256').update(bytes).digest('hex')!==bank.sha256) throw new Error('Hypersound fixture integrity mismatch; existing file preserved.');
if(missing){await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);}
console.log('Hypersound fixture verified (568430 bytes).');
