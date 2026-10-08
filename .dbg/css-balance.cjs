// 1) Balance de llaves en TODOS los CSS del panel directora (+ inline del HTML)
// 2) Balance del SA_CSS inyectado por school-activities.module.js
const fs = require('fs');

function balance(css, label) {
  let depth = 0, min = 0, inC = false;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (inC) { if (c === '*' && css[i + 1] === '/') { inC = false; i++; } continue; }
    if (c === '/' && css[i + 1] === '*') { inC = true; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth < min) min = depth; }
  }
  const ok = depth === 0 && min >= 0;
  console.log(`  ${ok ? 'OK  ' : 'BADE'} ${label}  (final=${depth}, min=${min})`);
  return ok;
}

const files = ['css/theme.css','css/layout.css','css/karpus-modern.css','css/karpus-tailwind.css',
  'css/premium-mobile.css','css/wall-social.css','css/directora-containers.css','css/school-center.css',
  'css/student-record-modal.css','css/messenger-chat.css','css/supervision.css'];
console.log('== CSS archivos');
for (const f of files) if (fs.existsSync(f)) balance(fs.readFileSync(f, 'utf8'), f);

console.log('== inline panel_directora.html');
const html = fs.readFileSync('panel_directora.html', 'utf8');
[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].forEach((m, i) => balance(m[1], `style#${i}`));

console.log('== SA_CSS (school-activities.module.js)');
const src = fs.readFileSync('js/shared/school-activities.module.js', 'utf8');
const at = src.indexOf('const SA_CSS');
const open = src.indexOf('`', at);
let end = -1;
for (let i = open + 1; i < src.length; i++) {
  if (src[i] === '\\') { i++; continue; }
  if (src[i] === '`') { end = i; break; }
}
const sa = src.slice(open + 1, end).replace(/\$\{[^}]*\}/g, 'VAR');
balance(sa, 'SA_CSS');
console.log('   longitud:', sa.length);
