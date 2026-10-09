const http = require('http');
const https = require('https');
const dns = require('dns');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || process.env.WEB_PORT || 3000);
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

function lookup(hostname, options, callback){
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err || !addresses || !addresses.length) return callback(err || new Error('not found'));
    const v4 = addresses.filter(item => item.family === 4);
    const chosen = v4.length ? v4 : addresses;
    if (options && options.all) return callback(null, chosen);
    callback(null, chosen[0].address, chosen[0].family);
  });
}

function proxy(req, res){
  const target = new URL(req.url, apiOrigin);
  const headers = Object.assign({}, req.headers, {
    host: target.host,
    'x-forwarded-host': req.headers['x-forwarded-host'] || req.headers.host || '',
    'x-forwarded-proto': req.headers['x-forwarded-proto'] || (process.env.RAILWAY_ENVIRONMENT ? 'https' : 'http')
  });
  const transport = target.protocol === 'https:' ? https : http;
  const upstream = transport.request(target, { method: req.method, headers, lookup }, upstreamRes => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', err => {
    console.error('proxy', err.code || err.message, target.hostname, target.port);
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
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' };
    if (rel === 'index.html' || rel === 'sw.js') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    res.end(body);
  });
}

http.createServer(serve).listen(port, '0.0.0.0', () => {
  let origin = 'invalid';
  try {
    const parsed = new URL(apiOrigin);
    origin = parsed.protocol + '//' + parsed.hostname + ':' + (parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
  } catch (err) {}
  console.log('Web listening on 0.0.0.0:' + port + ' api ' + origin);
});
