// fix-encoding.cjs — Corrige mojibake en archivos JS del panel maestra
// El problema: los archivos son UTF-8 pero contienen secuencias de bytes
// que corresponden a UTF-8 reinterpretado como Latin-1 luego re-codificado.
// Solución: re-decodificar cada byte como Latin-1 y luego leer como UTF-8.

const fs = require('fs');
const path = require('path');

function fixMojibake(content) {
  // Los caracteres corruptos ocurren porque bytes UTF-8 fueron interpretados
  // como Latin-1 (ISO-8859-1) y luego re-codificados a UTF-8.
  // Para revertir: tomar cada código de carácter < 256, escribir el byte,
  // y re-decodificar como UTF-8.
  
  // Construir buffer de bytes Latin-1
  const bytes = [];
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code < 256) {
      bytes.push(code);
    } else {
      // Carácter ya correcto (código > 255 = ya es Unicode real)
      // Re-codificar como UTF-8
      const enc = Buffer.from(content[i], 'utf8');
      for (const b of enc) bytes.push(b);
    }
  }
  
  return Buffer.from(bytes).toString('utf8');
}

const root = path.resolve(__dirname, '..');
const targets = [
  'js/maestra/modules/weekly-schedule.js',
  'js/maestra/modules/routine.js.bak',
];

for (const rel of targets) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (no existe): ${rel}`);
    continue;
  }
  
  // Leer como binario
  const rawBuf = fs.readFileSync(filePath);
  
  // Quitar BOM si existe
  let start = 0;
  if (rawBuf[0] === 0xEF && rawBuf[1] === 0xBB && rawBuf[2] === 0xBF) {
    start = 3;
  }
  
  // El contenido tiene secuencias mojibake: bytes UTF-8 leídos como Latin-1
  // Revertir: leer el buffer como Latin-1 string, luego re-interpretar como UTF-8
  const latin1String = rawBuf.slice(start).toString('latin1');
  
  // Convertir de vuelta: cada char code es un byte
  const recoveredBuf = Buffer.from(latin1String, 'latin1');
  
  // Ahora decodificar como UTF-8 real
  const fixed = recoveredBuf.toString('utf8');
  
  // Verificar que no hay mojibake obvio
  const badCount = (fixed.match(/Ã|â€|Â·|ðŸ/g) || []).length;
  
  // Guardar sin BOM
  fs.writeFileSync(filePath, fixed, 'utf8');
  console.log(`OK: ${rel} | mojibake restante aprox: ${badCount}`);
  
  // Mostrar primeros 200 chars para verificar
  console.log('  Muestra:', fixed.substring(0, 150).replace(/\n/g, ' '));
  console.log();
}
