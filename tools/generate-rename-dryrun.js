const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outFile = path.join(root, 'rename-dryrun.txt');

function normSegment(seg) {
  // Replace spaces and underscores with dash, collapse multiple dashes, trim
  let s = seg.replace(/[_ ]+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^[-]+|[-]+$/g, '');
  return s;
}

function normPath(p) {
  const parts = p.split(path.sep);
  const newParts = parts.map(normSegment);
  return newParts.join(path.sep);
}

function walk(dir) {
  const results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  const excludeNames = new Set(['node_modules', '.git', 'backups', '.venv', 'venv', '__pycache__', '.vscode', '.vs']);
  list.forEach((ent) => {
    const full = path.join(dir, ent.name);
    if (excludeNames.has(ent.name)) return;
    // Skip the tools script and generated output to avoid self-matching
    const rel = path.relative(root, full);
    if (rel === 'rename-dryrun.txt' || rel.startsWith('tools' + path.sep)) return;
    if (ent.isDirectory()) {
      results.push(full);
      try { results.push(...walk(full)); } catch (e) { /* ignore permission errors */ }
    } else {
      results.push(full);
    }
  });
  return results;
}

const all = walk(root);
const candidates = all.filter(p => {
  // relative path from root
  const rel = path.relative(root, p);
  // ignore the generated dryrun itself if rerun
  if (rel === 'rename-dryrun.txt' || rel.startsWith('tools' + path.sep)) return false;
  return /[_ ]/.test(rel);
});

const mappings = candidates.map(abs => {
  const rel = path.relative(root, abs);
  const normalized = normPath(rel);
  return { from: rel, to: normalized };
});

let out = [];
out.push('Rename dry-run generated on: ' + (new Date()).toISOString());
out.push('Root: ' + root);
out.push('Total candidates: ' + mappings.length);
out.push('');
for (const m of mappings) {
  out.push(m.from + ' => ' + m.to);
}

fs.writeFileSync(outFile, out.join('\n'));
console.log('Wrote', outFile, 'with', mappings.length, 'entries');
console.log('Preview (first 40 lines):');
console.log(out.slice(0, 40).join('\n'));
console.log('\nTo apply changes: review the file and confirm with the assistant.');
