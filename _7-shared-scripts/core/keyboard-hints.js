/** Visual hints for registered actions with an owned HTML button or link target. */
export function mountKeyboardHints({ actions, pageId, root = document }) {
  const element = root.documentElement;
  const badges = new Map();
  const observer = new MutationObserver(refresh);
  let disposed = false;

  function refresh() {
    if (disposed) return;
    observer.disconnect();
    const eligible = new Map();
    for (const action of actions.list(pageId)) {
      const target = action.target?.();
      if (!target?.isConnected || target.ownerDocument !== root ||
          !target.matches?.('button, a[href]')) continue;
      eligible.set(action.id, { target, keys: action.keys });
    }
    for (const [id, entry] of badges) {
      const current = eligible.get(id);
      if (current?.target === entry.target && current.keys === entry.keys &&
          entry.badge.parentNode === entry.target) continue;
      entry.badge.remove();
      badges.delete(id);
    }
    for (const [id, { target, keys }] of eligible) {
      if (badges.has(id)) continue;
      const badge = root.createElement('kbd');
      badge.className = 'site-shortcut-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = keys;
      target.append(badge);
      badges.set(id, { target, keys, badge });
    }
    for (const target of new Set([...badges.values()].map(entry => entry.target))) {
      observer.observe(target, { childList: true });
    }
  }

  function onKeydown(event) {
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      element.dataset.shortcutHintsKeyboard = 'true';
    } else if (event.key === 'Escape') {
      delete element.dataset.shortcutHintsKeyboard;
    }
  }

  const unsubscribe = actions.subscribe(refresh);
  root.addEventListener('keydown', onKeydown, { capture: true });
  refresh();
  return () => {
    disposed = true;
    observer.disconnect();
    root.removeEventListener('keydown', onKeydown, { capture: true });
    unsubscribe();
    for (const { badge } of badges.values()) badge.remove();
    badges.clear();
    delete element.dataset.shortcutHintsKeyboard;
  };
}
