const fs = require('fs');

const r = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/rooms.module.js', 'utf8');
const t = fs.readFileSync('c:/Users/digitacionlab/Documents/SISTEMA/sistema-de-estancia2-main/js/directora/teachers.module.js', 'utf8');

console.log('=== rooms.module.js ===');
console.log('import applyClassroomGroupTeacher:', r.includes('applyClassroomGroupTeacher') ? '✅' : '❌');
console.log('removeTeacher usa applyClassroom:  ', r.includes('await applyClassroomGroupTeacher(room, null)') ? '✅' : '❌');
console.log('removeTeacher this._rooms cache:   ', r.includes('this._rooms') ? '✅' : '❌');

console.log('\n=== teachers.module.js ===');
console.log('import applyClassroomGroupTeacher: ', t.includes("import {") && t.includes('applyClassroomGroupTeacher') ? '✅' : '❌');
console.log('import notifyClassroomUpdated:     ', t.includes('notifyClassroomUpdated') ? '✅' : '❌');
console.log('single aula usa applyClassroom:    ', t.includes('await applyClassroomGroupTeacher(classrooms[0], null)') ? '✅' : '❌');
console.log('multi aula usa applyClassroom:     ', t.includes('await applyClassroomGroupTeacher(room, null)') ? '✅' : '❌');
console.log('notifyClassroomUpdated en single:  ', t.includes('notifyClassroomUpdated()') ? '✅' : '❌');
