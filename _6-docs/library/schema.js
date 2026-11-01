export const DEFAULT_PRESENTATION = {
  id: 'pretty-pets', type: 'presentation', title: 'Pretty Pets',
  description: '1st Grade Unit 3 Week 1 · Do you have a pet? · 31 slides',
  sourceUrl: 'https://1drv.ms/p/c/f747edb114afa405/IQTs_qJa-ZktSI1UUDdAu1tzAZL9weST4VV5sw633AkWFzU?wdAr=1.7777777777777777',
  previewUrl: './assets/pretty-pets-cover.png', width: 0.297, height: 0.167063,
  x: 0.35, z: -0.59, rotation: -8, scale: 1
};
const allowedEmbedHosts = host => host === '1drv.ms' || host === 'onedrive.live.com' || host.endsWith('.officeapps.live.com') || host.endsWith('.sharepoint.com');
export function presentationUrl(input) {
  let source = String(input || '').trim();
  if (source.startsWith('<')) {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    source = doc.querySelector('iframe')?.getAttribute('src') || '';
  }
  const url = new URL(source);
  if (url.protocol !== 'https:' || !allowedEmbedHosts(url.hostname.toLowerCase())) throw new Error('Use an HTTPS Microsoft OneDrive or PowerPoint presentation link.');
  return url.href;
}
const localAsset = value => typeof value === 'string' && /^\.\/documents\/[a-z0-9-]+\.(pdf|png|jpe?g|webp|docx|pptx|xlsx|odt|odp|ods|rtf|txt|md)$/i.test(value);
const previewAsset = value => typeof value === 'string' && (/^\.\/assets\/[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(value) || /^\.\/documents\/[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(value));
export function validateLibrary(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.items) || input.items.length > 100) throw new Error('Invalid document library.');
  const ids = new Set();
  return { version: 1, items: input.items.map(item => {
    if (!item || !/^[a-z0-9-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('Invalid or duplicate document ID.');
    ids.add(item.id);
    if (!['pdf', 'image', 'presentation', 'document'].includes(item.type)) throw new Error('Invalid document type.');
    const title = String(item.title || '').trim().slice(0, 120);
    if (!title) throw new Error('A document title is required.');
    const clean = { id: item.id, type: item.type, title, description: String(item.description || '').trim().slice(0, 500) };
    if (item.type === 'presentation') clean.sourceUrl = presentationUrl(item.sourceUrl);
    else if (localAsset(item.sourceUrl)) clean.sourceUrl = item.sourceUrl;
    else throw new Error('PDFs and images must be uploaded to the local review server.');
    if (item.previewUrl) {
      if (!previewAsset(item.previewUrl)) throw new Error('Invalid cover image path.');
      clean.previewUrl = item.previewUrl;
    }
    if (item.type === 'pdf' && item.pageImages) {
      if (!Array.isArray(item.pageImages) || item.pageImages.length > 120 || !item.pageImages.every(value => /^\.\/documents\/[a-z0-9-]+-page-\d+\.jpg$/i.test(value))) throw new Error('Invalid PDF page images.');
      clean.pageImages = [...item.pageImages];
      if (!Number.isInteger(item.pageCount) || item.pageCount < clean.pageImages.length || item.pageCount > 100000) throw new Error('Invalid PDF page count.');
      clean.pageCount = item.pageCount;
      clean.coverFirst = item.coverFirst !== false;
    }
    const defaults = { width: item.type === 'presentation' ? .297 : .210, height: item.type === 'presentation' ? .167063 : .297, x: .32, z: -.65, rotation: 0, scale: 1 };
    for (const [key, fallback] of Object.entries(defaults)) {
      const n = Number(item[key] ?? fallback);
      const limits = { width: [.08,.6], height: [.08,.6], x: [.07,1.32], z: [-1.1,-.07], rotation: [-180,180], scale: [.5,1.6] }[key];
      if (!Number.isFinite(n) || n < limits[0] || n > limits[1]) throw new Error(`Invalid ${key}.`);
      clean[key] = n;
    }
    return clean;
  }) };
}
