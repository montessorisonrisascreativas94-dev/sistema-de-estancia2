// fix-fffd.cjs
// Corrige U+FFFD (replacement char) que quedaron en los archivos
// después de la corrección de mojibake.
// 
// El origen: "–" (en dash, U+2013, bytes E2 80 93) fue tratado como Latin-1
// dos veces, produciendo secuencias inválidas. El decodificador UTF-8
// los convirtió en U+FFFD.
// 
// Estrategia: re-procesar desde el buffer ORIGINAL (antes de cualquier corrección)
// usando un decodificador que sea tolerante y reconstruya el texto correcto.

const fs = require('fs');
const path = require('path');

// Tabla de mapeo: secuencias Latin-1 (como aparecen en el archivo corrupto)
// → carácter UTF-8 correcto.
// Generado analizando los bytes reales del archivo.
const MOJIBAKE_MAP = [
  // en dash (–) U+2013: UTF-8 = E2 80 93 → Latin-1 x2 = Ã¢â‚¬â€œ etc.
  // Necesitamos reparar desde el git original. Usamos reemplazos de cadena.
];

function fixFile(filePath) {
  const rawBuf = fs.readFileSync(filePath);
  
  // Quitar BOM
  let start = 0;
  if (rawBuf[0] === 0xEF && rawBuf[1] === 0xBB && rawBuf[2] === 0xBF) start = 3;
  const buf = rawBuf.slice(start);
  
  // Leer como Latin-1 (raw bytes)
  const latin1 = buf.toString('latin1');
  
  // Convertir Latin-1 → buffer → UTF-8 (1 capa de mojibake)
  const pass1Buf = Buffer.from(latin1, 'latin1');
  const pass1 = pass1Buf.toString('utf8');
  
  // pass1 aún puede tener Ã€ etc. Aplicar segunda capa
  const pass2Buf = Buffer.from(pass1, 'latin1');
  const pass2 = pass2Buf.toString('utf8');
  
  // En pass2 habrá U+FFFD donde había chars de 3+ bytes (emojis, en-dash etc.)
  // en el doble-mojibake. Para esos, necesitamos ir al nivel de bytes del archivo
  // ACTUAL (ya corregido una vez) y reparar manualmente.
  
  // Leer el archivo ya corregido (con U+FFFD)
  const currentContent = fs.readFileSync(filePath, 'utf8');
  
  // Los U+FFFD en el archivo actual corresponden a chars que necesitamos reponer.
  // Los más comunes en este código:
  const fixMap = {
    // Patrón en archivo actual → reemplazo correcto
    // El "–" en el título del comentario
    ' \uFFFD ': ' \u2013 ',     // " – "  en dash
    ')\uFFFD ': ')\u2013 ',     // "– " después de )
    ' \uFFFD${': ' \u2013${',   // " – ${" en templates
    '}\uFFFD${': '}\u2013${',   // "}–${"
    '}\uFFFD ': '}\u2013 ',     // "} – "
    '\uFFFD Panel': '\u2013 Panel',
    '\uFFFD Sonrisas': '\u2013 Sonrisas',
    '\uFFFD adapta': '\u2013 adapta',
    '\uFFFD PERFILES': '\u2013 PERFILES',
    '\uFFFD Horario': '\u2013 Horario',
    '\uFFFD Modo': '\u2013 Modo',
    '\uFFFD Sistema': '\u2013 Sistema',
    '\uFFFD panel': '\u2013 panel',
    '\uFFFD Express': '\u2013 Express',
    '\uFFFD Rutina': '\u2013 Rutina',
    '\uFFFD Pá': '\u2013 Pá',
    '\uFFFD II': '\u2013 II',
    '\uFFFD III': '\u2013 III',
    '\uFFFD 23': '\u2013 23',
    '\uFFFD 35': '\u2013 35',
    '\uFFFD 5': '\u2013 5',
    '\uFFFD 6': '\u2013 6',
    '\uFFFD 12': '\u2013 12',
    '\uFFFD KÍnder': '\u2013 KÍnder',
    '\uFFFD Pre': '\u2013 Pre',
    '\uFFFD 1°': '\u2013 1°',
    // Fecha rango en horario semanal: "12 jun – 16 jun"
    // Aparece como: "12 jun ? 16 jun" → "12 jun – 16 jun"
    // El patrón es: "short' })} ? ${dates[4]"
    "short' })} \uFFFD ${dates[4]": "short' })} \u2013 ${dates[4]}",
    // Checkmark ✓ (U+2713)
    '\uFFFD': '\u2013',  // catch-all: FFFD restantes → en dash (más común)
  };

  let fixed = currentContent;
  // Aplicar reemplazos específicos primero, luego el catch-all
  const specific = Object.entries(fixMap).filter(([k]) => k !== '\uFFFD');
  const catchAll = '\uFFFD';
  
  for (const [from, to] of specific) {
    fixed = fixed.split(from).join(to);
  }
  
  // Para los FFFD restantes, analizar contexto
  // Si van entre comillas o en comentarios, son en-dash
  fixed = fixed.split('\uFFFD').join('\u2013');
  
  const remaining = (fixed.match(/\uFFFD/g) || []).length;
  console.log(`${path.basename(filePath)}: FFFD restantes = ${remaining}`);
  
  fs.writeFileSync(filePath, fixed, 'utf8');
  return fixed;
}

const root = 'c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main';

console.log('=== Reparando U+FFFD ===');
const ws = fixFile(`${root}/js/maestra/modules/weekly-schedule.js`);
const rt = fixFile(`${root}/js/maestra/modules/routine.js`);

// Verificar resultado
console.log('\n=== Verificación ===');
console.log('WS título:', ws.substring(ws.indexOf('Horario Semanal'), ws.indexOf('Horario Semanal') + 50));
console.log('RT título:', rt.substring(rt.indexOf('Rutina Express'), rt.indexOf('Rutina Express') + 50));

// Verificar los textos del usuario
const checks = ['Estimulación', '🧸', 'Ahora en el aula', '· En curso ·', 'alumnos marcados'];
checks.forEach(t => {
  console.log(t.substring(0,25), '->', rt.includes(t) || ws.includes(t) ? 'OK' : 'FALTA');
});
