const fs = require('fs');

const r = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/rooms.module.js', 'utf8');
const t = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/teachers.module.js', 'utf8');

console.log('=== rooms.module.js (removeTeacher) ===');
console.log('Usa eq(teacher_id):       ', r.includes("eq('teacher_id'") ? '✅' : '❌');
console.log('NO usa applyClassroom:    ', !r.includes('applyClassroomGroupTeacher(room, null)') ? '✅ (limpio)' : '❌ (aún lo usa)');
console.log('Invalida 3 caches:        ', r.includes("QueryCache.invalidate('dir_classrooms_occ')") && r.includes("QueryCache.invalidate('dir_teachers')") ? '✅' : '❌');
console.log('notifyClassroomUpdated:   ', r.includes('notifyClassroomUpdated()') ? '✅' : '❌');

console.log('\n=== teachers.module.js (removeFromClassroom + _confirm) ===');
console.log('Single: eq(teacher_id):   ', t.includes("eq('teacher_id', teacherId)") ? '✅' : '❌');
console.log('Multi:  eq(teacher_id):   ', t.includes("eq('teacher_id', teacherId)") ? '✅' : '❌');
console.log('NO usa applyClassroom:    ', !t.includes('applyClassroomGroupTeacher') ? '✅ (limpio)' : '❌ (aún lo importa)');
console.log('Import notifyClassroomUpd:', t.includes('notifyClassroomUpdated') ? '✅' : '❌');
console.log('Invalida 3 caches (single):', t.includes("QueryCache.invalidate('dir_teachers')") && t.includes("QueryCache.invalidate('dir_classrooms_occ')") ? '✅' : '❌');

// Verificar que no quedan referencias a applyClassroomGroupTeacher en teachers
const applyCount = (t.match(/applyClassroomGroupTeacher/g) || []).length;
console.log('\napplyClassroomGroupTeacher refs en teachers:', applyCount, applyCount === 0 ? '✅' : '⚠️ revisar');
