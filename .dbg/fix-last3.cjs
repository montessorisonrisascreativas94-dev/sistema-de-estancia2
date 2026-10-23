const fs = require('fs');

const f = 'c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/modules/routine.js';
let content = fs.readFileSync(f, 'utf8');

// Buscar contexto exacto de los 3 corruptos
const pattern = /(emoji|icon): '([^']{0,20})'/g;
let m;
const bad = [];
while ((m = pattern.exec(content)) !== null) {
  const val = m[2];
  const hasBad = [...val].some(c => {
    const cp = c.codePointAt(0);
    return cp === 0x2013 || cp === 0xFFFD || (cp < 0x20 && cp !== 0x09 && cp !== 0x0A && cp !== 0x0D);
  });
  if (hasBad) {
    const ctx = content.substring(m.index - 30, m.index + 120);
    bad.push({ match: m[0], index: m.index, ctx: ctx.replace(/\n/g, '↵') });
  }
}

bad.forEach((b, i) => {
  console.log(`\n[${i+1}] ${b.match}`);
  console.log(`    ctx: ${b.ctx.substring(0, 150)}`);
});

// Ahora reparar los 3
// Basado en el output anterior, el contexto es:
// "durmió', icon: '–x–' }, { val:"
// Esto es dentro de NAP_STATUS_OPTIONS o similar

// Reparación directa por contexto de línea
const lines = content.split('\n');
const fixed_lines = lines.map(line => {
  // Si la línea tiene un icon/emoji corrupto con –x–
  if (!line.includes('–x') && !line.includes('\u2013x')) return line;
  
  // Línea de estado de nap: '{ val: ..., icon: '–x–' }'
  // Tratar de identificar por val o label en la misma línea
  if (line.includes("'poco'") || line.includes('"poco"')) {
    return line.replace(/icon: '[^']+'/, "icon: '🍽️'");
  }
  if (line.includes("'nada'") || line.includes('"nada"')) {
    return line.replace(/icon: '[^']+'/, "icon: '❌'");
  }
  if (line.includes("durmió") || line.includes('durmio') || line.includes("'bien'")) {
    return line.replace(/icon: '[^']+'/, "icon: '😴'");
  }
  if (line.includes("Se despertó") || line.includes('despertó')) {
    return line.replace(/icon: '[^']+'/, "icon: '⏰'");
  }
  // Cualquier –x– suelto en icon/emoji = fallback ❓ 
  // pero solo si es claramente corrupto (pattern –x– sin emoji real)
  return line.replace(/((?:emoji|icon): ')[–\u2013][xa-z0-9\u0014-\u001f\u2013\uFFFD]{0,10}'/, (m, pre) => {
    // Verificar que no haya emoji real
    for (const c of m) {
      if (c.codePointAt(0) > 0x2100) return m; // Ya tiene emoji real
    }
    return `${pre}❓'`;
  });
});

const fixedContent = fixed_lines.join('\n');

// Contar restantes
const remaining = (fixedContent.match(/(emoji|icon): '([^']{0,20})'/g) || []).filter(m2 => {
  return [...m2].some(c => {
    const cp = c.codePointAt(0);
    return cp === 0x2013 || cp === 0xFFFD;
  });
}).length;

fs.writeFileSync(f, fixedContent, 'utf8');
console.log(`\nrestantes: ${remaining}`);
if (remaining === 0) console.log('✅ routine.js completamente limpio');
