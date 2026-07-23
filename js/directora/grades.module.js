import { DirectorApi } from './api.js';
import { Helpers } from '../shared/helpers.js';
import { supabase } from '../shared/supabase.js';
import { AppState } from './state.js';
import { auditLog } from '../shared/db-utils.js';
import { SmartLoader } from '../shared/smart-loader.js';

const STAR_LABELS = { 5: 'Excelente', 4: 'Muy Bien', 3: 'En Desarrollo', 2: 'Necesita Apoyo', 1: 'Requiere Seguimiento' };
const STAR_COLORS = { 5: 'text-emerald-600 bg-emerald-50 border-emerald-200', 4: 'text-green-600 bg-green-50 border-green-200', 3: 'text-amber-600 bg-amber-50 border-amber-200', 2: 'text-orange-600 bg-orange-50 border-orange-200', 1: 'text-rose-600 bg-rose-50 border-rose-200' };
const AREA_ICONS = { 'Lenguaje': 'languages', 'Matemática': 'calculator', 'Desarrollo Infantil': 'heart', 'Psicomotricidad': 'activity', 'Arte y Creatividad': 'palette', 'Ciencias Naturales': 'leaf', 'Formación Valores': 'star' };
const AREA_COLORS = { 'Lenguaje': 'blue', 'Matemática': 'indigo', 'Desarrollo Infantil': 'pink', 'Psicomotricidad': 'orange', 'Arte y Creatividad': 'purple', 'Ciencias Naturales': 'emerald', 'Formación Valores': 'amber' };

function starsHtml(count, size = 'text-sm') {
  if (count == null) return '<span class="text-slate-300">—</span>';
  return '<span class="tracking-tight">' + '★'.repeat(count) + '<span class="text-slate-200">' + '☆'.repeat(5 - count) + '</span></span>';
}

function starAvgHtml(avg) {
  if (avg == null) return '<span class="text-slate-300 text-xs font-bold">—</span>';
  const rounded = Math.round(avg);
  return `<span class="font-black text-lg ${rounded >= 4 ? 'text-emerald-600' : rounded >= 3 ? 'text-amber-600' : 'text-rose-600'}">${avg.toFixed(1)}</span> <span class="text-xs text-slate-400">★</span>`;
}

function levelFromAvg(avg) {
  if (avg == null) return { label: 'Sin evaluar', cls: 'bg-slate-100 text-slate-500' };
  if (avg >= 4.5) return { label: 'Excelente', cls: 'bg-emerald-100 text-emerald-700' };
  if (avg >= 3.5) return { label: 'Muy Bien', cls: 'bg-green-100 text-green-700' };
  if (avg >= 2.5) return { label: 'En Desarrollo', cls: 'bg-amber-100 text-amber-700' };
  if (avg >= 1.5) return { label: 'Necesita Apoyo', cls: 'bg-orange-100 text-orange-700' };
  return { label: 'Requiere Seguimiento', cls: 'bg-rose-100 text-rose-700' };
}

function starsBar(avg) {
  if (avg == null) return '';
  const pct = (avg / 5) * 100;
  const color = avg >= 4 ? 'bg-emerald-500' : avg >= 3 ? 'bg-amber-500' : 'bg-rose-500';
  return `<div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1"><div class="${color} h-full rounded-full transition-all" style="width:${pct}%"></div></div>`;
}

