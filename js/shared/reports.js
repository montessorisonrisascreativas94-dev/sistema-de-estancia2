
/**
 * Módulo de Reportes y Incidencias
 */
import { supabase } from './supabase.js';

/**
 * Crea un nuevo reporte
 * @param {Object} data - Datos del reporte
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function createReport(data) {
  try {
    const { data: result, error } = await supabase.rpc('create_report', {
      p_report_type: data.reportType,
      p_target_teacher_id: data.targetTeacherId || null,
      p_target_student_id: data.targetStudentId || null,
      p_classroom_id: data.classroomId || null,
      p_category: data.category,
      p_description: data.description,
      p_severity: data.severity || 'media',
      p_is_anonymous: data.isAnonymous || false,
      p_evidence_url: data.evidenceUrl || null
    });

    if (error) throw error;
    return result;
  } catch (error) {
    console.error('Error creating report:', error);
    throw error;
  }
}

/**
 * Actualiza el estado de un reporte
 * @param {number} reportId - ID del reporte
 * @param {string} newStatus - Nuevo estado
 * @param {string} [response] - Respuesta
 * @param {string} [comment] - Comentario
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function updateReportStatus(reportId, newStatus, response = null, comment = null) {
  try {
    const { data: result, error } = await supabase.rpc('update_report_status', {
      p_report_id: reportId,
      p_new_status: newStatus,
      p_response: response,
      p_comment: comment
    });

    if (error) throw error;
    return result;
  } catch (error) {
    console.error('Error updating report status:', error);
    throw error;
  }
}

/**
 * Obtiene reportes del dashboard
 * @param {string} [status] - Filtrar por estado
 * @returns {Promise<Array>} Lista de reportes
 */
export async function getReports(status = null) {
  try {
    const { data, error } = await supabase.rpc('get_reports', { p_status: status });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting reports:', error);
    throw error;
  }
}

/**
 * Obtiene reportes propios del usuario
 * @returns {Promise<Array>} Lista de reportes
 */
export async function getMyReports() {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select(`
        *,
        target_teacher:target_teacher_id(name),
        target_student:target_student_id(name),
        classroom:classroom_id(name),
        response_by:response_by(name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting my reports:', error);
    throw error;
  }
}

/**
 * Obtiene el dashboard de reportes
 * @returns {Promise<Object>} Datos del dashboard
 */
export async function getReportsDashboard() {
  try {
    const { data, error } = await supabase
      .from('v_reports_dashboard')
      // FIX select('*'): explicit columns for v_reports_dashboard view
      .select('total_reports, open_reports, resolved_reports, pending_reports, overdue_reports, avg_resolution_days');

    if (error) throw error;
    return data?.[0] || {};
  } catch (error) {
    console.error('Error getting reports dashboard:', error);
    throw error;
  }
}

/**
 * Obtiene el historial de un reporte
 * @param {number} reportId - ID del reporte
 * @returns {Promise<Array>} Historial
 */
export async function getReportHistory(reportId) {
  try {
    const { data, error } = await supabase
      .from('report_history')
      .select(`
        *,
        changed_by:changed_by(name)
      `)
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting report history:', error);
    throw error;
  }
}

/**
 * Sube una evidencia (archivo)
 * @param {File} file - Archivo a subir
 * @returns {Promise<string>} URL del archivo
 */
export async function uploadEvidence(file) {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `reports/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('evidence')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('evidence')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading evidence:', error);
    throw error;
  }
}

/**
 * Obtiene la lista de maestras
 * @returns {Promise<Array>} Lista de maestras
 */
export async function getTeachers() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .eq('role', 'maestra');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting teachers:', error);
    throw error;
  }
}

/**
 * Obtiene la lista de estudiantes del padre
 * @returns {Promise<Array>} Lista de estudiantes
 */
export async function getMyStudents() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('students')
      .select('id, name, classroom_id')
      .eq('parent_id', user.id)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting my students:', error);
    throw error;
  }
}

/**
 * Obtiene la lista de aulas
 * @returns {Promise<Array>} Lista de aulas
 */
export async function getClassrooms() {
  try {
    const { data, error } = await supabase
      .from('classrooms')
      .select('id, name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting classrooms:', error);
    throw error;
  }
}

export default {
  createReport,
  updateReportStatus,
  getReports,
  getMyReports,
  getReportsDashboard,
  getReportHistory,
  uploadEvidence,
  getTeachers,
  getMyStudents,
  getClassrooms
};
