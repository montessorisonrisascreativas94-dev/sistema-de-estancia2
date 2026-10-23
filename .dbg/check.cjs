const fs = require('fs');
const ws = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/modules/weekly-schedule.js', 'utf8');

// Verificar el encabezado del título
const titleIdx = ws.indexOf('Horario Semanal');
console.log('Titulo:', ws.substring(titleIdx, titleIdx + 60));

// Ver líneas con "Hoy" y "bloques"
const lines = ws.split('\n');
lines.forEach((l, i) => {
  if (l.includes('Hoy') && l.includes('bloques')) console.log('L' + (i + 1) + ':', l.trim());
  if (l.includes('\u2013') || l.includes('\u2014')) console.log('DASH L' + (i + 1) + ':', l.trim().substring(0, 80));
});

// Buscar en routine.js el texto del banner
const rt = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/maestra/modules/routine.js', 'utf8');
const rtLines = rt.split('\n');
rtLines.forEach((l, i) => {
  if (l.includes('Ahora en el aula') || l.includes('alumnos marcados') || l.includes('En curso')) {
    console.log('RT L' + (i + 1) + ':', l.trim().substring(0, 100));
  }
});
