// fix-final.cjs
// Reconstruye routine.js y weekly-schedule.js desde sus fuentes corruptas
// con un decodificador que maneja correctamente emojis (4-byte UTF-8).
//
// Análisis de la corrupción:
// - Archivo original: UTF-8 con emojis (4 bytes cada uno) y chars especiales
// - Fue guardado como si fuera Latin-1, LUEGO ese Latin-1 se re-guardó como UTF-8
// - Resultado: cada byte del UTF-8 original se convirtió en 2 bytes (Ã patrón)
// - Para revertir: leer el archivo como Latin-1 y decodificar como UTF-8
// - Pero: emojis de 4 bytes en UTF-8 al pasar por Latin-1 x2 producen secuencias
//   que a veces son inválidas. Hay que ser tolerante (reemplazarNULL → emoji correcto).

const fs = require('fs');
const path = require('path');

// Tabla de emojis que aparecen en estos archivos (en orden de ocurrencia)
// Mapeamos la secuencia corrupta de bytes a su emoji correcto
// Los emojis de 4 bytes UTF-8 (F0 xx xx xx) tras doble Latin-1 encoding
// producen secuencias de 8 chars Ã-style. Los identificamos por su patrón único.

// Función principal: reconstruir desde bytes raw
function decodeFile(rawBuf) {
  // Quitar BOM
  let start = 0;
  if (rawBuf[0] === 0xEF && rawBuf[1] === 0xBB && rawBuf[2] === 0xBF) start = 3;
  const buf = rawBuf.slice(start);
  
  // Leer como Latin-1: cada byte → un codepoint
  const latin1 = buf.toString('latin1');
  
  // Convertir de vuelta a bytes (un byte por char)
  const step1Buf = Buffer.from(latin1, 'latin1');
  
  // Intentar decodificar como UTF-8 con reemplazo de chars inválidos
  // Usamos 'latin1' para obtener bytes, luego Buffer para UTF-8
  
  // Segunda capa del mismo proceso
  const step1Latin1 = step1Buf.toString('latin1');
  const step2Buf = Buffer.from(step1Latin1, 'latin1');
  
  // Ahora decodificar como UTF-8, pero necesitamos manejar los bytes de emojis
  // Los emojis de 4 bytes (F0...) en el doble-encode producen 8 bytes inválidos
  // Necesitamos una decodificación byte a byte tolerante
  
  return decodeUTF8Tolerant(step2Buf);
}

