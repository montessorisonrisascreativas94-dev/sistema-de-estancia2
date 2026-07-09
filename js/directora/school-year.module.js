
/**
 * School Year Configuration Module - Directora Panel
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const $el = (id) => document.getElementById(id);

export const SchoolYearModule = {
  state: {
    schoolYears: [],
    currentYear: null,
    selectedYear: null,
  },

  async init() {
    console.log('SchoolYearModule init');
    await this.loadSchoolYears();
    this.render();
    this.setupEventListeners();
  },

  async loadSchoolYears() {
    try {
      const { data, error } = await supabase
        .from('school_years')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      this.state.schoolYears = data || [];
      this.state.currentYear = data?.find(y => y.is_current) || null;
    } catch (err) {
      console.error('Error loading school years:', err);
      Helpers.toast('Error al cargar años escolares', 'error');
    }
  },

  render() {
    const section = $el('ciclo-escolar');
    if (!section) return;

    section.innerHTML = `
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-black text-slate-800">Ciclo Escolar</h2>
            <p class="text-sm text-slate-500">Configuración del año escolar, calendario y reincripción</p>
          </div>
          <button onclick="SchoolYearModule.openModal()" class="px-4 py-2 bg-emerald-500 text-white font-bold rounded-lg hover:bg-emerald-600 transition-all">
            <i data-lucide="plus" class="w-4 h-4 inline mr-2"></i> Nuevo Año
          </button>
        </div>

        <!-- Current Year Card -->
        ${this.state.currentYear ? `
          <div class="bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl p-6 text-white shadow-lg">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-bold opacity-80 uppercase">Año Escolar Actual</div>
                <h3 class="text-3xl font-black mt-1">${this.state.currentYear.name}</h3>
                <p class="mt-2 text-sm opacity-90">
                  <i data-lucide="calendar" class="w-4 h-4 inline mr-2"></i>
                  ${new Date(this.state.currentYear.start_date).toLocaleDateString('es-DO')} - ${new Date(this.state.currentYear.end_date).toLocaleDateString('es-DO')}
                </p>
              </div>
              <div class="text-right">
                <span class="px-3 py-1 bg-white/20 rounded-full text-sm font-bold">
                  ${this.state.currentYear.status === 'active' ? 'Activo' : this.state.currentYear.status}
                </span>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- School Years List -->
        <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div class="p-4 border-b border-slate-100">
            <h3 class="text-lg font-black text-slate-800">Historial de Años Escolares</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">Año</th>
                  <th class="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">Inicio</th>
                  <th class="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">Fin</th>
                  <th class="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">Estado</th>
                  <th class="px-4 py-3 text-center text-[10px] font-black text-slate-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody id="school-years-body" class="divide-y divide-slate-100">
                ${this.renderTableRows()}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Reenrollment Configuration -->
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 class="text-lg font-black text-slate-800 mb-4">Configuración de Reincripción</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">Mes de Reincripción</label>
              <select id="reenrollment-month" class="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500">
                ${['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((month, index) => `
                  <option value="${index + 1}">${month}</option>
                `).join('')}
              </select>
            </div>
            <div class="flex items-end">
              <button onclick="SchoolYearModule.saveReenrollmentSettings()" class="px-6 py-3 bg-emerald-500 text-white font-black rounded-xl hover:bg-emerald-600 transition-all">
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>

        <!-- School Calendar -->
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 class="text-lg font-black text-slate-800 mb-4">Calendario Escolar</h3>
          <div id="school-calendar" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            ${this.renderCalendarMonths()}
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  renderTableRows() {
    if (!this.state.schoolYears.length) {
      return `
        <tr>
          <td colspan="5" class="text-center py-8 text-slate-400">
            <i data-lucide="calendar" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
            No hay años escolares registrados
          </td>
        </tr>
      `;
    }

    return this.state.schoolYears.map(year => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-4 py-4 font-bold text-slate-800">${year.name}</td>
        <td class="px-4 py-4 text-sm text-slate-600">${new Date(year.start_date).toLocaleDateString('es-DO')}</td>
        <td class="px-4 py-4 text-sm text-slate-600">${new Date(year.end_date).toLocaleDateString('es-DO')}</td>
        <td class="px-4 py-4">
          <span class="px-3 py-1 text-xs font-bold rounded-full ${
            year.is_current ? 'bg-emerald-100 text-emerald-700' : 
            year.status === 'active' ? 'bg-blue-100 text-blue-700' : 
            'bg-slate-100 text-slate-700'
          }">
            ${year.is_current ? 'Actual' : year.status}
          </span>
        </td>
        <td class="px-4 py-4 text-center">
          <div class="flex justify-center gap-2">
            <button onclick="SchoolYearModule.editYear(${year.id})" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
              <i data-lucide="edit" class="w-4 h-4"></i>
            </button>
            ${!year.is_current ? `
              <button onclick="SchoolYearModule.setAsCurrent(${year.id})" class="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                <i data-lucide="star" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  renderCalendarMonths() {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months.map(month => `
      <div class="p-4 bg-slate-50 rounded-xl border border-slate-100">
        <h4 class="font-black text-slate-800 mb-3">${month}</h4>
        <div class="grid grid-cols-7 gap-1 text-xs">
          ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="text-center text-slate-400 font-bold">${d}</div>`).join('')}
          ${Array(35).fill(0).map((_, i) => {
            const day = i - 3;
            if (day <= 0 || day > 31) return '<div></div>';
            const isWeekend = (i % 7 === 5 || i % 7 === 6);
            return `
              <div class="text-center py-1 rounded font-bold ${
                isWeekend ? 'text-slate-300' : 'text-slate-700'
              } hover:bg-slate-100 cursor-pointer">${day}</div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
  },

  openModal(year = null) {
    this.state.selectedYear = year;
    
    const isEdit = !!year;
    const modalHTML = `
      <div id="school-year-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
          <div class="p-6 border-b border-slate-100">
            <div class="flex items-center justify-between">
              <h3 class="text-xl font-black text-slate-800">${isEdit ? 'Editar Año Escolar' : 'Nuevo Año Escolar'}</h3>
              <button onclick="SchoolYearModule.closeModal()" class="p-2 text-slate-400 hover:text-slate-600">
                <i data-lucide="x" class="w-5 h-5"></i>
              </button>
            </div>
          </div>

          <div class="p-6 space-y-4">
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">Nombre del Año</label>
              <input id="year-name" type="text" value="${year?.name || ''}" placeholder="Ej: 2024-2025" class="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-bold text-slate-700 mb-2">Fecha de Inicio</label>
                <input id="year-start" type="date" value="${year?.start_date || ''}" class="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500">
              </div>
              <div>
                <label class="block text-sm font-bold text-slate-700 mb-2">Fecha de Fin</label>
                <input id="year-end" type="date" value="${year?.end_date || ''}" class="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500">
              </div>
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">Estado</label>
              <select id="year-status" class="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500">
                <option value="upcoming" ${year?.status === 'upcoming' ? 'selected' : ''}>Próximo</option>
                <option value="active" ${year?.status === 'active' ? 'selected' : ''}>Activo</option>
                <option value="closed" ${year?.status === 'closed' ? 'selected' : ''}>Cerrado</option>
              </select>
            </div>
          </div>

          <div class="p-6 border-t border-slate-100 flex justify-end gap-3">
            <button onclick="SchoolYearModule.closeModal()" class="px-5 py-2 text-slate-600 font-bold border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition-all">Cancelar</button>
            <button onclick="SchoolYearModule.saveYear()" class="px-5 py-2 bg-emerald-500 text-white font-black rounded-xl hover:bg-emerald-600 transition-all">Guardar</button>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container);
    if (window.lucide) lucide.createIcons();
  },

  closeModal() {
    const modal = document.getElementById('school-year-modal');
    if (modal) modal.remove();
  },

  async saveYear() {
    const name = document.getElementById('year-name').value.trim();
    const start_date = document.getElementById('year-start').value;
    const end_date = document.getElementById('year-end').value;
    const status = document.getElementById('year-status').value;

    if (!name || !start_date || !end_date) {
      Helpers.toast('Por favor complete todos los campos', 'warning');
      return;
    }

    try {
      if (this.state.selectedYear) {
        // Update existing
        const { error } = await supabase
          .from('school_years')
          .update({ name, start_date, end_date, status })
          .eq('id', this.state.selectedYear.id);
        if (error) throw error;
        Helpers.toast('Año escolar actualizado', 'success');
      } else {
        // Create new
        const { error } = await supabase
          .from('school_years')
          .insert({ name, start_date, end_date, status, is_current: false });
        if (error) throw error;
        Helpers.toast('Año escolar creado', 'success');
      }

      this.closeModal();
      await this.loadSchoolYears();
      this.render();
    } catch (err) {
      console.error('Error saving school year:', err);
      Helpers.toast('Error al guardar año escolar', 'error');
    }
  },

  async setAsCurrent(yearId) {
    try {
      // First, set all to not current
      await supabase
        .from('school_years')
        .update({ is_current: false })
        .not('id', 'is', null);

      // Then set selected as current
      const { error } = await supabase
        .from('school_years')
        .update({ is_current: true, status: 'active' })
        .eq('id', yearId);
      if (error) throw error;

      Helpers.toast('Año escolar establecido como actual', 'success');
      await this.loadSchoolYears();
      this.render();
    } catch (err) {
      console.error('Error setting as current:', err);
      Helpers.toast('Error al establecer como año actual', 'error');
    }
  },

  editYear(yearId) {
    const year = this.state.schoolYears.find(y => y.id === yearId);
    if (year) this.openModal(year);
  },

  async saveReenrollmentSettings() {
    const month = document.getElementById('reenrollment-month').value;
    try {
      const { error } = await supabase
        .from('school_settings')
        .update({ reenrollment_month: parseInt(month), updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      Helpers.toast('Configuración de reincripción guardada', 'success');
    } catch (err) {
      console.error('Error saving settings:', err);
      Helpers.toast('Error al guardar configuración', 'error');
    }
  },

  setupEventListeners() {
    // Listen for real-time changes
    const channel = supabase
      .channel('school_years_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_years' }, () => {
        this.loadSchoolYears().then(() => this.render());
      })
      .subscribe();
  }
};

window.SchoolYearModule = SchoolYearModule;

