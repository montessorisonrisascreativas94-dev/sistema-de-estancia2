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
  Object.freeze({ id: 1,  name: 'Párvulos I',                 level: 'Párvulos I',                 color: '#F472B6', line: 'Rosa',    minDays: 45,   maxDays: 365,   minAge: 0.12, maxAge: 1.0,  labelRange: '45 días – 11 meses' }),
  Object.freeze({ id: 2,  name: 'Párvulos II',                level: 'Párvulos II',                color: '#FB923C', line: 'Naranja', minDays: 365,  maxDays: 730,   minAge: 1.0,  maxAge: 2.0,  labelRange: '12 – 23 meses' }),
  Object.freeze({ id: 3,  name: 'Párvulos III',               level: 'Párvulos III',               color: '#FACC15', line: 'Amarillo',minDays: 730,  maxDays: 1095,  minAge: 2.0,  maxAge: 3.0,  labelRange: '24 – 35 meses' }),
  Object.freeze({ id: 4,  name: 'Pre-Kínder – Línea Blanca',  level: 'Pre-Kínder – Línea Blanca',  color: '#E5E7EB', line: 'Blanca',  minDays: 1095, maxDays: 1460,  minAge: 3.0,  maxAge: 4.0,  labelRange: '3 años' }),
  Object.freeze({ id: 5,  name: 'Kínder – Línea Gris',        level: 'Kínder – Línea Gris',        color: '#9CA3AF', line: 'Gris',    minDays: 1460, maxDays: 1825,  minAge: 4.0,  maxAge: 5.0,  labelRange: '4 años' }),
  Object.freeze({ id: 6,  name: 'Pre-Primario – Línea Negra', level: 'Pre-Primario – Línea Negra', color: '#374151', line: 'Negra',   minDays: 1825, maxDays: 2190,  minAge: 5.0,  maxAge: 6.0,  labelRange: '5 años' }),
  Object.freeze({ id: 7,  name: '1ro – Línea Roja',           level: '1ro – Línea Roja',           color: '#EF4444', line: 'Roja',    minDays: 2190, maxDays: 2555,  minAge: 6.0,  maxAge: 7.0,  labelRange: '6 años' }),
  Object.freeze({ id: 8,  name: '2do – Línea Amarilla',       level: '2do – Línea Amarilla',       color: '#EAB308', line: 'Amarilla',minDays: 2555, maxDays: 2920,  minAge: 7.0,  maxAge: 8.0,  labelRange: '7 años' }),
  Object.freeze({ id: 9,  name: '3ro – Línea Azul',           level: '3ro – Línea Azul',           color: '#3B82F6', line: 'Azul',    minDays: 2920, maxDays: 3285,  minAge: 8.0,  maxAge: 9.0,  labelRange: '8 años' }),
  Object.freeze({ id: 10, name: '4to – Línea Verde',          level: '4to – Línea Verde',          color: '#22C55E', line: 'Verde',   minDays: 3285, maxDays: 3650,  minAge: 9.0,  maxAge: 10.0, labelRange: '9 años' }),
  Object.freeze({ id: 11, name: '5to – Línea Naranja',        level: '5to – Línea Naranja',        color: '#F97316', line: 'Naranja', minDays: 3650, maxDays: 4015,  minAge: 10.0, maxAge: 11.0, labelRange: '10 años' }),
  Object.freeze({ id: 12, name: '6to – Línea Morado',         level: '6to – Línea Morado',         color: '#A855F7', line: 'Morada',  minDays: 4015, maxDays: 4380,  minAge: 11.0, maxAge: 12.0, labelRange: '11 años' }),
]);

export const SPECIAL_CLASSROOMS = Object.freeze([
  'Verano', 'Inglés Afterschool', 'Ballet / Danza',
  'Taekwondo', 'Sala de Tarea', 'Cuido',
]);

export const CANONICAL_CLASSROOM_LEVELS = Object.freeze(
  CANONICAL_CLASSROOMS.map((c) => c.level)
);

/** Busca un aula canónica por nombre/level (normaliza acentos). */
export function findCanonicalClassroom(levelOrName) {
  if (!levelOrName) return null;
  const key = String(levelOrName)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
  return CANONICAL_CLASSROOMS.find((c) => {
    const cK = c.level.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
    const cK2 = c.name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
    return cK === key || cK2 === key;
  }) || null;
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