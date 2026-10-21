// Music owns these UI instances. Media elements are borrowed by the UI and
// remain under the page's existing transport/preview ownership.
export function disposeMusicVideoControls(owner) {
  if (!owner) return;
  const ui = owner.ui;
  owner.ui = null;
  owner.uiCanvas = null;
  owner.uiCtx = null;
  ui?.dispose();
}