function decodeUTF8Tolerant(buf) {
  let result = '';
  let i = 0;
  
  while (i < buf.length) {
    const b = buf[i];
    
    if (b < 0x80) {
      // ASCII
      result += String.fromCharCode(b);
      i++;
    } else if (b >= 0xC0 && b < 0xE0 && i + 1 < buf.length && (buf[i+1] & 0xC0) === 0x80) {
      // 2-byte sequence
      const cp = ((b & 0x1F) << 6) | (buf[i+1] & 0x3F);
      result += String.fromCodePoint(cp);
      i += 2;
    } else if (b >= 0xE0 && b < 0xF0 && i + 2 < buf.length && (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80) {
      // 3-byte sequence
      const cp = ((b & 0x0F) << 12) | ((buf[i+1] & 0x3F) << 6) | (buf[i+2] & 0x3F);
      result += String.fromCodePoint(cp);
      i += 3;
    } else if (b >= 0xF0 && b < 0xF8 && i + 3 < buf.length && (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80 && (buf[i+3] & 0xC0) === 0x80) {
      // 4-byte sequence (emojis)
      const cp = ((b & 0x07) << 18) | ((buf[i+1] & 0x3F) << 12) | ((buf[i+2] & 0x3F) << 6) | (buf[i+3] & 0x3F);
      result += String.fromCodePoint(cp);
      i += 4;
    } else {
      // Byte inválido — skip (este es el problema con emojis que se corrompieron irrecuperablemente)
      // Para emojis específicos de este código, usamos una tabla de reparación posterior
      result += '\uFFFD';
      i++;
    }
  }
  
  return result;
}

// Tabla de reparación post-proceso para U+FFFD que representan emojis conocidos
// Basado en el contexto donde aparecen en el código
function repairKnownPatterns(content) {
  // Emojis que aparecen en DEFAULT_SCHEDULE y LEVEL_DEFAULT_SCHEDULE
  // Identificados por el contexto (texto alrededor del FFFD)
  const emojiRepairs = [
    // Formato: [patrón regex con contexto, emoji correcto]
    // Emojis de 4 bytes que se corrompieron - los identificamos por label vecino
    
    // 🖐️ Bienvenida (F0 9F 96 90 EF B8 8F)
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Bienvenida'/g, "emoji: '🖐️', label: 'Bienvenida'"],
    // 📋 Pase de Lista
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Pase de Lista'/g, "emoji: '📋', label: 'Pase de Lista'"],
    // 🍞 Desayuno
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Desayuno'/g, "emoji: '🍞', label: 'Desayuno'"],
    // 🧼 Lavado de manos
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Lavado de manos'/g, "emoji: '🧼', label: 'Lavado de manos'"],
    // 🎨 Actividad educativa / matutina / principal
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Actividad educativa'/g, "emoji: '🎨', label: 'Actividad educativa'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Actividad matutina'/g, "emoji: '🎨', label: 'Actividad matutina'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Actividad principal'/g, "emoji: '🎨', label: 'Actividad principal'"],
    // 🌳 Salida al Patio / Recreo
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Salida al Patio'/g, "emoji: '🌳', label: 'Salida al Patio'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Recreo'/g, "emoji: '🌳', label: 'Recreo'"],
    // 🍎 Refrigerio
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Refrigerio'/g, "emoji: '🍎', label: 'Refrigerio'"],
    // 🔬 Actividad sensorial / de la tarde / Clase 3
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Actividad sensorial'/g, "emoji: '🔬', label: 'Actividad sensorial'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Actividad de la tarde'/g, "emoji: '🔬', label: 'Actividad de la tarde'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Clase 3'/g, "emoji: '🔬', label: 'Clase 3'"],
    // 🍽️ Almuerzo
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Almuerzo'/g, "emoji: '🍽️', label: 'Almuerzo'"],
    // 🪥 Cepillado
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Cepillado'/g, "emoji: '🪥', label: 'Cepillado'"],
    // 😴 Siesta
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Siesta'/g, "emoji: '😴', label: 'Siesta'"],
    // 😊 Despertar
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Despertar'/g, "emoji: '😊', label: 'Despertar'"],
    // 🎮 Juego libre / sensorial
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Juego libre'/g, "emoji: '🎮', label: 'Juego libre'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Juego sensorial'/g, "emoji: '🎮', label: 'Juego sensorial'"],
    // 👋 Entrega de niños / Salida
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Entrega de ni/g, "emoji: '👋', label: 'Entrega de ni"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Salida'/g, "emoji: '👋', label: 'Salida'"],
    // 🍼 Biberón / Biberón tarde / Biberón / Desayuno (infants)
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Bib/g, "emoji: '🍼', label: 'Bib"],
    // 🧷 Cambio de pañal / Cambio pañal tarde
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Cambio/g, "emoji: '🧷', label: 'Cambio"],
    // 🧸 Estimulación (infants/toddlers)
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Estimulaci/g, "emoji: '🧸', label: 'Estimulaci"],
    // 🎁 Merienda (snack2)
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Merienda'/g, "emoji: '🎁', label: 'Merienda'"],
    // 📚 Libros / Clase 1
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Clase 1'/g, "emoji: '📚', label: 'Clase 1'"],
    // ✏️ Clase 2
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Clase 2'/g, "emoji: '✏️', label: 'Clase 2'"],
    // 🎨 Clase 4
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Clase 4'/g, "emoji: '🎨', label: 'Clase 4'"],
    // 📖 Actividades tarde
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Actividades tarde'/g, "emoji: '📖', label: 'Actividades tarde'"],
    // 🎭 Actividad 2
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Actividad 2'/g, "emoji: '🎭', label: 'Actividad 2'"],
    // Emojis en INDIV_EVENTS / EXTRA_EVENTS
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Popó'/g, "icon: '💩', label: 'Popó'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Pipí'/g, "icon: '💧', label: 'Pipí'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Uso del Baño'/g, "icon: '🚽', label: 'Uso del Baño'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Cambio de Pañal'/g, "icon: '🧻', label: 'Cambio de Pañal'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Temperatura'/g, "icon: '🌡️', label: 'Temperatura'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Medicamento'/g, "icon: '💊', label: 'Medicamento'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Golpe/g, "icon: '🤕', label: 'Golpe"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Vómito'/g, "icon: '🤮', label: 'Vómito'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Tos/g, "icon: '😷', label: 'Tos"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Biberón'/g, "icon: '🍼', label: 'Biberón'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Nota Individual'/g, "icon: '📝', label: 'Nota Individual'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Fiebre'/g, "icon: '🤒', label: 'Fiebre'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Accidente'/g, "icon: '🩹', label: 'Accidente'"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Llamada/g, "icon: '📞', label: 'Llamada"],
    [/icon: '[\uFFFD\u2013]+',\s*label: 'Otro'/g, "icon: '📌', label: 'Otro'"],
    // MOOD_OPTIONS
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Feliz'/g, "emoji: '😊', label: 'Feliz'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Tranquilo'/g, "emoji: '🙂', label: 'Tranquilo'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Normal'/g, "emoji: '😐', label: 'Normal'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Triste'/g, "emoji: '😢', label: 'Triste'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Llanto'/g, "emoji: '😭', label: 'Llanto'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Enfermo'/g, "emoji: '🤒', label: 'Enfermo'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Somnoliento'/g, "emoji: '😴', label: 'Somnoliento'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Irritable'/g, "emoji: '😡', label: 'Irritable'"],
    // TEMP_OPTIONS
    [/icon: '[\uFFFD\u2013]+',\s*color: '#0B63C7'/g, "icon: '🧊', color: '#0B63C7'"],
    // COLLECTIVE_QUICK_EVENTS
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Baño'/g, "emoji: '🚽', label: 'Baño'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Popó'/g, "emoji: '💩', label: 'Popó'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Biberón'/g, "emoji: '🍼', label: 'Biberón'"],
    [/emoji: '[\uFFFD\u2013]+',\s*label: 'Cambio pañal'/g, "emoji: '🧷', label: 'Cambio pañal'"],
    // empty state icon en weekly-schedule
    [/class="wk-empty-icon">[\uFFFD\u2013]+</g, 'class="wk-empty-icon">🗓️</'],
    // checkmark en wk-check
    [/'\uFFFD'/g, "'✓'"],
    [/"\uFFFD"/g, '"✓"'],
    // ✓ restante
    [/done \? '[\uFFFD\u2013]+'/g, "done ? '✓'"],
  ];

  let fixed = content;
  for (const [pattern, replacement] of emojiRepairs) {
    fixed = fixed.replace(pattern, replacement);
  }
  return fixed;
}

