// The scene canvas stays put. Move its projection to the midpoint of the
// horizontal strip left visible by the shared drawers (including transitions).
export function panelViewport(canvas) {
  const rect = canvas?.getBoundingClientRect();
  const width = rect?.width || 0;
  if (!width) return { left: 0, right: width, width, offsetX: 0 };
  let left = 0, right = width;
  for (const [selector, side] of [['#review-panels .review-panel--left', 'left'], ['#review-panels .review-panel--right', 'right']]) {
    const panel = document.querySelector(selector);
    if (!panel || getComputedStyle(panel).display === 'none') continue;
    const edge = panel.getBoundingClientRect();
    if (edge.bottom <= rect.top || edge.top >= rect.bottom) continue;
    if (side === 'left' && edge.left < rect.right && edge.right > rect.left)
      left = Math.max(left, Math.min(width, edge.right - rect.left));
    if (side === 'right' && edge.right > rect.left && edge.left < rect.right)
      right = Math.min(right, Math.max(0, edge.left - rect.left));
  }
  if (right < left) { const midpoint = (left + right) / 2; left = right = midpoint; }
  return { left, right, width, offsetX: (width - left - right) / 2 };
}
