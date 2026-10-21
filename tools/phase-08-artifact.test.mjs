import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { artifactPlan, buildArtifact } from './release-artifact.mjs';
import { createStaticServer } from './phase-08-server.mjs';

test('runtime artifact retains generated configuration, recorder, shared owners, vendor code and licenses while excluding development files', async () => {
  const plan = await artifactPlan();
  for (const file of plan.policy.required) assert.ok(plan.files.includes(file), file);
  assert.ok(plan.files.includes('_0-start/stupid.html'), 'uncertain public alternative is preserved');
  assert.ok(plan.files.includes('_7-shared-scripts/shared-video-controls.js'), 'active facade is preserved');
  assert.ok(plan.files.some(file => file.startsWith('games/') && file.endsWith('.wasm')));
  assert.ok(plan.files.every(file => !/(^|\/)(tools|output|tmp|src|node_modules)\//.test(file)));
  assert.ok(plan.files.every(file => !file.includes('.phase06-fixture.')));
  assert.equal(plan.releaseReady, false);
});

test('artifact rejects unhydrated LFS and stale destinations without removing data', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'phase08-artifact-'));
  try {
    await fs.mkdir(path.join(root, 'tools'));
    await fs.writeFile(path.join(root, 'tools/release-artifact.json'), JSON.stringify({siteFiles:['index.html'],dataFiles:[],siteTrees:[],required:['index.html']}));
    await fs.writeFile(path.join(root, 'index.html'), 'version https://git-lfs.github.com/spec/v1\noid sha256:test');
    await assert.rejects(artifactPlan(root), /LFS pointer/);
    await fs.writeFile(path.join(root, 'index.html'), '<main>fixture</main>');
    const destination = path.join(root, 'artifact');
    const result = await buildArtifact(destination, root);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].sha256.length, 64);
    await assert.rejects(buildArtifact(destination, root), /existing output is preserved/);
    assert.equal(await fs.readFile(path.join(destination, 'index.html'), 'utf8'), '<main>fixture</main>');
  } finally {
    assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('phase08-artifact-'));
    await fs.rm(root, {recursive:true,force:true});
  }
});

test('static preview enforces loopback hosts, hidden-file and realpath containment while serving byte ranges', async () => {
  const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'phase08-preview-'));
  const root=path.join(fixture,'site'),outside=path.join(fixture,'outside');
  await fs.mkdir(root);await fs.mkdir(outside);await fs.mkdir(path.join(root,'.git'));
  await fs.writeFile(path.join(root,'index.html'),'<main>test</main>');
  await fs.writeFile(path.join(root,'.git/config'),'private fixture');
  await fs.writeFile(path.join(outside,'private.txt'),'outside fixture');
  await fs.symlink(outside,path.join(root,'escape'),'junction');
  const server=createStaticServer({root});
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const invalidHostStatus=await new Promise((resolve,reject)=>{
      const request=http.request(origin,{method:'HEAD',headers:{Host:'review.invalid'}},response=>{response.resume();resolve(response.statusCode);});
      request.on('error',reject);request.end();
    });
    assert.equal(invalidHostStatus,403);
    assert.equal((await fetch(`${origin}/.git/config`,{method:'HEAD'})).status,403);
    assert.equal((await fetch(`${origin}/escape/private.txt`,{method:'HEAD'})).status,403);
    const range=await fetch(origin,{headers:{Range:'bytes=0-3'}});
    assert.equal(range.status,206);assert.equal(await range.text(),'<mai');
    assert.equal(range.headers.get('content-range'),'bytes 0-3/17');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    assert.equal(path.dirname(fixture),path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixture).startsWith('phase08-preview-'));
    await fs.rm(fixture,{recursive:true,force:true});
  }
});
