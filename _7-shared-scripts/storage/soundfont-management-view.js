// Reusable view; Phase 6 chooses where to mount it and supplies catalog labels.
export function mountSoundfontManagementView({ store, root, labelFor = id => id, signal } = {}) {
  if (!store || !root) throw new TypeError('store and root are required');
  let disposed = false;
  const panel = root.ownerDocument.createElement('section');
  panel.setAttribute('aria-label', 'Saved instruments');
  const heading = root.ownerDocument.createElement('h2'); heading.textContent = 'Saved instruments';
  const summary = root.ownerDocument.createElement('p');
  const list = root.ownerDocument.createElement('ul');
  const removeAll = root.ownerDocument.createElement('button');
  removeAll.type = 'button'; removeAll.textContent = 'Remove all saved instruments';
  panel.append(heading, summary, list, removeAll); root.append(panel);
  async function render() {
    try {
      const [items, usage] = await Promise.all([store.list(), store.usage()]);
      if (disposed) return;
      summary.textContent = `${usage.usedBytes.toLocaleString()} of ${usage.budgetBytes.toLocaleString()} bytes used`;
      list.replaceChildren();
      for (const item of items) {
        const row = root.ownerDocument.createElement('li');
        const title = root.ownerDocument.createElement('span');
        title.textContent = `${labelFor(item.instrumentId)} — ${item.status} (${item.packageId}) `;
        const remove = root.ownerDocument.createElement('button');
        remove.type = 'button'; remove.textContent = `Remove ${labelFor(item.instrumentId)}`;
        remove.addEventListener('click', async () => { await store.removeSelections([item.instrumentId]); await render(); });
        row.append(title, remove); list.append(row);
      }
      removeAll.disabled = !items.length;
    } catch (error) { if (!disposed) summary.textContent = `Saved instrument status unavailable: ${error.message}`; }
  }
  const onAll = async () => { const items = await store.list(); await store.removeSelections(items.map(item => item.instrumentId)); await render(); };
  removeAll.addEventListener('click', onAll);
  const stop = store.subscribe(render);
  const dispose = () => { if (disposed) return; disposed = true; stop(); removeAll.removeEventListener('click', onAll); panel.remove(); signal?.removeEventListener('abort', dispose); };
  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) dispose(); else void render();
  return { render, dispose };
}
