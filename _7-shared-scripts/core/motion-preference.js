import { getSharedSettings } from './settings.js';

const query = '(prefers-reduced-motion: reduce)';

/** Decorative transitions stop when either site or system asks for less motion. */
export function prefersReducedMotion() {
  return Boolean(getSharedSettings().get().accessibility.reducedMotion || globalThis.matchMedia?.(query).matches);
}

export function onReducedMotionChange(callback, { signal } = {}) {
  const settings = getSharedSettings();
  const media = globalThis.matchMedia?.(query);
  const notify = () => callback(prefersReducedMotion());
  const unsubscribe = settings.subscribe(notify, { signal });
  media?.addEventListener?.('change', notify, { signal });
  return () => {
    unsubscribe?.();
    media?.removeEventListener?.('change', notify);
  };
}
