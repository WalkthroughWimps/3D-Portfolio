import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const defaultRoot = path.resolve(import.meta.dirname, '..');
export async function artifactPlan(root = defaultRoot) {
  const policy = JSON.parse(await fs.readFile(path.join(root, 'tools/release-artifact.json'), 'utf8'));
  const files = new Set([...policy.siteFiles, ...policy.dataFiles]);
  const excluded = [];
  async function walk(relative) {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Artifact symlink is not allowed: ${file}`);
      if (policy.excludedSegments.includes(entry.name) || policy.excludedNames.includes(entry.name) || entry.name.startsWith('.')) { excluded.push(file); continue; }
      if (entry.isDirectory()) await walk(file);
      else if (policy.extensions.includes(path.extname(entry.name).toLowerCase()) || /^(LICENSE|LICENCE|COPYING|NOTICE)([.-].*)?$/i.test(entry.name)) files.add(file);
      else excluded.push(file);
    }
  }
  for (const tree of policy.siteTrees) await walk(tree);
  const sorted = [...files].sort();
  for (const file of policy.required) if (!files.has(file)) throw new Error(`Required runtime file excluded: ${file}`);
  const lowercase = new Map();
  for (const file of sorted) {
    if (lowercase.has(file.toLowerCase())) throw new Error(`Case collision: ${file} and ${lowercase.get(file.toLowerCase())}`);
    lowercase.set(file.toLowerCase(), file);
    const absolute = path.join(root, file);
    if ((await fs.lstat(absolute)).isSymbolicLink()) throw new Error(`Artifact symlink is not allowed: ${file}`);
    const handle = await fs.open(absolute);
    try {
      const prefix = Buffer.alloc(128);
      await handle.read(prefix, 0, prefix.length, 0);
      if (prefix.toString().startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error(`Unhydrated Git LFS pointer: ${file}`);
    } finally { await handle.close(); }
  }
  return { schemaVersion: 1, policy, files: sorted, excluded: excluded.sort(), releaseReady: false,
    limitation: 'Site payload only. External media/CDN, dependency compatibility, licensing and prior acceptance gates must be verified separately.' };
}
export async function buildArtifact(destination, root = defaultRoot) {
  const plan = await artifactPlan(root);
  // Refuse stale output and never delete an existing tree or write into source.
  if (await fs.stat(destination).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('Use a new empty artifact destination; existing output is preserved.');
  await fs.mkdir(destination, { recursive: true });
  const records = [];
  for (const file of plan.files) {
    const source = path.join(root, file), target = path.join(destination, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(target)) digest.update(chunk);
    records.push({ path: file, bytes: (await fs.stat(target)).size, sha256: digest.digest('hex') });
  }
  return { ...plan, records, totalBytes: records.reduce((sum, file) => sum + file.bytes, 0) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const mode = process.argv[2] || 'check';
  if (!['check', 'build'].includes(mode)) throw new Error('Usage: node tools/release-artifact.mjs check|build [new-directory-under-output]');
  const out = path.join(defaultRoot, 'output/phase-08');
  await fs.mkdir(out, { recursive: true });
  let report;
  if (mode === 'build') {
    const destination = path.resolve(defaultRoot, process.argv[3] || 'output/phase-08/artifact/site');
    const relative = path.relative(path.join(defaultRoot, 'output'), destination);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Artifact destination must be a new directory inside output/.');
    report = await buildArtifact(destination);
    report.destination = path.relative(defaultRoot, destination).replaceAll('\\', '/');
  } else report = await artifactPlan();
  await fs.writeFile(path.join(out, mode === 'build' ? 'artifact-built.json' : 'artifact-plan.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${mode}: ${report.files.length} runtime files; external assets and release gates remain separate.`);
}
