import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const candidates=[
  path.resolve(here,'../../tmp/oddio-panel-customization/three.module.mjs'),
  path.resolve(here,'../../node_modules/three/build/three.module.js'),
];
const three=candidates.find(existsSync);
if(!three)throw new Error('Three.js module missing. Install three@0.159.0 in the repository or restore tmp/oddio-panel-customization/three.module.mjs.');
export async function resolve(specifier,context,next){
  if(specifier==='three')return {url:new URL('file:///'+three.replace(/\\/g,'/')).href,shortCircuit:true};
  return next(specifier,context);
}
export async function load(url,context,next){
  if((url.includes('/_1-about/faces/odd/')||url.includes('/_7-shared-scripts/core/'))&&new URL(url).pathname.endsWith('.js'))
    return {format:'module',source:await readFile(new URL(url),'utf8'),shortCircuit:true};
  return next(url,context);
}
