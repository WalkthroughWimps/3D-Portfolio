import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(workspace, 'output', 'glb-accessibility-blender');
const port = Number(process.env.GLB_PREVIEW_PORT || 8882);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.blend': 'application/octet-stream' };
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const routes = [['/models/', 'glb'], ['/controls/', 'controls'], ['/files/', ''], ['/previews/', 'previews'], ['/preview/', 'preview'], ['/originals/', 'originals']];
    let relative = 'preview/index.html';
    let allowedRoot = root;
    if (pathname === '/models/tester-cube.glb' || pathname === '/files/about-accessibility.blend') {
      allowedRoot = path.join(workspace, 'assets', 'about-cube');
      relative = pathname === '/models/tester-cube.glb'
        ? path.join('glb', 'Old .glb', 'output', 'glb-accessibility-blender', 'glb', 'tester-cube.glb')
        : path.join('blend', 'Old .blend', 'output', 'glb-accessibility-blender', 'about-accessibility.blend');
    } else if (pathname !== '/') {
      const route = routes.find(([prefix]) => pathname.startsWith(prefix));
      if (!route) throw new Error('Unknown route');
      if (route[1] === 'originals') {
        allowedRoot = path.join(workspace, 'assets', 'glb');
        relative = pathname.slice(route[0].length);
      } else relative = path.join(route[1], pathname.slice(route[0].length) || 'index.html');
    }
    const file = path.resolve(allowedRoot, relative);
    if (!file.startsWith(`${allowedRoot}${path.sep}`)) throw new Error('Invalid path');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(file);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Preview file not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`GLB candidate preview: http://127.0.0.1:${port}/`));
