/**
 * admision-utils.js — Normalización compartida entre el formulario
 * público de preinscripción y el modal de admisión.
 *
 * 🔗 SINCRONIZADO con js/shared/constants.js → CANONICAL_CLASSROOMS
 *    (fuente única de verdad: 12 aulas + rangos de edad + metadata)
 */

import {
  CANONICAL_CLASSROOMS,
  SPECIAL_CLASSROOMS,
  findCanonicalClassroom,
  validateAgeForClassroom,
  suggestClassroomByAge,
  ageInDays,
} from './constants.js';

// Alias de compatibilidad (no repetimos datos, re-exportamos desde constants):
export const SPECIAL_LEVELS = SPECIAL_CLASSROOMS;

// CANONICAL_LEVELS: construido dinámicamente desde CANONICAL_CLASSROOMS
// para mantener compatibilidad con código que usa el formato antiguo .canon/.aliases/.minAge/.maxAge
const LEVEL_ALIASES = {
  'Párvulos I':                 ['Parvulos I', 'Párvulos 1', 'Párvulos 1ro', 'Maternal', 'Maternal I'],
  'Párvulos II':                ['Parvulos II', 'Párvulos 2', 'Párvulos 2do', 'Maternal II'],
  'Párvulos III':               ['Parvulos III', 'Párvulos 3', 'Párvulos 3ro', 'Infante'],
  'Pre-Kínder – Línea Blanca':  ['Pre-Kinder', 'Pre-Kinder – Línea Blanca', 'Pre-Kínder', 'Pre-Kinder - Línea Blanca', 'Pre-Kínder - Línea Blanca'],
  'Kínder – Línea Gris':        ['Kinder', 'Kínder', 'Kínder - Línea Gris', 'Kinder - Línea Gris', 'Kinder Línea Gris'],
  'Pre-Primario – Línea Negra': ['Preprimaria', 'Pre-Primario', 'Pre-Primario - Línea Negra', 'Preprimaria - Línea Negra'],
  '1ro – Línea Roja':           ['1ro Primaria', '1ro', 'Primer Grado', '1ro - Línea Roja', '1ro - Linea Roja'],
  '2do – Línea Amarilla':       ['2do Primaria', '2do', 'Segundo Grado', '2do - Línea Amarilla'],
  '3ro – Línea Azul':           ['3ro Primaria', '3ro', 'Tercer Grado', '3ro - Línea Azul'],
  '4to – Línea Verde':          ['4to Primaria', '4to', 'Cuarto Grado', '4to - Línea Verde'],
  '5to – Línea Naranja':        ['5to Primaria', '5to', 'Quinto Grado', '5to - Línea Naranja'],
  '6to – Línea Morado':         ['6to Primaria', '6to', 'Sexto Grado', '6to - Línea Morado'],
};

export const CANONICAL_LEVELS = CANONICAL_CLASSROOMS.map((c) => ({
  canon: c.level,
  aliases: LEVEL_ALIASES[c.level] || [],
  minAge: c.minAge,
  maxAge: c.maxAge,
  minDays: c.minDays,
  maxDays: c.maxDays,
  labelRange: c.labelRange,
  color: c.color,
  line: c.line,
}));

// Re-export helpers sincronizados:
export { findCanonicalClassroom, validateAgeForClassroom, suggestClassroomByAge, ageInDays };

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[–—−]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

/** Quita acentos, guiones y espacios: 'Párvulos I' → 'parvulosi'. */
export const levelKey = (s) => norm(s).replace(/[-\s]/g, '');

const INDEX = new Map();
for (const l of CANONICAL_LEVELS) {
  for (const alias of [l.canon, ...l.aliases]) {
    const k = levelKey(alias);
    if (k && !INDEX.has(k)) INDEX.set(k, l.canon);
  }
}
// Atajos sueltos que no son aliases explícitos.
INDEX.set('1ro', '1ro – Línea Roja');
INDEX.set('2do', '2do – Línea Amarilla');
INDEX.set('3ro', '3ro – Línea Azul');
INDEX.set('4to', '4to – Línea Verde');
INDEX.set('5to', '5to – Línea Naranja');
INDEX.set('6to', '6to – Línea Morado');

/**
 * Convierte cualquier etiqueta de nivel a su forma canónica.
 * Devuelve la entrada original si no reconoce el nivel, para no
 * perder información en la cola de revisión de Dirección.
 */
export function normalizeLevel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return INDEX.get(levelKey(raw)) ?? raw;
}

/** ¿El nivel corresponde a un aula del plan oficial (no a un área especial)? */
export function isSpecialLevel(value) {
  const k = levelKey(value);
  return SPECIAL_LEVELS.some((s) => levelKey(s) === k);
}

/**
 * Grupo de edad (0-6) en años decimales a partir de una fecha de
 * nacimiento. Se usa para sugerir aula cuando el nivel solicitado no
 * existe como tal.
 */
export function ageInYears(birthDate, refDate = new Date()) {
  if (!birthDate) return null;
  const b = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(b) || b > refDate) return null;
  const days = Math.max(0, Math.round((refDate - b) / 86400000));
  return days / 365.25;
}

