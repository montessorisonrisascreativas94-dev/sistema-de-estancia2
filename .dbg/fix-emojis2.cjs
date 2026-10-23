// fix-emojis2.cjs — Segunda pasada: repara emojis corruptos sin label: directa

const fs = require('fs');

function isBad(str) {
  return [...str].some(c => {
    const cp = c.codePointAt(0);
    return cp === 0x2013 || cp === 0xFFFD || (cp < 0x20 && cp !== 0x09 && cp !== 0x0A && cp !== 0x0D);
  });
}

function fixContent(content) {
  let fixed = content;

  // ── 1. TEMP_OPTIONS (identificados por val/label/color)
  // { val: 'fria',     label: 'Fría',    icon: 'CORRUPTO', color: '#0B63C7' }
  // { val: 'natural',  label: 'Natural', icon: 'CORRUPTO', color: '#28B54D' }
  // { val: 'tibia',    label: 'Tibia',   icon: 'CORRUPTO', color: '#FF8A00' }
  // { val: 'caliente', label: 'Caliente', icon: 'CORRUPTO', color: '#EF4444' }
  fixed = fixed.replace(/(\{ val: 'fria'[^}]*?icon: ')[^']+'/, "$1🧊'");
  fixed = fixed.replace(/(\{ val: 'natural'[^}]*?icon: ')[^']+'/, "$1💧'");
  fixed = fixed.replace(/(\{ val: 'tibia'[^}]*?icon: ')[^']+'/, "$1♨️'");
  fixed = fixed.replace(/(\{ val: 'caliente'[^}]*?icon: ')[^']+'/, "$1🔥'");

  // ── 2. COLLECTIVE_QUICK_EVENTS — { id: 'pending', label: 'Pendientes', icon: '⏳' } ya OK
  // { id: 'alert', label: 'Alertas', icon: 'CORRUPTO' }
  fixed = fixed.replace(/label: 'Alertas', icon: '[^']+'/, "label: 'Alertas', icon: '🔔'");

  // ── 3. Objetos de resumen por groupEventId (sin label: directo)
  // breakfast: { emoji: 'CORRUPTO', color: '#FF8A00', label: 'Desayuno' }
  fixed = fixed.replace(/(breakfast:\s*\{[^}]*?emoji: ')[^']+'/, "$1🍞'");
  fixed = fixed.replace(/(lunch:\s*\{[^}]*?emoji: ')[^']+'/, "$1🍽️'");
  fixed = fixed.replace(/(snack:\s*\{[^}]*?emoji: ')[^']+'/, "$1🍎'");
  fixed = fixed.replace(/(nap:\s*\{[^}]*?emoji: ')[^']+'/, "$1😴'");
  fixed = fixed.replace(/(sleep:\s*\{[^}]*?emoji: ')[^']+'/, "$1😴'");
  fixed = fixed.replace(/(milk:\s*\{[^}]*?emoji: ')[^']+'/, "$1🍼'");
  fixed = fixed.replace(/(activity:\s*\{[^}]*?emoji: ')[^']+'/, "$1🎨'");
  fixed = fixed.replace(/(sensorial:\s*\{[^}]*?emoji: ')[^']+'/, "$1🔬'");
  fixed = fixed.replace(/(playground:\s*\{[^}]*?emoji: ')[^']+'/, "$1🌳'");
  fixed = fixed.replace(/(handwash:\s*\{[^}]*?emoji: ')[^']+'/, "$1🧼'");
  fixed = fixed.replace(/(toothbrush:\s*\{[^}]*?emoji: ')[^']+'/, "$1🪥'");
  fixed = fixed.replace(/(bath:\s*\{[^}]*?emoji: ')[^']+'/, "$1🚿'");
  fixed = fixed.replace(/(diaper_change:\s*\{[^}]*?emoji: ')[^']+'/, "$1🧷'");
  fixed = fixed.replace(/(diaper:\s*\{[^}]*?emoji: ')[^']+'/, "$1💩'");
  fixed = fixed.replace(/(temp:\s*\{[^}]*?emoji: ')[^']+'/, "$1🌡️'");
  fixed = fixed.replace(/(med:\s*\{[^}]*?emoji: ')[^']+'/, "$1💊'");
  fixed = fixed.replace(/(health:\s*\{[^}]*?emoji: ')[^']+'/, "$1🤒'");
  fixed = fixed.replace(/(incident:\s*\{[^}]*?emoji: ')[^']+'/, "$1🤕'");
  fixed = fixed.replace(/(behavior:\s*\{[^}]*?emoji: ')[^']+'/, "$1📋'");
  fixed = fixed.replace(/(note:\s*\{[^}]*?emoji: ')[^']+'/, "$1📝'");

  // ── 4. NAP/SLEEP estados en el modal de siesta
  // icon sueño estado: { val: 'durmiendo', icon: '😴' } etc
  // buscar por val
  fixed = fixed.replace(/(val: 'durmiendo'[^}]*?icon: ')[^']+'/, "$1😴'");
  fixed = fixed.replace(/(val: 'No durmió'[^}]*?icon: ')[^']+'/, "$1🌅'");
  // La línea que quedó con –ܬ️ en { val:'No durmió', icon: '–ܬ️' }
  fixed = fixed.replace(/icon: '[–\u2013][ܬ]️'/, "icon: '🌅'");

  // ── 5. TEMP_OPTIONS segunda iteración (por color explícito)
  // { val: 'fria', ... icon: '...', color: '#0B63C7' }
  const tempOpt = [
    ["'#0B63C7'", '🧊'],
    ["'#28B54D'", '💧'],
    ["'#FF8A00'", '♨️'],
    ["'#EF4444'", '🔥'],
  ];
  for (const [color, emoji] of tempOpt) {
    // Solo dentro de TEMP_OPTIONS — buscamos el patrón icon: 'XXX', color: COLOR
    // dentro de objetos que tienen val: (temperatura)
    const re = new RegExp(`(val:\\s*'(?:fria|natural|tibia|caliente)'[\\s\\S]{0,50}?icon:\\s*')[^']+'`, 'g');
    fixed = fixed.replace(re, (m, pre) => {
      // Buscar qué color es
      for (const [c, e] of tempOpt) {
        if (m.includes(c)) return `${pre}${e}'`;
      }
      return m;
    });
  }

  // ── 6. Ver si quedan FOOD_STATUS icons por color o val
  // { val: 'todo', label: 'Todo', icon: '✅' } — ya OK
  // { val: 'poco', label: 'Poco', icon: 'CORRUPTO', color: '#...' }
  fixed = fixed.replace(/val: 'poco'([^}]*?)icon: '[^']+'/, "val: 'poco'$1icon: '🍽️'");
  fixed = fixed.replace(/val: 'nada'([^}]*?)icon: '[^']+'/, "val: 'nada'$1icon: '❌'");

  // ── 7. Checkmarks ✓ sueltos
  // '<time>–</time>' o similar
  fixed = fixed.replace(/<time>[–\u2013\uFFFD]{1,3}<\/time>/g, '<time>✓</time>');
  
  // ── 8. Cualquier emoji/icon que siga corrupto (catch-all final)
  // Por ahora, si un emoji tiene chars corruptos y NO lo arreglamos, lo marcamos visualmente
  // para no romper el JS (dejar '?' es mejor que un emoji dañado)
  fixed = fixed.replace(/((?:emoji|icon):\s*')[^']*?(?:[–\u2013\uFFFD][^']*?)'(?=,)/g, (m, pre) => {
    // Si ya tiene un emoji real (codepoint > 0x1F000), dejarlo
    for (const c of m) {
      const cp = c.codePointAt(0);
      if (cp > 0x1F000) return m;
    }
    return `${pre}❓'`;
  });

  return fixed;
}

const root = 'c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main';
const f = `${root}/js/maestra/modules/routine.js`;

let content = fs.readFileSync(f, 'utf8');
const fixed = fixContent(content);
fs.writeFileSync(f, fixed, 'utf8');

// Contar restantes
const badCount = (fixed.match(/(emoji|icon): '(?:[–\u2013x\uFFFD][^']{0,10})'/g) || []).filter(m => {
  return [...m].some(c => {
    const cp = c.codePointAt(0);
    return cp === 0x2013 || cp === 0xFFFD;
  });
}).length;

console.log(`routine.js: emojis corruptos restantes ≈ ${badCount}`);

// Verificar emojis clave
const keys = ['🧸', '🖐️', '📋', '🍞', '🌳', '🎨', '😴', '🍽️', '🧼', '💧', '♨️', '🔥', '🌡️', '💊', '💩', '🚽'];
keys.forEach(e => { if (fixed.includes(e)) process.stdout.write(e + ' '); });
console.log('\n');

// Buscar los 6 que quedaban
const pattern = /(emoji|icon): '([^']{0,20})'/g;
let m2;
while ((m2 = pattern.exec(fixed)) !== null) {
  const val = m2[2];
  if (isBad(val)) {
    const ctx = fixed.substring(m2.index - 5, m2.index + 80);
    console.log('AÚN CORRUPTO:', JSON.stringify(val), '|', ctx.replace(/\n/g, ' ').substring(0, 100));
  }
}

function isBad(str) {
  return [...str].some(c => {
    const cp = c.codePointAt(0);
    return cp === 0x2013 || cp === 0xFFFD || (cp < 0x20 && cp !== 0x09 && cp !== 0x0A && cp !== 0x0D);
  });
}
