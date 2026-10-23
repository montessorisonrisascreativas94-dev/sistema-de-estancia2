const fs = require('fs');
const f = 'c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/modules/routine.js';
let content = fs.readFileSync(f, 'utf8');

// Reparar los últimos corruptos directamente
// [1] { id: 'sleep', label: 'Durmiendo', icon: 'CORRUPTO' }
content = content.replace(
  /label: 'Durmiendo', icon: '[^']+'/,
  "label: 'Durmiendo', icon: '😴'"
);
// [2] { val: 'si', label: 'Dormido', icon: 'CORRUPTO' }
content = content.replace(
  /val: 'si', label: 'Dormido', icon: '[^']+'/,
  "val: 'si', label: 'Dormido', icon: '😴'"
);
// Por si acaso: cualquier icono con –xܴ (emoji corrupto de 😴 Zzz)
content = content.replace(/icon: '[–\u2013][x][ܴ]'/g, "icon: '😴'");
// Cualquier emoji corrupto residual → ❓
content = content.replace(/((?:emoji|icon): ')[–\u2013][^']{0,10}'/g, (m, pre) => {
  for (const c of m) {
    if (c.codePointAt(0) > 0x2100) return m;
  }
  return `${pre}❓'`;
});

const remaining = (content.match(/(emoji|icon): '([^']{0,20})'/g) || []).filter(m => {
  return [...m].some(c => c.codePointAt(0) === 0x2013 || c.codePointAt(0) === 0xFFFD);
}).length;

fs.writeFileSync(f, content, 'utf8');
console.log('Restantes:', remaining);
if (remaining === 0) console.log('✅ LIMPIO');
