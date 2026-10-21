// Hit-test frozen layout rectangles, never animated/displaced DOM bounds.
export function reorderSlot(rectangles, y) {
  const index = rectangles.findIndex(rect => y < rect.top + rect.height / 2);
  return index < 0 ? rectangles.length : index;
}
