/**
 * 📦 CONSTANTES GLOBALES (PRO - ESCALABLE)
 */

// ============================
// 🗄️ TABLAS BD
// ============================
export const TABLES = Object.freeze({
  PROFILES: 'profiles',
  STUDENTS: 'students',
  TASKS: 'tasks',
  TASK_EVIDENCES: 'task_evidences',
  ATTENDANCE: 'attendance',
  ATTENDANCE_REQUESTS: 'attendance_requests',
  POSTS: 'posts',
  LIKES: 'likes',
  COMMENTS: 'comments',
  GRADES: 'grades',
  MESSAGES: 'messages',
  PAYMENTS: 'payments',
  CLASSROOMS: 'classrooms',
  NOTIFICATIONS: 'notifications',
  INQUIRIES: 'inquiries',
  STAFF_PERMITS: 'staff_permits'
});

// ============================
// 👥 ROLES
// ============================
export const ROLES = Object.freeze({
  DIRECTORA: 'directora',
  ASISTENTE: 'asistente',
  MAESTRA: 'maestra',
  PADRE: 'padre'
});

export const ROLE_LIST = Object.freeze(Object.values(ROLES));

// ============================
// 📊 ESTADOS
// ============================

// 📅 Asistencia
export const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'present',
  LATE: 'late',
  ABSENT: 'absent'
});

// 📚 Tareas
export const TASK_STATUS = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CLOSED: 'closed'
});

// 💰 Pagos
export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
});

// 📩 Incidencias
export const INQUIRY_STATUS = Object.freeze({
  RECEIVED: 'received',
  REVIEW: 'review',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
});

// 🔔 Notificaciones
export const NOTIFICATION_TYPES = Object.freeze({
  TASK: 'task',
  ATTENDANCE: 'attendance',
  MESSAGE: 'message',
  SYSTEM: 'system'
});

// 🎯 Filtros globales
export const FILTERS = Object.freeze({
  ALL: 'all'
});

// ============================
// 📅 MESES
// ============================
export const MONTHS = Object.freeze([
  "Enero", "Febrero", "Marzo", "Abril",
  "Mayo", "Junio", "Julio", "Agosto",
  "Septiembre", "Octubre", "Noviembre", "Diciembre"
]);

export const MONTH_LABELS = MONTHS;

// ============================
// 🏫 CONFIGURACIÓN DEL COLEGIO
// ============================
export const SCHOOL_SETTINGS_ID = 1;

