const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.WEB_PORT || 3000);
const apiOrigin = process.env.API_ORIGIN || 'http://127.0.0.1:3001';
const root = __dirname;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function proxy(req, res){
  const target = new URL(req.url, apiOrigin);
  const headers = Object.assign({}, req.headers, { host: target.host });
  const upstream = http.request(target, { method: req.method, headers }, upstreamRes => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', () => {
    if (res.headersSent) return;
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API unavailable' }));
  });
  req.pipe(upstream);
}

function serve(req, res){
  if (req.url.startsWith('/api/')) return proxy(req, res);
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
}

http.createServer(serve).listen(port, '127.0.0.1', () => {
  console.log('Web listening on http://127.0.0.1:' + port);
});
