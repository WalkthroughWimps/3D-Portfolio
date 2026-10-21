// Generate a local-only copy of the Music entry with a regression panel in its
// lexical scope. The real page, consent settings, and public entry stay intact.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const entry = process.argv.slice(2).find(arg => !arg.startsWith('--')) || '_5-music/music-piano-controls.v2.js';
// Keep the document in Music's real directory: the asset facade uses the
// page URL (not <base>) to resolve page-relative media paths.
const output = path.join(root, '_5-music');
await mkdir(output, { recursive: true });
const source = (await readFile(path.join(root, entry), 'utf8')).replace(
  /(from\s+|import\s*)(['"])(\.[^'"]+)\2/g,
  (_, prefix, quote, specifier) => `${prefix}${quote}${new URL(specifier, 'http://fixture/_5-music/music-piano-controls.v2.js').pathname}${quote}`
);
const harness = await readFile(path.join(root, 'tools/fixtures/music-regression-panel.txt'), 'utf8');
const allowTemporaryAudio = process.argv.includes('--allow-temporary-audio');
await writeFile(path.join(output, '.phase06-fixture.mjs'), source + `\nconst allowTemporaryAudioTest = ${allowTemporaryAudio};\n` + harness);
const html = (await readFile(path.join(root, '_5-music/music.html'), 'utf8'))
  .replace('<head>', '<head><base href="/_5-music/">')
  .replace(/music-piano-controls\.v2\.js(?:\?[^'"\s]*)?/, '/_5-music/.phase06-fixture.mjs');
await writeFile(path.join(output, '.phase06-fixture.html'), html);
console.log('http://127.0.0.1:8878/_5-music/.phase06-fixture.html');
