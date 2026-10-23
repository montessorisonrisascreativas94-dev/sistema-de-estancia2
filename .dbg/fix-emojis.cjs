// fix-emojis.cjs — Repara todos los emojis corruptos en routine.js y weekly-schedule.js
// Los emojis quedaron como secuencias de –, x, números, etc. tras el doble mojibake.
// Los reparamos usando el contexto (label) para identificar el emoji correcto.

const fs = require('fs');

// Mapa completo label → emoji para todos los que aparecen en estos archivos
const LABEL_TO_EMOJI = {
  // DEFAULT_SCHEDULE / LEVEL_DEFAULT_SCHEDULE
  'Bienvenida':           '🖐️',
  'Pase de Lista':        '📋',
  'Desayuno':             '🍞',
  'Lavado de manos':      '🧼',
  'Actividad educativa':  '🎨',
  'Salida al Patio':      '🌳',
  'Refrigerio':           '🍎',
  'Actividad sensorial':  '🔬',
  'Almuerzo':             '🍽️',
  'Cepillado':            '🪥',
  'Siesta':               '😴',
  'Despertar':            '😊',
  'Merienda':             '🎁',
  'Juego libre':          '🎮',
  'Juego sensorial':      '🎮',
  'Entrega de niños':     '👋',
  // infants
  'Biberón / Desayuno':   '🍼',
  'Cambio de pañal':      '🧷',
  'Estimulación':         '🧸',
  'Biberón tarde':        '🍼',
  'Cambio pañal tarde':   '🧷',
  // toddlers
  'Estimulación':         '🧸',
  // preprimary
  'Actividad matutina':   '🎨',
  'Recreo':               '🌳',
  'Actividad de la tarde':'🔬',
  // primary
  'Clase 1':              '📚',
  'Clase 2':              '✏️',
  'Clase 3':              '🔬',
  'Clase 4':              '🎨',
  'Actividades tarde':    '📖',
  'Salida':               '👋',
  // special
  'Actividad principal':  '🎨',
  'Actividad 2':          '🎭',
  // INDIV_EVENTS
  'Popó':                 '💩',
  'Pipí':                 '💧',
  'Uso del Baño':         '🚽',
  'Cambio de Pañal':      '🧻',
  'Temperatura':          '🌡️',
  'Medicamento':          '💊',
  'Golpe / Caída':        '🤕',
  'Vómito':               '🤮',
  'Tos / Congestión':     '😷',
  'Biberón':              '🍼',
  'Nota Individual':      '📝',
  // EXTRA_EVENTS
  'Fiebre':               '🤒',
  'Accidente':            '🩹',
  'Llamada a padres':     '📞',
  'Otro':                 '📌',
  // MOOD_OPTIONS
  'Feliz':                '😊',
  'Tranquilo':            '🙂',
  'Normal':               '😐',
  'Triste':               '😢',
  'Llanto':               '😭',
  'Enfermo':              '🤒',
  'Somnoliento':          '😴',
  'Irritable':            '😡',
  // COLLECTIVE_QUICK_EVENTS
  'Baño':                 '🚽',
  'Cambio pañal':         '🧷',
  // WHOLE_CLASS_ROUTINES y otros
  'Baño completo':        '🛁',
  'Lavado de cara':       '🧼',
  'Cepillado dental':     '🪥',
  'Baño de esponja':      '🧽',
  'Uso del baño':         '🚽',
  'Peinado':              '💇',
  'Lavado de pies':       '🦶',
  'Higiene de uñas':      '💅',
  'Limpiar la nariz':     '🤧',
  'Lavado antes de comer':'🧼',
  'Cepillado tras comer': '🪥',
  'Losión y protección':  '🧴',
  'Hidratación':          '💧',
  'Fruta':                '🍊',
  'Papilla':              '🥣',
  'Sopa':                 '🍲',
  'Verduras':             '🥦',
  'Proteína':             '🍗',
  'Leche':                '🥛',
  'Agua':                 '💧',
  'Postre':               '🍮',
  'Estimulación temprana':'🧸',
  'Gateo':                '🐣',
  'Juegos sensoriales':   '🎯',
  'Juego simbólico':      '🎭',
  'Bloques':              '🧱',
  'Juego grupal':         '👫',
  'Abrazo grupal':        '🤗',
  'Identificar emociones':'😊',
  'Juego con pelota':     '⚽',
  'Coordinación':         '🎯',
  'Ejercicios':           '🏃',
  'Estimulación cognitiva':'🧠',
  'Experimento':          '🔬',
  'Expresión oral':       '🗣️',
  'Colorear':             '🖍️',
  'Arte':                 '🎨',
  'Música':               '🎵',
  'Lectura':              '📚',
  'Cuentacuentos':        '📖',
  'Juegos recreativos':   '🎡',
  'Deportes':             '⚽',
  'Lectura de cuento':    '📚',
  'Cantos y rimas':       '🎵',
  'Colores':              '🌈',
  'Números':              '🔢',
  'Letras':               '🔤',
  'Manualidad':           '✂️',
  'Pintura':              '🖌️',
  'Plastilina':           '🪆',
  'Rompecabezas':         '🧩',
  'Experimento sensorial':'🔬',
  'Clasificación':        '🗂️',
  'Figuras geométricas':  '📐',
  'Seriación':            '🔢',
  'Juego dirigido':       '🎯',
  'Juego de roles':       '🎭',
  'Muñecas':              '🪆',
  'Carritos':             '🚗',
  'Cocina de juguete':    '🍳',
  'Pelotas':              '⚽',
  'Escondite':            '🙈',
  'Casita de juego':      '🏠',
  'Rompecabezas de piso': '🧩',
  'Dominó gigante':       '🁣',
  'Ejercicios matutinos': '🏃',
  'Marcha':               '🚶',
  'Correr':               '🏃',
  'Saltar la cuerda':     '🪅',
  'Baile':                '💃',
  'Yoga infantil':        '🧘',
  'Equilibrio':           '⚖️',
  'Lanzar pelota':        '🎯',
  'Circuito motriz':      '🏃',
  'Escalada':             '🧗',
  'Rodar en colchoneta':  '🛹',
  'Preparar la siesta':   '🛏️',
  'Relajación':           '😌',
  'Masaje':               '💆',
  'Momento tranquilo':    '🤫',
  'Música relajante':     '🎵',
  'Ojos cerrados':        '😌',
  'Sacar las mantas':     '🛏️',
  'Bajar la luz':         '🌙',
  'Buenos días':          '🌅',
  'Saludar a los amigos': '👋',
  'Compartir materiales': '🤝',
  'Decir por favor y gracias': '🙏',
  'Pedir perdón':         '🙇',
  'Ayudar a un compañero':'🤝',
  'Hablar de la familia': '👨‍👩‍👧',
  'Repasar las normas':   '📋',
  'Ronda de conversación':'💬',
  'Juego al sol':         '☀️',
  'Aire fresco':          '🌿',
  'Esparcimiento':        '🌳',
  'Paseo de observación': '👀',
  'Contacto con la naturaleza': '🌱',
  'Observar insectos':    '🐛',
  'Mirar las nubes':      '☁️',
  'Tomar sol (vitamina D)':'☀️',
  'Observar la lluvia':   '🌧️',
  'Guardia en la veranda':'🏡',
  'Pintar con pincel':    '🖌️',
  'Pintar con las manos': '🖐️',
  'Dibujar':              '✏️',
  'Pegar y recortar':     '✂️',
  'Moldear plastilina':   '🪆',
  'Papel de colores':     '🎨',
  'Cantar':               '🎤',
  'Instrumentos de ritmo':'🥁',
  'Juego musical':        '🎵',
  'Danza':                '💃',
  'Títeres':              '🎭',
  'Percusión corporal':   '🥁',
  'Plegado de papel':     '📄',
  'Collage':              '🖼️',
  'Cuento con imágenes':  '📚',
  'Canción infantil':     '🎵',
  'Rondas y juegos de dedos': '🤲',
  'Láminas de palabras':  '🖼️',
  'Reconocer vocales':    '🔤',
  'Decir los nombres':    '🏷️',
  'Opuestos':             '↔️',
  'Responder preguntas':  '❓',
  'Cuento narrado':       '📖',
  'Sonidos de animales':  '🐾',
  'Poema y verso':        '📜',
  'Onomatopeyas':         '🔊',
  'Guardar juguetes':     '🧹',
  'Formar la fila':       '👣',
  'Lavarse antes de comer':'🧼',
  'Sentarse a la mesa':   '🪑',
  'Retirarse a descansar':'🛏️',
  // UI labels
  'Bit–cora Express':     '📓',
  'Horario Semanal':      '📅',
  'Nuevo evento':         '➕',
  'Pre-K–nder / K–nder':  '🎓',
  'Pre-Primario':         '📚',
  'Primaria':             '🏫',
  'Aula':                 '🏫',
  // Summary labels
  'Desayuno: ':           '🍞',
  'Almuerzo: ':           '🍽️',
  'Merienda: ':           '🎁',
  'Siesta: ':             '😴',
  'Nota: ':               '📝',
  'Actividad':            '🎨',
  'Sensorial':            '🔬',
  'Patio':                '🌳',
  'Lavado':               '🧼',
  'Nota':                 '📝',
  // Inline quick icons
  'Baño':                 '🚽',
  // TEMP_OPTIONS (identificados por color)
  // Solo ICON fields con context
  'Golpe/Caída':          '🤕',
  'Tos/Congestión':       '😷',
  'Lavado manos':         '🧼',
  'Cambio pañal':         '🧷',
  'Conducta':             '📋',
  // FOOD_ICONS
  'Todo':                 '✅',
  'Poco':                 '🍽️',
  'Nada':                 '❌',
  // SOCIAL_ICONS
  'Ayuda':                '🤝',
  'Compartió':            '🤝',
  'Jugó solo':            '🧍',
  'Grupo':                '👫',
  'Apoyo emocional':      '💝',
  'Atención':             '👁️',
  'Participó':            '🙋',
  'Curiosidad':           '🔍',
  'Terminó':              '✅',
  'Necesitó ayuda':       '🆘',
  'Controló':             '✋',
  'Se frustró':           '😤',
  'Lloró':                '😭',
  'Ansiedad':             '😰',
  'Se calmó':             '😌',
  'Manipulación':         '🖐️',
  // MOTOR_ICONS
  'Fina':                 '✌️',
  'Gruesa':               '💪',
  'Lenguaje':             '💬',
  'Concentración':        '🎯',
  'Autonomía':            '🌟',
  // Inline in summary cards
  'Duerme':               '😴',
  'Despertó':             '😊',
  // calendar tab labels
  'Pre-Kínder / Kínder':  '🎓',
};