/** Aula canónica sugerida por edad, o '' si no aplica. */
export function suggestLevelByAge(birthDate, refDate = new Date()) {
  const age = ageInYears(birthDate, refDate);
  if (age === null) return '';
  const hit = CANONICAL_LEVELS.find((l) => age >= l.minAge && age < l.maxAge);
  return hit ? hit.canon : '';
}

// ── Correo de login institucional ────────────────────────────

/** Dominio único de acceso al Portal de Padres. */
export const LOGIN_DOMAIN = 'sonrisacreativas.com';

/**
 * RFC 5321 limita la dirección completa a 64 caracteres. Con este
 * dominio la parte local no puede pasar de 44, si no Supabase Auth
 * rechaza el alta.
 */
const MAX_LOCAL = 64 - 1 - LOGIN_DOMAIN.length;

/**
 * Convierte texto libre en una parte de usuario segura para correo.
 * 'María José Pérez' → 'maria.jose.perez'
 */
export function slugifyForEmail(value) {
  return norm(value)
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40);
}

/**
 * Construye el usuario de login con el dominio institucional fijo.
 *
 *   normalizeLoginEmail('juan',  '00112345678')
 *   → 'juan.00112345678@sonrisacreativas.com'
 *
 * Si el valor ya trae un '@', se conserva SOLO la parte local y se
 * reaplica el dominio: nadie puede crear una cuenta fuera del colegio.
 */
export function normalizeLoginEmail(localPart, cedula = '') {
  let local = String(localPart ?? '').trim();
  if (local.includes('@')) local = local.split('@')[0];
  local = slugifyForEmail(local);
  const ced = String(cedula ?? '').replace(/\D/g, '');
  if (!local) local = 'familia';

  if (ced) {
    // La cédula identifica a la familia: se recorta el nombre, nunca
    // el discriminante, para no perder unicidad.
    const suffix = '.' + ced.slice(-11);
    const maxBase = MAX_LOCAL - suffix.length;
    local = (local.slice(0, Math.max(1, maxBase)).replace(/\.+$/, '') || 'familia') + suffix;
  }
  if (local.length > MAX_LOCAL) local = local.slice(0, MAX_LOCAL).replace(/\.+$/, '');
  if (!local) local = 'familia';

  return `${local}@${LOGIN_DOMAIN}`;
}

/**
 * Usuario único a partir de nombre + cédula. Si no hay cédula, se
 * añade un sufijo numérico para evitar colisiones entre hermanos.
 */
export function buildLoginEmail({ p1Name, p1Cedula, p1Email, suffix = '' }) {
  const parts = String(p1Name ?? '').trim().split(/\s+/).filter(Boolean);
  const base = slugifyForEmail(parts[0] || 'familia');
  const last = slugifyForEmail(parts.length > 1 ? parts[parts.length - 1] : '');
  const local = [base, last].filter(Boolean).join('.');
  const email = normalizeLoginEmail(local || slugifyForEmail(p1Email) || 'familia', p1Cedula);
  if (!suffix) return email;
  // El sufijo de hermano también tiene que caber en los 64 caracteres.
  const room = MAX_LOCAL - suffix.length - 1;
  const baseLocal = email.slice(0, email.indexOf('@')).slice(0, Math.max(1, room)).replace(/\.+$/, '');
  return `${baseLocal || 'familia'}.${suffix}@${LOGIN_DOMAIN}`;
}

/**
 * El correo de login nunca se toma del correo del padre tal cual:
 * se deriva del nombre + cédula para que sea predecible y único.
 */
export function splitContactEmails({ p1Name, p1Cedula, p1Email }) {
  return {
    login_email: buildLoginEmail({ p1Name, p1Cedula }),
    notification_email: String(p1Email ?? '').trim(),
  };
}

// ── Correo de login INSTITUCIONAL por ESTUDIANTE (regla nueva) ──
//
// > El usuario de un estudiante siempre será:
// >   primer_nombre.primer_apellido@sonrisacreativas.com
// >
// > No se usa la cédula del tutor ni el nombre del tutor. Esto hace
// > que el usuario sea fácil de recordar para la familia y 100%
// > asociado al niño/a, no a la persona que lo inscribió.

export const STUDENT_DEFAULT_PASSWORD = 'sonrisa123';

/**
 * Construye el correo institucional del padre asociado a un alumno
 * usando la REGLA NUEVA: primerNombre.primerApellido@dominio.
 *
 *   buildStudentParentLoginEmail({ studentName: 'Juan Pérez', studentLastName: 'Cabrera' })
 *   → 'juan.perez@sonrisacreativas.com'
 *
 * Si se detectan colisiones (mismo primer nombre + mismo primer apellido
 * entre dos familias distintas) se pasa un suffix numérico.
 */
export function buildStudentParentLoginEmail({ studentName, studentLastName, suffix = '' }) {
  const first = String(studentName ?? '').trim().split(/\s+/).filter(Boolean)[0] || '';
  const last = String(studentLastName ?? '').trim().split(/\s+/).filter(Boolean)[0] || '';
  const base = slugifyForEmail([first, last].filter(Boolean).join(' ')) || 'familia';
  const local = suffix ? `${base}.${String(suffix).replace(/[^a-z0-9]/g,'')}` : base;
  const trimmed = local.length > MAX_LOCAL ? local.slice(0, MAX_LOCAL).replace(/\.+$/, '') : local;
  return `${trimmed || 'familia'}@${LOGIN_DOMAIN}`;
}
