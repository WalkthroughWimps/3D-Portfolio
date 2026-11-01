const form = document.querySelector('[role="search"]');
const search = document.querySelector('#directory-search');
const count = document.querySelector('#directory-count');
const empty = document.querySelector('#directory-empty');
const rooms = [...document.querySelectorAll('.directory-room')];
const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function filter() {
  const words = normalize(search.value).trim().split(/\s+/).filter(Boolean);
  let matches = 0;
  let roomCount = 0;
  for (const room of rooms) {
    let visible = 0;
    const name = room.querySelector('h2').textContent;
    for (const entry of room.querySelectorAll('[data-entry]')) {
      const text = normalize(`${name} ${entry.textContent}`);
      entry.hidden = !words.every(word => text.includes(word));
      if (!entry.hidden) visible++;
    }
    room.hidden = !visible;
    matches += visible;
    if (visible) roomCount++;
  }
  count.textContent = `${matches} ${matches === 1 ? 'entry' : 'entries'} across ${roomCount} ${roomCount === 1 ? 'area' : 'areas'}.`;
  empty.hidden = matches > 0;
}
form.hidden = false;
form.addEventListener('submit', event => event.preventDefault());
search.addEventListener('input', filter);
form.addEventListener('reset', () => { search.value = ''; filter(); });
for (const link of document.querySelectorAll('.map-room')) link.addEventListener('click', () => {
  // Map destinations must remain reachable even after filtering the list.
  search.value = '';
  filter();
});
