export const SELECT_TOOL = { id: 'select', label: 'Select', key: 'V', path: 'M5 3v16l4-5 5 7 3-2-5-7 6-1z', hotspot: [5, 3] };
export const DRAWING_TOOLS = [
  { id: 'pencil', label: 'Pencil', key: 'N', path: 'M4 20l4-1L20 7l-4-4L4 15z M13 6l4 4', hotspot: [4, 20] },
  { id: 'path', label: 'Pen', key: 'P', path: 'M4 20l4-11 8-6 5 5-6 8z M4 20l8-8 M15 3l6 6 M11 11h2v2h-2z', hotspot: [4, 20] },
  { id: 'line', label: 'Line', key: 'L', path: 'M4 20L20 4 M2 18l4 4 M18 2l4 4', hotspot: [4, 20] },
  { id: 'rectangle', label: 'Rectangle', key: 'R', path: 'M4 5h16v14H4z', hotspot: [12, 12] },
  { id: 'ellipse', label: 'Ellipse', key: 'E', path: 'M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0', hotspot: [12, 12] },
  { id: 'polygon', label: 'Polygon', key: 'O', path: 'M12 3l10 18H2z', hotspot: [12, 12] },
  { id: 'diamond', label: 'Diamond', key: 'D', path: 'M12 2l10 10-10 10L2 12z', hotspot: [12, 12] },
  { id: 'heart', label: 'Heart', key: 'H', path: 'M12 21C-4 11 3-3 12 6c9-9 16 5 0 15z', hotspot: [12, 12] },
  { id: 'star', label: 'Star', key: 'S', path: 'M12 2l3 6.3 7 .8-5.2 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7L2 9.1l7-.8z', hotspot: [12, 12] },
  { id: 'arc', label: 'Arc', key: 'U', path: 'M3 17a9 9 0 0 1 18 0h-4a5 5 0 0 0-10 0z', hotspot: [12,12] },
  { id: 'torus', label: 'Torus', key: 'I', path: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0 M16 12a4 4 0 1 0-8 0 4 4 0 1 0 8 0', hotspot: [12,12] },
  { id: 'pacman', label: 'Pacman', key: 'J', path: 'M12 12l8-5a9 9 0 1 0 0 10z', hotspot: [12,12] }
];
export const ALL_TOOLS = [SELECT_TOOL, ...DRAWING_TOOLS];
export const toolIcon = tool => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${tool.path}"/></svg>`;
export const ACTION_TOOLS = {
  move: { path: 'M12 2l4 4h-3v5h5V8l4 4-4 4v-3h-5v5h3l-4 4-4-4h3v-5H6v3l-4-4 4-4v3h5V6H8z', hotspot: [12, 12] },
  rotate: { path: 'M21 2v8h-8l3-3a6 6 0 1 0 2 8l3 2A9 9 0 1 1 18 5z', hotspot: [12, 12] },
  pivot: { path: 'M11 2h2v6h-2z M11 16h2v6h-2z M2 11h6v2H2z M16 11h6v2h-6z M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0', hotspot: [12, 12] }
};
const cursors = new Map();
export function toolCursor(id, color = '#56d9ed') {
  const tint = /^#[\da-f]{6}$/i.test(color || '') ? color : null, key = `${id}:${tint}`;
  if (cursors.has(key)) return cursors.get(key);
  const tool = id === 'gear' ? { path: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M19 12a7 7 0 1 1-14 0 7 7 0 1 1 14 0 M14 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0', hotspot: [12, 12] } : ACTION_TOOLS[id] || ALL_TOOLS.find(t => t.id === id) || SELECT_TOOL;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="-2 -2 28 28"><g stroke-linecap="round" stroke-linejoin="round"><path d="${tool.path}" fill="${tint || 'none'}" stroke="#11212b" stroke-width="4.5"/><path d="${tool.path}" fill="${tint || 'none'}" stroke="#effbff" stroke-width="3"/><path d="${tool.path}" fill="${tint || 'none'}" stroke="${tint || '#effbff'}" stroke-width="1.6"/>${tint ? '' : '<path d="M3 23L23 3" fill="none" stroke="#f0a6ad" stroke-width="2"/>'}</g></svg>`;
  const cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${tool.hotspot[0] + 2} ${tool.hotspot[1] + 2}, crosshair`;
  cursors.set(key, cursor); return cursor;
}
