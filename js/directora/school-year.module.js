/**
 * School Year Management Center - Director Panel
 * The central nervous system of the entire platform.
 * Every module, every student, every payment, every report
 * depends on the active school year.
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { SmartLoader } from '../shared/smart-loader.js';

const $el = (id) => document.getElementById(id);

const LEVEL_ORDER = ['Maternal','Infante','Parvulos','Pre-Kinder','Kinder','Preprimaria','1ro Primaria','2do Primaria','3ro Primaria','4to Primaria','5to Primaria','6to Primaria'];

export const SchoolYearModule = {
  state: {
    schoolYears: [],
    currentYear: null,
    dashboard: null,
    selectedYear: null,
    activeTab: 'overview',
    viewingHistory: false,
    viewingYearId: null,
  },

  async init() {
    await this.loadSchoolYears();
    await this.loadDashboard();
    // If dashboard KPIs are all zeros (fallback), load real counts
    if (this.state.dashboard && this.state.kpi && this.state.kpi.enrollments === 0) {
      await this._loadFallbackKPIs();
    }
    this.render();
    this.setupEventListeners();
  },

  async _loadFallbackKPIs() {
    const yearId = this.state.currentYear?.id;
    if (!yearId) return;
    try {
      const [enr, cls, tea, pay, per] = await Promise.all([
        supabase.from('student_enrollments').select('id', { count: 'exact', head: true }).eq('school_year_id', yearId).in('status', ['activo','inscrito','admitido','reinscrito']),
        supabase.from('classrooms').select('id', { count: 'exact', head: true }),
        supabase.from('classrooms').select('teacher_id').not('teacher_id', 'is', null),
        supabase.from('payments').select('id, amount, status').eq('school_year_id', yearId),
        supabase.from('periods').select('status').eq('school_year_id', yearId)
      ]);
      const kpi = this.state.dashboard.kpi;
      kpi.enrollments = enr.count || 0;
      kpi.classrooms = cls.count || 0;
      kpi.teachers = new Set((tea.data || []).map(r => r.teacher_id)).size;
      const payments = pay.data || [];
      kpi.pending_payments = payments.filter(p => p.status === 'pending').length;
      kpi.total_income = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
      kpi.pending_income = payments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount || 0), 0);
      const periods = per.data || [];
      kpi.active_periods = periods.filter(p => p.status === 'open').length;
      kpi.closed_periods = periods.filter(p => p.status === 'closed').length;
    } catch (_) {}
  },

  async loadSchoolYears() {
    try {
      const { data, error } = await supabase.from('school_years').select('*').order('start_date', { ascending: false });
      if (error) throw error;
      this.state.schoolYears = data || [];
      this.state.currentYear = data?.find(y => y.is_current) || data?.find(y => y.status === 'active') || null;
    } catch (err) {
      console.error('Error loading school years:', err);
    }
  },

  async loadDashboard() {
    try {
      const yearId = this.state.viewingYearId || this.state.currentYear?.id;
      if (!yearId) { this.state.dashboard = null; return; }
      const { data, error } = await supabase.rpc('get_school_year_dashboard', { p_school_year_id: yearId });
      if (error) throw error;
      if (data?.error) {
        // RPC returned business error — build fallback dashboard from currentYear
        console.warn('Dashboard RPC business error:', data.error);
        this.state.dashboard = this._buildFallbackDashboard();
        return;
      }
      this.state.dashboard = data;
    } catch (err) {
      console.error('Error loading dashboard, using fallback:', err);
      this.state.dashboard = this._buildFallbackDashboard();
    }
  },

  _buildFallbackDashboard() {
    const year = this.state.currentYear || this.state.viewingYearId
      ? this.state.schoolYears.find(y => y.id === this.state.viewingYearId)
      : null;
    if (!year) return null;
    const totalDays = year.end_date && year.start_date ? Math.max(1, (new Date(year.end_date) - new Date(year.start_date)) / 86400000) : 365;
    const elapsed = Math.max(0, Math.min(totalDays, (Date.now() - new Date(year.start_date)) / 86400000));
    return {
      found: true,
      year: {
        id: year.id, name: year.name, start_date: year.start_date,
        end_date: year.end_date, status: year.status, is_current: year.is_current,
        period_model: year.period_model, num_periods: year.num_periods,
        enrollment_open: year.enrollment_open, reenrollment_open: year.reenrollment_open,
        total_days: Math.round(totalDays), elapsed_days: Math.round(elapsed)
      },
      kpi: { enrollments: 0, classrooms: 0, teachers: 0, pending_payments: 0, total_income: 0, pending_income: 0, attendance_pct: 0, active_periods: 0, closed_periods: 0 },
      current_period: null,
      processes: []
    };
  },

  render() {
    const section = $el('ciclo-escolar-config');
    if (!section) return;

    const d = this.state.dashboard;
    const year = d?.year;
    const kpi = d?.kpi;
    const isHistory = this.state.viewingHistory;

    section.innerHTML = `
      <div class="space-y-6">
        ${this._renderHeader()}

        ${year ? this._renderExecutiveSummary(year, kpi, d) : this._renderNoYear()}

        ${year ? this._renderTimeline(year, d) : ''}

        ${year ? this._renderTabBar() : ''}

        <div id="syc-tab-content">
          ${year ? this._renderTabContent() : ''}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  _renderHeader() {
    const isHistory = this.state.viewingHistory;
    const viewYear = this.state.viewingYearId ? this.state.schoolYears.find(y => y.id === this.state.viewingYearId) : null;

    return `
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div class="flex items-center gap-3 mb-1">
            <div class="w-1 h-8 rounded-full" style="background:#0B63C7"></div>
            <h1 class="text-2xl font-black text-slate-800">Gestión del Año Escolar</h1>
          </div>
          <p class="text-slate-500 font-medium ml-4">
            ${isHistory ? `Viendo: <strong>${viewYear?.name || ''}</strong> <button onclick="SchoolYearModule.exitHistory()" class="ml-2 text-xs font-bold text-[#0B63C7] underline">Volver al actual</button>` : 'Centro de control del ciclo escolar activo'}
          </p>
        </div>
        <div class="flex gap-2">
          ${!isHistory ? `
            <button onclick="SchoolYearModule.openNewYearWizard()" class="px-4 py-2.5 bg-[#0B63C7] text-white text-xs font-black uppercase rounded-xl hover:bg-[#0850A0] transition-all shadow-md">
              <i data-lucide="plus" class="w-4 h-4 inline mr-1"></i> Nuevo Año
            </button>
          ` : ''}
          <select onchange="SchoolYearModule.switchYear(this.value)" class="px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold bg-white outline-none focus:border-[#0B63C7]">
            ${this.state.schoolYears.map(y => `
              <option value="${y.id}" ${(this.state.viewingYearId || this.state.currentYear?.id) == y.id ? 'selected' : ''}>
                ${y.name} ${y.is_current ? '(Actual)' : ''} ${y.status === 'closed' ? '(Cerrado)' : ''}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
    `;
  },

  _renderExecutiveSummary(year, kpi, d) {
    if (!year) return '';
    const progress = year.total_days > 0 ? Math.round((year.elapsed_days / year.total_days) * 100) : 0;
    const progressColor = progress >= 80 ? '#ef4444' : progress >= 50 ? '#f59e0b' : '#0B63C7';

    return `
      <!-- Executive Summary Card -->
      <div class="bg-gradient-to-r from-[#0B63C7] to-[#0850A0] rounded-2xl p-6 text-white shadow-xl">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div class="text-sm font-bold opacity-80 uppercase tracking-wide">Año Escolar</div>
            <h3 class="text-4xl font-black mt-1">${year.name}</h3>
            <div class="flex items-center gap-4 mt-3">
              <span class="px-3 py-1 bg-white/20 rounded-full text-sm font-bold">
                ${year.status === 'active' ? '🟢 Activo' : year.status === 'closed' ? '🔴 Cerrado' : '🟡 Próximo'}
              </span>
              <span class="text-sm opacity-90">
                <i data-lucide="calendar" class="w-4 h-4 inline mr-1"></i>
                ${new Date(year.start_date).toLocaleDateString('es-DO')} — ${new Date(year.end_date).toLocaleDateString('es-DO')}
              </span>
            </div>
            <div class="mt-4">
              <div class="flex justify-between text-xs mb-1 opacity-80">
                <span>Día ${year.elapsed_days} de ${year.total_days}</span>
                <span>${progress}%</span>
              </div>
              <div class="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all" style="width:${progress}%;background:${progressColor}"></div>
              </div>
            </div>
            ${d.current_period ? `
              <div class="mt-3 text-sm opacity-90">
                <i data-lucide="clock" class="w-4 h-4 inline mr-1"></i>
                Período actual: <strong>${d.current_period.name}</strong>
              </div>
            ` : ''}
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div class="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
              <div class="text-2xl font-black">${kpi?.enrollments || 0}</div>
              <div class="text-[10px] font-bold opacity-80 uppercase mt-1">Estudiantes</div>
            </div>
            <div class="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
              <div class="text-2xl font-black">${kpi?.classrooms || 0}</div>
              <div class="text-[10px] font-bold opacity-80 uppercase mt-1">Aulas</div>
            </div>
            <div class="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
              <div class="text-2xl font-black">${kpi?.teachers || 0}</div>
              <div class="text-[10px] font-bold opacity-80 uppercase mt-1">Maestras</div>
            </div>
            <div class="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
              <div class="text-2xl font-black">${kpi?.attendance_pct || 0}%</div>
              <div class="text-[10px] font-bold opacity-80 uppercase mt-1">Asistencia</div>
            </div>
            <div class="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
              <div class="text-2xl font-black">RD$${this._formatNum(kpi?.total_income || 0)}</div>
              <div class="text-[10px] font-bold opacity-80 uppercase mt-1">Cobrado</div>
            </div>
            <div class="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
              <div class="text-2xl font-black">${kpi?.pending_payments || 0}</div>
              <div class="text-[10px] font-bold opacity-80 uppercase mt-1">Pendientes</div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _renderTimeline(year, d) {
    const processes = d?.processes || [];
    const steps = [
      { key: 'config', label: 'Config.', icon: 'settings' },
      { key: 'periods_created', label: 'Períodos', icon: 'calendar' },
      { key: 'enrollment_open', label: 'Inscripción', icon: 'user-plus' },
      { key: 'classes_started', label: 'Clases', icon: 'book-open' },
      { key: 'period_open', label: 'Período Act.', icon: 'play' },
      { key: 'evaluations_open', label: 'Evaluaciones', icon: 'check-square' },
      { key: 'report_cards', label: 'Boletines', icon: 'file-text' },
      { key: 'year_closed', label: 'Cierre', icon: 'lock' },
      { key: 'promotion', label: 'Promoción', icon: 'arrow-up-right' },
      { key: 'archived', label: 'Archivado', icon: 'archive' },
    ];

    const doneSet = new Set(processes.filter(p => p.status === 'completed').map(p => p.type));
    const currentIdx = steps.findIndex(s => !doneSet.has(s.key));

    return `
      <div class="bg-white rounded-2xl border border-slate-100 p-4 overflow-x-auto">
        <div class="flex items-center gap-1 min-w-max">
          ${steps.map((s, i) => {
            const isDone = doneSet.has(s.key);
            const isCurrent = i === currentIdx;
            const color = isDone ? '#10b981' : isCurrent ? '#0B63C7' : '#cbd5e1';
            return `
              <div class="flex items-center">
                <div class="flex flex-col items-center gap-1">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black" style="background:${color}">
                    <i data-lucide="${s.icon}" class="w-4 h-4"></i>
                  </div>
                  <span class="text-[9px] font-bold text-slate-500 text-center leading-tight">${s.label}</span>
                </div>
                ${i < steps.length - 1 ? `<div class="w-6 h-0.5 mx-1 mt-[-18px]" style="background:${isDone ? '#10b981' : '#e2e8f0'}"></div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  _renderTabBar() {
    const tabs = [
      { id: 'overview', label: 'Resumen', icon: 'layout-dashboard' },
      { id: 'periods', label: 'Períodos', icon: 'calendar' },
      { id: 'config', label: 'Configuración', icon: 'settings' },
      { id: 'inscriptions', label: 'Inscripción', icon: 'user-plus' },
      { id: 'reenrollment', label: 'Reinscripción', icon: 'refresh-cw' },
      { id: 'processes', label: 'Procesos', icon: 'zap' },
      { id: 'history', label: 'Historial', icon: 'clock' },
    ];

    return `
      <div class="flex gap-1 overflow-x-auto pb-1">
        ${tabs.map(t => `
          <button onclick="SchoolYearModule.switchTab('${t.id}')"
            class="px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
              this.state.activeTab === t.id
                ? 'bg-[#0B63C7] text-white shadow-md'
                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }">
            <i data-lucide="${t.icon}" class="w-3.5 h-3.5 inline mr-1"></i>${t.label}
          </button>
        `).join('')}
      </div>
    `;
  },

  _renderTabContent() {
    switch (this.state.activeTab) {
      case 'overview': return this._renderOverviewTab();
      case 'periods': return this._renderPeriodsTab();
      case 'config': return this._renderConfigTab();
      case 'inscriptions': return this._renderInscriptionsTab();
      case 'reenrollment': return this._renderReenrollmentTab();
      case 'processes': return this._renderProcessesTab();
      case 'history': return this._renderHistoryTab();
      default: return '';
    }
  },

  _renderOverviewTab() {
    const d = this.state.dashboard;
    const kpi = d?.kpi;
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-all">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center" style="background:#E8F2FF"><i data-lucide="users" class="w-6 h-6" style="color:#0B63C7"></i></div>
            <div><div class="text-2xl font-black text-slate-800">${kpi?.enrollments || 0}</div><div class="text-xs font-bold text-slate-400">Estudiantes Activos</div></div>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-all">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-50"><i data-lucide="credit-card" class="w-6 h-6 text-emerald-600"></i></div>
            <div><div class="text-2xl font-black text-emerald-600">RD$${this._formatNum(kpi?.total_income || 0)}</div><div class="text-xs font-bold text-slate-400">Total Cobrado</div></div>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-all">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-50"><i data-lucide="alert-triangle" class="w-6 h-6 text-amber-600"></i></div>
            <div><div class="text-2xl font-black text-amber-600">RD$${this._formatNum(kpi?.pending_income || 0)}</div><div class="text-xs font-bold text-slate-400">Pendiente por Cobrar</div></div>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-all">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-50"><i data-lucide="check-circle" class="w-6 h-6 text-indigo-600"></i></div>
            <div><div class="text-2xl font-black text-indigo-600">${kpi?.attendance_pct || 0}%</div><div class="text-xs font-bold text-slate-400">Asistencia Promedio</div></div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-slate-800">${kpi?.active_periods || 0}</div>
          <div class="text-xs font-bold text-slate-400 mt-1">Períodos Abiertos</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-slate-800">${kpi?.closed_periods || 0}</div>
          <div class="text-xs font-bold text-slate-400 mt-1">Períodos Cerrados</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-slate-800">${kpi?.classrooms || 0}</div>
          <div class="text-xs font-bold text-slate-400 mt-1">Aulas Configuradas</div>
        </div>
      </div>
    `;
  },

  _renderPeriodsTab() {
    const d = this.state.dashboard;
    const year = d?.year;
    return `
      <div class="bg-white rounded-2xl border border-slate-100 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-black text-slate-800">Períodos del Año Escolar</h3>
          <button onclick="SchoolYearModule.openAddPeriodModal()" class="px-3 py-1.5 bg-[#0B63C7] text-white text-xs font-black rounded-lg hover:bg-[#0850A0]">
            <i data-lucide="plus" class="w-3.5 h-3.5 inline mr-1"></i>Agregar
          </button>
        </div>
        <div id="syc-periods-list" class="space-y-3">Cargando...</div>
      </div>
    `;
  },

  _renderConfigTab() {
    const year = this.state.currentYear;
    if (!year) return '';
    return `
      <div class="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 class="font-black text-slate-800 mb-4">Configuración del Año Escolar</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Nombre</label>
            <input id="syc-name" value="${year.name}" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
          </div>
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Modelo de Períodos</label>
            <select id="syc-model" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
              <option value="trimestres" ${year.period_model==='trimestres'?'selected':''}>Trimestres</option>
              <option value="semestres" ${year.period_model==='semestres'?'selected':''}>Semestres</option>
              <option value="mensual" ${year.period_model==='mensual'?'selected':''}>Mensual</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Fecha Inicio</label>
            <input id="syc-start" type="date" value="${year.start_date}" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
          </div>
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Fecha Fin</label>
            <input id="syc-end" type="date" value="${year.end_date}" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
          </div>
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Edad Mínima</label>
            <input id="syc-minage" type="number" value="${year.min_age || ''}" placeholder="Ej: 2" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
          </div>
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Edad Máxima</label>
            <input id="syc-maxage" type="number" value="${year.max_age || ''}" placeholder="Ej: 6" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
          </div>
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Costo Inscripción</label>
            <input id="syc-enrcost" type="number" value="${year.enrollment_cost || 0}" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
          </div>
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Costo Matrícula</label>
            <input id="syc-matcost" type="number" value="${year.matricula_cost || 0}" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
          </div>
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Descuento Hermanos (%)</label>
            <input id="syc-siblingdisc" type="number" value="${year.sibling_discount || 0}" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
          </div>
          <div class="flex items-end">
            <button onclick="SchoolYearModule.saveConfig()" class="w-full py-3 bg-[#0B63C7] text-white font-black rounded-xl hover:bg-[#0850A0] transition-all">
              Guardar Configuración
            </button>
          </div>
        </div>
      </div>
    `;
  },

  _renderInscriptionsTab() {
    const year = this.state.currentYear;
    return `
      <div class="bg-white rounded-2xl border border-slate-100 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-black text-slate-800">Configuración de Inscripciones</h3>
          <div class="flex gap-2">
            <button onclick="SchoolYearModule.toggleEnrollment(${year?.id}, ${!year?.enrollment_open})"
              class="px-4 py-2 rounded-xl text-xs font-black transition-all ${
                year?.enrollment_open ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              }">
              ${year?.enrollment_open ? '🔒 Cerrar Inscripciones' : '🔓 Abrir Inscripciones'}
            </button>
          </div>
        </div>
        <div class="flex items-center gap-3 p-4 rounded-xl border ${
          year?.enrollment_open ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
        }">
          <div class="w-10 h-10 rounded-full flex items-center justify-center ${
            year?.enrollment_open ? 'bg-emerald-100' : 'bg-slate-200'
          }">
            <i data-lucide="${year?.enrollment_open ? 'unlock' : 'lock'}" class="w-5 h-5 ${year?.enrollment_open ? 'text-emerald-600' : 'text-slate-400'}"></i>
          </div>
          <div>
            <div class="font-black text-sm ${year?.enrollment_open ? 'text-emerald-700' : 'text-slate-500'}">
              Inscripciones ${year?.enrollment_open ? 'Abiertas' : 'Cerradas'}
            </div>
            <div class="text-xs text-slate-500">Las familias pueden ${year?.enrollment_open ? 'enviar' : 'enviar'} preinscripciones</div>
          </div>
        </div>
        <div class="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-slate-50 rounded-xl p-4 text-center">
            <div class="text-2xl font-black text-[#0B63C7]">${this.state.dashboard?.kpi?.enrollments || 0}</div>
            <div class="text-xs font-bold text-slate-500 mt-1">Inscritos este Año</div>
          </div>
          <div class="bg-slate-50 rounded-xl p-4 text-center">
            <div class="text-2xl font-black text-amber-600" id="syc-pending-count">...</div>
            <div class="text-xs font-bold text-slate-500 mt-1">Preinscripciones Pendientes</div>
          </div>
          <div class="bg-slate-50 rounded-xl p-4 text-center">
            <div class="text-2xl font-black text-slate-600">${this.state.dashboard?.kpi?.classrooms || 0}</div>
            <div class="text-xs font-bold text-slate-500 mt-1">Cupos Disponibles</div>
          </div>
        </div>
      </div>
    `;
  },

  _renderReenrollmentTab() {
    const year = this.state.currentYear;
    return `
      <div class="bg-white rounded-2xl border border-slate-100 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-black text-slate-800">Reinscripción</h3>
          <button onclick="SchoolYearModule.toggleReenrollment(${year?.id}, ${!year?.reenrollment_open})"
            class="px-4 py-2 rounded-xl text-xs font-black transition-all ${
              year?.reenrollment_open ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }">
            ${year?.reenrollment_open ? '🔒 Cerrar Reinscripción' : '🔓 Abrir Reinscripción'}
          </button>
        </div>
        <div class="flex items-center gap-3 p-4 rounded-xl border ${
          year?.reenrollment_open ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
        }">
          <div class="w-10 h-10 rounded-full flex items-center justify-center ${
            year?.reenrollment_open ? 'bg-emerald-100' : 'bg-slate-200'
          }">
            <i data-lucide="${year?.reenrollment_open ? 'unlock' : 'lock'}" class="w-5 h-5 ${year?.reenrollment_open ? 'text-emerald-600' : 'text-slate-400'}"></i>
          </div>
          <div>
            <div class="font-black text-sm ${year?.reenrollment_open ? 'text-emerald-700' : 'text-slate-500'}">
              Reinscripción ${year?.reenrollment_open ? 'Abierta' : 'Cerrada'}
            </div>
            <div class="text-xs text-slate-500">Los padres pueden reinscribir a sus hijos para el próximo año</div>
          </div>
        </div>
      </div>
    `;
  },

  _renderProcessesTab() {
    const processes = this.state.dashboard?.processes || [];
    return `
      <div class="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 class="font-black text-slate-800 mb-4">Centro de Procesos</h3>
        <div class="space-y-2">
          ${processes.length === 0 ? '<p class="text-slate-400 text-center py-4">No hay procesos registrados</p>' : ''}
          ${processes.map(p => `
            <div class="flex items-center gap-3 p-3 rounded-xl ${
              p.status === 'completed' ? 'bg-emerald-50' : p.status === 'in_progress' ? 'bg-amber-50' : 'bg-slate-50'
            }">
              <div class="w-8 h-8 rounded-full flex items-center justify-center ${
                p.status === 'completed' ? 'bg-emerald-100' : p.status === 'in_progress' ? 'bg-amber-100' : 'bg-slate-200'
              }">
                <i data-lucide="${p.status === 'completed' ? 'check' : p.status === 'in_progress' ? 'loader' : 'circle'}" class="w-4 h-4 ${
                  p.status === 'completed' ? 'text-emerald-600' : p.status === 'in_progress' ? 'text-amber-600' : 'text-slate-400'
                }"></i>
              </div>
              <div class="flex-1">
                <div class="text-sm font-bold text-slate-800">${p.label || p.type}</div>
                <div class="text-xs text-slate-500">${p.executed_at ? new Date(p.executed_at).toLocaleString('es-DO') : 'Pendiente'}</div>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${
                p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : p.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
              }">${p.status === 'completed' ? 'Completado' : p.status === 'in_progress' ? 'En proceso' : 'Pendiente'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  _renderHistoryTab() {
    const years = this.state.schoolYears;
    return `
      <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div class="p-4 border-b border-slate-100">
          <h3 class="font-black text-slate-800">Historial de Años Escolares</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase">Año</th>
                <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase hidden sm:table-cell">Período</th>
                <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase hidden md:table-cell">Inicio</th>
                <th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase">Estado</th>
                <th class="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${years.map(y => `
                <tr class="hover:bg-slate-50 transition-colors ${y.is_current ? 'bg-blue-50/50' : ''}">
                  <td class="px-4 py-3">
                    <div class="font-black text-slate-800">${y.name}</div>
                    <div class="text-xs text-slate-400">${y.period_model || 'trimestres'} · ${y.num_periods || 3} períodos</div>
                  </td>
                  <td class="px-4 py-3 hidden sm:table-cell text-slate-600 text-xs">
                    ${new Date(y.start_date).toLocaleDateString('es-DO')} — ${new Date(y.end_date).toLocaleDateString('es-DO')}
                  </td>
                  <td class="px-4 py-3 hidden md:table-cell text-slate-600 text-xs">${new Date(y.start_date).toLocaleDateString('es-DO')}</td>
                  <td class="px-4 py-3">
                    <span class="px-2.5 py-1 rounded-full text-xs font-black ${
                      y.is_current ? 'bg-[#E8F2FF] text-[#0B63C7]' :
                      y.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      y.status === 'closed' ? 'bg-slate-100 text-slate-600' :
                      'bg-amber-100 text-amber-700'
                    }">${y.is_current ? 'Actual' : y.status === 'active' ? 'Activo' : y.status === 'closed' ? 'Cerrado' : 'Próximo'}</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <div class="flex justify-center gap-1">
                      <button onclick="SchoolYearModule.viewYearHistory(${y.id})" class="p-2 text-[#0B63C7] hover:bg-blue-50 rounded-lg" title="Ver datos">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                      </button>
                      ${!y.is_current ? `
                        <button onclick="SchoolYearModule.setAsCurrent(${y.id})" class="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Activar">
                          <i data-lucide="star" class="w-4 h-4"></i>
                        </button>
                      ` : ''}
                      ${y.status !== 'closed' ? `
                        <button onclick="SchoolYearModule.closeYear(${y.id})" class="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Cerrar año">
                          <i data-lucide="lock" class="w-4 h-4"></i>
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  _renderNoYear() {
    return `
      <div class="bg-white rounded-2xl border border-slate-100 p-12 text-center">
        <div class="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i data-lucide="calendar-plus" class="w-10 h-10 text-[#0B63C7]"></i>
        </div>
        <h3 class="text-xl font-black text-slate-700 mb-2">No hay año escolar activo</h3>
        <p class="text-slate-500 text-sm mb-6 max-w-md mx-auto">Crea un nuevo año escolar para comenzar a gestionar el ciclo académico. El sistema puede copiar la configuración del año anterior automáticamente.</p>
        <button onclick="SchoolYearModule.openNewYearWizard()" class="px-6 py-3 bg-[#0B63C7] text-white font-black rounded-xl hover:bg-[#0850A0] transition-all shadow-lg">
          <i data-lucide="plus" class="w-5 h-5 inline mr-2"></i> Crear Primer Año Escolar
        </button>
      </div>
    `;
  },

  _formatNum(n) {
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n/1000).toFixed(0) + 'K';
    return n.toLocaleString('es-DO');
  },

  // ── Actions ──────────────────────────────────────────────

  switchTab(tab) {
    this.state.activeTab = tab;
    this.render();
    if (tab === 'periods') this._loadPeriods();
    if (tab === 'inscriptions') this._loadPendingCount();
  },

  async switchYear(yearId) {
    if (!yearId) return;
    this.state.viewingYearId = parseInt(yearId);
    await this.loadDashboard();
    this.render();
  },

  exitHistory() {
    this.state.viewingHistory = false;
    this.state.viewingYearId = null;
    this.render();
  },

  viewYearHistory(yearId) {
    this.state.viewingHistory = true;
    this.state.viewingYearId = yearId;
    this.loadDashboard().then(() => this.render());
  },

  async setAsCurrent(yearId) {
    if (!confirm('¿Establecer este año como el activo actual?')) return;
    try {
      const { data, error } = await supabase.rpc('set_active_school_year', { p_school_year_id: yearId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      Helpers.toast('Año escolar activado', 'success');
      await this.loadSchoolYears();
      await this.loadDashboard();
      this.render();
      if (window._loadCycleSelectors) await window._loadCycleSelectors();
    } catch (err) {
      Helpers.toast('Error: ' + err.message, 'error');
    }
  },

  async closeYear(yearId) {
    const year = this.state.schoolYears.find(y => y.id === yearId);
    if (!confirm(`¿Estás seguro de cerrar el año escolar ${year?.name || ''}?\n\nEsto cerrará todos los períodos y bloqueará las ediciones.`)) return;

    const progress = SmartLoader.overlay({
      title: 'Cerrando el Año Escolar',
      steps: [
        { icon: '🔒', text: 'Cerrando el Año Escolar' },
        { icon: '✓', text: 'Archivando publicaciones del muro' },
        { icon: '✓', text: 'Guardando registros de asistencia' },
        { icon: '✓', text: 'Generando boletines de calificaciones' },
        { icon: '✓', text: 'Promoviendo estudiantes de grado' },
        { icon: '✓', text: 'Bloqueando períodos académicos' },
        { icon: '✓', text: 'Cerrando cuentas financieras' },
        { icon: '✓', text: 'Preparando el nuevo ciclo escolar' }
      ]
    });

    try {
      progress.setStep(0);
      progress.setSubtitle('Iniciando proceso de cierre...');

      await new Promise(r => setTimeout(r, 400));
      progress.setStep(1);

      const { data, error } = await supabase.rpc('close_school_year', { p_school_year_id: yearId });

      for (let i = 2; i <= 7; i++) {
        progress.setStep(i);
        await new Promise(r => setTimeout(r, 250));
      }

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      progress.setStep(7);
      progress.complete('✅ Año escolar cerrado correctamente. Todo está seguro.');

      await this.loadSchoolYears();
      await this.loadDashboard();
      this.render();
    } catch (err) {
      progress.error('⚠️ No pudimos cerrar el año escolar. La información permanece segura. Puedes intentarlo nuevamente.');
      Helpers.toast('Error: ' + err.message, 'error');
    }
  },

  async toggleEnrollment(yearId, open) {
    try {
      const { error } = await supabase.from('school_years').update({ enrollment_open: open }).eq('id', yearId);
      if (error) throw error;
      Helpers.toast(open ? 'Inscripciones abiertas' : 'Inscripciones cerradas', 'success');
      await this.loadSchoolYears();
      await this.loadDashboard();
      this.render();
    } catch (err) {
      Helpers.toast('Error: ' + err.message, 'error');
    }
  },

  async toggleReenrollment(yearId, open) {
    try {
      const { error } = await supabase.from('school_years').update({ reenrollment_open: open }).eq('id', yearId);
      if (error) throw error;
      Helpers.toast(open ? 'Reinscripción abierta' : 'Reinscripción cerrada', 'success');
      await this.loadSchoolYears();
      await this.loadDashboard();
      this.render();
    } catch (err) {
      Helpers.toast('Error: ' + err.message, 'error');
    }
  },

  async saveConfig() {
    const year = this.state.currentYear;
    if (!year) return;
    const data = {
      name: $el('syc-name')?.value?.trim(),
      start_date: $el('syc-start')?.value,
      end_date: $el('syc-end')?.value,
      period_model: $el('syc-model')?.value,
      min_age: parseInt($el('syc-minage')?.value) || null,
      max_age: parseInt($el('syc-maxage')?.value) || null,
      enrollment_cost: parseFloat($el('syc-enrcost')?.value) || 0,
      matricula_cost: parseFloat($el('syc-matcost')?.value) || 0,
      sibling_discount: parseFloat($el('syc-siblingdisc')?.value) || 0,
    };
    try {
      const { error } = await supabase.from('school_years').update(data).eq('id', year.id);
      if (error) throw error;
      Helpers.toast('Configuración guardada', 'success');
      await this.loadSchoolYears();
      await this.loadDashboard();
      this.render();
    } catch (err) {
      Helpers.toast('Error: ' + err.message, 'error');
    }
  },

  async _loadPeriods() {
    const el = $el('syc-periods-list');
    if (!el) return;
    const yearId = this.state.viewingYearId || this.state.currentYear?.id;
    try {
      const { data: periods } = await supabase.from('periods')
        .select('*')
        .eq('school_year_id', yearId)
        .order('sort_order');
      el.innerHTML = (periods || []).map(p => `
        <div class="flex items-center gap-4 p-4 rounded-xl border ${p.is_active ? 'border-[#0B63C7] bg-blue-50/50' : 'border-slate-200'} transition-all">
          <div class="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${
            p.status === 'closed' ? 'bg-slate-100 text-slate-500' : p.is_active ? 'bg-[#0B63C7] text-white' : 'bg-emerald-100 text-emerald-700'
          }">${p.sort_order || '?'}</div>
          <div class="flex-1">
            <div class="font-black text-sm text-slate-800">${p.name}</div>
            <div class="text-xs text-slate-500">${new Date(p.start_date).toLocaleDateString('es-DO')} — ${new Date(p.end_date).toLocaleDateString('es-DO')}</div>
          </div>
          <div class="flex gap-2">
            ${p.status === 'open' && !p.is_active ? `
              <button onclick="SchoolYearModule.activatePeriod(${p.id})" class="px-3 py-1.5 bg-[#0B63C7] text-white text-xs font-black rounded-lg hover:bg-[#0850A0]">Activar</button>
            ` : ''}
            ${p.status === 'open' ? `
              <button onclick="SchoolYearModule.closePeriod(${p.id})" class="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-black rounded-lg hover:bg-red-200">Cerrar</button>
            ` : ''}
            <span class="px-2.5 py-1 rounded-full text-xs font-black ${
              p.status === 'closed' ? 'bg-slate-100 text-slate-500' : p.is_active ? 'bg-[#E8F2FF] text-[#0B63C7]' : 'bg-emerald-100 text-emerald-700'
            }">${p.status === 'closed' ? 'Cerrado' : p.is_active ? 'Activo' : 'Abierto'}</span>
          </div>
        </div>
      `).join('') || '<p class="text-slate-400 text-center py-4">No hay períodos configurados</p>';
    } catch (err) {
      el.innerHTML = '<p class="text-red-500">Error cargando períodos</p>';
    }
  },

  async activatePeriod(periodId) {
    try {
      const { data, error } = await supabase.rpc('activate_period', { p_period_id: periodId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      Helpers.toast('Período activado', 'success');
      await this.loadDashboard();
      this.render();
      if (this.state.activeTab === 'periods') this._loadPeriods();
    } catch (err) {
      Helpers.toast('Error: ' + err.message, 'error');
    }
  },

  async closePeriod(periodId) {
    if (!confirm('¿Cerrar este período?\n\nSe generarán boletines automáticos y el período quedará bloqueado.')) return;
    try {
      const { data, error } = await supabase.rpc('close_period', { p_period_id: periodId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      Helpers.toast(`Período cerrado. ${data?.cards_generated || 0} boletines generados.`, 'success');
      await this.loadDashboard();
      this.render();
      if (this.state.activeTab === 'periods') this._loadPeriods();
    } catch (err) {
      Helpers.toast('Error: ' + err.message, 'error');
    }
  },

  async _loadPendingCount() {
    const el = $el('syc-pending-count');
    if (!el) return;
    try {
      const { count } = await supabase.from('student_preregistrations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      el.textContent = count || 0;
    } catch (_) { el.textContent = '—'; }
  },

  openNewYearWizard() {
    const lastYear = this.state.schoolYears[0];
    const suggestedName = lastYear ? (parseInt(lastYear.name.split('-')[0]) + 1) + '-' + (parseInt(lastYear.name.split('-')[1]) + 1) : new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);

    const html = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="newYearWizard">
        <div class="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
          <div class="p-6 border-b border-slate-100">
            <div class="flex items-center justify-between">
              <h3 class="text-xl font-black text-slate-800">Nuevo Año Escolar</h3>
              <button onclick="SchoolYearModule.closeWizard()" class="p-2 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-black uppercase text-slate-400 mb-2">Nombre del Año</label>
              <input id="nyw-name" type="text" value="${suggestedName}" placeholder="Ej: 2026-2027" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-black uppercase text-slate-400 mb-2">Fecha Inicio</label>
                <input id="nyw-start" type="date" value="${lastYear ? lastYear.start_date : ''}" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
              </div>
              <div>
                <label class="block text-xs font-black uppercase text-slate-400 mb-2">Fecha Fin</label>
                <input id="nyw-end" type="date" value="${lastYear ? lastYear.end_date : ''}" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
              </div>
            </div>
            <div>
              <label class="block text-xs font-black uppercase text-slate-400 mb-2">Modelo de Períodos</label>
              <select id="nyw-model" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
                <option value="trimestres">Trimestres (3)</option>
                <option value="semestres">Semestres (2)</option>
                <option value="mensual">Mensual (12)</option>
              </select>
            </div>
            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div class="text-sm font-black text-blue-800">Opciones de creación:</div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="nyw-copy-classrooms" class="w-4 h-4 text-[#0B63C7] rounded" checked>
                <span class="text-sm text-slate-700">Copiar aulas del año anterior</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="nyw-copy-plans" class="w-4 h-4 text-[#0B63C7] rounded" checked>
                <span class="text-sm text-slate-700">Copiar planes de pago</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="nyw-promote" class="w-4 h-4 text-[#0B63C7] rounded" checked>
                <span class="text-sm text-slate-700">Promover estudiantes al siguiente nivel</span>
              </label>
            </div>
          </div>
          <div class="p-6 border-t border-slate-100 flex justify-end gap-3">
            <button onclick="SchoolYearModule.closeWizard()" class="px-5 py-2 text-slate-600 font-bold border-2 border-slate-200 rounded-xl hover:bg-slate-50">Cancelar</button>
            <button onclick="SchoolYearModule.createYear()" id="nyw-create-btn" class="px-6 py-2.5 bg-[#0B63C7] text-white font-black rounded-xl hover:bg-[#0850A0] transition-all">
              <i data-lucide="sparkles" class="w-4 h-4 inline mr-1"></i> Crear Año Escolar
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    if (window.lucide) lucide.createIcons();
  },

  closeWizard() {
    $el('newYearWizard')?.remove();
  },

  async createYear() {
    const btn = $el('nyw-create-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Creando...'; }

    const model = $el('nyw-model')?.value;
    const numPeriods = model === 'semestres' ? 2 : model === 'mensual' ? 12 : 3;

    try {
      const { data, error } = await supabase.rpc('create_new_school_year_with_promotion', {
        p_name: $el('nyw-name')?.value?.trim(),
        p_start_date: $el('nyw-start')?.value,
        p_end_date: $el('nyw-end')?.value,
        p_copy_classrooms: $el('nyw-copy-classrooms')?.checked ?? true,
        p_copy_payment_plans: $el('nyw-copy-plans')?.checked ?? true,
        p_promote_students: $el('nyw-promote')?.checked ?? true,
        p_num_periods: numPeriods,
        p_period_model: model,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const summary = [
        `✅ ${data.periods_created || 0} períodos creados`,
        `🏫 ${data.classrooms_copied || 0} aulas copiadas`,
        `💳 ${data.plans_copied || 0} planes de pago copiados`,
        `👶 ${data.students_promoted || 0} estudiantes promovidos`,
      ].join('\n');

      this.closeWizard();
      Helpers.toast('Año escolar creado exitosamente', 'success');
      alert(`Año "${data.name}" creado:\n\n${summary}`);

      await this.loadSchoolYears();
      await this.loadDashboard();
      this.render();
      if (window._loadCycleSelectors) await window._loadCycleSelectors();
    } catch (err) {
      Helpers.toast('Error: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4 inline mr-1"></i> Crear Año Escolar'; if (window.lucide) lucide.createIcons(); }
    }
  },

  openAddPeriodModal() {
    const year = this.state.currentYear;
    if (!year) return;

    const html = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="addPeriodModal">
        <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div class="p-6 border-b border-slate-100">
            <div class="flex items-center justify-between">
              <h3 class="text-xl font-black text-slate-800">Agregar Período</h3>
              <button onclick="$el('addPeriodModal')?.remove()" class="p-2 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-black uppercase text-slate-400 mb-2">Nombre</label>
              <input id="apm-name" type="text" placeholder="Ej: 4to Trimestre" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-black uppercase text-slate-400 mb-2">Fecha Inicio</label>
                <input id="apm-start" type="date" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
              </div>
              <div>
                <label class="block text-xs font-black uppercase text-slate-400 mb-2">Fecha Fin</label>
                <input id="apm-end" type="date" class="w-full px-4 py-3 rounded-xl border-2 border-slate-100 text-sm font-bold outline-none focus:border-[#0B63C7]">
              </div>
            </div>
          </div>
          <div class="p-6 border-t border-slate-100 flex justify-end gap-3">
            <button onclick="$el('addPeriodModal')?.remove()" class="px-5 py-2 text-slate-600 font-bold border-2 border-slate-200 rounded-xl">Cancelar</button>
            <button onclick="SchoolYearModule.savePeriod()" class="px-5 py-2 bg-[#0B63C7] text-white font-black rounded-xl hover:bg-[#0850A0]">Crear Período</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    if (window.lucide) lucide.createIcons();
  },

  async savePeriod() {
    const yearId = this.state.currentYear?.id;
    if (!yearId) return;
    const name = $el('apm-name')?.value?.trim();
    const start = $el('apm-start')?.value;
    const end = $el('apm-end')?.value;
    if (!name || !start || !end) { Helpers.toast('Complete todos los campos', 'error'); return; }

    try {
      const { error } = await supabase.from('periods').insert({
        name, start_date: start, end_date: end,
        status: 'open', is_active: false,
        school_year_id: yearId, sort_order: 99
      });
      if (error) throw error;
      $el('addPeriodModal')?.remove();
      Helpers.toast('Período creado', 'success');
      await this.loadDashboard();
      this.render();
      if (this.state.activeTab === 'periods') this._loadPeriods();
    } catch (err) {
      Helpers.toast('Error: ' + err.message, 'error');
    }
  },

  setupEventListeners() {
    const channel = supabase
      .channel('school_years_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_years' }, () => {
        this.loadSchoolYears().then(() => this.loadDashboard()).then(() => this.render());
      })
      .subscribe();
  }
};

// Expose globally for onclick handlers
window.SchoolYearModule = SchoolYearModule;
window.$el = $el;
