const fs = require('fs');

const r = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/rooms.module.js', 'utf8');
const u = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/ui.module.js', 'utf8');
const t = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/teachers.module.js', 'utf8');

console.log('=== rooms.module.js ===');
console.log('removeTeacher fn:          ', r.includes('async removeTeacher(') ? '✅' : '❌');
console.log('supabase null update:      ', r.includes('teacher_id: null') ? '✅' : '❌');

console.log('\n=== ui.module.js ===');
console.log('card btn (App.rooms):      ', u.includes('App.rooms.removeTeacher') ? '✅' : '❌');
console.log('row  btn (App.rooms):      ', u.includes('App.rooms.removeTeacher') ? '✅' : '❌');
console.log('dc-icon-btn--warn card:    ', u.includes('dc-icon-btn--warn') ? '✅' : '❌');

console.log('\n=== teachers.module.js ===');
console.log('removeFromClassroom fn:    ', t.includes('async removeFromClassroom(') ? '✅' : '❌');
console.log('_confirmRemove fn:         ', t.includes('async _confirmRemoveFromClassroom(') ? '✅' : '❌');
console.log('grid btn user-minus:       ', t.includes('App.teachers.removeFromClassroom') ? '✅' : '❌');
console.log('table btn user-minus:      ', t.includes("removeFromClassroom('" + "'${t.id}'") ? '✅ (con template)' : t.includes('removeFromClassroom') ? '✅ (presente)' : '❌');

// Mostrar fragmento del botón en tarjeta de aula
const idx = u.indexOf('App.rooms.removeTeacher');
if (idx >= 0) {
  console.log('\nFragmento botón en tarjeta:');
  console.log(u.substring(idx - 50, idx + 120));
}
