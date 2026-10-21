export const NOTES_PANELS = Object.freeze({ tools: 288, gears: 264, layers: 224, panelGap: 10, rimGap: 32, stackPeek: 14 });

// Bounds are projected at zoom 1, without the host's horizontal view offset.
// Only the circular glass counts: clipped art must never expand the layout.
export function drawingLayout({ width, left, right, availableRight = width, layersOpen = false, margin = 12, fitInterior = true }) {
  const p = NOTES_PANELS, end = Math.max(0, Math.min(width, availableRight));
  const stacked = layersOpen && (width <= 680 || end - 2 * margin < p.gears + p.tools + p.panelGap + p.layers + 2 * p.rimGap + 220);
  const rightWidth = p.tools + (layersOpen && !stacked ? p.panelGap + p.layers : 0);
  const peek = stacked ? p.stackPeek : 0, fixedWidth = p.gears + peek + rightWidth + 2 * p.rimGap;
  if (width <= 680 || end - 2 * margin < fixedWidth + 220) {
    return { compact: true, stacked, zoom: 1, offset: (width - end) / 2, uiLeft: margin, uiRight: width - end + margin, dockLeft: end / 2 };
  }
  if (!fitInterior) return {compact:false,stacked,zoom:1,offset:(width-end)/2,uiLeft:end-margin-rightWidth,gearsLeft:margin+peek,dockLeft:end/2};
  const diameter = Math.max(1, right - left);
  const zoom = Math.min(1, (end - 2 * margin - fixedWidth) / diameter);
  const scaledLeft = width / 2 + (left - width / 2) * zoom;
  const scaledRight = width / 2 + (right - width / 2) * zoom;
  const start = scaledLeft - p.rimGap - p.gears - peek, finish = scaledRight + p.rimGap + rightWidth;
  // Center the entire assembly; at maximum fit both ends meet the settings margin.
  const offset = (start + finish - end) / 2;
  return { compact: false, stacked, zoom, offset, uiLeft: scaledRight + p.rimGap - offset,
    gearsLeft: start + peek - offset, dockLeft: (scaledLeft + scaledRight) / 2 - offset,
    circleLeft: scaledLeft - offset, circleRight: scaledRight - offset };
}
