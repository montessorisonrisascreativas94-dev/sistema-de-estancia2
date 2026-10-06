/**
 * 🧪 tests/aulas.test.mjs — Regresión del sistema de aulas
 * Ejecutar:  node tests/aulas.test.mjs
 *
 * Cubre los bugs históricos:
 *  - findCanonicalClassroom('parvalo 2') → null  (normalize no idempotente)
 *  - findCanonicalClassroom('Párvulos II') → 'Párvulos I'  (match por subcadena)
 *  - findCanonicalClassroom('kinder') → 'Pre-Kínder'
 *  - sanitizeClassroomDisplayName no recortaba sufijos con espacio final
 *  - dedupeClassrooms fusionaba Párvulos II/III dentro de la tarjeta I
 */
import {
  findCanonicalClassroom,
  sanitizeClassroomDisplayName,
  formatClassroomFullName,
  formatClassroomLevel,
  dedupeClassrooms,
  CANONICAL_CLASSROOMS,
} from '../js/shared/constants.js';

let pass = 0;
const fail = [];
const eq = (actual, expected, label) => {
  if (actual === expected) { pass++; return; }
  fail.push(`${label}\n     esperado: ${JSON.stringify(expected)}\n     obtenido: ${JSON.stringify(actual)}`);
};

// ── 1. Nombres oficiales ─────────────────────────────────────────
for (const c of CANONICAL_CLASSROOMS) {
  eq(findCanonicalClassroom(c.name)?.displayLevel, c.displayLevel, `canónica por name: ${c.name}`);
  eq(findCanonicalClassroom(c.level)?.displayLevel, c.displayLevel, `canónica por level: ${c.level}`);
}

// ── 2. Alias sucios comunes → su canónica correcta ───────────────
const alias = [
  ['parvalo 1', 'Párvulos I'],
  ['parvalo 2', 'Párvulos II'],
  ['parvalo 3', 'Párvulos III'],
  ['parvulo i', 'Párvulos I'],
  ['parvulo ii', 'Párvulos II'],
  ['parvulo iii', 'Párvulos III'],
  ['maternal 1', 'Párvulos I'],
  ['maternal 2', 'Párvulos II'],
  ['maternal 3', 'Párvulos III'],
  ['PARVULOS II', 'Párvulos II'],
  ['Párvulos II', 'Párvulos II'],
  ['Párvulos III', 'Párvulos III'],
  ['kinder', 'Kínder'],
  ['pre kinder', 'Pre-Kínder'],
  ['prekinder', 'Pre-Kínder'],
  ['pre primario', 'Pre-Primario'],
  ['1ro', '1° Primero'],
  ['1ro - Línea Roja', '1° Primero'],
  ['2do – Línea Amarilla', '2° Segundo'],
  ['6to', '6° Sexto'],
  ['6° Sexto', '6° Sexto'],
];
for (const [input, expected] of alias) {
  eq(findCanonicalClassroom(input)?.displayLevel, expected, `alias: ${input}`);
}

// ── 3. Sufijos de soft-delete (creados por sql/15) ───────────────
eq(sanitizeClassroomDisplayName('parvalo 2 (variante — canon parvulos i)'), 'parvalo 2', 'sufijo variante');
eq(sanitizeClassroomDisplayName('parvalo 2 (variante — canon parvulos i) '), 'parvalo 2', 'sufijo + espacio final');
eq(sanitizeClassroomDisplayName('Párvulos I (duplicado #7)'), 'Párvulos I', 'sufijo duplicado');
eq(sanitizeClassroomDisplayName('Kínder (duplicado #12 — 20261001)'), 'Kínder', 'sufijo duplicado fechado');
eq(findCanonicalClassroom('parvalo 2 (variante — canon parvulos i)')?.displayLevel, 'Párvulos II', 'variante sucia → canónica');
eq(findCanonicalClassroom('parvalo 2 (variante — canon parvulos i) ')?.displayLevel, 'Párvulos II', 'variante sucia + espacio');
eq(formatClassroomFullName('parvalo 2 (variante — canon parvulos i)', ''), 'Párvulos II', 'fullname de variante');

// ── 4. Niveles legibles ──────────────────────────────────────────
eq(formatClassroomLevel('1ro - Línea Roja'), '1° Primero', 'level 1ro-línea');
eq(formatClassroomLevel('Párvulos III'), 'Párvulos III', 'level parvulos III');
eq(formatClassroomFullName('parvalo 3', ''), 'Párvulos III', 'fullname parvalo 3');

// ── 5. dedupeClassrooms NO fusiona niveles distintos ─────────────
const rows = [
  { id: 1, name: 'Párvulos I', level: 'Párvulos I', student_count: 3 },
  { id: 2, name: 'Párvulos II', level: 'Párvulos II', student_count: 5 },
  { id: 3, name: 'Párvulos III', level: 'Párvulos III', student_count: 7 },
  { id: 4, name: 'parvalo 2 (variante — canon parvulos ii)', level: 'Párvulos II', student_count: 0, teacher_id: 'x' },
];
const deduped = dedupeClassrooms(rows);
eq(deduped.length, 3, 'dedupe: 3 grupos (I, II, III) — la variante se funde en II');
eq(deduped[0].name, 'Párvulos I', 'dedupe: primer grupo es I');
eq(deduped[1].name, 'Párvulos II', 'dedupe: segundo grupo es II');
eq(deduped[2].name, 'Párvulos III', 'dedupe: tercer grupo es III');
eq(deduped[1].student_count, 5, 'dedupe: II conserva su conteo');

// ── 6. Especiales no colisionan ──────────────────────────────────
eq(findCanonicalClassroom('Cuido'), null, 'Cuido no es canónica');
eq(formatClassroomFullName('Cuido Infantil', 'Cuido'), 'Cuido Infantil', 'especial Cuido');

// ── Reporte ──────────────────────────────────────────────────────
console.log(`\n${pass} aserciones OK`);
if (fail.length) {
  console.error(`\n${fail.length} FALLAS:`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('✔ tests/aulas.test.mjs: todo verde');
