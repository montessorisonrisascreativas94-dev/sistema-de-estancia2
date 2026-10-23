const fs = require('fs');
const rt = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/modules/routine.js', 'utf8');

// Buscar todos los patrones emoji/icon con contenido sospechoso
const pattern = /(emoji|icon): '([^']{0,20})'/g;
let m;
while ((m = pattern.exec(rt)) !== null) {
  const val = m[2];
  const hasBad = [...val].some(c => {
    const cp = c.codePointAt(0);
    return cp === 0x2013 || cp === 0xFFFD;
  });
  if (hasBad) {
    // Obtener contexto
    const ctx = rt.substring(m.index - 5, m.index + 80);
    console.log('CORRUPTO:', JSON.stringify(val), '| ctx:', ctx.replace(/\n/g, ' ').substring(0, 100));
  }
}
