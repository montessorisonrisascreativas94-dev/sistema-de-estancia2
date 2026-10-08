// Extractor lineal de reglas CSS (sin backtracking) con 'button' en el selector.
const fs = require('fs');

const targets = [
  'css/theme.css', 'css/layout.css', 'css/karpus-modern.css',
  'css/directora-containers.css', 'css/school-center.css',
  'css/premium-mobile.css', 'css/karpus-tailwind.css'
];

function rulesOf(css, name) {
  const out = [];
  let sel = '', depth = 0, inComment = false, i = 0;
  let bufSel = '';
  while (i < css.length) {
    const c = css[i];
    if (inComment) { if (c === '*' && css[i + 1] === '/') { inComment = false; i += 2; continue; } i++; continue; }
    if (c === '/' && css[i + 1] === '*') { inComment = true; i += 2; continue; }
    if (depth === 0) {
      if (c === '{') { bufSel = sel; sel = ''; depth = 1; i++; continue; }
      if (c === '}') { sel = ''; i++; continue; }
      sel += c; i++; continue;
    }
    // dentro de bloque
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        out.push({ sel: bufSel.replace(/\s+/g, ' ').trim(), body: arguments[0] });
      }
      i++; continue;
    }
    i++;
  }
  return out;
}

// rehacer con captura del cuerpo
function parse(css) {
  const res = [];
  let sel = '', body = '', depth = 0, inComment = false, i = 0;
  while (i < css.length) {
    const c = css[i];
    if (inComment) { if (c === '*' && css[i + 1] === '/') { inComment = false; i += 2; continue; } i++; continue; }
    if (depth === 0) {
      if (c === '/' && css[i + 1] === '*') { inComment = true; i += 2; continue; }
      if (c === '{') { depth = 1; body = ''; i++; continue; }
      if (c === '}') { sel = ''; i++; continue; }
      sel += c; i++; continue;
    }
    if (c === '/' && css[i + 1] === '*') { inComment = true; i += 2; continue; }
    if (c === '{') { depth++; if (depth === 1) body = ''; i++; continue; }
    if (c === '}') { depth--; if (depth === 0) { res.push({ sel: sel.replace(/\s+/g, ' ').trim(), body: body.replace(/\s+/g, ' ').trim() }); sel = ''; } i++; continue; }
    if (depth === 1) body += c;
    i++;
  }
  return res;
}

const html = fs.readFileSync('panel_directora.html', 'utf8');
const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const sources = [...targets.filter(t => fs.existsSync(t)).map(t => ({ name: t, css: fs.readFileSync(t, 'utf8') })),
  { name: 'panel_directora.html#inline', css: inline }];

for (const { name, css } of sources) {
  const rs = parse(css).filter(r => /(^|[^\w-])button([^\w-]|$)/i.test(r.sel));
  if (!rs.length) continue;
  console.log('\n=== ' + name);
  for (const r of rs) console.log('  ' + r.sel + ' { ' + r.body.slice(0, 260) + ' }');
}
