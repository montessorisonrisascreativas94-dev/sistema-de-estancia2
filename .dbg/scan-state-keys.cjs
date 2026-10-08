// Escanea AppState.set('x') vs claves declaradas en cada inicializacion.
const fs = require('fs');
const path = require('path');

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.dbg') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.js$/.test(e.name) && !/\.min\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk('.');
const report = [];

for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  // claves declaradas en new SomeState({ ... })
  const declared = new Set();
  const declRe = /new\s+\w*AppState\(\s*\{([^}]*)\}/g;
  let dm;
  while ((dm = declRe.exec(t))) {
    for (const k of dm[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) declared.add(k[1]);
  }
  // set('key'
  const setRe = /\.set\(\s*['"]([A-Za-z_$][\w$]*)['"]/g;
  let sm;
  const dropped = new Set();
  while ((sm = setRe.exec(t))) {
    const key = sm[1];
    if (declared.size && !declared.has(key)) dropped.add(key);
  }
  if (declared.size) {
    report.push({
      file: f,
      declared: [...declared],
      dropped: [...dropped]
    });
  }
}

for (const r of report) {
  console.log(`\n=== ${r.file}\n  declaradas: ${r.declared.join(', ')}`);
  if (r.dropped.length) console.log(`  ⚠ DROPPED (set inutilizado): ${r.dropped.join(', ')}`);
}
