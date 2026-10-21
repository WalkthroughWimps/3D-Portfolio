import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

export const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(workspace, 'tmp', 'face-file-reservations');
const stateFile = path.join(directory, 'state.json');
const guardFile = path.join(directory, 'transaction.lock');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fileOperation(operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= 7 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      // Windows sync/indexing tools can briefly hold an otherwise writable file.
      // Keep the transaction guard while retrying the atomic replacement.
      await sleep(Math.min(200, 25 * 2 ** attempt));
    }
  }
}

async function canonical(input) {
  let candidate = path.resolve(workspace, input), suffix = [];
  while (true) {
    try { candidate = path.join(await fs.realpath(candidate), ...suffix); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) throw error;
      suffix.unshift(path.basename(candidate)); candidate = parent;
    }
  }
  const relative = path.relative(await fs.realpath(workspace), candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Reservation paths must stay inside this workspace');
  const key = relative.replaceAll('\\', '/').replace(/\/$/, '');
  return process.platform === 'win32' ? key.toLowerCase() : key;
}
const overlaps = (a, b) => !a || !b || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

async function transaction(callback) {
  await fs.mkdir(directory, {recursive: true});
  let handle;
  const deadline = Date.now() + 5000;
  while (!handle) {
    try { handle = await fs.open(guardFile, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error('Reservation transaction is busy. If a process crashed, inspect tmp/face-file-reservations/transaction.lock; only remove it after confirming its PID has exited and no recovery is already running.');
      await sleep(25);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}));
    let state;
    try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = {version: 1, reservations: []}; }
    if (state.version !== 1 || !Array.isArray(state.reservations)) throw new Error('Invalid reservation state; refusing to overwrite it');
    const result = await callback(state);
    if (result.write) {
      const temporary = path.join(directory, `${randomUUID()}.tmp`);
      try { await fs.writeFile(temporary, JSON.stringify(state, null, 2) + '\n'); await fileOperation(() => fs.rename(temporary, stateFile)); }
      finally { await fileOperation(() => fs.rm(temporary, {force: true})); }
    }
    return result.value;
  } finally { await handle.close(); await fileOperation(() => fs.rm(guardFile, {force: true})); }
}

export async function acquire({owner, files, waitMs = 0, leaseMs = 900000}) {
  if (typeof owner !== 'string' || !owner.trim() || !Array.isArray(files) || !files.length) throw new Error('acquire requires --owner and --files');
  if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 30000 || !Number.isFinite(leaseMs) || leaseMs < 1000 || leaseMs > 3600000) throw new Error('wait-ms must be 0..30000; lease-ms must be 1000..3600000');
  const keys = [...new Set(await Promise.all(files.map(canonical)))].sort();
  const deadline = Date.now() + waitMs;
  while (true) {
    const result = await transaction(state => {
      const conflicts = state.reservations.filter(item => item.files.some(held => keys.some(key => overlaps(key, held))));
      if (conflicts.length) return {value: {ok: false, conflicts: conflicts.map(item => ({...item, expired: Date.parse(item.expiresAt) <= Date.now()}))}};
      const now = Date.now(), reservation = {token: randomUUID(), owner: owner.trim(), files: keys, acquiredAt: new Date(now).toISOString(), expiresAt: new Date(now + leaseMs).toISOString()};
      state.reservations.push(reservation); return {write: true, value: {ok: true, reservation}};
    });
    if (result.ok || Date.now() >= deadline) return result;
    await sleep(Math.min(250, Math.max(0, deadline - Date.now())));
  }
}

export async function manage(command, {token, leaseMs = 900000, reason} = {}) {
  if (command === 'status') return transaction(state => ({value: {ok: true, reservations: state.reservations.map(item => ({...item, expired: Date.parse(item.expiresAt) <= Date.now()}))}}));
  if (!['renew', 'release', 'recover'].includes(command) || !token) throw new Error('Use status, acquire, renew --token, release --token, or recover --token --reason');
  return transaction(state => {
    const index = state.reservations.findIndex(item => item.token === token);
    if (index < 0) throw new Error('Reservation token is not held; refusing to change another reservation');
    const reservation = state.reservations[index];
    if (command === 'renew') {
      if (!Number.isFinite(leaseMs) || leaseMs < 1000 || leaseMs > 3600000) throw new Error('lease-ms must be 1000..3600000');
      reservation.expiresAt = new Date(Date.now() + leaseMs).toISOString();
    } else {
      if (command === 'recover' && (Date.parse(reservation.expiresAt) > Date.now() || !reason?.trim())) throw new Error('Recovery requires an expired reservation and --reason documenting confirmed owner inactivity');
      state.reservations.splice(index, 1);
    }
    return {write: true, value: {ok: true, command, reservation, ...(reason ? {reason} : {})}};
  });
}

async function main(args) {
  const command = args.shift(), options = {};
  while (args.length) {
    const key = args.shift();
    if (key === '--files') { options.files = []; while (args.length && !args[0].startsWith('--')) options.files.push(args.shift()); }
    else if (['--owner', '--token', '--reason', '--wait-ms', '--lease-ms'].includes(key)) {
      const value = args.shift(); if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      const name = {'--wait-ms': 'waitMs', '--lease-ms': 'leaseMs'}[key] || key.slice(2); options[name] = name.endsWith('Ms') ? Number(value) : value;
    } else throw new Error(`Unknown option ${key}`);
  }
  const result = command === 'acquire' ? await acquire(options) : await manage(command, options);
  console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2)).catch(error => { console.error(JSON.stringify({ok: false, error: error.message})); process.exitCode = 1; });