// ============================
// 🏫 AULAS CANÓNICAS (FUENTE ÚNICA DE VERDAD)
// Las 12 aulas oficiales + rangos de edad + colores de identidad.
// Estas aulas son FIJAS (estructura del colegio). Lo que cambia:
//   - capacity (capacidad)
//   - teacher_id (maestra asignada)
//   - is_live (activa año actual)
// Rangos en days (preciso para validación nacimiento) y years (útil para UI).
// ============================
export const CANONICAL_CLASSROOMS = Object.freeze([
  Object.freeze({ id: 1,  name: 'Párvulos I',       level: 'Párvulos I',       displayLevel: 'Párvulos I',       color: '#F472B6', line: 'Rosa',     minDays: 45,   maxDays: 365,   minAge: 0.12, maxAge: 1.0,  labelRange: '45 días – 11 meses' }),
  Object.freeze({ id: 2,  name: 'Párvulos II',      level: 'Párvulos II',      displayLevel: 'Párvulos II',      color: '#FB923C', line: 'Naranja',  minDays: 365,  maxDays: 730,   minAge: 1.0,  maxAge: 2.0,  labelRange: '12 – 23 meses' }),
  Object.freeze({ id: 3,  name: 'Párvulos III',     level: 'Párvulos III',     displayLevel: 'Párvulos III',     color: '#FACC15', line: 'Amarillo', minDays: 730,  maxDays: 1095,  minAge: 2.0,  maxAge: 3.0,  labelRange: '24 – 35 meses' }),
  Object.freeze({ id: 4,  name: 'Pre-Kínder',       level: 'Pre-Kínder',       displayLevel: 'Pre-Kínder',       color: '#E5E7EB', line: 'Blanca',   minDays: 1095, maxDays: 1460,  minAge: 3.0,  maxAge: 4.0,  labelRange: '3 años' }),
  Object.freeze({ id: 5,  name: 'Kínder',           level: 'Kínder',           displayLevel: 'Kínder',           color: '#9CA3AF', line: 'Gris',     minDays: 1460, maxDays: 1825,  minAge: 4.0,  maxAge: 5.0,  labelRange: '4 años' }),
  Object.freeze({ id: 6,  name: 'Pre-Primario',     level: 'Pre-Primario',     displayLevel: 'Pre-Primario',     color: '#374151', line: 'Negra',    minDays: 1825, maxDays: 2190,  minAge: 5.0,  maxAge: 6.0,  labelRange: '5 años' }),
  Object.freeze({ id: 7,  name: '1° Primero',       level: '1° Primero',       displayLevel: '1° Primero',       color: '#EF4444', line: 'Roja',     minDays: 2190, maxDays: 2555,  minAge: 6.0,  maxAge: 7.0,  labelRange: '6 años' }),
  Object.freeze({ id: 8,  name: '2° Segundo',       level: '2° Segundo',       displayLevel: '2° Segundo',       color: '#EAB308', line: 'Amarilla', minDays: 2555, maxDays: 2920,  minAge: 7.0,  maxAge: 8.0,  labelRange: '7 años' }),
  Object.freeze({ id: 9,  name: '3° Tercero',       level: '3° Tercero',       displayLevel: '3° Tercero',       color: '#3B82F6', line: 'Azul',     minDays: 2920, maxDays: 3285,  minAge: 8.0,  maxAge: 9.0,  labelRange: '8 años' }),
  Object.freeze({ id: 10, name: '4° Cuarto',        level: '4° Cuarto',        displayLevel: '4° Cuarto',        color: '#22C55E', line: 'Verde',    minDays: 3285, maxDays: 3650,  minAge: 9.0,  maxAge: 10.0, labelRange: '9 años' }),
  Object.freeze({ id: 11, name: '5° Quinto',        level: '5° Quinto',        displayLevel: '5° Quinto',        color: '#F97316', line: 'Naranja',  minDays: 3650, maxDays: 4015,  minAge: 10.0, maxAge: 11.0, labelRange: '10 años' }),
  Object.freeze({ id: 12, name: '6° Sexto',         level: '6° Sexto',         displayLevel: '6° Sexto',         color: '#A855F7', line: 'Morada',   minDays: 4015, maxDays: 4380,  minAge: 11.0, maxAge: 12.0, labelRange: '11 años' }),
]);

export const SPECIAL_CLASSROOMS = Object.freeze([
  'Verano', 'Inglés Afterschool', 'Ballet / Danza',
  'Taekwondo', 'Sala de Tarea', 'Cuido',
]);

export const SPECIAL_CLASSROOMS_META = Object.freeze([
  Object.freeze({ key: 'Verano',             displayName: 'Campamento de Verano', color: '#0EA5E9', emoji: '☀️', short: 'Verano' }),
  Object.freeze({ key: 'Inglés Afterschool', displayName: 'Inglés Afterschool',   color: '#2563EB', emoji: '🇬🇧', short: 'Inglés' }),
  Object.freeze({ key: 'Ballet / Danza',     displayName: 'Ballet y Danza',       color: '#EC4899', emoji: '🩰', short: 'Ballet' }),
  Object.freeze({ key: 'Taekwondo',          displayName: 'Taekwondo',             color: '#DC2626', emoji: '🥋', short: 'Taekwondo' }),
  Object.freeze({ key: 'Sala de Tarea',      displayName: 'Sala de Tarea',         color: '#059669', emoji: '📚', short: 'Tarea' }),
  Object.freeze({ key: 'Cuido',              displayName: 'Cuido Infantil',        color: '#D97706', emoji: '🧸', short: 'Cuido' }),
]);

export function findSpecialClassroom(nameOrKey) {
  if (!nameOrKey) return null;
  const k = String(nameOrKey).trim();
  return SPECIAL_CLASSROOMS_META.find(m => m.key === k || m.short === k || m.displayName === k) || null;
}

/**
 * 🧼 Limpia nombres de aula que tienen sufijos de soft-delete:
 *   "... (variante — canon parvulos i)",
 *   "... (duplicado #123)",
 *   "... (duplicado — 20261001)"
 * Usar siempre ANTES de normalizar / buscar canónica.
 */
export function sanitizeClassroomDisplayName(raw) {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/\s*\(variante[^\)]*\)/gi, '')
    .replace(/\s*\(duplicado[^\)]*\)/gi, '')
    .replace(/\s*\(dup[^\)]*\)/gi, '')
    .replace(/\s*,\s*$/, '')
    .trim();
}

