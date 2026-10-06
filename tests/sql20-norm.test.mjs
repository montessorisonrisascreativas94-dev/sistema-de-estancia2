// Validación estática de sql/20_AULAS_LIMPIEZA_FINAL.sql
// Replica _aula_norm() en JS y verifica el catálogo extraído del archivo:
//   - idempotencia de la normalización
//   - que cada fila del catálogo es un punto fijo (se puede buscar por su
//     propio texto) y que el nombre oficial se encuentra a sí mismo
//   - que no haya norms ambiguos (dos destinos distintos)
//   - que el suelto "parvalo" NUNCA esté en el catálogo (bug del 15)
//   - casos reales reportados por la usuaria
import { readFileSync } from 'node:fs';

const SQL = readFileSync(new URL('../sql/20_AULAS_LIMPIEZA_FINAL.sql', import.meta.url), 'utf8');

let failures = 0;
function ok(cond, msg) {
  if (cond) return;
  failures++;
  console.error('  ✗ ' + msg);
}
function eq(a, b, msg) { ok(a === b, `${msg} → esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); }

// ---- extraer translate() y el regex de sufijo del archivo ----
const normFn = SQL.match(/CREATE OR REPLACE FUNCTION public\._aula_norm[\s\S]*?\$\$;/);
ok(!!normFn, 'no se encontró _aula_norm en el SQL');
ok(/public\._aula_strip_suffix\(lower/.test(normFn[0]),
  '_aula_norm debe usar _aula_strip_suffix (el patrón vive en un solo lugar)');
const tr = normFn[0].match(/'([^']*á[^']*)',\s*\n\s*'([^']*)'/);
ok(!!tr, 'no se encontró el par from/to de translate()');
const from = tr[1], to = tr[2];
eq(from.length, to.length, 'translate(): from y to deben tener el mismo largo');

const stripFn = SQL.match(/CREATE OR REPLACE FUNCTION public\._aula_strip_suffix[\s\S]*?\$\$;/);
ok(!!stripFn, 'no se encontró _aula_strip_suffix en el SQL');
const rx = stripFn[0].match(/regexp_replace\(COALESCE\(t, ''\),\s*'([^']*)',/);
ok(!!rx, 'no se encontró el regex de sufijo sucio en _aula_strip_suffix');
const suffixRe = new RegExp(rx[1], 'i');

const TMAP = new Map([...from].map((c, i) => [c, to[i]]));

function aulaNorm(t) {
  if (t === null || t === undefined) return null;
  let s = String(t).toLowerCase();
  s = s.replace(suffixRe, '');          // quita sufijo sucio
  s = [...s].map(c => TMAP.get(c) ?? c).join('');  // translate (°, /, tildes…)
  s = s.replace(/\s+/g, ' ');           // colapsa DESPUÉS del translate
  s = s.trim();
  return s === '' ? null : s;
}

// Réplica de _aula_strip_suffix: quita el sufijo conservando CAJA y
// tildes originales (se usa para renombrar custom sin minúscularlas)
function stripSuffix(t) {
  if (t === null || t === undefined) return null;
  const s = String(t).replace(suffixRe, '').trim();
  return s === '' ? null : s;
}

// ---- extraer el catálogo VALUES de _aula_catalog ----
const catFn = SQL.match(/CREATE OR REPLACE FUNCTION public\._aula_catalog[\s\S]*?\$\$;/);
ok(!!catFn, 'no se encontró _aula_catalog en el SQL');
const rows = [...catFn[0].matchAll(/\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(true|false)\)/g)]
  .map(m => ({ norm: m[1], name: m[2], level: m[3], sp: m[4] === 'true' }));
ok(rows.length >= 100, `catálogo demasiado pequeño (${rows.length} filas)`);

const byNorm = new Map();
for (const r of rows) {
  if (byNorm.has(r.norm)) {
    ok(byNorm.get(r.norm).name === r.name,
      `norm ambigua "${r.norm}": "${byNorm.get(r.norm).name}" vs "${r.name}"`);
  } else {
    byNorm.set(r.norm, r);
  }
}
function canonOf(text) {
  const n = aulaNorm(text);
  return n ? (byNorm.get(n) ?? null) : null;
}

console.log(`translate ${from.length} chars · catálogo ${rows.length} filas · ${byNorm.size} norms únicos`);

// 1) idempotencia + punto fijo de cada norm del catálogo
for (const r of rows) {
  eq(aulaNorm(r.norm), r.norm, `norm "${r.norm}" no es punto fijo`);
}
// 2) cada nombre oficial se encuentra a sí mismo
for (const r of rows) {
  const hit = canonOf(r.name);
  ok(hit && hit.name === r.name, `nombre oficial "${r.name}" no se encuentra a sí mismo (norm=${aulaNorm(r.name)})`);
}
// 3) cada nivel oficial también
for (const r of rows) {
  const hit = canonOf(r.level);
  ok(hit && hit.name === r.name, `nivel oficial "${r.level}" no resuelve a "${r.name}"`);
}
// 4) el suelto "parvalo" jamás está en el catálogo (bug del 15)
ok(!byNorm.has('parvalo'), 'el norm ambiguo "parvalo" NO debe estar en el catálogo');
ok(canonOf('parvalo') === null, '"parvalo" suelto no debe resolver a ninguna aula');

// 5) casos reales de la usuaria
const casos = [
  ['parvalo 2 (variante — canon parvulos i)', 'Párvulos II'],
  ['parvalo 2', 'Párvulos II'],
  ['parvalo', null],
  ['Párvulos I', 'Párvulos I'],
  ['Párvulos II', 'Párvulos II'],
  ['Párvulos III', 'Párvulos III'],
  ['parvuloss', null],
  ['Kínder', 'Kínder'],
  ['kinder gris', 'Kínder'],
  ['Pre-Kínder', 'Pre-Kínder'],
  ['prekinder', 'Pre-Kínder'],
  ['1° Primero', '1° Primero'],
  ['1ro', '1° Primero'],
  ['primero', '1° Primero'],
  ['3ro – linea azul', '3° Tercero'],
  ['6° Sexto', '6° Sexto'],
  ['Ballet y Danza', 'Ballet y Danza'],
  ['Ballet / Danza', 'Ballet y Danza'],
  ['Campamento de Verano', 'Campamento de Verano'],
  ['Verano', 'Campamento de Verano'],
  ['Cuido Infantil', 'Cuido Infantil'],
  ['aula personalizada', null],
  ['', null],
  [null, null],
];
for (const [input, expected] of casos) {
  const hit = canonOf(input);
  eq(hit ? hit.name : null, expected, `canonOf(${JSON.stringify(input)})`);
}

// 5b) _aula_strip_suffix: conserva caja/tildes; no toca lo sin sufijo
//     (si no, "Aula Azul" terminaría renombrada a "aula azul")
eq(stripSuffix('Aula Azul'), 'Aula Azul', 'strip: custom sin sufijo NO cambia');
eq(stripSuffix('Sala Blanca (variante — canon X)'), 'Sala Blanca', 'strip: quita variante, conserva caja');
eq(stripSuffix('1° Primero (duplicado #12)'), '1° Primero', 'strip: quita duplicado #id');
eq(stripSuffix('Kínder'), 'Kínder', 'strip: oficial intacta');
eq(stripSuffix('  Párvulos II  '), 'Párvulos II', 'strip: recorta espacios');
eq(stripSuffix('(variante — canon)'), null, 'strip: solo-sufijo → NULL');
eq(stripSuffix(null), null, 'strip: NULL → NULL');
// idempotencia de strip
for (const s of ['Aula Azul', 'Kínder (dup #9)', '1° Primero (variante — x)']) {
  eq(stripSuffix(stripSuffix(s)), stripSuffix(s), `strip idempotente en ${JSON.stringify(s)}`);
}

// 6) niveles de especiales = clave corta (así la usan admisión/validador)
for (const r of rows.filter(r => r.sp)) {
  ok(['Verano', 'Inglés Afterschool', 'Ballet / Danza', 'Taekwondo', 'Sala de Tarea', 'Cuido'].includes(r.level),
    `nivel de especial "${r.name}" = "${r.level}" no es una clave corta válida`);
}
// 7) 12 regulares con name === level
const regs = rows.filter(r => !r.sp && r.name === r.level);
ok(new Set(regs.map(r => r.name)).size === 12,
  `se esperaban 12 canónicas regulares, hay ${new Set(regs.map(r => r.name)).size}`);

if (failures) {
  console.error(`\n${failures} comprobación(es) fallida(s)`);
  process.exit(1);
}
console.log('✔ tests/sql20-norm.test.mjs: todo verde');
