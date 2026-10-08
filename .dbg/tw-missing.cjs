// ¿Qué clases usan el JS/HTML del panel y NO existen en karpus-tailwind.css?
const fs = require('fs');
const path = require('path');

const tw = fs.readFileSync('css/karpus-tailwind.css', 'utf8');

function has(cls) {
  const esc = '.' + cls.replace(/[^a-zA-Z0-9_-]/g, (m) => '\\' + m);
  let i = tw.indexOf(esc);
  while (i >= 0) {
    const after = tw[i + esc.length];
    if (!after || !/[a-zA-Z0-9_-]/.test(after)) return true;
    i = tw.indexOf(esc, i + 1);
  }
  return false;
}

const looksTW = (c) => /^(text|p[xylrtb]?|m[xylrtb]?|gap|grid|flex|w|h|min-|max-|rounded|border|shadow|bg|font|leading|tracking|space|top|left|right|bottom|z-|overflow|whitespace|items|justify|self|col-|row-|hidden|block|inline|absolute|relative|fixed|sticky|pointer|cursor|transition|duration|ease|transform|scale|translate|opacity|divide|ring|outline|object|aspect|basis|grow|shrink|order|uppercase|lowercase|capitalize|italic|underline|select|resize|appearance|backdrop|filter|blur|decoration|list-|align|content|place|snap|touch|sr-only|font-)([-:]|$)/.test(c);

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
  for (const m of src.matchAll(/class="([^"]+)"/g)) {
    m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean).forEach(c => set.add(c));
  }
  for (const m of src.matchAll(/classList\.(?:add|toggle|remove)\(([^)]*)\)/g)) {
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) q[1].split(/\s+/).filter(Boolean).forEach(c => set.add(c));
  }
  return set;
}

const roots = process.argv.slice(2);
const missing = new Map();
let total = 0;
for (const root of roots) {
  const files = fs.existsSync(root) && fs.statSync(root).isDirectory() ? filesOf(root) : [root];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    for (const c of classesIn(fs.readFileSync(f, 'utf8'))) {
      if (!looksTW(c)) continue;
      total++;
      if (!has(c)) {
        if (!missing.has(c)) missing.set(c, new Set());
        missing.get(c).add(f);
      }
    }
  }
}
console.log(`clases-TW usadas: ${total} | FALTANTES: ${missing.size}`);
for (const [cls, files] of [...missing].sort()) console.log(`  ${cls.padEnd(26)} ${[...files].join(', ')}`);
