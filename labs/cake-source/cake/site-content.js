(() => {
  const list = document.querySelector('#flavor-list');
  const status = document.querySelector('#flavor-menu-status');
  if (!list || !status) return;

  async function loadFlavors() {
    try {
      const response = await fetch('/api/menu', { cache: 'no-store' });
      if (!response.ok) throw new Error('The menu is temporarily unavailable.');
      const menu = await response.json();
      if (!Array.isArray(menu.cakes)) throw new Error('The menu is temporarily unavailable.');

      const flavors = menu.cakes
        .filter(item => Array.isArray(item) && typeof item[1] === 'string' && item[1].trim())
        .map(item => item[1].trim());
      list.replaceChildren(...flavors.map(name => {
        const item = document.createElement('li');
        item.textContent = name;
        return item;
      }));
      status.textContent = flavors.length
        ? 'These choices match the live cake request menu.'
        : 'No cake flavors are listed right now. Send a request and ask the studio what is available.';
    } catch {
      status.textContent = 'The current flavor list could not load. You can still send a request and ask about availability.';
    }
  }

  loadFlavors();
})();
