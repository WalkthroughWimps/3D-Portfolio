// An owner registers actions for its mounted scope. Dispatch does not consume the event;
// the caller does that only after an action reports that it handled the key.
export function isInteractiveKeyboardTarget(target) {
  const element = target?.nodeType === 1 ? target : target?.parentElement;
  const editable = element?.closest?.('[contenteditable]');
  if (editable ? editable.isContentEditable : element?.isContentEditable) return true;
  return !!element?.closest?.('a[href], button, input, textarea, select, summary, audio[controls], video[controls], [role="button"], [role="textbox"], [role="slider"], [role="tree"], [role="treeitem"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="spinbutton"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="option"], [role="grid"], [role="gridcell"], [role="scrollbar"]');
}

export function createKeyboardActions() {
  const actions = new Map();
  const listeners = new Set();
  let disposed = false;
  const list = scope => [...actions.values()].filter(action => !scope || action.scope === scope);
  const notify = () => { for (const listener of [...listeners]) listener(); };

  return {
    register(action) {
      if (disposed || !action?.id || !action.label || !action.keys ||
          typeof action.match !== 'function' || typeof action.run !== 'function' || actions.has(action.id)) {
        throw new Error(`Invalid or duplicate keyboard action: ${action?.id}`);
      }
      actions.set(action.id, action);
      notify();
      return () => { if (actions.get(action.id) === action) { actions.delete(action.id); notify(); } };
    },
    get(id) { return actions.get(id); },
    list,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(event, scope) {
      if (disposed || event.defaultPrevented || event.isComposing || event.key === 'Process') return false;
      const candidates = list(scope).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      for (const action of candidates) {
        if (action.match(event) && (!action.enabled || action.enabled(event)) && action.run(event) === true) return true;
      }
      return false;
    },
    dispose() { actions.clear(); listeners.clear(); disposed = true; }
  };
}
