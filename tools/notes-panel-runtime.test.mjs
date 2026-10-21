import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../_1-about/notes/drawing-layout.js', import.meta.url), 'utf8');
const {drawingLayout, NOTES_PANELS: p} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('edge layout preserves manual zoom framing for very large glass and changing pane counts', () => {
  for (const width of [1120, 1440, 1920]) for (const layersOpen of [false, true]) {
    const input = {width, left: -5000, right: 6000, layersOpen, fitInterior: false};
    const result = drawingLayout(input);
    assert.equal(result.zoom, 1); assert.equal(result.offset, 0);
    const rightWidth = p.tools + (layersOpen && !result.stacked ? p.layers + p.panelGap : 0);
    assert.equal(result.uiLeft + rightWidth, width - 12);
    assert.equal(result.gearsLeft - (result.stacked ? p.stackPeek : 0), 12);
    assert.deepEqual(result, drawingLayout({...input, left: 400, right: 700}));
  }
});

test('settings reserve horizontal space without zooming or overlapping edge controls', () => {
  for (const availableRight of [900, 1100, 1450]) {
    const result = drawingLayout({width: 1920, availableRight, left: -600, right: 2200, layersOpen: true, fitInterior: false});
    assert.equal(result.zoom, 1); assert.equal(result.offset, (1920 - availableRight) / 2);
    assert.ok(result.gearsLeft + p.gears <= result.uiLeft);
    const rightWidth = p.tools + (result.stacked ? 0 : p.panelGap + p.layers);
    assert.equal(result.uiLeft + rightWidth, availableRight - 12);
  }
});

test('fit mode remains opt-in at runtime while compact controls never force shrink', () => {
  const input = {width: 1440, left: -1000, right: 2400, layersOpen: true};
  assert.equal(drawingLayout({...input, fitInterior: false}).zoom, 1);
  const fitted = drawingLayout({...input, fitInterior: true});
  assert.ok(fitted.zoom > 0 && fitted.zoom < 1);
  for (const width of [320, 390, 720]) {
    const result = drawingLayout({...input, width, fitInterior: false});
    assert.equal(result.compact, true); assert.equal(result.zoom, 1);
    assert.equal(result.uiLeft, 12); assert.equal(result.uiRight, 12);
  }
});
