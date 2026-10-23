// fix-encoding2.cjs
// Los archivos tienen DOBLE mojibake: bytes UTF-8 → Latin-1 → UTF-8 → Latin-1 → UTF-8
// Para revertir aplicamos la conversión latin1-buffer→utf8 DOS veces.

const fs = require('fs');
const path = require('path');

function decodeMojibake(content) {
  // Cada codepoint del string representa un byte (Latin-1)
  // Convertirlo a buffer real y leer como UTF-8
  const buf = Buffer.allocUnsafe(content.length);
  for (let i = 0; i < content.length; i++) {
    buf[i] = content.charCodeAt(i) & 0xFF;
  }
  return buf.toString('utf8');
}

function fixFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: ${filePath}`);
    return;
  }

  const rawBuf = fs.readFileSync(filePath);

  // Quitar BOM si existe
  let start = 0;
  if (rawBuf[0] === 0xEF && rawBuf[1] === 0xBB && rawBuf[2] === 0xBF) start = 3;

  // Leer el buffer como Latin-1 string (cada byte = un char)
  const latin1 = rawBuf.slice(start).toString('latin1');

  // Primer pase: revertir una capa de mojibake
  let pass1;
  try {
    pass1 = decodeMojibake(latin1);
  } catch(e) {
    console.log(`  Error pass1: ${e.message}`);
    return;
  }

  // Verificar si todavía hay mojibake (si hay chars > 127 con patrones Ã)
  const badAfterPass1 = (pass1.match(/Ã[¡-ÿ]|â€|Â[·¿¡°]/g) || []).length;
  console.log(`  Pass1 mojibake restante: ${badAfterPass1}`);

  let result = pass1;

  if (badAfterPass1 > 0) {
    // Segunda capa: el archivo tenía doble mojibake
    try {
      result = decodeMojibake(pass1);
    } catch(e) {
      console.log(`  Error pass2: ${e.message}, usando pass1`);
      result = pass1;
    }
  }

  const badFinal = (result.match(/Ã[¡-ÿ]|â€|Â[·¿¡°]/g) || []).length;
  console.log(`  Final mojibake: ${badFinal}`);
  console.log(`  Muestra: ${result.substring(0, 200).replace(/\n/g, ' ')}`);

  // Guardar sin BOM
  fs.writeFileSync(filePath, result, { encoding: 'utf8' });
  console.log(`  GUARDADO: ${path.basename(filePath)}\n`);
}

const root = path.resolve(__dirname, '..');

console.log('=== weekly-schedule.js ===');
fixFile(path.join(root, 'js/maestra/modules/weekly-schedule.js'));

console.log('=== routine.js.bak ===');
fixFile(path.join(root, 'js/maestra/modules/routine.js.bak'));
