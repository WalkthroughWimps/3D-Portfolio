(() => {
  if (document.body.dataset.mode !== 'preview') return;
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'cake-order-preview' || !event.data.cake) return;
    try { await window.setOrderCakePreview(event.data.cake, event.data.options); parent.postMessage({ type: 'cake-preview-updated' }, location.origin); }
    catch { parent.postMessage({ type: 'cake-preview-unavailable' }, location.origin); }
  });
  parent.postMessage({ type: 'cake-preview-ready' }, location.origin);
})();