// Patrón que identifica emojis corruptos: cualquier combinación de –, letras ASCII simples, números raros
// que NO son texto normal (aparecen entre comillas simples en emoji/icon field)
const CORRUPT_EMOJI_PATTERN = /(['"])((?:[–\u2013x\uFFFD]|[a-zA-Z0-9!@#$%^&*()[\]{}|;:',.<>?~`_=+\\/-]){1,12}(?:️)?)([\'"]),(\s*label:|\s*displayName:)/g;

function fixContent(content) {
  let fixed = content;
  
  // Reemplazar emojis corruptos usando el label como clave
  // Patrón: emoji: 'CORRUPTO', label: 'LABEL'
  // o:      icon: 'CORRUPTO', label: 'LABEL'
  
  // Construir un patrón que capture el campo y el label
  const emojiFieldPattern = /((?:emoji|icon):\s*')((?:[^']{0,20})?)(',\s*(?:label|displayName):\s*')((?:[^']+)')/g;
  
  fixed = fixed.replace(emojiFieldPattern, (match, pre, emojiVal, mid, labelPart) => {
    // Extraer label
    const labelMatch = labelPart.match(/^([^']+)'/);
    if (!labelMatch) return match;
    const label = labelMatch[1];
    
    // Verificar si el emoji tiene caracteres problemáticos
    const hasBad = [...emojiVal].some(c => {
      const cp = c.codePointAt(0);
      return cp === 0x2013 || cp === 0xFFFD || (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13);
    });
    
    if (!hasBad) return match; // Emoji ya correcto
    
    // Buscar emoji correcto por label
    const correctEmoji = LABEL_TO_EMOJI[label];
    if (correctEmoji) {
      return `${pre}${correctEmoji}${mid}${labelPart}`;
    }
    
    // Si no hay match exacto, intentar búsqueda parcial
    for (const [key, emoji] of Object.entries(LABEL_TO_EMOJI)) {
      if (label.startsWith(key) || key.startsWith(label)) {
        return `${pre}${emoji}${mid}${labelPart}`;
      }
    }
    
    return match; // No encontrado, dejar como está
  });

  // También reparar el ícono de empty state en weekly-schedule
  fixed = fixed.replace(/class="wk-empty-icon">[^<]{0,15}<\/div>/g, 
    'class="wk-empty-icon">🗓️</div>');
  
  // Reparar checkmark ✓ en wk-check
  // El patrón es: done ? 'CORRUPTO' : `...`
  fixed = fixed.replace(/done \? '[^']{0,10}' : /g, "done ? '✓' : ");
  
  // Reparar ✓ en time:<time>CORRUPTO</time>
  fixed = fixed.replace(/<time>[^<]{0,5}<\/time>/g, (m) => {
    if (m.includes('✓')) return m;
    // Si tiene chars corruptos dentro del time tag, es el checkmark
    const inner = m.replace(/<\/?time>/g, '');
    const hasBad = [...inner].some(c => c.codePointAt(0) === 0x2013 || c.codePointAt(0) === 0xFFFD);
    if (hasBad && inner.length <= 3) return '<time>✓</time>';
    return m;
  });

  return fixed;
}

const root = 'c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main';

const files = [
  `${root}/js/maestra/modules/routine.js`,
  `${root}/js/maestra/modules/weekly-schedule.js`,
];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const fixed = fixContent(content);
  fs.writeFileSync(f, fixed, 'utf8');
  
  // Contar emojis corruptos restantes
  const badEmoji = (fixed.match(/(emoji|icon): '(?:[–x\uFFFD]){1,10}'/g) || []).length;
  console.log(`${f.split('/').pop()}: emojis corruptos restantes ≈ ${badEmoji}`);
  
  // Verificar emojis clave
  const keyChecks = ['🧸', '🖐️', '📋', '🍞', '🌳', '🎨', '😴', '✓', '🗓️'];
  keyChecks.forEach(e => {
    if (fixed.includes(e)) process.stdout.write(`${e} `);
  });
  console.log('\n');
}