function _ordinalES(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return String(n);
  const map = { 1:'1°', 2:'2°', 3:'3°', 4:'4°', 5:'5°', 6:'6°', 7:'7°', 8:'8°', 9:'9°', 10:'10°' };
  return map[num] || `${num}°`;
}

function _wordES(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return String(n);
  const map = { 1:'Primero', 2:'Segundo', 3:'Tercero', 4:'Cuarto', 5:'Quinto', 6:'Sexto', 7:'Séptimo', 8:'Octavo', 9:'Noveno', 10:'Décimo' };
  return map[num] || String(n);
}

export function formatClassroomLevel(levelOrName) {
  if (!levelOrName) return '';
  const raw = sanitizeClassroomDisplayName(String(levelOrName));
  const canon = findCanonicalClassroom(raw);
  if (canon?.displayLevel) return canon.displayLevel;
  const special = findSpecialClassroom(raw);
  if (special) return special.displayName;
  const cleaned = raw
    .replace(/[–—−]/g, '-')
    .replace(/\s*-\s*linea\s*.*/gi, '')
    .replace(/\s*línea\s*.*/gi, '')
    .trim();
  const m = cleaned.match(/^(\d{1,2})(?:[rao]s?|°)?\b\s*(.*)$/i);
  if (m) {
    const n = Number(m[1]);
    const rest = (m[2] || '').replace(/^de\s+/i, '').trim();
    const word = rest || _wordES(n);
    return `${_ordinalES(n)} ${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  }
  return cleaned;
}

export function formatClassroomFullName(name, level) {
  const n = sanitizeClassroomDisplayName(String(name || '')).trim();
  const l = sanitizeClassroomDisplayName(String(level || '')).trim();
  const canon = findCanonicalClassroom(l || n);
  if (canon?.displayLevel) return canon.displayLevel;
  const special = findSpecialClassroom(n) || findSpecialClassroom(l);
  if (special) return special.displayName;
  const disp = formatClassroomLevel(n || l || '');
  return disp || n || 'Sin aula';
}

export function classroomColorFor(name, level) {
  const n = sanitizeClassroomDisplayName(name);
  const l = sanitizeClassroomDisplayName(level);
  const canon = findCanonicalClassroom(l || n);
  if (canon?.color) return canon.color;
  const special = findSpecialClassroom(n) || findSpecialClassroom(l);
  if (special?.color) return special.color;
  return '#0B63C7';
}

export const CANONICAL_CLASSROOM_LEVELS = Object.freeze(
  CANONICAL_CLASSROOMS.map((c) => c.level)
);

/** Busca un aula canónica por nombre/level (normaliza acentos, detecta "Línea Color", "1ro", ordinales). */
export function findCanonicalClassroom(levelOrName) {
  if (!levelOrName) return null;
  const input = sanitizeClassroomDisplayName(String(levelOrName));
  const normalize = (s) => String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—−]/g, '-').replace(/\s+/g, ' ')
    .replace(/\s*-\s*linea\s*.*/g, '')
    .replace(/\s*linea\s*.*/g, '')
    .replace(/\b(\d{1,2})(?:[rdt][oa]s?|°|º|ª)\b/gi, (_, n) => n)
    .replace(/\b(primero|segundo|tercero|cuarto|quinto|sexto|septimo|octavo|noveno|decimo)\b/gi, (m) => {
      const map = {primero:1,segundo:2,tercero:3,cuarto:4,quinto:5,sexto:6,septimo:7,octavo:8,noveno:9,decimo:10};
      return String(map[m.toLowerCase()] || m);
    })
    .replace(/pre[ -]*kinder/gi, 'pre-kinder')
    .replace(/pre[ -]*primario/gi, 'pre-primario')
    .replace(/maternal/gi, 'parvulos')
    .replace(/manternal/gi, 'parvulos')
    .replace(/parvalo(?!s)|parvulo(?!s)/gi, 'parvulos')
    .replace(/parvulos\s*([ivx123]+|\b[123]\b)/gi, (m, n) => {
      if (!n) return m;
      const tok = String(n).toLowerCase();
      const map = {i:1,ii:2,iii:3,iv:4,v:5,x:10,'1':1,'2':2,'3':3};
      const num = map[tok];
      return num ? `parvulos ${num}` : m;
    })
    .replace(/\s+/g, ' ').trim();
  const key = normalize(input);
  if (!key) return null;
  const norm = (c) => [normalize(c.level), normalize(c.name), normalize(`${c.id} ${c.line}`)];
  // 1ª pasada: igualdad exacta (evita que "Párvulos II" caiga en "Párvulos I"
  // o "kinder" en "Pre-Kínder" por match de subcadena).
  const exact = CANONICAL_CLASSROOMS.find((c) => { const ks = norm(c); return ks[0] === key || ks[1] === key || ks[2] === key; });
  if (exact) return exact;
  // 2ª pasada: subcadena, eligiendo la canónica MÁS CORTA (más específica).
  // Sin esto, la clave corta "1" (de "1ro") cae en "parvulos 1" (Párvulos I)
  // en vez de "1 1" (1° Primero).
  let best = null, bestLen = Infinity;
  for (const c of CANONICAL_CLASSROOMS) {
    const ks = norm(c);
    if (!ks.some((ck) => ck.includes(key) || key.includes(ck))) continue;
    const len = Math.min(...ks.filter((ck) => ck.includes(key) || key.includes(ck)).map((ck) => ck.length));
    if (len < bestLen) { best = c; bestLen = len; }
  }
  return best;
}

/** Calcula edad total en días desde una fecha de nacimiento. */
export function ageInDays(birthDate, refDate = new Date()) {
  if (!birthDate) return null;
  const b = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(b) || b > refDate) return null;
  return Math.max(0, Math.round((refDate - b) / 86400000));
}

/** Calcula edad en años decimales a partir de días. */
export function daysToYears(days) {
  if (days === null || days === undefined || isNaN(days)) return null;
  return days / 365.25;
}

/**
 * Valida si totalDays entra en el rango de un aula canónica.
 * Retorna: { ok: boolean, range: Object|null, isSpecial: boolean, suggestedLevel: string }
 * isSpecial=true → no hay control de edad (Verano, Afterschool...)
 */
export function validateAgeForClassroom(totalDays, levelOrName) {
  if (totalDays === null || totalDays === undefined) {
    return { ok: false, range: null, isSpecial: false, suggestedLevel: '' };
  }
  const isSpecial = SPECIAL_CLASSROOMS.some((s) => {
    const k1 = String(s).toLowerCase().replace(/\s+/g, '');
    const k2 = String(levelOrName || '').toLowerCase().replace(/\s+/g, '');
    return k1 === k2;
  });
  if (isSpecial) {
    return { ok: true, range: null, isSpecial: true, suggestedLevel: '' };
  }
  const range = findCanonicalClassroom(levelOrName);
  if (!range) {
    const suggested = suggestClassroomByAge(totalDays);
    return { ok: false, range: null, isSpecial: false, suggestedLevel: suggested?.level || '' };
  }
  const ok = totalDays >= range.minDays && totalDays < range.maxDays;
  const suggested = suggestClassroomByAge(totalDays);
  return { ok, range, isSpecial: false, suggestedLevel: suggested?.level || '' };
}

/** Retorna el aula canónica sugerida por edad en días, o null. */
export function suggestClassroomByAge(totalDays) {
  if (totalDays === null || totalDays === undefined || totalDays < 45) return null;
  return CANONICAL_CLASSROOMS.find((c) => totalDays >= c.minDays && totalDays < c.maxDays) || null;
}

// ============================
// 🔑 CLAVES Y CONFIGURACIÓN
// ============================
export const CONFIG = Object.freeze({
  GOOGLE_SHEET_ID: '1UoYhq7nHbtHfzfOT3im4l4UKwPBCy2zc-rSBHV_oA_k',
  TERMS_VERSION: '1.0'
});

// ============================
// 🛠️ HELPERS
// ============================

/**
 * ✅ Valida rol
 */
export function isValidRole(role) {
  return ROLE_LIST.includes(role);
}

/**
 * 🔐 Normaliza texto seguro
 */
export function normalize(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

/**
 * ✅ Valida estado de pago
 */
export function isValidPaymentStatus(status) {
  return Object.values(PAYMENT_STATUS).includes(status);
}

/**
 * ✅ Valida estado de incidencia
 */
export function isValidInquiryStatus(status) {
  return Object.values(INQUIRY_STATUS).includes(status);
}

/**
 * 🏫 DEDUPLICADOR DE AULAS (fuente única de verdad)
 * Agrupa aulas por: 1) CANÓNICA (por findCanonicalClassroom + level/name)
 *                  2) ESPECIAL (por findSpecialClassroom)
 *                  3) key custom: special | canonKey | `${name}__${level}`
 *
 * Reglas de scoring por grupo (mayor gana):
 *   +10000 → NO contiene "línea"/"linea" en name ni en level (prioridad máxima)
 *   +1000  → name coincide exactamente con el nombre canónico oficial
 *   +5000  → NO es especial (especiales solo ganan en su propio grupo)
 *   +100   → tiene teacher_id (tiene maestra asignada)
 *   +10    → tiene is_special=false (aula regular)
 *   tie-breaker: menor id
 *
 * Fusiona: suma student_count a la ganadora si estaba dispersa.
 *
 * @param {Array<any>} rows  lista de aulas (BD)
 * @returns {Array<any>}     array dedupeado (mismo orden canónico luego especiales)
 */
export function dedupeClassrooms(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const groups = new Map();

  for (const row of rows) {
    if (!row) continue;
    if (row.deleted_at) continue; // excluir soft-deleted por si acaso

    let groupKey = null;
    let canonicalMeta = null;
    const canon = findCanonicalClassroom(row.level || row.name || '');
    if (canon) {
      groupKey = `canon:${canon.id}`;
      canonicalMeta = canon;
    } else {
      const spec = findSpecialClassroom(row.name) || findSpecialClassroom(row.level);
      if (spec) {
        groupKey = `spec:${spec.key}`;
      }
    }
    if (!groupKey) {
      const n = String(row.name || '').trim().toLowerCase();
      const l = String(row.level || '').trim().toLowerCase();
      groupKey = `custom:${n}__${l}`;
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        canonicalMeta,
        items: [],
      });
    }
    groups.get(groupKey).items.push(row);
  }

  const result = [];
  const hasLinePattern = (s) => /linea/i.test(String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

  for (const { groupKey, canonicalMeta, items } of groups.values()) {
    if (items.length === 1) {
      result.push({ ...items[0] });
      continue;
    }

    // Scoring
    let best = null;
    let bestScore = -Infinity;
    let totalCount = 0;

    for (const it of items) {
      let score = 0;
      if (!hasLinePattern(it.name) && !hasLinePattern(it.level)) score += 10000;
      if (canonicalMeta && it.name === canonicalMeta.name) score += 2000;   // fila ya oficial → carga su id
      else if (canonicalMeta && it.level === canonicalMeta.level) score += 1000;
      if (groupKey.startsWith('spec:')) score += 0;
      else if (!groupKey.startsWith('spec:')) score += 5000;
      if (it.teacher_id) score += 100;
      if (it.is_special === false) score += 10;
      score -= (it.id ?? 0) * 0.0001; // menor id gana empates

      if (score > bestScore) {
        bestScore = score;
        best = it;
      }

      if (typeof it.student_count === 'number') totalCount += it.student_count;
    }

    const winner = { ...best };
    if (totalCount > 0 && typeof best.student_count === 'number') {
      winner.student_count = totalCount;
    } else if (totalCount > 0) {
      winner.student_count = totalCount;
    }
    // ✅ El ganador adopta el nombre/nivel OFICIAL: una fila variante con
    //    maestra puede ganar el scoring, y no debe pintarse con su nombre sucio.
    if (canonicalMeta) {
      winner.name  = canonicalMeta.name;
      winner.level = canonicalMeta.level;
      if (!winner.teacher_id) {
        const withTeacher = items.find((it) => it.teacher_id);
        if (withTeacher) winner.teacher_id = withTeacher.teacher_id;
      }
    }
    result.push(winner);
  }

  // Orden estable: canónicas primero en su orden natural, luego especiales, luego custom
  return result.sort((a, b) => {
    const ca = findCanonicalClassroom(a.level || a.name || '');
    const cb = findCanonicalClassroom(b.level || b.name || '');
    if (ca && cb) return ca.id - cb.id;
    if (ca) return -1;
    if (cb) return 1;
    const sa = findSpecialClassroom(a.name) || findSpecialClassroom(a.level);
    const sb = findSpecialClassroom(b.name) || findSpecialClassroom(b.level);
    if (sa && sb) return String(sa.key).localeCompare(String(sb.key));
    if (sa) return -1;
    if (sb) return 1;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}