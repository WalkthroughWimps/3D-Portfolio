(() => {
  'use strict';
  const status = document.querySelector('#labs-admin-status');
  for (const [buttonId,apiName] of [['labs-open-menu','CakeStudioMenu'],['labs-open-backgrounds','CakeStudioBackgrounds']]) {
    document.getElementById(buttonId).addEventListener('click',() => {
      const panel = window[apiName];
      if (panel?.open) panel.open();
      else status.textContent = 'Sample controls are still loading. Please refresh this page.';
    });
  }
  document.getElementById('labs-reset-demo').addEventListener('click', () => {
    if (window.CakeLabs?.resetDemo) window.CakeLabs.resetDemo();
    else status.textContent = 'Sample controls are still loading. Please refresh this page.';
  });
  const privatePattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\d ().-]{8,}\d)|\b(?:password|credit card|social security|medical history)\b/i;
  document.addEventListener('input', event => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !privatePattern.test(field.value)) return;
    field.value = '';
    status.textContent = 'Cleared: use fictional menu labels only. Personal, health, and payment details are not collected.';
  }, true);
})();
