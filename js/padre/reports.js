
import { supabase } from '../shared/supabase.js';
import { Helpers } from './helpers.js';

export const ReportsModule = {
  async init() {
    await this.loadReports();
    this.setupEventListeners();
  },

  async loadReports() {
    const container = document.getElementById('reportsList');
    if (!container) return;

    try {
      const { data: reports, error } = await supabase
        .from('reports')
        .select('*, target_teacher:target_teacher_id(name), target_student:target_student_id(name), classroom:classroom_id(name), response_by:response_by(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!reports?.length) {
        container.innerHTML = `
          <div class="p-8 text-center text-slate-400">
            <i data-lucide="inbox" class="w-16 h-16 mx-auto mb-4 text-slate-300"></i>
            <p class="font-bold">No tienes reportes aún</p>
            <p class="text-sm mt-1">Crea tu primer reporte haciendo clic en "Nuevo Reporte"</p>
          </div>
        `;
      } else {
        container.innerHTML = reports.map(report => this.renderReportCard(report)).join('');
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

  renderReportCard(report) {
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
      <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h4 class="font-black text-slate-800">${typeLabels[report.report_type]}</h4>
            <p class="text-xs text-slate-400 font-bold mt-1">${new Date(report.created_at).toLocaleDateString()}</p>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-black ${statusColors[report.status]}">${statusLabels[report.status]}</span>
        </div>
        <p class="text-sm font-bold text-slate-700 mb-2">${report.category}</p>
        <p class="text-sm text-slate-600 mb-3">${report.description}</p>
        <div class="flex flex-wrap gap-3 text-xs font-bold text-slate-500 mb-3">
          <span class="${severityColors[report.severity]}">Severidad: ${severityLabels[report.severity]}</span>
          ${report.target_teacher?.name ? `<span>Maestra: ${report.target_teacher.name}</span>` : ''}
          ${report.target_student?.name ? `<span>Estudiante: ${report.target_student.name}</span>` : ''}
          ${report.classroom?.name ? `<span>Aula: ${report.classroom.name}</span>` : ''}
        </div>
        ${report.response ? `
          <div class="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p class="text-[10px] font-black text-blue-600 uppercase mb-1">Respuesta</p>
            <p class="text-sm text-blue-800">${report.response}</p>
            ${report.response_by?.name ? `<p class="text-xs text-blue-500 mt-1">Por: ${report.response_by.name} el ${new Date(report.response_at).toLocaleDateString()}</p>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  },

  setupEventListeners() {
    // New report button
    const newReportBtn = document.getElementById('btnNewReport');
    if (newReportBtn) {
      newReportBtn.addEventListener('click', () => {
        this.openNewReportModal();
      });
    }

    // Report type change
    const reportTypeSelect = document.getElementById('reportType');
    if (reportTypeSelect) {
      reportTypeSelect.addEventListener('change', (e) => {
        this.handleReportTypeChange(e.target.value);
      });
    }

    // Evidence file input
    const evidenceInput = document.getElementById('reportEvidence');
    if (evidenceInput) {
      evidenceInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        const fileNameEl = document.getElementById('evidenceFileName');
        if (fileNameEl && file) {
          fileNameEl.textContent = file.name;
        }
      });
    }

    // New report form submission
    const newReportForm = document.getElementById('newReportForm');
    if (newReportForm) {
      newReportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSubmitReport(e);
      });
    }
  },

  async openNewReportModal() {
    const modal = document.getElementById('modalNewReport');
    if (!modal) return;

    // Load teachers and students
    await Promise.all([this.loadTeachers(), this.loadStudents()]);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  },

  async loadTeachers() {
    try {
      const { data: teachers, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('role', 'maestra');

      if (error) throw error;

      const select = document.getElementById('targetTeacher');
      if (select) {
        select.innerHTML = '<option value="">Seleccionar maestra...</option>' +
          teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      }
    } catch (error) {
      console.error('Error loading teachers:', error);
    }
  },

  async loadStudents() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: students, error } = await supabase
        .from('students')
        .select('id, name')
        .eq('parent_id', user.id)
        .eq('is_active', true);

      if (error) throw error;

      const select = document.getElementById('targetStudent');
      if (select) {
        select.innerHTML = '<option value="">Seleccionar estudiante...</option>' +
          students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      }
    } catch (error) {
      console.error('Error loading students:', error);
    }
  },

  handleReportTypeChange(type) {
    const teacherSection = document.getElementById('targetTeacherSection');
    const studentSection = document.getElementById('targetStudentSection');

    if (teacherSection) {
      teacherSection.classList.toggle('hidden', type !== 'queja_maestra');
    }
    if (studentSection) {
      studentSection.classList.toggle('hidden', type !== 'incidente_estudiante');
    }
  },

  async handleSubmitReport(e) {
    try {
      const formData = new FormData(e.target);
      let evidenceUrl = null;

      // Upload evidence if exists
      const evidenceFile = document.getElementById('reportEvidence')?.files?.[0];
      if (evidenceFile) {
        evidenceUrl = await this.uploadEvidence(evidenceFile);
      }

      const reportType    = formData.get('reportType');
      const targetTeacherId = formData.get('targetTeacher') || null;
      const targetStudentId = formData.get('targetStudent') || null;
      const category      = formData.get('category');
      const description   = formData.get('description');
      const severity      = formData.get('severity') || 'medium';
      const isAnonymous   = document.getElementById('reportAnonymous')?.checked || false;

      // Try the RPC first; if it fails with 400/PGRST202, fall back to direct insert
      let submitError = null;
      const { error: rpcError } = await supabase.rpc('create_report', {
        p_report_type:        reportType,
        p_target_teacher_id:  targetTeacherId,
        p_target_student_id:  targetStudentId,
        p_classroom_id:       null,
        p_category:           category,
        p_description:        description,
        p_severity:           severity,
        p_is_anonymous:       isAnonymous,
        p_evidence_url:       evidenceUrl
      });

      if (rpcError) {
        // Log for debugging
        console.warn('[Reports] RPC create_report failed:', rpcError?.message, rpcError?.code);

        // FIX 400: Fallback to direct insert if RPC is missing or has param mismatch
        if (
          rpcError.code === 'PGRST202' ||
          rpcError.message?.includes('function') ||
          rpcError.message?.includes('does not exist') ||
          rpcError.code === '42883'
        ) {
          const { data: authData } = await supabase.auth.getUser();
          const userId = authData?.user?.id;

          const { error: insertError } = await supabase.from('reports').insert({
            report_type:        reportType,
            target_teacher_id:  targetTeacherId || undefined,
            target_student_id:  targetStudentId || undefined,
            category,
            description,
            severity,
            is_anonymous:       isAnonymous,
            evidence_url:       evidenceUrl || undefined,
            parent_id:          userId,
            status:             'open'
          });
          submitError = insertError;
        } else {
          submitError = rpcError;
        }
      }

      if (submitError) throw submitError;

      Helpers.toast('Reporte enviado exitosamente', 'success');
      
      // Close modal and reset form
      const modal = document.getElementById('modalNewReport');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
      e.target.reset();
      
      // Reload reports
      await this.loadReports();
    } catch (error) {
      console.error('Error submitting report:', error?.message || error);
      Helpers.toast(`Error al enviar el reporte: ${error?.message || 'intenta de nuevo'}`, 'error');
    }
  },

  async uploadEvidence(file) {
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
};
