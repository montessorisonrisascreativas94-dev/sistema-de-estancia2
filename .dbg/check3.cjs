const fs = require('fs');

const rt = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/modules/routine.js', 'utf8');

// Buscar Estimulación y ver qué emoji tiene
const idx = rt.indexOf('Estimulaci');
console.log('Contexto Estimulación:');
const chunk = rt.substring(idx - 20, idx + 80);
for(let i = 0; i < chunk.length; i++) {
  const code = chunk.charCodeAt(i);
  if(code > 127 || code < 32) process.stdout.write(`[U+${code.toString(16).toUpperCase()}]`);
  else process.stdout.write(chunk[i]);
}
console.log();

// Buscar "En curso" en routine.js
const enCursoIdx = rt.indexOf('En curso');
console.log('\nContexto "En curso":');
const chunk2 = rt.substring(enCursoIdx - 10, enCursoIdx + 50);
for(let i = 0; i < chunk2.length; i++) {
  const code = chunk2.charCodeAt(i);
  if(code > 127 || code < 32) process.stdout.write(`[U+${code.toString(16).toUpperCase()}]`);
  else process.stdout.write(chunk2[i]);
}
console.log();

// Buscar "Ahora en el aula"
const ahoraIdx = rt.indexOf('Ahora en el aula');
console.log('\nContexto "Ahora en el aula":');
const chunk3 = rt.substring(ahoraIdx - 10, ahoraIdx + 80);
for(let i = 0; i < chunk3.length; i++) {
  const code = chunk3.charCodeAt(i);
  if(code > 127 || code < 32) process.stdout.write(`[U+${code.toString(16).toUpperCase()}]`);
  else process.stdout.write(chunk3[i]);
}
console.log();

// Buscar "alumnos marcados"
const alumIdx = rt.indexOf('alumnos marcados');
console.log('\nContexto "alumnos marcados":');
const chunk4 = rt.substring(alumIdx - 30, alumIdx + 60);
for(let i = 0; i < chunk4.length; i++) {
  const code = chunk4.charCodeAt(i);
  if(code > 127 || code < 32) process.stdout.write(`[U+${code.toString(16).toUpperCase()}]`);
  else process.stdout.write(chunk4[i]);
}
console.log();
