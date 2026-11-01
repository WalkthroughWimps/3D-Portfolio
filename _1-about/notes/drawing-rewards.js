import { NOTE_AWARDS, noteAwards } from './drawing-discoveries.js';

const MARKS = {
  [NOTE_AWARDS.circle]: { label: 'Blank plate found', art: '<circle cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="3"/>' },
  [NOTE_AWARDS.key]: { label: 'Cabinet key found', art: '<circle cx="14" cy="32" r="9"/><circle cx="14" cy="32" r="3"/><path d="M23 32H54m-18 0v13l4 3m5-16v16m8-16v16"/>' }
};
const STYLE = `
.notes-reward-tray { position:fixed; z-index:120; left:14px; bottom:max(14px, env(safe-area-inset-bottom)); display:flex; gap:8px; pointer-events:none; }
.notes-reward-token { width:64px; height:64px; display:grid; place-items:center; border-radius:14px; color:#d5fbf5; border:1px solid color-mix(in srgb,#a8f8ec var(--notes-reward-strength),#5b8387); background:linear-gradient(145deg,#31515a,#132730); box-shadow:0 2px 12px color-mix(in srgb,#8ee9da var(--notes-reward-strength),transparent),inset 0 1px #ffffff44; }
.notes-reward-token svg { width:48px; height:48px; fill:none; stroke:currentColor; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; }
.notes-reward-flight { position:fixed; z-index:121; pointer-events:none; margin:0; transform-origin:top left; border:0; border-radius:0; background:none; box-shadow:none; }
.notes-reward-flight svg { width:100%; height:100%; }
.notes-reward-toast { position:fixed; z-index:122; pointer-events:none; max-width:min(290px,calc(100vw - 24px)); padding:9px 12px; border:1px solid color-mix(in srgb,#b0fbec var(--notes-reward-strength),#6c9092); border-radius:9px; background:#17333cef; color:#effffd; font:600 13px/1.3 system-ui,sans-serif; box-shadow:0 3px 12px #071a20a8; }
.notes-reward-toast[hidden] { display:none; }
`;

/** A screen-space visual receipt. It never owns, changes, or re-awards an item. */
export function createDrawingRewards({ project, getReducedMotion = () => false, store = noteAwards } = {}) {
  const style = document.createElement('style'); style.textContent = STYLE; document.head.append(style);
  const tray = document.createElement('div'); tray.className = 'notes-reward-tray'; tray.setAttribute('aria-label', 'Drawing discoveries'); document.body.append(tray);
  const toast = document.createElement('div'); toast.className = 'notes-reward-toast'; toast.hidden = true; toast.setAttribute('role','status'); toast.setAttribute('aria-live','polite'); document.body.append(toast);
  const tokens = new Map(), flights = new Set();
  let disposed = false, strength = '53%', toastTimer = 0;
  function token(id) {
    if (!MARKS[id] || tokens.has(id) || disposed) return null;
    const node = document.createElement('div'); node.className = 'notes-reward-token'; node.dataset.award = id;
    node.setAttribute('role', 'img'); node.setAttribute('aria-label', MARKS[id].label);
    node.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">${MARKS[id].art}</svg>`;
    // Fixed order keeps existing receipts in the same slots after a reload.
    const index = Object.values(NOTE_AWARDS).indexOf(id);
    tray.insertBefore(node, [...tray.children].find(child => Object.values(NOTE_AWARDS).indexOf(child.dataset.award) > index) || null);
    tokens.set(id, node); return node;
  }
  function award(receipt, bounds, fit) {
    const target = tokens.get(receipt?.id) || token(receipt?.id); if (!target) return;
    const box = bounds ? project?.(bounds, fit) : null;
    const label = receipt.id === NOTE_AWARDS.circle ? 'Circle recognized — plate' : 'Key recognized — key';
    toast.textContent = `${label} ${receipt.alreadyHeld ? 'already collected' : 'collected'}`;
    toast.style.left = `${Math.max(12,Math.min(innerWidth-290,(box?.x || 14)+(box?.width || 0)/2-110))}px`;
    toast.style.top = `${Math.max(12,Math.min(innerHeight-56,(box?.y || innerHeight-120)-46))}px`;
    toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(()=>{toast.hidden=true;},2000);
    if (receipt.alreadyHeld) {
      if (!getReducedMotion()) target.animate([{transform:'scale(1)'},{transform:'scale(1.17)'},{transform:'scale(1)'}],{duration:650,easing:'ease-out'});
      return;
    }
    if (getReducedMotion() || !box || !Number.isFinite(box.x + box.y + box.width + box.height) || box.width < 4 || box.height < 4) return;
    const flight = target.cloneNode(true); flight.classList.add('notes-reward-flight'); flight.removeAttribute('role'); flight.setAttribute('aria-hidden', 'true');
    flight.style.setProperty('--notes-reward-strength', strength);
    const svg = flight.querySelector('svg'); svg.setAttribute('preserveAspectRatio', 'none');
    if (receipt.id === NOTE_AWARDS.key && box.fit) {
      const { head, end, side } = box.fit, ax = (end.x - head.x) / 39, ay = (end.y - head.y) / 39;
      const cx = (side.x - end.x) / 16, cy = (side.y - end.y) / 16;
      const tx = head.x - box.x - ax * 14 - cx * 32, ty = head.y - box.y - ay * 14 - cy * 32;
      if ([ax,ay,cx,cy,tx,ty].every(Number.isFinite)) {
        svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
        svg.innerHTML = `<g transform="matrix(${ax} ${ay} ${cx} ${cy} ${tx} ${ty})">${MARKS[NOTE_AWARDS.key].art}</g>`;
      }
    }
    flight.style.left = `${box.x}px`; flight.style.top = `${box.y}px`; flight.style.width = `${box.width}px`; flight.style.height = `${box.height}px`;
    target.style.visibility = 'hidden'; document.body.append(flight); flights.add(flight);
    const end = target.getBoundingClientRect();
    const dx = end.left - box.x, dy = end.top - box.y, sx = end.width / box.width, sy = end.height / box.height;
    const animation = flight.animate([
      { transform: 'translate(0,0) scale(1)', opacity: .15, offset: 0 },
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: .24 },
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: .42 },
      { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: .08, offset: 1 }
    ], { duration: 1150, easing: 'cubic-bezier(.24,.72,.22,1)' });
    animation.finished.catch(() => {}).finally(() => { flight.remove(); flights.delete(flight); target.style.visibility = ''; });
  }
  store.get().forEach(receipt => token(receipt.id));
  const unsubscribe = store.subscribe(receipt => { if (receipt.remote) token(receipt.id); });
  function setContrast(value) { strength = `${Math.round(20 + value * 65)}%`; tray.style.setProperty('--notes-reward-strength', strength); toast.style.setProperty('--notes-reward-strength',strength); flights.forEach(node=>node.style.setProperty('--notes-reward-strength',strength)); }
  function settle() { flights.forEach(node => { node.getAnimations().forEach(animation => animation.cancel()); node.remove(); }); flights.clear(); tokens.forEach(node => { node.style.visibility = ''; node.getAnimations().forEach(animation=>animation.cancel()); }); clearTimeout(toastTimer); toast.hidden=true; }
  function dispose() { if (disposed) return; disposed = true; unsubscribe(); settle(); tray.remove(); toast.remove(); style.remove(); }
  return { award, setContrast, settle, dispose };
}
