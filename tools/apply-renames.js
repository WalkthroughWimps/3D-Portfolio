const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dryrun = path.join(root, 'rename-dryrun.txt');
if (!fs.existsSync(dryrun)) {
  console.error('rename-dryrun.txt not found');
  process.exit(1);
}

const outLog = path.join(root, 'rename-changes.log');
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, 'backups', `rename-backup-${ts}`);
fs.mkdirSync(backupDir, { recursive: true });

function readMappings() {
  const lines = fs.readFileSync(dryrun, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const mappings = [];
  for (const l of lines) {
    if (l.includes(' => ')) {
      const [from, to] = l.split(' => ').map(s => s.trim());
      if (from && to && from !== to) mappings.push({ from, to });
    }
  }
  return mappings;
}

function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ } }

function backupFile(relPath) {
  const src = path.join(root, relPath);
  if (!fs.existsSync(src)) return;
  const dest = path.join(backupDir, relPath);
  ensureDir(path.dirname(dest));
  try { fs.copyFileSync(src, dest); } catch (e) { console.warn('Backup failed for', relPath, e); }
}

function safeRename(oldRel, newRel) {
  const oldAbs = path.join(root, oldRel);
  const newAbs = path.join(root, newRel);
  if (!fs.existsSync(oldAbs)) {
    return { ok: false, reason: 'missing' };
  }
  ensureDir(path.dirname(newAbs));
  // If target exists, skip and mark conflict
  if (fs.existsSync(newAbs)) {
    return { ok: false, reason: 'target-exists' };
  }
  try {
    fs.renameSync(oldAbs, newAbs);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateReferences(mappings) {
  // collect text files to update
  const exts = new Set(['.js', '.ts', '.html', '.css', '.scss', '.json', '.md', '.txt', '.yml', '.yaml', '.ps1']);
  function walk(dir) {
    const acc = [];
    const ents = fs.readdirSync(dir, { withFileTypes: true });
    const exclude = new Set(['node_modules', '.git', 'backups', '.venv', 'venv', '__pycache__', '.vscode', '.vs', 'tools']);
    for (const ent of ents) {
      if (exclude.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) acc.push(...walk(full));
      else acc.push(full);
    }
    return acc;
  }
  const files = walk(root).filter(f => {
    const rel = path.relative(root, f);
    if (rel === 'rename-dryrun.txt' || rel === 'rename-references.txt' || rel === 'rename-changes.log') return false;
    return exts.has(path.extname(f).toLowerCase());
  });

  const changes = [];
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
    let original = text;
    for (const m of mappings) {
      // create several variants to replace: backslashes and forward slashes and encoded
      const fromBack = m.from.replace(/\//g, '\\\\'); // for regex
      const fromForward = m.from.replace(/\\\\/g, '/');
      const normBack = m.from.replace(/\//g, '\\');
      const normForward = m.from.replace(/\\/g, '/');
      const encForward = encodeURI(normForward);
      const encBack = encodeURI(normBack);
      // build regexes
      // replace literal occurrences of normForward and normBack and encoded forms
      const variants = [normForward, normBack, encForward, encBack];
      for (const v of variants) {
        if (!v) continue;
        const re = new RegExp(escapeRegExp(v), 'g');
        text = text.replace(re, m.to.replace(/\\/g, '/'));
      }
    }
    if (text !== original) {
      // backup original
      const rel = path.relative(root, file);
      const bak = path.join(backupDir, rel);
      ensureDir(path.dirname(bak));
      fs.copyFileSync(file, bak);
      fs.writeFileSync(file, text, 'utf8');
      changes.push(rel);
    }
  }
  return changes;
}

function applyAll() {
  const mappings = readMappings();
  // Normalize mapping paths to use platform-specific separators
  const normMappings = mappings.map(m => ({ from: path.normalize(m.from), to: path.normalize(m.to) }));

  // Determine directory mappings vs file mappings
  const dirMaps = [];
  const fileMaps = [];
  for (const m of normMappings) {
    const abs = path.join(root, m.from);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) dirMaps.push(m);
    else fileMaps.push(m);
  }

  // Sort directories by path depth descending to rename children first
  dirMaps.sort((a,b) => b.from.split(path.sep).length - a.from.split(path.sep).length);

  const log = [];
  log.push('Rename run: ' + (new Date()).toISOString());
  log.push('Backup dir: ' + path.relative(root, backupDir));
  log.push('');

  // Perform file backups and renames for files first
  for (const m of fileMaps) {
    const fromRel = m.from;
    const toRel = m.to;
    const fromAbs = path.join(root, fromRel);
    if (!fs.existsSync(fromAbs)) { log.push(`SKIP (missing): ${fromRel}`); continue; }
    // backup file
    backupFile(fromRel);
    const res = safeRename(fromRel, toRel);
    if (res.ok) log.push(`RENAMED: ${fromRel} -> ${toRel}`);
    else log.push(`FAILED: ${fromRel} -> ${toRel} (${res.reason})`);
  }

  // Now rename directories
  for (const m of dirMaps) {
    const fromRel = m.from;
    const toRel = m.to;
    const fromAbs = path.join(root, fromRel);
    if (!fs.existsSync(fromAbs)) { log.push(`SKIP (missing dir): ${fromRel}`); continue; }
    // backup directory: copy entries file-by-file into backupDir preserving structure
    const stack = [fromRel];
    while (stack.length) {
      const rel = stack.pop();
      const abs = path.join(root, rel);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        const ents = fs.readdirSync(abs);
        for (const e of ents) stack.push(path.join(rel, e));
      } else if (fs.existsSync(abs)) {
        backupFile(rel);
      }
    }
    const res = safeRename(fromRel, toRel);
    if (res.ok) log.push(`RENAMED DIR: ${fromRel} -> ${toRel}`);
    else log.push(`FAILED DIR: ${fromRel} -> ${toRel} (${res.reason})`);
  }

  log.push('');
  // Update textual references in files
  log.push('Updating textual references in code/text files...');
  const changedFiles = updateReferences(normMappings);
  log.push(`Updated ${changedFiles.length} files`);

  fs.writeFileSync(outLog, log.join('\n'));
  console.log('Rename complete. Log:', outLog);
}

applyAll();
