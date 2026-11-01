// Reversible proportions trial: the model on disk and its lower assembly stay intact.
export const UPPER_TABLET_HEIGHT_SCALE = 1.25;
const originalTransforms = new WeakMap();

export function growUpperTablet(root, heightScale = UPPER_TABLET_HEIGHT_SCALE) {
  if(!Number.isFinite(heightScale) || heightScale <= 0) throw new RangeError('Tablet height scale must be positive');
  let tablet = null;
  root?.traverse(object => {
    if(!tablet && /^(?:pe'rpad|perpad)_tablet$/i.test(object.name || '') && object.geometry) tablet = object;
  });
  if(!tablet) return null;
  if(!tablet.geometry.boundingBox) tablet.geometry.computeBoundingBox();
  const bounds = tablet.geometry.boundingBox;
  if(!bounds || !Number.isFinite(bounds.min.y) || !(bounds.max.y > bounds.min.y)) return null;
  if(!originalTransforms.has(tablet)){
    originalTransforms.set(tablet, {position:tablet.position.clone(),scaleY:tablet.scale.y,bottom:bounds.min.y});
  }
  const original = originalTransforms.get(tablet);
  tablet.scale.y = original.scaleY * heightScale;
  // Local Y is the display's vertical axis. Anchor its frame's bottom edge so
  // the extra height grows upward, preserving clearance above the lower screen.
  const shift = original.position.clone().set(0, original.bottom * original.scaleY * (1 - heightScale), 0)
    .applyQuaternion(tablet.quaternion);
  tablet.position.copy(original.position).add(shift);
  // Its screen is a child, so frame, UV surface, raycasting and focus bounds move together.
  tablet.updateWorldMatrix(true, true);
  return tablet;
}
