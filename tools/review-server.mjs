import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const host = '127.0.0.1';
const port = Number.parseInt(process.env.REVIEW_PORT || '8878', 10);
const root = process.cwd();
const rootPrefix = `${path.resolve(root).toLowerCase()}${path.sep}`;

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.opus', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.woff2', 'font/woff2']
]);

function sendText(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

async function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl || '/', `http://${host}:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filePath = path.resolve(root, `.${pathname}`);
  const normalized = filePath.toLowerCase();
  if (normalized !== path.resolve(root).toLowerCase() && !normalized.startsWith(rootPrefix)) {
    return null;
  }
  const fileStat = await stat(filePath);
  return fileStat.isDirectory()
    ? { filePath: path.join(filePath, 'index.html'), fileStat: await stat(path.join(filePath, 'index.html')) }
    : { filePath, fileStat };
}

const server = http.createServer(async (request, response) => {
  if (request.url === '/__admin/video-filter') {
    if (request.method !== 'POST') { sendText(response, 405, 'POST required'); return; }
    if (request.headers.origin !== `http://${host}:${port}` && request.headers.origin !== `http://localhost:${port}`) {
      sendText(response, 403, 'Local same-origin requests only'); return;
    }
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 2048) { sendText(response, 413, 'Settings too large'); return; }
      }
      const input = JSON.parse(body);
      const settings = {};
      const ranges = { brightness: [0.5, 1.5], contrast: [0.5, 1.5], saturation: [0, 2], hue: [-180, 180], sepia: [0, 1] };
      for (const key of Object.keys(ranges)) {
        if (input[key] === undefined && (key === 'hue' || key === 'sepia')) input[key] = 0;
        if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < ranges[key][0] || input[key] > ranges[key][1]) {
          sendText(response, 400, 'Invalid filter settings'); return;
        }
        settings[key] = input[key];
      }
      const destination = path.join(root, 'data/video-filter.json');
      await writeFile(`${destination}.tmp`, `${JSON.stringify(settings, null, 2)}\n`);
      await rename(`${destination}.tmp`, destination);
      sendText(response, 200, 'Saved');
    } catch { sendText(response, 400, 'Unable to save filter settings'); }
    return;
  }
  let resolved;
  try {
    resolved = await resolveRequestPath(request.url);
  } catch {
    sendText(response, 404, 'Not found');
    return;
  }
  if (!resolved) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  const { filePath, fileStat } = resolved;
  if (path.extname(filePath) === '.html' && request.method === 'GET') {
    let html = await readFile(filePath, 'utf8');
    // Admin UI exists only in the local server response, never in public HTML.
    html = html.replace('</body>', '<script type="module" src="/tools/local-admin/video-filter.mjs"></script></body>');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
    return;
  }
  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
  };
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = fileStat.size - 1;
  let status = 200;
  if (range) {
    start = range[1] ? Number(range[1]) : start;
    end = range[2] ? Number(range[2]) : end;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= fileStat.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${fileStat.size}` });
      response.end();
      return;
    }
    end = Math.min(end, fileStat.size - 1);
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${fileStat.size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  response.writeHead(status, headers);
  const stream = createReadStream(filePath, { start, end });
  stream.on('error', () => {
    if (!response.headersSent) sendText(response, 503, 'Unable to read file');
    else response.destroy();
  });
  stream.pipe(response);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing review server first.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Review server: http://${host}:${port}/?review=1&mode=visuals`);
  console.log('Press Ctrl+C to stop.');
});
