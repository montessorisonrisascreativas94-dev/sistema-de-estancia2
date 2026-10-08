// Clases usadas en el markup generado por JS vs karpus-tailwind.css
const fs = require('fs');
const path = require('path');

const tw = fs.readFileSync('css/karpus-tailwind.css', 'utf8');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (cls) => new RegExp(reEsc('.' + cls) + '(?![a-zA-Z0-9_-])').test(tw);

// solo clases con cara de utilidad Tailwind
const looksTW = (c) => /^(text|p[xylrtb]?|m[xylrtb]?|gap|grid|flex|w|h|min-w|max-w|min-h|max-h|rounded|border|shadow|bg|font|leading|tracking|space|top|left|right|bottom|z|overflow|whitespace|items|justify|self|col-span|row-span|hidden|block|inline|absolute|relative|fixed|sticky|pointer-events|cursor|transition|duration|ease|transform|scale|translate|opacity|divide|ring|outline|object|aspect|basis|grow|shrink|order|text-align|uppercase|lowercase|capitalize|italic|underline|line-through|select|resize|appearance|backdrop|filter|blur|brightness|contrast|decoration|list|align|content|place|snap|touch|will-change|sr-only)([-:]|$)/.test(c);

function filesOf(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesOf(p));
    else if (/\.js$/.test(e.name) && !/\.min\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const args = process.argv.slice(2);
const roots = args.length ? args : ['js/directora', 'js/shared'];

const missing = new Map(); // clase -> [archivos]
let total = 0;
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const files = fs.statSync(root).isDirectory() ? filesOf(root) : [root];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const classes = new Set();
    for (const m of src.matchAll(/class="([^"]+)"/g)) {
      m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    }
    for (const m of src.matchAll(/classList\.(?:add|toggle|remove)\(([^)]*)\)/g)) {
      for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) q[1].split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    }
    for (const c of classes) {
      if (!looksTW(c)) continue;
      total++;
      if (!has(c)) {
        if (!missing.has(c)) missing.set(c, []);
        if (!missing.get(c).includes(f)) missing.get(c).push(f);
      }
    }
  }
}

console.log(`clases-TW usadas: ${total} | FALTANTES en karpus-tailwind.css: ${missing.size}\n`);
for (const [cls, files] of [...missing].sort()) {
  console.log(`  ${cls.padEnd(28)} ${files.join(', ')}`);
}