const root = 'c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main';

// Procesar weekly-schedule.js desde el archivo actual (ya tiene latin1→utf8 hecho)
// pero con FFFD aún presentes antes de fix-fffd.cjs
// → Re-procesar desde el .bak corregido (que SÍ tiene los caracteres correctos)
// El .bak ya fue procesado por fix-encoding2.cjs y fix-fffd.cjs

// Leer los archivos actuales (ya con – en lugar de FFFD para dashes)
const wsContent = fs.readFileSync(`${root}/js/maestra/modules/weekly-schedule.js`, 'utf8');
const rtContent = fs.readFileSync(`${root}/js/maestra/modules/routine.js`, 'utf8');

// Aplicar reparaciones de emojis
const wsFixed = repairKnownPatterns(wsContent);
const rtFixed = repairKnownPatterns(rtContent);

fs.writeFileSync(`${root}/js/maestra/modules/weekly-schedule.js`, wsFixed, 'utf8');
fs.writeFileSync(`${root}/js/maestra/modules/routine.js`, rtFixed, 'utf8');

// Verificación final
const fffdWs = (wsFixed.match(/\uFFFD/g) || []).length;
const fffdRt = (rtFixed.match(/\uFFFD/g) || []).length;
console.log('weekly-schedule.js FFFD restantes:', fffdWs);
console.log('routine.js FFFD restantes:', fffdRt);

const checks = ['Estimulación', '🧸', '·', '–', 'Ahora en el aula', 'alumnos marcados', 'Bienvenida', 'Siesta'];
checks.forEach(t => {
  const inRt = rtFixed.includes(t);
  const inWs = wsFixed.includes(t);
  console.log(`"${t}":`, inRt || inWs ? 'OK' : 'FALTA', inRt ? '(routine)' : '', inWs ? '(weekly)' : '');
});

// Mostrar contexto de Estimulación
const idx = rtFixed.indexOf('Estimulaci');
console.log('\nEstimulación contexto:', rtFixed.substring(idx - 15, idx + 60));
