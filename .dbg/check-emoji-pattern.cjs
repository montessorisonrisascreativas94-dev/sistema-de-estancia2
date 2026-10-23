// Analizar los patrones de dashes que representan emojis en routine.js
const fs = require('fs');

const rt = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/modules/routine.js', 'utf8');

// Buscar todos los patrones de emoji corruptos: secuencias de –, x, etc. 
// que aparecen antes de ', label:
const emojiPattern = /emoji: '([^']+)',\s*label: '([^']+)'/g;
let m;
const found = [];
while ((m = emojiPattern.exec(rt)) !== null) {
  const emoji = m[1];
  const label = m[2];
  // Verificar si el emoji tiene codepoints problemáticos
  const hasBad = [...emoji].some(c => {
    const cp = c.codePointAt(0);
    return cp === 0x2013 || cp === 0xFFFD || cp < 32;
  });
  if (hasBad) {
    found.push({ emoji, label, hex: [...emoji].map(c => c.codePointAt(0).toString(16)).join(' ') });
  }
}

console.log('Emojis corruptos en routine.js:');
found.forEach(f => console.log(`  label: "${f.label}" | emoji hex: ${f.hex} | emoji: ${f.emoji}`));

// También para icons
const iconPattern = /icon: '([^']+)',\s*label: '([^']+)'/g;
while ((m = iconPattern.exec(rt)) !== null) {
  const icon = m[1];
  const label = m[2];
  const hasBad = [...icon].some(c => {
    const cp = c.codePointAt(0);
    return cp === 0x2013 || cp === 0xFFFD || cp < 32;
  });
  if (hasBad) {
    found.push({ emoji: icon, label, hex: [...icon].map(c => c.codePointAt(0).toString(16)).join(' ') });
    console.log(`  ICON label: "${label}" | icon hex: ${[...icon].map(c => c.codePointAt(0).toString(16)).join(' ')} | icon: ${icon}`);
  }
}