export const GradesModule = {
  _currentPeriodId: null,
  _periods: [],
  _schoolYears: [],
  _allData: [],
  _areas: [],
  _competencies: [],
  _competencyScores: [],
  _activeTab: 'students',

  async init() {
    const container = document.getElementById('gradesTableBody');
    if (!container) return;

    try {
      const { data: years } = await supabase.from('school_years').select('*').order('start_date', { ascending: false });
      this._schoolYears = years || [];
    } catch (_) {}

    const { data: areas } = await supabase.from('academic_areas').select('*').order('sort_order');
    this._areas = areas || [];

    const { data: comps } = await supabase.from('competencies').select('*, area:academic_areas(name, icon)').order('level_order');
    this._competencies = comps || [];

    await this._loadPeriods();
    await this._loadAllData();
    this._bindEvents();
  },

  _bindEvents() {
    document.getElementById('gradesFilterPeriod')?.addEventListener('change', (e) => {
      this._currentPeriodId = e.target.value || null;
      this._loadAllData();
    });

    const searchInput = document.getElementById('searchGradeStudent');
    if (searchInput && !searchInput._bound) {
      searchInput._bound = true;
      searchInput.addEventListener('input', Helpers.debounce(() => this.applyFilters(), 300));
    }

    const classFilter = document.getElementById('gradesFilterClassroom');
    if (classFilter && !classFilter._bound) {
      classFilter._bound = true;
      classFilter.addEventListener('change', () => this.applyFilters());
      this._loadClassrooms();
    }

    document.getElementById('btnClosePeriod')?.addEventListener('click', () => this._closePeriod());
    document.getElementById('btnNewPeriod')?.addEventListener('click', () => this._openPeriodModal());
    document.getElementById('btnExportGrades')?.addEventListener('click', () => this._exportGrades());

    document.querySelectorAll('.grades-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.grades-tab').forEach(t => t.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm'));
        document.querySelectorAll('.grades-tab').forEach(t => t.classList.add('text-slate-500'));
        tab.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
        tab.classList.remove('text-slate-500');
        document.querySelectorAll('.grades-tab-content').forEach(c => c.style.display = 'none');
        const target = tab.dataset.tab;
        document.getElementById('gradesTab' + target.charAt(0).toUpperCase() + target.slice(1)).style.display = '';
        this._activeTab = target;
        if (target === 'areas') this._renderAreas();
        if (target === 'institutional') this._renderInstitutional();
      });
    });
  },

  async _loadClassrooms() {
    const { data: rooms } = await DirectorApi.getClassrooms();
    const sel = document.getElementById('gradesFilterClassroom');
    if (sel && rooms) {
      sel.innerHTML = '<option value="all">Todas las aulas</option>' +
        rooms.map(r => `<option value="${r.id}">${Helpers.escapeHTML(r.name)}</option>`).join('');
    }
  },

  async _loadPeriods() {
    try {
      const { data: periods } = await DirectorApi.getPeriods();
      this._periods = periods || [];
      const sel = document.getElementById('gradesFilterPeriod');
      if (!sel) return;
      sel.innerHTML = '<option value="">Todos los períodos</option>' +
        this._periods.map(p =>
          `<option value="${p.id}">${Helpers.escapeHTML(p.name)} ${p.status === 'closed' ? '(Cerrado)' : ''}</option>`
        ).join('');
      const active = this._periods.find(p => p.is_active) || this._periods.find(p => p.status === 'open');
      if (active) {
        sel.value = active.id;
        this._currentPeriodId = String(active.id);
      } else if (this._periods.length > 0) {
        sel.value = this._periods[0].id;
        this._currentPeriodId = String(this._periods[0].id);
      }
      const btnClose = document.getElementById('btnClosePeriod');
      if (btnClose) btnClose.style.display = active && active.status === 'open' ? 'flex' : 'none';
    } catch (_) {}
  },

  async _loadAllData() {
    const tableBody = document.getElementById('gradesTableBody');
    if (!tableBody) return;

    await SmartLoader.showIn('gradesTableBody', 'calificaciones', { skeleton: 'table', rows: 6 });

    try {
      const studentsResult = await DirectorApi.getStudents();
      const students = studentsResult?.data || [];

      let scoresQuery = supabase.from('competency_scores').select('*');
      if (this._currentPeriodId) {
        scoresQuery = scoresQuery.eq('period_id', parseInt(this._currentPeriodId));
      }
      const { data: scores, error: scErr } = await scoresQuery;
      if (scErr) throw scErr;

      const compMap = {};
      this._competencies.forEach(c => { compMap[c.id] = c; });

      const grouped = {};
      students.forEach(s => {
        grouped[s.id] = {
          sid: s.id, name: s.name,
          classroom: s.classrooms?.name || 'Sin aula',
          classroom_id: s.classroom_id,
          scores: [], areaAvgs: {}, globalAvg: null
        };
      });

      (scores || []).forEach(sc => {
        if (grouped[sc.student_id]) {
          grouped[sc.student_id].scores.push(sc);
        }
      });

      this._allData = Object.values(grouped).map(s => {
        const areaScores = {};
        s.scores.forEach(sc => {
          const comp = compMap[sc.competency_id];
          if (comp) {
            const areaName = comp.area?.name || comp.area_name || 'Otra';
            if (!areaScores[areaName]) areaScores[areaName] = [];
            if (sc.stars) areaScores[areaName].push(sc.stars);
          }
        });

        s.areaAvgs = {};
        Object.entries(areaScores).forEach(([area, vals]) => {
          s.areaAvgs[area] = vals.reduce((a, b) => a + b, 0) / vals.length;
        });

        const allStars = s.scores.map(sc => sc.stars).filter(v => v != null);
        s.globalAvg = allStars.length > 0 ? allStars.reduce((a, b) => a + b, 0) / allStars.length : null;
        return s;
      });

      this.applyFilters();
      this._updateKPIs();
      if (this._activeTab === 'areas') this._renderAreas();
      if (this._activeTab === 'institutional') this._renderInstitutional();

    } catch (e) {
      tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-12">
        <div class="flex flex-col items-center gap-3">
          <div class="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center text-2xl">⚠️</div>
          <p class="font-bold text-slate-700">No pudimos cargar las evaluaciones</p>
          <p class="text-xs text-slate-400 max-w-sm text-center">La información permanece segura. Puedes intentarlo nuevamente.</p>
          <button onclick="App.grades._loadAllData()" class="px-4 py-2 bg-indigo-500 text-white rounded-xl font-black text-xs uppercase hover:bg-indigo-600 transition-all">Reintentar</button>
        </div>
      </td></tr>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  filter(value) {
    const input = document.getElementById('searchGradeStudent');
    if (input) { input.value = value; this.applyFilters(); }
  },

  applyFilters() {
    const tableBody = document.getElementById('gradesTableBody');
    if (!tableBody) return;

    const search = (document.getElementById('searchGradeStudent')?.value || '').toLowerCase();
    const classFilter = document.getElementById('gradesFilterClassroom')?.value || 'all';

    let filtered = this._allData;
    if (search) filtered = filtered.filter(s => s.name.toLowerCase().includes(search));
    if (classFilter !== 'all') filtered = filtered.filter(s => String(s.classroom_id) === classFilter);

    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-16 text-slate-400 font-medium">No se encontraron evaluaciones con los filtros aplicados.</td></tr>';
      return;
    }

    filtered.sort((a, b) => {
      if (a.globalAvg != null && b.globalAvg != null) return b.globalAvg - a.globalAvg;
      if (a.globalAvg != null) return -1;
      return 1;
    });

    const areaNames = ['Lenguaje', 'Matemática', 'Desarrollo Infantil', 'Psicomotricidad', 'Arte y Creatividad'];

    tableBody.innerHTML = filtered.map(s => {
      const level = levelFromAvg(s.globalAvg);
      const areaCells = areaNames.map(area => {
        const avg = s.areaAvgs[area];
        if (avg == null) return '<td class="px-4 py-4 text-center"><span class="text-slate-300">—</span></td>';
        return `<td class="px-4 py-4 text-center">${starsHtml(Math.round(avg))}<div class="text-[10px] text-slate-400 font-bold mt-0.5">${avg.toFixed(1)}★</div></td>`;
      }).join('');

      return `
        <tr class="hover:bg-indigo-50/30 border-b border-slate-100 transition-all cursor-pointer group"
            ondblclick="App.grades.openStudentDetail('${s.sid}')">
          <td class="px-6 py-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-sm group-hover:scale-110 transition-transform">
                ${s.name.charAt(0)}
              </div>
              <div>
                <div class="font-black text-slate-800 text-sm">${Helpers.escapeHTML(s.name)}</div>
                <div class="text-[10px] text-slate-400 font-black uppercase tracking-tighter">${s.classroom}</div>
              </div>
            </div>
          </td>
          <td class="px-4 py-4 text-center">
            <div class="flex flex-col items-center">
              ${starAvgHtml(s.globalAvg)}
              ${starsBar(s.globalAvg)}
            </div>
          </td>
          ${areaCells}
          <td class="px-4 py-4 text-center">
            <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-sm ${level.cls}">
              ${level.label}
            </span>
          </td>
          <td class="px-4 py-4 text-center">
            <button onclick="event.stopPropagation();App.grades.openStudentDetail('${s.sid}')"
              class="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors" title="Ver expediente">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
          </td>
        </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  _updateKPIs() {
    const evaluated = this._allData.filter(s => s.globalAvg != null);
    const allAvgs = evaluated.map(s => s.globalAvg);
    const globalAvg = allAvgs.length > 0 ? allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length : null;
    const needsSupport = evaluated.filter(s => s.globalAvg != null && s.globalAvg <= 2).length;
    const areasSet = new Set();
    evaluated.forEach(s => Object.keys(s.areaAvgs).forEach(a => areasSet.add(a)));

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('kpiTotalEvaluated', evaluated.length);
    set('kpiAvgStars', globalAvg != null ? globalAvg.toFixed(1) + ' ★' : 'N/A');
    set('kpiNeedsSupport', needsSupport);
    set('kpiAreasEvaluated', areasSet.size);
  },

  _renderAreas() {
    const grid = document.getElementById('areasGrid');
    if (!grid) return;

    if (this._allData.length === 0) {
      grid.innerHTML = '<div class="text-center py-10 text-slate-400 col-span-full">No hay datos de evaluación disponibles.</div>';
      return;
    }

    const areaAggregates = {};
    this._allData.forEach(s => {
      Object.entries(s.areaAvgs).forEach(([area, avg]) => {
        if (!areaAggregates[area]) areaAggregates[area] = { name: area, avgs: [], count: 0 };
        areaAggregates[area].avgs.push(avg);
        areaAggregates[area].count++;
      });
    });

    const areaNames = Object.keys(areaAggregates);
    if (!areaNames.length) {
      grid.innerHTML = '<div class="text-center py-10 text-slate-400 col-span-full">No hay áreas evaluadas en este período.</div>';
      return;
    }

    grid.innerHTML = areaNames.map(area => {
      const data = areaAggregates[area];
      const avg = data.avgs.reduce((a, b) => a + b, 0) / data.avgs.length;
      const color = AREA_COLORS[area] || 'slate';
      const icon = AREA_ICONS[area] || 'book';
      const level = levelFromAvg(avg);
      const dist = [5, 4, 3, 2, 1].map(star => data.avgs.filter(a => Math.round(a) === star).length);

      return `
        <div class="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all">
          <div class="flex items-center gap-3 mb-4">
            <div class="p-2.5 bg-${color}-100 rounded-xl text-${color}-600"><i data-lucide="${icon}" class="w-5 h-5"></i></div>
            <div>
              <h4 class="font-black text-slate-800 text-sm">${Helpers.escapeHTML(area)}</h4>
              <p class="text-[10px] text-slate-400 font-bold uppercase">${data.count} estudiante${data.count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div class="text-center mb-4">
            <div class="text-3xl font-black text-slate-800">${avg.toFixed(1)} <span class="text-lg text-yellow-500">★</span></div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${level.cls} mt-1 inline-block">${level.label}</span>
          </div>
          <div class="space-y-1.5">
            ${[5, 4, 3, 2, 1].map((star, i) => {
              const count = dist[i];
              const pct = data.count > 0 ? Math.round((count / data.count) * 100) : 0;
              return `
                <div class="flex items-center gap-2 text-[10px]">
                  <span class="w-6 text-right font-bold text-slate-500">${star}★</span>
                  <div class="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div class="h-full rounded-full ${star >= 4 ? 'bg-emerald-500' : star >= 3 ? 'bg-amber-500' : 'bg-rose-500'}" style="width:${pct}%"></div>
                  </div>
                  <span class="w-8 text-right font-bold text-slate-400">${count}</span>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  _renderInstitutional() {
    const container = document.getElementById('institutionalSummary');
    if (!container) return;

    if (!this._currentPeriodId) {
      container.innerHTML = '<div class="text-center py-10 text-slate-400">Selecciona un período específico para ver el resumen institucional.</div>';
      return;
    }

    const period = this._periods.find(p => String(p.id) === String(this._currentPeriodId));
    const evaluated = this._allData.filter(s => s.globalAvg != null);
    const totalStudents = this._allData.length;
    const totalEvaluated = evaluated.length;
    const globalAvg = evaluated.length > 0 ? evaluated.reduce((a, b) => a + b.globalAvg, 0) / evaluated.length : null;

    const areaAggregates = {};
    this._allData.forEach(s => {
      Object.entries(s.areaAvgs).forEach(([area, avg]) => {
        if (!areaAggregates[area]) areaAggregates[area] = [];
        areaAggregates[area].push(avg);
      });
    });

    const byLevel = { excelente: 0, muy_bien: 0, desarrollo: 0, apoyo: 0, seguimiento: 0 };
    evaluated.forEach(s => {
      if (s.globalAvg >= 4.5) byLevel.excelente++;
      else if (s.globalAvg >= 3.5) byLevel.muy_bien++;
      else if (s.globalAvg >= 2.5) byLevel.desarrollo++;
      else if (s.globalAvg >= 1.5) byLevel.apoyo++;
      else byLevel.seguimiento++;
    });

    const areaNames = Object.keys(areaAggregates).sort();

    container.innerHTML = `
      <div class="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl p-6 border border-indigo-100">
        <h4 class="font-black text-indigo-800 text-sm mb-1">${Helpers.escapeHTML(period?.name || 'Período seleccionado')}</h4>
        <p class="text-xs text-indigo-600 font-bold">${totalEvaluated} de ${totalStudents} estudiantes evaluados</p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        ${[
          { label: 'Excelente', count: byLevel.excelente, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'Muy Bien', count: byLevel.muy_bien, cls: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'En Desarrollo', count: byLevel.desarrollo, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
          { label: 'Necesita Apoyo', count: byLevel.apoyo, cls: 'bg-orange-50 border-orange-200 text-orange-700' },
          { label: 'Requiere Seguim.', count: byLevel.seguimiento, cls: 'bg-rose-50 border-rose-200 text-rose-700' }
        ].map(l => `
          <div class="border rounded-xl p-4 text-center ${l.cls}">
            <div class="text-2xl font-black">${l.count}</div>
            <div class="text-[10px] font-bold uppercase tracking-wider mt-1">${l.label}</div>
          </div>
        `).join('')}
      </div>

      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div class="bg-slate-50 px-6 py-3 border-b border-slate-100">
          <h4 class="font-black text-slate-700 text-sm">Promedio por Área</h4>
        </div>
        <div class="divide-y divide-slate-50">
          ${areaNames.map(area => {
            const vals = areaAggregates[area];
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            const pct = (avg / 5) * 100;
            const color = avg >= 4 ? 'bg-emerald-500' : avg >= 3 ? 'bg-amber-500' : 'bg-rose-500';
            const icon = AREA_ICONS[area] || 'book';
            const areaColor = AREA_COLORS[area] || 'slate';
            return `
              <div class="px-6 py-4 flex items-center gap-4">
                <div class="p-2 bg-${areaColor}-100 rounded-xl text-${areaColor}-600"><i data-lucide="${icon}" class="w-4 h-4"></i></div>
                <div class="flex-1 min-w-0">
                  <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-slate-700 text-sm">${Helpers.escapeHTML(area)}</span>
                    <span class="font-black text-slate-800">${avg.toFixed(1)} ★</span>
                  </div>
                  <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div class="${color} h-full rounded-full transition-all" style="width:${pct}%"></div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>

      ${globalAvg != null ? `
      <div class="bg-white border border-slate-200 rounded-2xl p-6 text-center">
        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Promedio Global Institucional</p>
        <div class="text-4xl font-black text-slate-800">${globalAvg.toFixed(1)} <span class="text-yellow-500 text-2xl">★</span></div>
        <p class="text-sm text-slate-500 mt-1">${levelFromAvg(globalAvg).label}</p>
      </div>` : ''}
    `;

    if (window.lucide) lucide.createIcons();
  },

  async openStudentDetail(studentId) {
    const data = this._allData.find(s => String(s.sid) === String(studentId));
    if (!data) return;

    const compMap = {};
    this._competencies.forEach(c => { compMap[c.id] = c; });

    const areaGroups = {};
    data.scores.forEach(sc => {
      const comp = compMap[sc.competency_id];
      if (!comp) return;
      const areaName = comp.area?.name || comp.area_name || 'Otra';
      if (!areaGroups[areaName]) areaGroups[areaName] = [];
      areaGroups[areaName].push({ ...sc, competency: comp });
    });

    const areaNames = Object.keys(areaGroups).sort();

    const modalHtml = `
      <div class="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div class="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 text-white flex justify-between items-center">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-black">${data.name.charAt(0)}</div>
            <div>
              <h3 class="text-xl font-black">${Helpers.escapeHTML(data.name)}</h3>
              <p class="text-sm font-bold text-white/70 uppercase tracking-widest">${data.classroom} · Promedio: ${data.globalAvg != null ? data.globalAvg.toFixed(1) + ' ★' : 'Sin evaluar'}</p>
            </div>
          </div>
          <button onclick="App.ui.closeModal()" class="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-colors">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-4">
          ${areaNames.length === 0 ? '<p class="text-center text-slate-400 py-8">No hay evaluaciones por competencias para este estudiante.</p>' :
            areaNames.map(area => {
              const items = areaGroups[area];
              const areaAvg = items.map(i => i.stars).filter(v => v != null);
              const avg = areaAvg.length > 0 ? areaAvg.reduce((a, b) => a + b, 0) / areaAvg.length : null;
              const icon = AREA_ICONS[area] || 'book';
              const areaColor = AREA_COLORS[area] || 'slate';
              return `
                <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div class="px-5 py-3 bg-${areaColor}-50 border-b border-${areaColor}-100 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <i data-lucide="${icon}" class="w-4 h-4 text-${areaColor}-600"></i>
                      <h4 class="font-black text-slate-800 text-sm">${Helpers.escapeHTML(area)}</h4>
                    </div>
                    <span class="font-black text-sm ${avg != null ? (avg >= 4 ? 'text-emerald-600' : avg >= 3 ? 'text-amber-600' : 'text-rose-600') : 'text-slate-400'}">
                      ${avg != null ? avg.toFixed(1) + ' ★' : '—'}
                    </span>
                  </div>
                  <div class="divide-y divide-slate-50">
                    ${items.map(item => `
                      <div class="px-5 py-3 flex items-center justify-between">
                        <div class="min-w-0 flex-1">
                          <div class="font-bold text-slate-700 text-sm">${Helpers.escapeHTML(item.competency.name)}</div>
                          <div class="text-[10px] text-slate-400">${Helpers.escapeHTML(item.competency.description || '')}</div>
                        </div>
                        <div class="flex items-center gap-3">
                          <span class="text-yellow-500 text-sm">${starsHtml(item.stars)}</span>
                          <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${STAR_COLORS[item.stars] || 'bg-slate-100 text-slate-500'}">
                            ${STAR_LABELS[item.stars] || '—'}
                          </span>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>`;
            }).join('')}
        </div>
        <div class="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
          <button onclick="App.grades.openStudentHistory('${data.sid}','${Helpers.escapeHTML(data.name).replace(/'/g,"\\'")}')"
            class="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all flex items-center gap-2">
            <i data-lucide="history" class="w-3.5 h-3.5"></i> Historial Académico
          </button>
          <button onclick="App.ui.closeModal()" class="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-slate-900 transition-all">Cerrar</button>
        </div>
      </div>`;

    window.openGlobalModal(modalHtml, true);
    if (window.lucide) lucide.createIcons();
  },

  async openStudentHistory(studentId, studentName) {
    try {
      const { data, error } = await supabase.rpc('get_student_competencies', {
        p_student_id: parseInt(studentId),
        p_period_id: this._currentPeriodId ? parseInt(this._currentPeriodId) : null
      });
      if (error) throw error;

      const { data: recordData } = await supabase.rpc('get_student_academic_record', {
        p_student_id: parseInt(studentId)
      });

      const records = recordData?.records || [];
      const currentScores = Array.isArray(data) ? data : [];

      window.openGlobalModal(`
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden">
          <div class="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 text-white flex items-center justify-between">
            <div>
              <h3 class="text-xl font-black">Expediente Académico</h3>
              <p class="text-sm text-white/70 font-medium mt-0.5">${Helpers.escapeHTML(studentName)}</p>
            </div>
            <button onclick="App.ui.closeModal()" class="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-colors">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div class="p-6 overflow-y-auto max-h-[70vh] bg-slate-50 space-y-4">
            ${currentScores.length > 0 ? `
              <div class="bg-white rounded-2xl border border-slate-200 p-5">
                <h4 class="font-black text-slate-700 text-sm mb-3">Evaluación Actual</h4>
                <div class="space-y-2">
                  ${currentScores.map(sc => `
                    <div class="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <div class="text-sm font-bold text-slate-700">${Helpers.escapeHTML(sc.competency_name || '')}</div>
                      <span class="text-yellow-500 text-sm">${starsHtml(sc.stars)}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${records.length > 0 ? `
              <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div class="bg-slate-50 px-5 py-3 border-b border-slate-100">
                  <h4 class="font-black text-slate-700 text-sm">Historial por Períodos</h4>
                </div>
                <div class="divide-y divide-slate-50">
                  ${records.map(r => `
                    <div class="px-5 py-4">
                      <div class="flex items-center justify-between mb-2">
                        <div>
                          <span class="font-bold text-slate-800 text-sm">${Helpers.escapeHTML(r.period_name || '')}</span>
                          <span class="text-xs text-slate-400 ml-2">${Helpers.escapeHTML(r.school_year_name || '')}</span>
                        </div>
                        <span class="font-black text-indigo-600">${r.final_score != null ? Number(r.final_score).toFixed(1) : '—'}</span>
                      </div>
                      <div class="text-xs text-slate-500">${Helpers.escapeHTML(r.classroom_name || '')} · ${Helpers.escapeHTML(r.level || '')}</div>
                      ${r.teacher_comment ? `<p class="text-xs text-slate-500 italic mt-1">"${Helpers.escapeHTML(r.teacher_comment)}"</p>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : '<p class="text-center text-slate-400 text-sm">No hay historial académico registrado.</p>'}
          </div>
          <div class="p-4 bg-slate-50 border-t border-slate-100 text-center">
            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Expediente Académico — Solo visible para Directora</p>
          </div>
        </div>
      `, true);
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      Helpers.toast('Error al cargar expediente: ' + (e.message || ''), 'error');
    }
  },

  async _closePeriod() {
    const periodId = this._currentPeriodId;
    if (!periodId) return Helpers.toast('Selecciona un período abierto', 'warning');
    const period = this._periods.find(p => String(p.id) === String(periodId));
    if (!period || period.status === 'closed') return Helpers.toast('Este período ya está cerrado', 'warning');

    if (!confirm(
      'Cerrar el período "' + period.name + '"?\n\n' +
      '• Se calcularán los promedios finales de todos los estudiantes.\n' +
      '• Las calificaciones quedarán bloqueadas para edición.\n' +
      '• Se generarán las boletas de calificaciones.\n' +
      '• Las evaluaciones por competencias quedarán en modo lectura.\n\n' +
      '¿Deseas continuar?'
    )) return;

    const progress = SmartLoader.overlay({
      title: 'Cerrando el Período',
      steps: [
        { icon: '📊', text: 'Cerrando el Período ' + period.name },
        { icon: '✓', text: 'Calculando promedios finales' },
        { icon: '✓', text: 'Evaluando competencias por área' },
        { icon: '✓', text: 'Generando reportes de progreso' },
        { icon: '✓', text: 'Bloqueando calificaciones' },
        { icon: '✓', text: 'Notificando a las familias' }
      ]
    });

    try {
      progress.setStep(0);
      progress.setSubtitle('Iniciando proceso de cierre...');

      await new Promise(r => setTimeout(r, 400));
      progress.setStep(1);

      const { data, error } = await supabase.rpc('close_period', { p_period_id: parseInt(periodId) });

      for (let i = 2; i <= 5; i++) {
        progress.setStep(i);
        await new Promise(r => setTimeout(r, 200));
      }

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const cards = data?.cards_generated || 0;
      progress.setStep(5);
      progress.complete(`✅ Período cerrado. ${cards} boleta${cards !== 1 ? 's' : ''} generada${cards !== 1 ? 's' : ''}.`);
      auditLog('period.closed', { period_id: periodId, period_name: period.name });

      try {
        const { emitEvent: emit } = await import('../shared/supabase.js');
        const { data: reportCards } = await supabase
          .from('report_cards')
          .select('student_id, final_score, students:student_id(name, parent_id, p1_email)')
          .eq('period_id', parseInt(periodId))
          .lt('final_score', 60)
          .not('final_score', 'is', null);

        for (const rc of reportCards || []) {
          const stu = rc.students || {};
          emit('grade.low_score', {
            student_id: rc.student_id, student_name: stu.name,
            score: Number(rc.final_score).toFixed(1), period_name: period.name,
            parent_id: stu.parent_id, parent_email: stu.p1_email
          }).catch(() => {});
        }
      } catch (_) {}

      await this._loadPeriods();
      await this._loadAllData();
    } catch (e) {
      progress.error('⚠️ No pudimos cerrar el período. La información permanece segura. Puedes intentarlo nuevamente.');
      try {
        const { error } = await supabase.from('periods')
          .update({ status: 'closed', is_active: false, is_blocked: true })
          .eq('id', periodId);
        if (error) throw error;
        Helpers.toast('Período cerrado (sin cálculo de competencias)', 'warning');
        await this._loadPeriods();
        await this._loadAllData();
      } catch (e2) {
        Helpers.toast('Error al cerrar período: ' + (e2.message || e.message), 'error');
      }
    }
  },

  _openPeriodModal() {
    const ic = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 bg-slate-50/50 transition-all text-sm font-medium';
    const lc = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1';
    const y = new Date().getFullYear();
    const yearOptions = (this._schoolYears || []).map(yr =>
      `<option value="${yr.id}" ${yr.is_current ? 'selected' : ''}>${Helpers.escapeHTML(yr.name)} ${yr.is_current ? '(Actual)' : ''}</option>`
    ).join('');

    window.openGlobalModal(`
      <div class="w-full max-w-md overflow-hidden">
        <div class="bg-indigo-600 p-6 text-white flex justify-between items-center">
          <h3 class="text-xl font-black">Nuevo Período</h3>
        </div>
        <div class="p-6 space-y-4">
          <div><label class="${lc}">Año Escolar</label><select id="periodSchoolYear" class="${ic}">${yearOptions || '<option>Sin años escolares</option>'}</select></div>
          <div><label class="${lc}">Nombre del Período</label><input id="periodName" class="${ic}" placeholder="Ej: 1er Trimestre ${y}"></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="${lc}">Fecha Inicio</label><input id="periodStart" type="date" class="${ic}"></div>
            <div><label class="${lc}">Fecha Fin</label><input id="periodEnd" type="date" class="${ic}"></div>
          </div>
          <div class="flex items-center gap-2 px-1">
            <input type="checkbox" id="periodIsActive" class="w-4 h-4 text-indigo-600 rounded border-slate-300">
            <label for="periodIsActive" class="text-xs font-bold text-slate-600 uppercase">Establecer como activo</label>
          </div>
        </div>
        <div class="p-6 bg-slate-50 flex justify-end gap-3">
          <button onclick="App.ui.closeModal()" class="px-6 py-2.5 text-xs font-black uppercase text-slate-400">Cancelar</button>
          <button id="btnSavePeriod" class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-indigo-200">Crear Período</button>
        </div>
      </div>
    `);
    document.getElementById('btnSavePeriod')?.addEventListener('click', () => this._savePeriod());
    if (window.lucide) lucide.createIcons();
  },

  async _savePeriod() {
    const name = document.getElementById('periodName')?.value;
    const start = document.getElementById('periodStart')?.value;
    const end = document.getElementById('periodEnd')?.value;
    const isActive = document.getElementById('periodIsActive')?.checked;
    const schoolYearId = document.getElementById('periodSchoolYear')?.value || null;

    if (!name || !start || !end) return Helpers.toast('Completa todos los campos', 'warning');

    try {
      if (isActive) {
        await supabase.from('periods').update({ is_active: false }).eq('is_active', true);
      }
      const { error } = await supabase.from('periods').insert({
        name, start_date: start, end_date: end,
        status: 'open', is_active: isActive,
        school_year_id: schoolYearId ? parseInt(schoolYearId) : null
      });
      if (error) throw error;
      Helpers.toast('Período creado correctamente', 'success');
      App.ui.closeModal();
      await this._loadPeriods();
      await this._loadAllData();
    } catch (e) {
      Helpers.toast('Error al crear período', 'error');
    }
  },

  _exportGrades() {
    if (!this._allData.length) return Helpers.toast('No hay datos para exportar', 'warning');
    const choice = confirm('¿Exportar en formato PDF?\n\n(Aceptar para PDF, Cancelar para CSV)');
    if (choice) this._exportToPDF();
    else this._exportToCSV();
  },

  _exportToCSV() {
    const areaNames = ['Lenguaje', 'Matemática', 'Desarrollo Infantil', 'Psicomotricidad', 'Arte y Creatividad'];
    const csv = ['Estudiante,Aula,Global Stars,' + areaNames.join(',') + ',Nivel'];
    this._allData.forEach(s => {
      const level = levelFromAvg(s.globalAvg);
      const areaVals = areaNames.map(a => s.areaAvgs[a] != null ? s.areaAvgs[a].toFixed(1) : '—');
      csv.push(`"${s.name}","${s.classroom}",${s.globalAvg != null ? s.globalAvg.toFixed(1) : 'N/A'},${areaVals.join(',')},"${level.label}"`);
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluaciones_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  _exportToPDF() {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.setTextColor(99, 102, 241);
      doc.text('Centro de Evaluación Académica', 14, 20);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 28);

      const tableData = this._allData.map(s => {
        const level = levelFromAvg(s.globalAvg);
        return [s.name, s.classroom, s.globalAvg != null ? s.globalAvg.toFixed(1) + ' ★' : 'N/A', level.label];
      });

      doc.autoTable({
        startY: 35, head: [['Estudiante', 'Aula', 'Promedio ★', 'Nivel']], body: tableData,
        theme: 'grid', headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 }, columnStyles: { 2: { halign: 'center', fontStyle: 'bold' }, 3: { halign: 'center' } }
      });

      doc.save(`evaluaciones_${new Date().toISOString().split('T')[0]}.pdf`);
      Helpers.toast('PDF generado correctamente', 'success');
    } catch (err) {
      Helpers.toast('Error al generar PDF', 'error');
    }
  }
};
