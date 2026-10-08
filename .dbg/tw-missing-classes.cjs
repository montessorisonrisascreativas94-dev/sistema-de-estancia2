// ¿Qué clases usan los <button> del panel directora y faltan en karpus-tailwind.css?
const fs = require('fs');
const tw = fs.readFileSync('css/karpus-tailwind.css', 'utf8');
const html = fs.readFileSync('panel_directora.html', 'utf8');

const esc = (c) => c.replace(/[^a-zA-Z0-9_-]/g, (m) => '\\' + m);

function hasClass(cls) {
  const needle = '.' + esc(cls);
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-zA-Z0-9_-])');
  return re.test(tw);
}

// 1) botones del HTML estático
const btns = [...html.matchAll(/<button[^>]*class="([^"]+)"/g)].map(m => m[1]);
const all = new Set();
for (const b of btns) b.split(/\s+/).filter(Boolean).forEach(c => all.add(c));

const missing = [...all].filter(c => !hasClass(c));
console.log(`botones estaticos: ${btns.length} | clases unicas: ${all.size} | faltantes: ${missing.length}`);
console.log('  faltantes:', missing.join(' ') || 'ninguna');

// 2) todas las clases del HTML vs tailwind (no solo botones) — para ver el alcance
const every = new Set();
for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => every.add(c));
const miss2 = [...every].filter(c => !hasClass(c));
console.log(`\ntodas las clases del HTML: ${every.size} | faltantes en karpus-tailwind: ${miss2.length}`);
console.log('  ' + miss2.join(' '));

// 3) ¿existe la capa preflight de button?
const idx = tw.indexOf('button');
console.log('\n"button" aparece', (tw.match(/button/g) || []).length, 'veces en karpus-tailwind.css');
