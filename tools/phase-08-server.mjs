// Static artifact preview: no diagnostic injection, admin endpoint, or publication.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.webm':'video/webm','.mp4':'video/mp4','.mp3':'audio/mpeg','.opus':'audio/ogg','.wav':'audio/wav','.woff2':'font/woff2','.pdf':'application/pdf'};
export function createStaticServer({root, base = '/'}) {
  const absoluteRoot = path.resolve(root);
  if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('Base must begin and end with /.');
  return http.createServer(async (request, response) => {
    try {
      if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const host = new URL(`http://${request.headers.host || ''}`).hostname;
      if (!['127.0.0.1','localhost','[::1]'].includes(host)) { response.writeHead(403); response.end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(base)) { response.writeHead(404); response.end(); return; }
      const relative = pathname.slice(base.length) || 'index.html';
      if (relative.replaceAll('\\','/').split('/').some(segment=>segment.startsWith('.'))) { response.writeHead(403); response.end(); return; }
      const file = path.resolve(absoluteRoot, relative.endsWith('/') ? `${relative}index.html` : relative);
      const within = path.relative(absoluteRoot, file);
      if (within.startsWith('..') || path.isAbsolute(within)) { response.writeHead(403); response.end(); return; }
      const actualRoot = await fs.realpath(absoluteRoot), actualFile = await fs.realpath(file);
      const realWithin = path.relative(actualRoot,actualFile);
      if (realWithin.startsWith('..') || path.isAbsolute(realWithin)) { response.writeHead(403); response.end(); return; }
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw new Error('Not a file');
      let start = 0, end = stat.size - 1, status = 200;
      const headers = {'Content-Type':types[path.extname(file).toLowerCase()] || 'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!range || (!range[1] && !range[2])) { response.writeHead(416,{'Content-Range':`bytes */${stat.size}`}); response.end(); return; }
        start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
        end = range[1] && range[2] ? Math.min(Number(range[2]),end) : end;
        if (start > end || start >= stat.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) { response.writeHead(416,{'Content-Range':`bytes */${stat.size}`}); response.end(); return; }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = Math.max(0,end - start + 1);
      response.writeHead(status,headers);
      if (request.method === 'HEAD' || stat.size === 0) response.end();
      else createReadStream(file,{start,end}).on('error',()=>response.destroy()).pipe(response);
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.env.SITE_ROOT || 'output/phase-08/artifact/site';
  const server = createStaticServer({root,base:process.env.SITE_BASE || '/'});
  const port = Number(process.env.SITE_PORT || 8879);
  server.listen(port,'127.0.0.1',()=>console.log(`Static preview http://127.0.0.1:${port}${process.env.SITE_BASE || '/'} (${root})`));
}
