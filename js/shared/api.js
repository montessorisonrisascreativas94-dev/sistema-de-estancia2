import { supabase } from './supabase.js';
import { TABLES, ROLES } from './constants.js';
import { withLoading } from './loading-feedback.js';

/**
 * 🔥 Helper PRO
 */
const FRIENDLY_DB_ERRORS = {
  'database connection': 'Estamos trabajando contigo: hubo un problema de conexión.',
  'network': 'Parece que no hay conexión. Revisa tu internet e inténtalo de nuevo.',
  'fetch failed': 'No pudimos comunicarnos con el servidor. Inténtalo de nuevo.',
  'timeout': 'La solicitud tardó demasiado. Estamos contigo, intenta de nuevo.',
  'permission denied': 'No tienes permiso para realizar esta acción.',
  'row level security': 'No tienes permiso para acceder a esa información.',
  'jwt': 'Tu sesión venció. Inicia sesión nuevamente.',
  'already exists': 'Ese registro ya existe. Verifícalo e inténtalo de nuevo.',
  'not found': 'No encontramos lo que buscas.'
};

function friendlyDbError(msg = '') {
  const lower = msg.toLowerCase();
  for (const [key, friendly] of Object.entries(FRIENDLY_DB_ERRORS)) {
    if (lower.includes(key)) return friendly;
  }
  return msg;
}

async function handle(queryPromise, context = 'API') {
  const { data, error } = await queryPromise;

  if (error) {
    const friendly = friendlyDbError(error.message);
    if (friendly !== error.message && typeof window !== 'undefined' && window.Helpers?.toast) {
      window.Helpers.toast(friendly, 'error', 6000);
    }
    const wrapped = new Error(friendly);
    wrapped.originalMessage = error.message;
    wrapped.code = error.code;
    throw wrapped;
  }

  return data;
}

/**
 * Versión con feedback empático: muestra mensaje si la consulta tarda.
 */
function handleSlow(queryPromise, context = 'API', opts = {}) {
  return withLoading(`Cargando datos${context ? ' de ' + context : ''}...`, () => handle(queryPromise, context), {
    containerId: opts.containerId || null,
    minMs: opts.minMs || 800,
    patienceMs: opts.patienceMs || 2500
  });
}

/**
 * 🔐 Sanitizar búsqueda (PRO)
 */
function sanitize(text = '') {
  return String(text)
    .trim()
    .replace(/[%_]/g, ''); // evita conflictos con ilike
}

/**
 * 🧱 Base query helper
 */
const db = (table) => supabase.from(table);

/**
 * 🚀 API PRO
 */
