import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Labs build includes the public Cake demo and retains Route Map and host files', () => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(tempRoot, 'cake-labs-integration-'));
  const fixtureLabs = path.join(fixture, 'labs');
  const output = path.join(fixture, 'dist-labs-root');
  try {
    fs.cpSync(path.join(root, 'labs'), fixtureLabs, {recursive: true});
    execFileSync(process.execPath, [path.join(fixtureLabs, 'build-labs-root.js')], {cwd: fixture});

    const cake = path.join(output, 'cake');
    assert.equal(fs.existsSync(path.join(cake, 'index.html')), true);
    assert.match(fs.readFileSync(path.join(cake, 'index.html'), 'utf8'), /<title>Sample Cake Studio<\/title>/);
    assert.match(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), /href="\/cake\/"/);
    for (const control of ['_headers', '_redirects', '404.html']) {
      assert.equal(fs.existsSync(path.join(fixtureLabs, 'cake-source', control)), true, `${control} is in the Cake snapshot`);
    }

    function countFiles(directory) {
      return fs.readdirSync(directory, {withFileTypes: true}).reduce((count, entry) => {
        const child = path.join(directory, entry.name);
        return count + (entry.isDirectory() ? countFiles(child) : 1);
      }, 0);
    }
    assert.equal(countFiles(cake), 145);
    assert.equal(countFiles(path.join(output, 'routemap')), 547);

    for (const control of ['_headers', '_redirects', '404.html']) {
      assert.equal(fs.existsSync(path.join(output, control)), true, `${control} remains at the Pages root`);
    }
    assert.match(fs.readFileSync(path.join(output, '_headers'), 'utf8'), /^\/cake\/\*/m);
    assert.match(fs.readFileSync(path.join(output, '_redirects'), 'utf8'), /^\/cake \/cake\/ 301$/m);
    assert.match(fs.readFileSync(path.join(output, '404.html'), 'utf8'), /Matt Hall Labs/);
    assert.doesNotMatch(fs.readFileSync(path.join(output, '404.html'), 'utf8'), /Sample Cake Studio/);
    assert.equal(fs.existsSync(path.join(output, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(output, 'styles.css')), true);
    assert.equal(fs.existsSync(path.join(output, 'README-LABS-DEPLOYMENT.md')), true);
    assert.equal(fs.existsSync(path.join(output, 'routemap', 'index.html')), true);
    assert.equal(fs.existsSync(path.join(output, 'routemap', 'assets')), true);

    const disallowedNames = new Set(['.data', 'private', 'server', 'server.mjs', '.env', 'node_modules', 'admin', 'config']);
    function assertNoPrivateNames(directory) {
      for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        assert.equal(disallowedNames.has(entry.name.toLowerCase()), false, `disallowed Cake path: ${entry.name}`);
        if (entry.isDirectory()) assertNoPrivateNames(path.join(directory, entry.name));
      }
    }
    assertNoPrivateNames(cake);
  } finally {
    const resolvedFixture = fs.realpathSync(fixture);
    assert.equal(path.dirname(resolvedFixture), tempRoot, 'temporary fixture stays directly under the OS temp directory');
    assert.match(path.basename(resolvedFixture), /^cake-labs-integration-/);
    fs.rmSync(resolvedFixture, {recursive: true, force: true, maxRetries: 5, retryDelay: 500});
  }
});
