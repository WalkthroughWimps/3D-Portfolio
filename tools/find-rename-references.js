const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dryrun = path.join(root, 'rename-dryrun.txt');
const out = path.join(root, 'rename-references.txt');
if (!fs.existsSync(dryrun)) {
  console.error('rename-dryrun.txt not found in repo root');
  process.exit(1);
}

const lines = fs.readFileSync(dryrun, 'utf8').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
// skip header lines until we reach mapping lines containing ' => '
const mappings = [];
for (const l of lines) {
  if (l.includes(' => ')) {
    const parts = l.split(' => ');
    if (parts.length === 2) mappings.push({ from: parts[0], to: parts[1] });
  }
}

function walk(dir) {
  const list = [];
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  const exclude = new Set(['node_modules', '.git', 'backups', '.venv', 'venv', '__pycache__', '.vscode', '.vs']);
  for (const ent of ents) {
    if (exclude.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (full === path.join(root, 'rename-dryrun.txt') || full === path.join(root, 'rename-references.txt') || full.startsWith(path.join(root, 'tools'))) continue;
    if (ent.isDirectory()) list.push(...walk(full));
    else list.push(full);
  }
  return list;
}

const allFiles = walk(root).filter(f => {
  const ext = path.extname(f).toLowerCase();
  // include common text/code files
  return ['.js', '.ts', '.html', '.css', '.scss', '.json', '.md', '.txt', '.yml', '.yaml'].includes(ext) || f.toLowerCase().endsWith('.ps1');
});

const results = [];
for (const m of mappings) {
  const entry = { from: m.from, to: m.to, refs: [] };
  // We'll search for both the full relative path and the basename
  const basename = path.basename(m.from);
  for (const file of allFiles) {
    try {
      const txt = fs.readFileSync(file, 'utf8');
      if (txt.indexOf(m.from) !== -1 || txt.indexOf(basename) !== -1) {
        // capture matching lines
        const lines = txt.split(/\r?\n/);
        const matches = [];
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          if (ln.indexOf(m.from) !== -1 || ln.indexOf(basename) !== -1) {
            matches.push({ file: path.relative(root, file), line: i+1, text: ln.trim() });
            if (matches.length >= 20) break; // avoid huge outputs per file
          }
        }
        entry.refs.push(...matches);
      }
    } catch (e) {
      // ignore read errors
    }
  }
  if (entry.refs.length) results.push(entry);
}

const outLines = [];
outLines.push('Rename references report generated: ' + (new Date()).toISOString());
outLines.push('Total mappings: ' + mappings.length);
outLines.push('Mappings with references found: ' + results.length);
outLines.push('');
for (const r of results) {
  outLines.push('FROM: ' + r.from);
  outLines.push('TO:   ' + r.to);
  outLines.push('References:');
  for (const ref of r.refs) {
    outLines.push(`  ${ref.file}:${ref.line}: ${ref.text}`);
  }
  outLines.push('');
}

fs.writeFileSync(out, outLines.join('\n'));
console.log('Wrote', out, 'with', results.length, 'entries (mappings with references)');
console.log('Preview (first 40 lines):');
console.log(outLines.slice(0,40).join('\n'));
