import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The site uses browser ES modules within a CommonJS package.
const source = await readFile(new URL('../_7-shared-scripts/local-preferences.js', import.meta.url), 'utf8');
const { createLocalPreferences } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('quota failures preserve current preferences without deleting stored data', () => {
    const saved = new Map([['sync', '270'], ['unrelated', 'keep']]);
    let full = true;
    const storage = {
        getItem: key => saved.get(key) ?? null,
        setItem(key, value) {
            if (full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
            saved.set(key, value);
        },
        removeItem: key => saved.delete(key)
    };
    const prefs = createLocalPreferences(() => storage);
    assert.equal(prefs.getItem('sync'), '270');
    prefs.setItem('sync', 310);
    prefs.setItem('emissiveScales', '{"screen":1}');
    assert.equal(prefs.getItem('sync'), '310');
    assert.equal(prefs.getItem('emissiveScales'), '{"screen":1}');
    assert.equal(saved.get('sync'), '270');
    assert.equal(saved.get('unrelated'), 'keep');
    full = false;
    prefs.setItem('sync', 320);
    assert.equal(saved.get('sync'), '320');
    saved.set('sync', '330');
    assert.equal(prefs.getItem('sync'), '330');
    prefs.removeItem('emissiveScales');
    assert.equal(prefs.getItem('emissiveScales'), null);
});

test('blocked storage access supports read, write, and removal in memory', () => {
    const prefs = createLocalPreferences(() => { throw new DOMException('Blocked', 'SecurityError'); });
    assert.equal(prefs.getItem('lighting'), null);
    prefs.setItem('lighting', 0.75);
    assert.equal(prefs.getItem('lighting'), '0.75');
    prefs.removeItem('lighting');
    assert.equal(prefs.getItem('lighting'), null);
});
