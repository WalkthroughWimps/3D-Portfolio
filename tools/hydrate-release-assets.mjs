// Explicit non-Git inputs for contract tests and static video alternative links.
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'tools/required-release-assets.json'),'utf8'));
async function verify(file,entry){
  if((await fs.stat(file)).size!==entry.bytes)throw new Error(`Asset size mismatch: ${entry.path}; existing data preserved.`);
  const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);
  if(digest.digest('hex')!==entry.sha256)throw new Error(`Asset integrity mismatch: ${entry.path}; existing data preserved.`);
}
try { for(const entry of manifest.assets){
  const destination=path.resolve(root,decodeURIComponent(entry.path));
  const relative=path.relative(root,destination);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Asset path escapes workspace.');
  const exists=await fs.stat(destination).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
  if(exists)await verify(destination,entry);
  else {
    const response=await fetch(new URL(entry.path,`${manifest.origin}/`),{signal:AbortSignal.timeout(120000)});
    if(!response.ok||response.status===206||!response.body){await response.body?.cancel();throw new Error(`Required asset HTTP ${response.status}: ${entry.path}`);}
    const scratch=path.join(root,'tmp/phase-08/downloads');await fs.mkdir(scratch,{recursive:true});
    const temporary=path.join(scratch,`${randomUUID()}.download`);
    let bytes=0;
    const limiter=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>entry.bytes?new Error(`Asset exceeds expected size: ${entry.path}`):null,chunk);}});
    try {
      await pipeline(Readable.fromWeb(response.body),limiter,createWriteStream(temporary,{flags:'wx'}));
      await verify(temporary,entry);
      await fs.mkdir(path.dirname(destination),{recursive:true});
      // Exclusive copy never replaces a file another process/user created meanwhile.
      await fs.copyFile(temporary,destination,1);
    } finally {await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  console.log(`Verified ${entry.path} (${entry.bytes} bytes).`);
} } catch(error){console.error(error.message);process.exitCode=1;}
