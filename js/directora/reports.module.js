
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

export const ReportsModule = {
  async init() {
    await this.loadDashboard();
    await this.loadReports();
    this.setupEventListeners();
  },

  async loadDashboard() {
    try {
      const { data: dashboard, error } = await supabase
        .from('v_reports_dashboard')
        // FIX select('*'): v_reports_dashboard is a view — select specific fields
        .select('total_reports, open_reports, resolved_reports, pending_reports, overdue_reports');

      if (error) throw error;

      // Update dashboard widgets
      const data = dashboard?.[0] || {};
      
      // Here you would update the dashboard UI with the data
      console.log('Reports dashboard data:', data);
    } catch (error) {
      console.error('Error loading reports dashboard:', error);
    }
  },

  async loadReports(status = null) {
    const container = document.getElementById('reportsList');
    if (!container) return;

    try {
      const { data: reports, error } = await supabase.rpc('get_reports', { p_status: status });

      if (error) throw error;

      if (!reports?.length) {
        container.innerHTML = `
          <div class="p-8 text-center text-slate-400">
            <i data-lucide="inbox" class="w-16 h-16 mx-auto mb-4 text-slate-300"></i>
            <p class="font-bold">No hay reportes</p>
          </div>
        `;
      } else {
        container.innerHTML = reports.map(report => this.renderReportRow(report)).join('');
      }

      if (window.lucide) lucide.createIcons();
    } catch (error) {
      console.error('Error loading reports:', error);
      container.innerHTML = `
        <div class="p-8 text-center text-slate-400">
          <p class="font-bold">Error al cargar reportes</p>
        </div>
      `;
    }
  },

  renderReportRow(report) {
    const statusColors = {
      pending: 'bg-amber-100 text-amber-700',
      in_review: 'bg-blue-100 text-blue-700',
      resolved: 'bg-green-100 text-green-700',
      closed: 'bg-slate-100 text-slate-700'
    };

    const statusLabels = {
      pending: 'Pendiente',
      in_review: 'En Revisión',
      resolved: 'Resuelto',
      closed: 'Cerrado'
    };

    const severityColors = {
      leve: 'text-green-600',
      media: 'text-amber-600',
      alta: 'text-red-600'
    };

    const severityLabels = {
      leve: 'Leve',
      media: 'Media',
      alta: 'Alta'
    };

    const typeLabels = {
      queja_maestra: 'Queja sobre Maestra',
      queja_directora: 'Queja sobre Directora',
      incidente_estudiante: 'Incidente de Estudiante',
      otro: 'Otro'
    };

    return `
      <tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors">
        <td class="py-4 px-4">
          <p class="font-bold text-slate-800">${typeLabels[report.report_type]}</p>
          <p class="text-xs text-slate-400">${report.category}</p>
        </td>
        <td class="py-4 px-4">
          <p class="text-sm text-slate-600">${report.reporter_name}</p>
        </td>
        <td class="py-4 px-4">
          ${report.target_teacher_name ? `<p class="text-sm text-slate-600">${report.target_teacher_name}</p>` : ''}
          ${report.target_student_name ? `<p class="text-sm text-slate-600">${report.target_student_name}</p>` : ''}
        </td>
        <td class="py-4 px-4">
          <span class="${severityColors[report.severity]} font-bold text-sm">${severityLabels[report.severity]}</span>
        </td>
        <td class="py-4 px-4">
          <span class="px-3 py-1 rounded-full text-xs font-black ${statusColors[report.status]}">${statusLabels[report.status]}</span>
        </td>
        <td class="py-4 px-4">
          <p class="text-xs text-slate-400">${new Date(report.created_at).toLocaleDateString()}</p>
        </td>
        <td class="py-4 px-4">
          <button onclick="ReportsModule.openReportDetail(${report.id})" class="px-4 py-2 bg-blue-100 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-200 transition-colors">
            Ver
          </button>
        </td>
      </tr>
    `;
  },

  setupEventListeners() {
    // Status filter
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.loadReports(e.target.value || null);
      });
    }
  },

  async openReportDetail(reportId) {
    try {
      // Get report details
      const { data: reports, error: reportError } = await supabase.rpc('get_reports');
      if (reportError) throw reportError;

      const report = reports.find(r => r.id === reportId);
      if (!report) throw new Error('Report not found');

      // Get report history
      const { data: history, error: historyError } = await supabase
        .from('report_history')
        .select('*, changed_by:changed_by(name)')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true });

      if (historyError) throw historyError;

      // Create modal HTML
      const modalHtml = this.createReportDetailModal(report, history);
      
      // Show modal
      if (window.openGlobalModal) {
        window.openGlobalModal(modalHtml);
      }

      // Setup modal event listeners
      this.setupReportDetailListeners(reportId);
    } catch (error) {
      console.error('Error opening report detail:', error);
      Helpers.safeToast('Error al abrir el reporte', 'error');
    }
  },

  createReportDetailModal(report, history) {
    const statusColors = {
      pending: 'bg-amber-100 text-amber-700',
      in_review: 'bg-blue-100 text-blue-700',
      resolved: 'bg-green-100 text-green-700',
      closed: 'bg-slate-100 text-slate-700'
    };

    const statusLabels = {
      pending: 'Pendiente',
      in_review: 'En Revisión',
      resolved: 'Resuelto',
      closed: 'Cerrado'
    };

    const typeLabels = {
      queja_maestra: 'Queja sobre Maestra',
      queja_directora: 'Queja sobre Directora',
      incidente_estudiante: 'Incidente de Estudiante',
      otro: 'Otro'
    };

    return `
      <div class="bg-white rounded-[2rem] overflow-hidden shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div class="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 class="font-black text-xl text-white">Detalle de Reporte</h3>
            <p class="text-xs text-white/70 font-bold">${typeLabels[report.report_type]}</p>
          </div>
          <button onclick="window.closeGlobalModal?.()" class="p-2 hover:bg-white/20 rounded-full transition-colors text-white">
            <i data-lucide="x" class="w-6 h-6"></i>
          </button>
        </div>
        
        <div class="p-6 overflow-y-auto flex-1">
          <div class="flex flex-wrap gap-3 mb-6">
            <span class="px-3 py-1 rounded-full text-xs font-black ${statusColors[report.status]}">${statusLabels[report.status]}</span>
            <span class="px-3 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700">${new Date(report.created_at).toLocaleDateString()}</span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Reportado por</p>
              <p class="font-bold text-slate-800">${report.reporter_name}</p>
            </div>
            ${report.target_teacher_name ? `
              <div>
                <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Maestra</p>
                <p class="font-bold text-slate-800">${report.target_teacher_name}</p>
              </div>
            ` : ''}
            ${report.target_student_name ? `
              <div>
                <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Estudiante</p>
                <p class="font-bold text-slate-800">${report.target_student_name}</p>
              </div>
            ` : ''}
            ${report.classroom_name ? `
              <div>
                <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Aula</p>
                <p class="font-bold text-slate-800">${report.classroom_name}</p>
              </div>
            ` : ''}
          </div>
          
          <div class="mb-6">
            <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Categoría</p>
            <p class="font-bold text-slate-800">${report.category}</p>
          </div>
          
          <div class="mb-6">
            <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Descripción</p>
            <p class="text-sm text-slate-600">${report.description}</p>
          </div>
          
          ${report.evidence_url ? `
            <div class="mb-6">
              <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Evidencia</p>
              <a href="${report.evidence_url}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-200 transition-colors">
                <i data-lucide="file" class="w-4 h-4"></i> Ver evidencia
              </a>
            </div>
          ` : ''}
          
          ${report.response ? `
            <div class="mb-6 p-4 bg-green-50 rounded-xl border border-green-100">
              <p class="text-[10px] font-black text-green-600 uppercase mb-1">Respuesta</p>
              <p class="text-sm text-green-800">${report.response}</p>
              ${report.response_by_name ? `<p class="text-xs text-green-500 mt-2">Por: ${report.response_by_name} el ${new Date(report.response_at).toLocaleDateString()}</p>` : ''}
            </div>
          ` : ''}
          
          ${history?.length ? `
            <div class="mt-6">
              <p class="text-[10px] font-black text-slate-400 uppercase mb-3">Historial</p>
              <div class="space-y-3">
                ${history.map(h => `
                  <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div class="flex justify-between items-start mb-2">
                      <p class="font-bold text-slate-800 text-sm">${h.changed_by?.name || 'Sistema'}</p>
                      <p class="text-xs text-slate-400">${new Date(h.created_at).toLocaleString()}</p>
                    </div>
                    ${h.old_status ? `<p class="text-xs text-slate-500">Estado anterior: ${h.old_status}</p>` : ''}
                    ${h.new_status ? `<p class="text-xs text-slate-500">Estado nuevo: ${h.new_status}</p>` : ''}
                    ${h.comment ? `<p class="text-sm text-slate-600 mt-1">${h.comment}</p>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <div class="mt-8 pt-6 border-t border-slate-200">
            <form id="reportActionForm" class="space-y-4">
              <div>
                <label class="block text-xs font-black text-slate-400 uppercase mb-2">Estado</label>
                <select id="reportStatusSelect" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                  <option value="pending" ${report.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                  <option value="in_review" ${report.status === 'in_review' ? 'selected' : ''}>En Revisión</option>
                  <option value="resolved" ${report.status === 'resolved' ? 'selected' : ''}>Resuelto</option>
                  <option value="closed" ${report.status === 'closed' ? 'selected' : ''}>Cerrado</option>
                </select>
              </div>
              
              <div>
                <label class="block text-xs font-black text-slate-400 uppercase mb-2">Respuesta (opcional)</label>
                <textarea id="reportResponseInput" rows="3" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Escribe una respuesta...">${report.response || ''}</textarea>
              </div>
              
              <div>
                <label class="block text-xs font-black text-slate-400 uppercase mb-2">Comentario (opcional)</label>
                <textarea id="reportCommentInput" rows="2" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Agrega un comentario..."></textarea>
              </div>
              
              <div class="flex gap-3 pt-2">
                <button type="button" onclick="window.closeGlobalModal?.()" class="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  Cancelar
                </button>
                <button type="submit" class="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition-all">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  },

  setupReportDetailListeners(reportId) {
    const form = document.getElementById('reportActionForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleUpdateReport(reportId, e);
      });
    }
  },

  async handleUpdateReport(reportId, e) {
    try {
      const newStatus = document.getElementById('reportStatusSelect').value;
      const response = document.getElementById('reportResponseInput').value || null;
      const comment = document.getElementById('reportCommentInput').value || null;

      const { data: result, error } = await supabase.rpc('update_report_status', {
        p_report_id: reportId,
        p_new_status: newStatus,
        p_response: response,
        p_comment: comment
      });

      if (error) throw error;

      Helpers.safeToast('Reporte actualizado exitosamente', 'success');
      window.closeGlobalModal?.();
      await this.loadReports();
      await this.loadDashboard();
    } catch (error) {
      console.error('Error updating report:', error);
      Helpers.safeToast('Error al actualizar el reporte', 'error');
    }
  }
};

window.ReportsModule = ReportsModule;