export const Api = {
  /**
   * 👨‍🎓 Estudiantes
   */
  async getStudents(searchTerm = '', onlyNoClass = false) {
    let query = db(TABLES.STUDENTS)
      .select(`
        id,
        name,
        classroom_id,
        classrooms(name),
        parent:parent_id(name)
      `)
      .eq('is_active', true)
      .order('name');

    if (searchTerm) {
      query = query.ilike('name', `%${sanitize(searchTerm)}%`);
    }

    if (onlyNoClass) {
      query = query.is('classroom_id', null);
    }

    return (await handle(query, 'getStudents')) || [];
  },

  /**
   * 🏫 Aulas
   */
  async getClassrooms(teacherFilter = 'all') {
    let query = db(TABLES.CLASSROOMS)
      .select(`
        id,
        name,
        capacity,
        teacher_id,
        is_live,
        teacher:teacher_id(name)
      `)
      .order('name');

    if (teacherFilter !== 'all') {
      query = query.eq('teacher_id', teacherFilter);
    }

    return (await handle(query, 'getClassrooms')) || [];
  },

  /**
   * 👩‍🏫 Maestras
   */
  async getTeachers() {
    const query = db(TABLES.PROFILES)
      .select('id, name, email, phone')
      .eq('role', ROLES.MAESTRA)
      .order('name');

    return (await handle(query, 'getTeachers')) || [];
  },

  /**
   * 📊 Estadísticas de asistencia
   */
  async getAttendanceStats(date) {
    const query = db(TABLES.ATTENDANCE)
      .select(`
        status,
        classroom_id,
        classroom:classrooms(name)
      `)
      .eq('date', date);

    return (await handle(query, 'getAttendanceStats')) || [];
  },

  /**
   * 📋 Detalle de asistencia
   */
  async getAttendanceDetail(classroomId, date) {
    const [students, attendance] = await Promise.all([
      handle(
        db(TABLES.STUDENTS)
          .select('id, name')
          .eq('classroom_id', classroomId)
          .eq('is_active', true)
          .order('name'),
        'attendance.students'
      ),
      handle(
        db(TABLES.ATTENDANCE)
          .select('student_id, status, created_at')
          .eq('classroom_id', classroomId)
          .eq('date', date),
        'attendance.records'
      )
    ]);

    return {
      students: students || [],
      attendance: attendance || []
    };
  },

  /**
   * 💰 Pagos
   */
  async getPayments(month, year) {
    const query = db(TABLES.PAYMENTS)
      .select('id, title, message, type, link, is_read, created_at')
      .eq('month_paid', month)
      .gte('created_at', `${year}-01-01`)
      .lte('created_at', `${year}-12-31`);

    return (await handle(query, 'getPayments')) || [];
  },

  /**
   * 💳 Actualizar pago
   */
  async updatePaymentStatus(id, status, validatedBy, notes = '') {
    const updates = {
      status,
      validated_by: validatedBy,
      ...(notes && { notes })
    };

    const query = db(TABLES.PAYMENTS)
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        student:students(name, parent_id)
      `)
      .single();

    return await handle(query, 'updatePaymentStatus');
  },

  // ===========================================================================
  // 🚀 MÉTODOS UNIFICADOS PARA PANEL PADRES (Producción Real)
  // ===========================================================================

  /**
   * 📅 Historial de asistencia de un estudiante (Para Calendario)
   * Soluciona el error de "calendario vacío" trayendo datos exactos por mes.
   */
  async getStudentAttendance(studentId, year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const query = db(TABLES.ATTENDANCE)
      .select('date, status')
      .eq('student_id', studentId)
      .gte('date', startDate)
      .lte('date', endDate);

    return (await handle(query, 'getStudentAttendance')) || [];
  },

  /**
   * 💰 Estado financiero completo (Soluciona el error de "Monto 0")
   * Cruza la configuración del alumno con los pagos reales en la base de datos.
   */
  async getStudentFinancialStatus(studentId) {
    const [student, pendingPayments, history] = await Promise.all([
      // 1. Datos base (cuota mensual configurada)
      handle(db(TABLES.STUDENTS).select('monthly_fee, due_day').eq('id', studentId).single(), 'getStudentFee'),
      // 2. Deuda real acumulada (Tabla payments)
      handle(db(TABLES.PAYMENTS).select('id, amount, status, month_paid, due_date, paid_date, method, proof_url, created_at').eq('student_id', studentId).in('status', ['pending', 'overdue']).order('due_date', { ascending: true }), 'getPendingPayments'),
      // 3. Historial de pagos
      handle(db(TABLES.PAYMENTS).select('id, amount, status, month_paid, due_date, paid_date, method, proof_url, created_at').eq('student_id', studentId).eq('status', 'paid').order('created_at', { ascending: false }).limit(5), 'getPaymentHistory')
    ]);

    const totalDebt = (pendingPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return {
      config: { monthly_fee: student?.monthly_fee || 0, due_day: student?.due_day || 5 },
      debt: { total: totalDebt, items: pendingPayments || [] }, // Items detallados para el formulario
      history: history || []
    };
  },

  /**
   * 🎓 Notas unificadas (Tareas + Boletín)
   */
  async getStudentGrades(studentId) {
    const [tasks, reports] = await Promise.all([
      // FIX 404: Explicit columns instead of select('*, task:task_id(*)')
      // Wildcard join fails if the FK relation isn't registered in PostgREST schema cache.
      handle(
        db(TABLES.TASK_EVIDENCES)
          .select('id, task_id, student_id, status, grade_letter, stars, file_url, comment, created_at, task:tasks!task_evidences_task_id_fkey(id, title)')
          .eq('student_id', studentId)
          .not('grade_letter', 'is', null)
          .order('created_at', { ascending: false }),
        'getTaskGrades'
      ),
      handle(db(TABLES.GRADES).select('id, subject, score, numeric_score, period_id, periods(name), notes, created_at').eq('student_id', studentId).order('created_at', { ascending: true }), 'getReportGrades')
    ]);

    return {
      tasks: tasks || [], // Evaluación continua (estrellas/letras)
      reports: reports || [] // Notas finales de periodo
    };
  }
};