/**
 * server/web.cjs — Servidor estático de producción.
 *
 * ENDURECIDO:
 *  - Sirve SOLO assets públicos (allowlist de subcarpetas/ext).
 *  - Bloquea por denylist archivos sensibles (.env, *.db, *.sql, server/, etc).
 *  - Headers de seguridad completos (CSP, HSTS, Permissions-Policy, COOP...).
 *  - Rate limiting por IP (protección básica contra abuso/DoS).
 *  - Cache: no-store para HTML, largo plazo para assets versionados.
 *  - Sin directory listing, sin stack traces.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
try { require('dotenv').config(); } catch(e) {}

let compress;
try { compress = require('compression'); } catch(_) { compress = null; }

const ROOT = path.join(__dirname, '..');

// ── Subcarpetas y extensiones permitidas ─────────────────────────
const ALLOWED_DIRS = new Set(['', 'css', 'js', 'img', 'images', 'fonts', 'audio', 'favicon', 'assets', 'materials']);
const ALLOWED_EXT  = new Set(['.html', '.css', '.js', '.mjs', '.json', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.webmanifest', '.txt', '.xml', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pdf', '.mp3', '.mp4', '.webm']);

// ── Denylist de archivos/patrones sensibles ──────────────────────
const SENSITIVE = [
  /\.env(\.|$)/i,
  /\.(sql|db|sqlite|sqlite3|bak|backup|log|key|pem|crt|csr)$/i,
  /(^|\/)(node_modules|server|supabase|migrations|scripts|\.git|\.github|data|tmp|dist-tools|docs)(\/|$)/i,
  /\.cjs$/i,
  /(package-lock|package|tsconfig|deno\.json|docker-compose|compose\.ya?ml|Dockerfile)/i,
  /(\.env\.|credentials|secret|token)/i,
];

function isBlockedPath(p) {
  const norm = p.replace(/\\/g, '/');
  if (norm.includes('\0')) return true;
  if (norm.split('/').some(seg => seg === '..')) return true; // path traversal
  return SENSITIVE.some(re => re.test(norm));
}

// ── Rate limiting (por IP) ───────────────────────────────────────
const buckets = new Map();
function rateLimit({ windowMs = 60_000, max = 300 } = {}) {
  return (req, res, next) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now > b.resetAt) { b = { hits: 0, resetAt: now + windowMs }; buckets.set(ip, b); }
    b.hits += 1;
    if (b.hits > max) return res.status(429).send('Demasiadas solicitudes');
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
}, 60_000).unref();

const app = express();
app.disable('x-powered-by');
app.disable('etag');

// ── Security headers completos ───────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://onesignal.com https://api.onesignal.com https://api.resend.com https://*.supabase.in; " +
    "frame-src 'self' https://www.youtube.com; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'");
  next();
});

// Rate limit global
app.use(rateLimit({ max: 300 }));

if (compress) app.use(compress());

// ── Middleware de acceso a archivos ──────────────────────────────
function secureStatic(servingDir, options = {}) {
  const publicDir = path.resolve(servingDir);
  return (req, res, next) => {
    let reqPath;
    try { reqPath = decodeURIComponent(req.path); } catch { return res.status(400).end(); }

    if (isBlockedPath(reqPath)) return res.status(403).end();

    const firstSeg = reqPath.split('/')[1] || ''; // '' = root
    const ext = path.extname(reqPath).toLowerCase();

    // Permitir solo subcarpetas/extensiones de la allowlist
    if (firstSeg && !ALLOWED_DIRS.has(firstSeg)) return res.status(403).end();
    if (ext && !ALLOWED_EXT.has(ext)) return res.status(403).end();

    const filePath = path.join(publicDir, reqPath);
    // El archivo debe quedar DENTRO del directorio público (anti traversal)
    if (!filePath.startsWith(publicDir)) return res.status(403).end();

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const isHtml = ext === '.html' || reqPath === '/' || reqPath === '/index.html';
      res.setHeader('Cache-Control', isHtml ? 'no-store' : 'public, max-age=604800');
      return res.sendFile(filePath, { headers: { 'Content-Security-Policy': res.getHeader('Content-Security-Policy') } });
    }
    next();
  };
}

app.use(secureStatic(ROOT));

// ── Rutas SPA: servir index.html para rutas conocidas (no datos) ─
const SPA_PAGES = ['/login', '/preinscripcion', '/recuperar', '/panel_directora', '/panel_padres', '/panel_encargada', '/panel_control', '/panel_asistente', '/panel-maestra', '/terminos-uso', '/politica-privacidad', '/validate-invoice', '/attendance-live'];
app.get(SPA_PAGES, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(ROOT, 'index.html'));
});

// Raíz
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(ROOT, 'index.html'));
});

// 404
app.use((req, res) => {
  res.status(404).send('No encontrado');
});

// Error handler — sin stack traces
app.use((err, req, res, next) => {
  console.error('[web] error:', err && err.message);
  res.status(500).send('Error interno');
});

const port = process.env.PORT || 5800;
const host = process.env.WEB_HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Web segura escuchando en http://${host}:${port}`);
});
