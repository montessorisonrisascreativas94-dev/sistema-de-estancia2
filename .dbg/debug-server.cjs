const http = require('http');
const fs   = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  return i + 1 < args.length ? args[i + 1] : (def !== undefined ? def : true);
};
const sessionId = getArg('session');
if (!sessionId) { console.error('Missing --session'); process.exit(1); }

let port   = parseInt(getArg('port', '7777'), 10);
const outdir   = path.resolve(getArg('outdir', '.dbg'));
const clean    = getArg('clean', false) !== false;
const idle     = parseInt(getArg('idle', '0'), 10) * 1000;
const remote   = getArg('remote', false) !== false;
const host     = remote ? '0.0.0.0' : '127.0.0.1';

if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });

const logFile = path.join(outdir, `trae-debug-log-${sessionId}.ndjson`);
const envFile = path.join(outdir, `${sessionId}.env`);

if (clean && fs.existsSync(logFile)) fs.truncateSync(logFile, 0);

const ndjsonWrite = (obj) => {
  if (!('ts' in obj)) obj.ts = Date.now();
  fs.appendFileSync(logFile, JSON.stringify(obj) + '\n');
};

let lastActivity = Date.now();
setInterval(() => {
  if (idle > 0 && Date.now() - lastActivity > idle) {
    process.exit(0);
  }
}, 5000);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'text/plain'
};

const server = http.createServer((req, res) => {
  lastActivity = Date.now();
  let pathname = '/';
  try { pathname = new URL(req.url, `http://${req.headers.host}`).pathname; } catch {}

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); return res.end();
  }

  if (req.method === 'POST' && pathname === '/event') {
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end', () => {
      try {
        const ev = JSON.parse(body || '{}');
        ndjsonWrite(ev);
        res.writeHead(200, CORS); res.end('ok');
      } catch (e) {
        res.writeHead(400, CORS); res.end('bad json');
      }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    let count = 0;
    try { count = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length : 0; } catch {}
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime_ms: Date.now() - startedAt, events: count }));
    return;
  }

  if (req.method === 'GET' && pathname === '/logs') {
    let lines = [];
    try { if (fs.existsSync(logFile)) lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean); } catch {}
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/x-ndjson' });
    res.end(lines.join('\n'));
    return;
  }

  if (req.method === 'DELETE' && pathname === '/logs') {
    try { if (fs.existsSync(logFile)) fs.truncateSync(logFile, 0); } catch {}
    res.writeHead(200, CORS); res.end('cleared');
    return;
  }

  res.writeHead(404, CORS); res.end('not found');
});

const tryListen = (p, retries) => {
  if (retries <= 0) { console.error('Ports exhausted'); process.exit(2); }
  const srv = server.listen(p, host, () => {
    const actualPort = srv.address().port;
    const apiUrl = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}/event`;
    fs.writeFileSync(envFile,
      `DEBUG_SERVER_URL=${apiUrl}\nDEBUG_SESSION_ID=${sessionId}\n`);
    const info = {
      api_url: apiUrl, session_id: sessionId,
      log_dir: outdir,
      log_file: logFile,
      env_file: envFile
    };
    process.stdout.write(`@@DEBUG_SERVER_INFO\n${JSON.stringify(info, null, 2)}\n@@END_DEBUG_SERVER_INFO\n`);
    process.stdout.write(`[debug-server] running on ${apiUrl}\n`);
  }).on('error', (e) => {
    if (e.code === 'EADDRINUSE') tryListen(p + 1, retries - 1);
    else { console.error(e); process.exit(3); }
  });
};

const startedAt = Date.now();
tryListen(port, 10);
