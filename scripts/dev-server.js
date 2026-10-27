#!/usr/bin/env node
// Local dev server: static files + /api/tutor through the real Vercel handler. Never serves private/.
// Usage: node scripts/dev-server.js [port]   (provider env vars as in TUTOR.md)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const handler = require('../api/tutor');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/tutor') return handler(req, res);
  if (url === '/api/solve') return require('../api/solve')(req, res);
  const rel = path.normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, '');
  if (/^[/\\](private|api|scripts|test|\.git)([/\\]|$)/.test(rel)) { res.statusCode = 404; return res.end('Not found'); }
  fs.readFile(path.join(root, rel), (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', types[path.extname(rel)] || 'application/octet-stream');
    res.end(buf);
  });
}).listen(Number(process.argv[2]) || 8787, () => console.log('LearnScroll dev server on http://localhost:' + (Number(process.argv[2]) || 8787)));
