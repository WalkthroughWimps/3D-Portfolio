import {readdir, lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const ARTWORK_RELATIVE = '_1-about/faces/about/assets/artwork';
export const ARTWORK_CATALOG_URL = `/${ARTWORK_RELATIVE}/index.json`;
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif)$/i;

/** Read only direct image files from the dedicated About artwork folder. */
export async function collectAboutArtwork(root) {
  const directory = path.join(root, ARTWORK_RELATIVE);
  const names = await readdir(directory);
  const files = [];
  for (const name of names) {
    if (name.startsWith('.') || !IMAGE_EXTENSION.test(name)) continue;
    const file = await lstat(path.join(directory, name));
    if (!file.isFile() || file.isSymbolicLink()) continue;
    const digest = createHash('sha256').update(name).digest('hex').slice(0, 20);
    files.push({id: `folder_${digest}`, name, revision: Math.max(1, Math.floor(file.mtimeMs)), bytes: file.size});
  }
  files.sort((a, b) => a.name.localeCompare(b.name, 'en', {numeric: true, sensitivity: 'base'})
    || a.name.localeCompare(b.name));
  return {version: 1, files};
}
