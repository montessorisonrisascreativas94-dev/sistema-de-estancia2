// Clases usadas (HTML estático + JS de directora + módulos shared)
// vs TODO el CSS que carga panel_directora (archivos + <style> inline + SA_CSS).
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('panel_directora.html', 'utf8');
const cssFiles = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m => m[1]);
const cssParts = [];
for (const f of cssFiles) if (fs.existsSync(f)) cssParts.push({ f, css: fs.readFileSync(f, 'utf8') });
[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].forEach((m, i) => cssParts.push({ f: `inline#${i}`, css: m[1] }));
// estilos que inyecta JS (SA_CSS)
const sa = fs.readFileSync('js/shared/school-activities.module.js', 'utf8');
const at = sa.indexOf('const SA_CSS'); const o = sa.indexOf('`', at);
let e = -1; for (let i = o + 1; i < sa.length; i++) { if (sa[i] === '\\') { i++; continue; } if (sa[i] === '`') { e = i; break; } }
if (e > 0) cssParts.push({ f: 'SA_CSS', css: sa.slice(o + 1, e) });
const ALLCSS = cssParts.map(x => x.css).join('\n');
console.log('CSS considerado:', cssParts.map(x => x.f).join(', '));

function hasIn(cls) {
  const esc = '.' + cls.replace(/[^a-zA-Z0-9_-]/g, (m) => '\\' + m);
  let i = ALLCSS.indexOf(esc);
  while (i >= 0) {
    const after = ALLCSS[i + esc.length];
    if (!after || !/[a-zA-Z0-9_-]/.test(after)) return true;
    i = ALLCSS.indexOf(esc, i + 1);
  }
  return false;
}

function filesOf(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesOf(p));
    else if (/\.js$/.test(e.name) && !/\.min\.js$/.test(e.name)) out.push(p);
  }
  return out;
}
function classesIn(src) {
  const set = new Set();
  for (const m of src.matchAll(/class="([^"]+)"/g))
    m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean).forEach(c => set.add(c));
  for (const m of src.matchAll(/classList\.(?:add|toggle|remove)\(([^)]*)\)/g))
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) q[1].split(/\s+/).filter(Boolean).forEach(c => set.add(c));
  return set;
}

const where = new Map();
const add = (set, src) => set.forEach(c => { if (!where.has(c)) where.set(c, new Set()); where.get(c).add(src); });
add(classesIn(html), 'HTML');
for (const f of [...filesOf('js/directora'), 'js/shared/school-activities.module.js', 'js/shared/school-center.module.js', 'js/shared/student-record-modal.js']) {
  if (fs.existsSync(f)) add(classesIn(fs.readFileSync(f, 'utf8')), f);
}

const undef = [];
for (const [cls, srcs] of where) {
  if (cls.includes('${') || cls.includes('[') && cls.includes('*')) continue;
  if (!hasIn(cls)) undef.push({ cls, srcs: [...srcs] });
}
undef.sort((a, b) => a.cls.localeCompare(b.cls));
console.log(`\nclasses usadas: ${where.size} | SIN DEFINIR en CSS cargado: ${undef.length}\n`);
for (const u of undef) console.log(`  ${u.cls.padEnd(30)} ${u.srcs.join(', ')}`);
