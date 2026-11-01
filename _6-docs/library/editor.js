import { validateLibrary, presentationUrl } from './schema.js';

const requestHeaders = { 'Content-Type': 'application/json', 'X-Docs-Library': '1' };
const localReview = ['127.0.0.1', 'localhost'].includes(location.hostname);
const draftKey = 'docs-library-draft-v1';
const field = (label, control) => { const wrapper = document.createElement('label'); wrapper.textContent = label; wrapper.append(control); return wrapper; };
const input = (type, name, value = '') => { const element = document.createElement('input'); element.type = type; element.name = name; element.value = value; return element; };
const button = (label, action) => { const element = document.createElement('button'); element.type = 'button'; element.textContent = label; element.addEventListener('click', action); return element; };
function bufferAsBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); }

export function mountDocsEditor({ library: initial, onChange }) {
  let library = structuredClone(initial), selectedId = library.items[0]?.id || '';
  const root = document.createElement('section'); root.className = 'docs-editor'; root.setAttribute('aria-label', 'Document library editor');
  root.innerHTML = '<h2 data-section-static>Document library</h2><p>Arrange documents on the desk and choose what visitors can open.</p>';
  const message = document.createElement('p'); message.className = 'docs-editor-message'; message.setAttribute('role', 'status');
  const section = document.createElement('div'); section.className = 'docs-editor-fields';
  const pick = document.createElement('select'); pick.setAttribute('aria-label', 'Choose document to edit');
  const type = document.createElement('select'); type.name = 'type';
  for (const name of ['presentation', 'pdf', 'image', 'document']) { const option = new Option(name[0].toUpperCase() + name.slice(1), name); type.add(option); }
  const format = document.createElement('select'); format.name = 'format';
  for (const [label, value] of [['A4 portrait', 'a4'], ['A4 landscape', 'a4-landscape'], ['Letter', 'letter'], ['16:9 presentation', 'wide'], ['Custom', 'custom']]) format.add(new Option(label, value));
  const title = input('text', 'title'), description = document.createElement('textarea'), source = document.createElement('textarea');
  description.name = 'description'; source.name = 'source';
  const cover = input('file', 'cover'); cover.accept = 'image/png,image/jpeg,image/webp';
  const coverFirst = input('checkbox', 'coverFirst'); coverFirst.checked = true;
  const file = input('file', 'document'); file.accept = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.odt,.odp,.ods,.rtf,.txt,.md';
  const width = input('number', 'width'), height = input('number', 'height'), scale = input('number', 'scale');
  const x = input('number', 'x'), z = input('number', 'z'), rotation = input('number', 'rotation');
  for (const numeric of [width, height, scale, x, z]) numeric.step = '.001'; rotation.step = '1';
  const sourceLabel = field('Microsoft presentation embed code or URL', source);
  const fileLabel = field('Upload PDF, image, or document', file);
  const coverLabel = field('Optional cover image', cover);
  function group(label, id, controls) {
    const details = document.createElement('details'); details.className = 'docs-editor-group'; details.dataset.sectionId = id; details.open = true;
    const summary = document.createElement('summary'); const heading = document.createElement('h3'); heading.textContent = label; summary.append(heading);
    const content = document.createElement('div'); content.className = 'docs-editor-group-fields'; content.append(...controls);
    details.append(summary, content); section.append(details); return details;
  }
  group('Document', 'document', [field('Document', pick), field('Type', type), field('Title', title), field('Description', description)]);
  const coverFirstLabel = field('Show PDF cover as a single first page', coverFirst);
  group('Source and cover', 'source-cover', [sourceLabel, fileLabel, coverLabel, coverFirstLabel]);
  group('Paper format and placement', 'paper-placement', [field('Paper format', format), field('Width (metres)', width), field('Height (metres)', height), field('Scale', scale), field('Desk X (metres)', x), field('Desk Z (metres)', z), field('Rotation (degrees)', rotation)]);
  root.append(section);
  const actions = document.createElement('div'); actions.className = 'docs-editor-actions'; root.append(actions, message);
  const report = value => { message.textContent = value; };
  const defaults = typeName => typeName === 'presentation' ? { width: .297, height: .167063 } : { width: .210, height: .297 };
  const tabletop = { minX: .062, maxX: 1.338, minZ: -1.110, maxZ: -.062 };
  const lamp = { minX: .9173, maxX: 1.1408, minZ: -.3473, maxZ: -.1237 };
  let positionTouched = false;
  function footprint(item) {
    const angle = Number(item.rotation || 0) * Math.PI / 180;
    const w = Number(item.width || .21) * Number(item.scale || 1), h = Number(item.height || .297) * Number(item.scale || 1);
    return { x: (Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h) / 2, z: (Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h) / 2 };
  }
  function suggestPosition(item) {
    const half = footprint(item), margin = .022;
    const minX = tabletop.minX + half.x + margin, maxX = tabletop.maxX - half.x - margin;
    const minZ = tabletop.minZ + half.z + margin, maxZ = tabletop.maxZ - half.z - margin;
    const stepX = Math.max(.08, 2 * half.x + .035), stepZ = Math.max(.08, 2 * half.z + .045);
    const candidates = [];
    for (let row = 0, z = minZ; z <= maxZ + 1e-6 && row < 2; row++, z += stepZ) {
      for (let x = minX; x <= maxX + 1e-6; x += stepX) candidates.push({ x, z });
    }
    const collides = candidate => {
      if (candidate.x - half.x < tabletop.minX || candidate.x + half.x > tabletop.maxX || candidate.z - half.z < tabletop.minZ || candidate.z + half.z > tabletop.maxZ) return true;
      if (candidate.x + half.x + margin > lamp.minX && candidate.x - half.x - margin < lamp.maxX && candidate.z + half.z + margin > lamp.minZ && candidate.z - half.z - margin < lamp.maxZ) return true;
      return library.items.some(existing => {
        const other = footprint(existing);
        return Math.abs(candidate.x - Number(existing.x)) < half.x + other.x + margin && Math.abs(candidate.z - Number(existing.z)) < half.z + other.z + margin;
      });
    };
    const free = candidates.find(candidate => !collides(candidate));
    if (free) return free;
    // A finite fan gives crowded collections a predictable fallback without
    // relocating any existing paper.
    const origin = library.items.at(-1) || { x: .7, z: -.58 };
    for (let ring = 1; ring <= 8; ring++) for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const candidate = { x: Math.max(minX, Math.min(maxX, Number(origin.x) + dx * ring * .035)), z: Math.max(minZ, Math.min(maxZ, Number(origin.z) + dz * ring * .035)) };
      if (!collides(candidate)) return candidate;
    }
    return { x: Math.max(minX, Math.min(maxX, .7)), z: Math.max(minZ, Math.min(maxZ, -.58)) };
  }
  function selected() { return library.items.find(item => item.id === selectedId); }
  function refreshPicker() {
    pick.replaceChildren();
    library.items.forEach(item => pick.add(new Option(item.title, item.id)));
    if (!library.items.length) pick.add(new Option('New document', ''));
    pick.value = selectedId;
  }
  function load() {
    const item = selected() || { type: 'presentation', title: '', description: '', sourceUrl: '', ...defaults('presentation'), rotation: 0, scale: 1, ...suggestPosition({ ...defaults('presentation'), rotation: 0, scale: 1 }) };
    file.value = ''; cover.value = ''; positionTouched = !!selected();
    type.value = item.type; title.value = item.title; description.value = item.description; source.value = item.type === 'presentation' ? item.sourceUrl : '';
    width.value = item.width; height.value = item.height; x.value = item.x; z.value = item.z; scale.value = item.scale; rotation.value = item.rotation;
    format.value = item.type === 'presentation' ? 'wide' : item.width === .297 && item.height === .210 ? 'a4-landscape' : item.width === .2159 && item.height === .2794 ? 'letter' : item.width === .210 && item.height === .297 ? 'a4' : 'custom';
    sourceLabel.hidden = item.type !== 'presentation'; fileLabel.hidden = item.type === 'presentation';
    coverFirstLabel.hidden = item.type !== 'pdf'; coverFirst.checked = item.coverFirst !== false;
    fileLabel.querySelector('input').disabled = !localReview; cover.disabled = !localReview;
    if (!localReview) report('File uploads and publishing are available in the local review server. Presentation links can be edited here and exported.');
  }
  pick.addEventListener('change', () => { selectedId = pick.value; load(); });
  function updateSuggestedPosition() {
    if (selected() || positionTouched) return;
    const position = suggestPosition({ width: Number(width.value), height: Number(height.value), rotation: Number(rotation.value), scale: Number(scale.value) });
    x.value = position.x; z.value = position.z;
  }
  for (const fieldElement of [x, z]) fieldElement.addEventListener('input', () => { positionTouched = true; });
  for (const fieldElement of [scale, rotation]) fieldElement.addEventListener('input', updateSuggestedPosition);
  type.addEventListener('change', () => { const dimensions = defaults(type.value); width.value = dimensions.width; height.value = dimensions.height; format.value = type.value === 'presentation' ? 'wide' : 'a4'; sourceLabel.hidden = type.value !== 'presentation'; fileLabel.hidden = type.value === 'presentation'; coverFirstLabel.hidden = type.value !== 'pdf'; updateSuggestedPosition(); });
  for (const dimension of [width, height]) dimension.addEventListener('input', () => { format.value = 'custom'; updateSuggestedPosition(); });
  format.addEventListener('change', () => {
    const dimensions = { a4: [.210,.297], 'a4-landscape': [.297,.210], letter: [.2159,.2794], wide: [.297,.167063] }[format.value];
    if (dimensions) { width.value = dimensions[0]; height.value = dimensions[1]; updateSuggestedPosition(); }
  });
  async function upload(selectedFile) {
    if (!localReview) throw new Error('Open the local review server to upload files.');
    if (selectedFile.size > 20 * 1024 * 1024) throw new Error('Files must be 20 MB or smaller.');
    const response = await fetch('/__admin/docs/upload', { method: 'POST', headers: requestHeaders, body: JSON.stringify({ filename: selectedFile.name, data: await bufferAsBase64(selectedFile) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Upload failed.'); return result;
  }
  function persistDraft() {
    try { localStorage.setItem(draftKey, JSON.stringify(library)); }
    catch { report('Saved for this session. Browser storage is unavailable.'); }
  }
  async function naturalImageSize(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('The image dimensions could not be read.'));
      image.src = url;
    });
  }
  actions.append(button('New document', () => { selectedId = ''; refreshPicker(); load(); title.focus(); }), button('Save document', async () => {
    try {
      let kind = type.value;
      const existing = selected();
      const item = { ...existing, id: existing?.id || crypto.randomUUID(), type: kind, title: title.value, description: description.value,
        width: Number(width.value), height: Number(height.value), x: Number(x.value), z: Number(z.value), rotation: Number(rotation.value), scale: Number(scale.value) };
      if (kind === 'presentation') item.sourceUrl = presentationUrl(source.value);
      else if (file.files[0]) {
        const uploaded = await upload(file.files[0]); item.sourceUrl = uploaded.sourceUrl;
        kind = /\.pdf$/i.test(uploaded.sourceUrl) ? 'pdf' : /\.(png|jpe?g|webp)$/i.test(uploaded.sourceUrl) ? 'image' : 'document';
        item.type = kind; type.value = kind;
        delete item.pageImages; delete item.pageCount; delete item.coverFirst;
        if (kind === 'pdf' && uploaded.pageImages?.length) { item.pageImages = uploaded.pageImages; item.pageCount = uploaded.pageCount; item.coverFirst = coverFirst.checked; }
        if (uploaded.width && uploaded.height) { item.width = uploaded.width; item.height = uploaded.height; }
        else if (kind === 'image') {
          const size = await naturalImageSize(uploaded.sourceUrl);
          item.width = .210; item.height = Math.max(.08, Math.min(.6, .210 * size.height / size.width));
        }
        if (uploaded.previewUrl) item.previewUrl = uploaded.previewUrl;
      }
      else if (!existing || existing.type !== kind) throw new Error('Choose a file to upload.');
      if (kind === 'pdf' && item.pageImages?.length) item.coverFirst = coverFirst.checked;
      if (cover.files[0]) item.previewUrl = (await upload(cover.files[0])).sourceUrl;
      const half = footprint(item), margin = .012;
      if (item.x - half.x < tabletop.minX || item.x + half.x > tabletop.maxX || item.z - half.z < tabletop.minZ || item.z + half.z > tabletop.maxZ) throw new Error('Keep the whole document on the desktop.');
      if (item.x + half.x + margin > lamp.minX && item.x - half.x - margin < lamp.maxX && item.z + half.z + margin > lamp.minZ && item.z - half.z - margin < lamp.maxZ) throw new Error('Move the document clear of the lamp.');
      const next = structuredClone(library); const index = next.items.findIndex(entry => entry.id === item.id);
      if (index < 0) next.items.push(item); else next.items[index] = item;
      library = validateLibrary(next); selectedId = item.id; persistDraft(); onChange(library); refreshPicker(); load(); report('Saved to this browser draft. Use Save to project to update the local project files.');
    } catch (error) { report(error.message); }
  }), button('Remove', () => { if (!selectedId) return; library.items = library.items.filter(item => item.id !== selectedId); selectedId = library.items[0]?.id || ''; persistDraft(); onChange(library); refreshPicker(); load(); report('Removed from this browser draft. Save to project to update the local project files.'); }),
  button('Move earlier', () => move(-1)), button('Move later', () => move(1)));
  function move(offset) { const index = library.items.findIndex(item => item.id === selectedId), target = index + offset; if (index < 0 || target < 0 || target >= library.items.length) return; [library.items[index], library.items[target]] = [library.items[target], library.items[index]]; persistDraft(); onChange(library); refreshPicker(); }
  actions.append(button('Save to project', async () => {
    try { if (!localReview) throw new Error('Save to project requires the local review server.');
      const response = await fetch('/__admin/docs/library', { method: 'POST', headers: requestHeaders, body: JSON.stringify(library) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not save library.');
      try { localStorage.removeItem(draftKey); } catch {}
      report('Project files saved. The collection is ready for review.');
    } catch (error) { report(error.message); }
  }));
  const exportButton = button('Export metadata JSON', () => { const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'docs-library.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  const importFile = input('file', 'import'); importFile.accept = 'application/json,.json';
  importFile.addEventListener('change', async () => { try { library = validateLibrary(JSON.parse(await importFile.files[0].text())); selectedId = library.items[0]?.id || ''; persistDraft(); onChange(library); refreshPicker(); load(); report('Imported to this browser draft. Save to project to update the local project files.'); } catch (error) { report(error.message); } });
  actions.append(exportButton, field('Import metadata JSON', importFile));
  root.selectDocument = id => { if (!library.items.some(item => item.id === id)) return; selectedId = id; refreshPicker(); load(); };
  refreshPicker(); load(); return root;
}
