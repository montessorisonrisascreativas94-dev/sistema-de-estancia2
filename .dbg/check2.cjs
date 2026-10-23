const fs = require('fs');
const ws = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/modules/weekly-schedule.js', 'utf8');

// Encontrar el char después de "Horario Semanal "
const idx = ws.indexOf('Horario Semanal ');
const charAfter = ws.charCodeAt(idx + 16);
console.log('Char después de "Horario Semanal ":', charAfter.toString(16), '=', ws[idx + 16]);
// U+2013 = 8211 = en dash –
// U+2014 = 8212 = em dash —
// U+00E2 = corrupto

// Verificar línea 118 – el separador entre fechas
const l118 = ws.split('\n')[117];
for(let i = 0; i < l118.length; i++) {
  const code = l118.charCodeAt(i);
  if(code > 127) {
    console.log(`pos ${i}: U+${code.toString(16).toUpperCase().padStart(4,'0')} = "${l118[i]}"`);
  }
}
