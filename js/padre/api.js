import { supabase } from '../shared/supabase.js';
import { TABLES } from './appState.js';
import { QueryCache } from '../shared/query-cache.js';

export function invalidateCache(pattern) {
  if (!pattern) { QueryCache.clear(); return; }
  QueryCache.invalidatePrefix(pattern);
}

/**
 * 🔥 Helper de manejo de errores centralizado
 */
async function handle(queryPromise, context = 'API') {
  const { data, error } = await queryPromise;
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

/**
 * 🚀 API Específica para el Panel de Padres
 */
export const Api = {
  /**
   * 👶 Obtener datos detallados del estudiante
   */
  async getStudent(studentId) {
    return QueryCache.get(`student:${studentId}`, () =>
      handle(
        supabase
          .from(TABLES.STUDENTS)
          .select(`*, classrooms(id, name, teacher_id, level)`)
          .eq('id', studentId)
          .single(),
        'getStudent'
      )
    , 60_000);
  },

  /**
   * 💰 Estado financiero completo
   */
  async getStudentFinancialStatus(studentId) {
    const [student, allPending, history] = await Promise.all([
      handle(supabase.from(TABLES.STUDENTS).select('monthly_fee, due_day').eq('id', studentId).single(), 'getStudentFee'),
      handle(supabase.from(TABLES.PAYMENTS)
        .select('id, amount, status, due_date, month_paid, evidence_url, proof_url, method')
        .eq('student_id', studentId)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(24), 'getPendingPayments'),
      handle(supabase.from(TABLES.PAYMENTS)
        .select('id, amount, status, due_date, month_paid, paid_date, method')
        .eq('student_id', studentId)
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(5), 'getPaymentHistory')
    ]);

    const trueDebt = (allPending || []).filter(p => !p.evidence_url && !p.proof_url);
    const totalDebt = trueDebt.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return {
      config: { monthly_fee: student?.monthly_fee || 0, due_day: student?.due_day || 5 },
      debt: { total: totalDebt, items: allPending || [] },
      history: history || []
    };
  },

  /**
   * 📅 Historial de asistencia por mes
   */
  async getStudentAttendance(studentId, year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    return await handle(
      supabase.from('attendance')
        .select('date, status, check_in, check_out')
        .eq('student_id', studentId)
        .gte('date', startDate)
        .lte('date', endDate),
      'getStudentAttendance'
    );
  },

  /**
   * 🎓 Notas y Evidencias
   */
  async getStudentGrades(studentId) {
    return QueryCache.get(`grades:${studentId}`, async () => {
      const [evidences, reports] = await Promise.all([
        handle(
          supabase.from(TABLES.TASK_EVIDENCES)
            .select('id, status, grade_letter, stars, comment, created_at, task:task_id(title, due_date)')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false })
            .limit(50),
          'getTaskGrades'
        ),
        handle(supabase.from(TABLES.GRADES)
          .select('id, subject, score, numeric_score, period_id, periods(name), created_at')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .limit(20), 'getReportGrades')
      ]);
      return { evidences: evidences || [], reports: reports || [] };
    }, 30_000);
  },

  /**
   * 📝 Rutina diaria (Daily Logs)
   */
  async getDailyLog(studentId, date) {
    // Prioriza el reporte publicado, pero si la fila quedó con otro status
    // (borrador / legado) igual se muestra: es mejor ver la rutina que un
    // "Sin reporte" aunque la maestra sí la registró.
    // Se usa limit(1) en vez de maybeSingle para no romper si hay filas duplicadas.
    const rows = await handle(
      supabase.from(TABLES.DAILY_LOGS)
        .select('mood, food, nap, eating, sleeping, activities, notes, infant_data, date, status, created_at')
        .eq('student_id', studentId)
        .eq('date', date)
        .order('status', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1),
      'getDailyLog'
    );
    if (rows && rows[0]) return rows[0];

    // Diagnóstico: sin fila para hoy. Consultamos las últimas fechas del
    // estudiante para distinguir "no hay datos" de "RLS/estudiante distinto".
    try {
      const { data: recent } = await supabase.from(TABLES.DAILY_LOGS)
        .select('date, status')
        .eq('student_id', studentId)
        .order('date', { ascending: false })
        .limit(3);
      console.warn('[padre.getDailyLog] Sin rutina para hoy:', {
        studentId, date,
        ultimasFechasVisibles: recent || [],
        nota: (recent && recent.length)
          ? 'La RLS SÍ permite leer daily_logs: revisa la fecha/estado de la fila de hoy.'
          : 'La RLS NO devuelve ninguna fila de daily_logs para este estudiante.'
      });
    } catch (_) {}

    return null;
  },

  /**
   * 🎒 Tareas pendientes y entregadas
   */
  async getStudentTasks(classroomId, studentId) {
    const [tasks, evidences] = await Promise.all([
      handle(supabase.from(TABLES.TASKS)
        .select('id, title, description, due_date, file_url')
        .eq('classroom_id', classroomId)
        .order('due_date', { ascending: true })
        .limit(30), 'getTasks'),
      handle(supabase.from(TABLES.TASK_EVIDENCES)
        .select('id, task_id, status, grade_letter, stars, file_url, created_at')
        .eq('student_id', studentId)
        .limit(50), 'getEvidences')
    ]);

    return { tasks: tasks || [], evidences: evidences || [] };
  }
};
