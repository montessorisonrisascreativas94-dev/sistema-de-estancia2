// Por panel: claves declaradas en su state.js vs claves usadas en .set('k')
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

for (const panel of panels) {
  const dir = path.join('js', panel);
  const stateFiles = walk(dir).filter(f => /state\.js$|appState\.js$|app-state\.js$/i.test(f));
  const declared = new Set();
  for (const sf of stateFiles) {
    const t = fs.readFileSync(sf, 'utf8');
    // bloques tipo { a: null, b: [] } dentro de new X(...) o new SafeAppState({...})
    for (const m of t.matchAll(/new\s+\w+\(\s*\{([\s\S]*?)\}\s*[,)]/g)) {
      for (const k of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) declared.add(k[1]);
    }
    // tambien el estado plano exportado
    for (const m of t.matchAll(/export\s+(?:const|let|var)\s+\w+\s*=\s*\{([\s\S]*?)\};/g)) {
      for (const k of m[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) declared.add(k[1]);
    }
  }

  const used = new Map();
  for (const f of walk(dir)) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/\.set\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) {
      if (!used.has(m[1])) used.set(m[1], f);
    }
  }

  const dropped = [...used.keys()].filter(k => !declared.has(k));
  console.log(`\n=== ${panel}  declaradas[${declared.size}]: ${[...declared].join(', ')}`);
  if (dropped.length) {
    console.log('  ⚠ SETS DESCARTADOS:');
    for (const k of dropped) console.log(`    - '${k}'  (en ${used.get(k)})`);
  } else {
    console.log('  ok: todos los set() estan declarados');
  }
}
