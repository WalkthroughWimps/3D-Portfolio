import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
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
