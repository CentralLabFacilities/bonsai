import { createServer } from 'http';
import * as httpModule from 'http';
import * as httpsModule from 'https';
import { extname } from 'path';
import assets from '../target/embedded-assets.js';

const apiTarget = process.env.API_TARGET || 'http://localhost:8080';
const PORT = parseInt(process.env.PORT || '3000', 10);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function serveStatic(req, res) {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = '/index.html';

  const content = assets[pathname];
  if (content !== undefined) {
    const ext = extname(pathname);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(Buffer.from(content, 'base64'));
  } else if (['.js', '.css', '.json', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2', '.ttf'].includes(extname(pathname))) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } else {
    const index = assets['/index.html'];
    if (index) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(Buffer.from(index, 'base64'));
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  }
}

const http = apiTarget ? (apiTarget.startsWith('https:') ? httpsModule : httpModule) : null;

const server = createServer((req, res) => {
  if (http && req.url.startsWith('/api')) {
    const targetUrl = new URL(req.url, apiTarget);
    targetUrl.pathname = targetUrl.pathname.replace(/^\/api/, '') || '/';

    const proxyUrl = new URL(targetUrl.href);
    const isHttps = proxyUrl.protocol === 'https:';
    const mod = isHttps ? httpsModule : httpModule;

    const proxyReq = mod.request({
      hostname: proxyUrl.hostname,
      port: proxyUrl.port || (isHttps ? 443 : 80),
      path: proxyUrl.pathname + proxyUrl.search,
      method: req.method,
      headers: { ...req.headers, host: proxyUrl.host },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    });

    req.pipe(proxyReq);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Serving ${Object.keys(assets).length} embedded assets`);
  if (apiTarget) {
    console.log(`API proxy target: ${apiTarget}`);
  }
  console.log(`Listening on http://localhost:${PORT}`);
});
