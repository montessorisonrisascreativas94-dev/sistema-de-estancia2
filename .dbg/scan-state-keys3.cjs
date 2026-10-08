// Claves declaradas por panel (new X({...}), factory return {...}, export const X={...})
// vs claves usadas en .set('k') dentro del panel.
const fs = require('fs');
const path = require('path');

const panels = ['maestra', 'directora', 'encargada', 'asistente', 'padre'];

function walk(d, out = []) {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.js$/.test(e.name) && !/\.min\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

function keysInObjectLiteral(src) {
  const keys = new Set();
  let depth = 0, start = -1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0 && start >= 0) { /*bloque completo*/ } }
  }
  // simple: claves de nivel 1 dentro del primer objeto literal completo
  const m = src.match(/\{([\s\S]*)\}/);
  if (!m) return keys;
  const body = m[1];
  let d = 0;
  let buf = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    if (d === 0) buf += c;
    else if (d === 1) buf += c;
  }
  // parser simple de nivel 1
  let cur = '', lvl = 0;
  const parts = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if ('([{'.includes(c)) lvl++;
    if (')]}'.includes(c)) lvl--;
    if (c === ',' && lvl === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  for (const p of parts) {
    const km = p.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
    if (km) keys.add(km[1]);
  }
  return keys;
}

const summary = [];
for (const panel of panels) {
  const dir = path.join('js', panel);
  const stateFiles = walk(dir).filter(f => /state\.js$|appState\.js$|app-state\.js$/i.test(f));
  const declared = new Set();
  const declaredFrom = {};
  for (const sf of stateFiles) {
    const t = fs.readFileSync(sf, 'utf8');
    const blocks = [];
    for (const m of t.matchAll(/new\s+\w+\(\s*(\{[\s\S]*?\})\s*[,)]/g)) blocks.push(m[1]);
    for (const m of t.matchAll(/return\s+(\{[\s\S]*?\n\s*\})\s*;/g)) blocks.push(m[1]);
    for (const m of t.matchAll(/export\s+const\s+\w+\s*=\s*(\{[\s\S]*?\n\s*\})\s*;/g)) blocks.push(m[1]);
    for (const b of blocks) {
      for (const k of keysInObjectLiteral(b)) { declared.add(k); declaredFrom[k] = sf; }
    }
  }
  const used = new Map();
  for (const f of walk(dir)) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/\.set\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) {
      if (!used.has(m[1])) used.set(m[1], f);
    }
  }
  const dropped = [...used.keys()].filter(k => !declared.has(k)).sort();
  summary.push({ panel, declared: [...declared].sort(), dropped, uses: used });
  console.log(`\n=== ${panel}  [declaradas: ${declared.size}] ${stateFiles.join(', ')}`);
  if (dropped.length) {
    console.log('  ⚠ SETS SILENCIOSAMENTE DESCARTADOS:');
    for (const k of dropped) console.log(`    - '${k}'  -> usado en ${used.get(k)}`);
  } else console.log('  ok');
}
