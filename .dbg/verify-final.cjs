const fs = require('fs');

const root = 'c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main';
const files = {
  'routine.js': `${root}/js/maestra/modules/routine.js`,
  'weekly-schedule.js': `${root}/js/maestra/modules/weekly-schedule.js`,
};

for (const [name, path] of Object.entries(files)) {
  const content = fs.readFileSync(path, 'utf8');
  
  // 1. Mojibake restante
  const mojibake = (content.match(/Ã[¡-ÿÃ]|â€|Â[·¿¡°]/g) || []).length;
  
  // 2. Emojis corruptos
  const badEmoji = (content.match(/(emoji|icon): '([^']{0,20})'/g) || []).filter(m => {
    return [...m].some(c => c.codePointAt(0) === 0x2013 || c.codePointAt(0) === 0xFFFD);
  }).length;
  
  // 3. FFFD restantes
  const fffd = (content.match(/\uFFFD/g) || []).length;
  
  console.log(`\n=== ${name} ===`);
  console.log(`Mojibake: ${mojibake} | Bad emojis: ${badEmoji} | FFFD: ${fffd}`);
  console.log(`Status: ${mojibake === 0 && badEmoji === 0 && fffd === 0 ? '✅ PERFECTO' : '⚠️ hay problemas'}`);
  
  // 4. Verificar textos del usuario reportado
  const checks = [
    '🧸', 'Estimulación', '· En curso', 'Ahora en el aula',
    'alumnos marcados', '–', '·', '✓', '🗓️'
  ];
  process.stdout.write('Contenido clave: ');
  checks.forEach(t => {
    if (content.includes(t)) process.stdout.write(`"${t}" ✓  `);
    else process.stdout.write(`"${t}" ✗  `);
  });
  console.log();
}

// 5. Sintaxis básica - intentar parse del JS
const { execSync } = require('child_process');
for (const [name, path] of Object.entries(files)) {
  try {
    execSync(`node --check "${path}"`, { stdio: 'pipe' });
    console.log(`\n${name}: ✅ Sintaxis JS válida`);
  } catch (e) {
    console.log(`\n${name}: ❌ Error de sintaxis: ${e.stderr?.toString().substring(0, 200)}`);
  }
}
