/**
 * Centro de Evaluación Académica — Boletín Inteligente (Directora).
 * Lista de estudiantes con promedio por período → clic abre la cuadrícula
 * compartida GradebookGrid (Áreas × Actividades en lectura + botones
 * "Ver Boletín" / "Descargar PDF"). Reemplaza al antiguo módulo de
 * competencias.
 */
import { Helpers } from '../shared/helpers.js';
import { supabase } from '../shared/supabase.js';
import { DirectorApi } from './api.js';
import { buildScoresMap, normalizeScore, avgOf, gradeColor, gradeToLevel } from '../shared/eval-utils.js';
import { GradebookGrid } from '../shared/gradebook-grid.module.js';
import { findCanonicalClassroom } from '../shared/constants.js';

const _esc = (s) => Helpers.escapeHTML(String(s ?? ''));
const canonOf = (c) => findCanonicalClassroom(c?.level || c?.name || '');

export const GradesModule = {
  _evaluation: null,
  _periods: [],
  _classrooms: [],
  _students: [],
  _areas: [],
  _modules: [],
  _activities: [],
  _scoresMap: {},
  _selPeriodId: null,
  _selClassroomId: null,

  async init() {
    const container = document.getElementById('gradesTableBody');
    if (!container) return;

    await this._loadBase();
    this._bindEvents();
    this._render();
  },

  // ── CONFIGURACIÓN DE ÁREAS POR AULA (Plan de Estudio Único) ───────
  _classroomConfig: null,

  async openClassroomConfigModal() {
    if (!this._evaluation) return Helpers.toast('Primero crea un boletín en "Nuevo Período"', 'warning');
    if (!this._classrooms.length) return Helpers.toast('No hay aulas registradas', 'warning');
    const base = this._parseClassroomConfigs(this._evaluation);
    const _acc = canonOf(this._classrooms[0]);

    window.openGlobalModal(`
      <div class="cfg-window">
        <div class="dc-cfg-head" style="--accent:${_acc.color || '#FF7A00'}">
          <div class="dc-cfg-head-txt">
            <h3><i data-lucide="settings-2"></i> Configurar Áreas y Actividades por Aula</h3>
            <p>Plan de Estudio Único · cada aula define sus áreas, ponderación y actividades evaluativas</p>
          </div>
          <span class="dc-cfg-badge"><i data-lucide="layers"></i> Plan Único</span>
        </div>

        <div class="cfg-body">
          <div class="cfg-rail">
            <div class="cfg-rail-head">
              <h4 class="cfg-rail-title"><i data-lucide="door-open"></i> Aulas</h4>
              <p class="cfg-rail-hint">Activa las secciones que entran al plan de estudio.</p>
            </div>
            <div class="cfg-rail-tools">
              <div class="dc-search dc-search--sm" style="width:100%;flex:none">
                <i data-lucide="search"></i>
                <input type="text" id="cfgRoomSearch" placeholder="Filtrar aulas..." autocomplete="off" />
              </div>
            </div>
            <div class="cfg-rail-list" id="cfgRoomList"></div>
          </div>

          <div class="cfg-editor">
            <div class="cfg-editor-head">
              <div class="cfg-editor-title">
                <span class="cfg-pip"></span>
                <div style="min-width:0">
                  <h4 class="cfg-editor-name" id="cfgEditorName">Aula</h4>
                  <span class="cfg-editor-line"><i></i><span id="cfgEditorLine">Línea</span></span>
                </div>
              </div>
              <div class="cfg-tools">
                <button id="cfgAddArea" class="dc-btn dc-btn--amber dc-btn--sm"><i data-lucide="plus-square"></i> Nueva Área</button>
                <button id="cfgResetDefault" class="dc-btn dc-btn--ghost dc-btn--sm"><i data-lucide="rotate-ccw"></i> Restablecer</button>
                <div class="cfg-weight" id="cfgWeightBox">
                  <span class="cfg-weight-k">Ponderación</span>
                  <span class="cfg-weight-v" id="cfgWeightTotal">0%</span>
                </div>
              </div>
            </div>

            <div class="cfg-off-note" id="cfgOffNote" hidden>
              <i data-lucide="power-off"></i>
              <span>Esta aula está <b>desactivada</b>. Sus áreas no se usarán en el cálculo de promedios.</span>
            </div>

            <div class="cfg-grid-head">
              <span style="text-align:center">#</span>
              <span>Nombre del Área</span>
              <span class="c">Ponderación</span>
              <span class="c">Actividades</span>
              <span class="c">Color</span>
              <span class="c" style="text-align:right">Quitar</span>
            </div>

            <div id="cfgAreasList" class="cfg-list"></div>
          </div>
        </div>

        <div class="cfg-foot">
          <div class="cfg-stats" id="cfgStats"></div>
          <div class="dc-btn-group">
            <button onclick="App.ui.closeModal()" class="dc-btn dc-btn--ghost">Cancelar</button>
            <button id="cfgSave" class="dc-btn dc-btn--primary"><i data-lucide="save"></i> Guardar Configuración</button>
          </div>
        </div>
      </div>
    `, false, 'max-w-6xl');

    this._classroomConfig = structuredClone(base);
    const sel = document.getElementById('cfgClassroomSel') || this._ensureCfgSel();
    const firstId = this._classrooms.find(c => this._cfgActive(String(c.id)) !== false)?.id || this._classrooms[0].id;
    sel.value = String(firstId);
    this._renderCfgRooms();
    this._renderCfgAreas(firstId);
    this._bindCfgEvents();
    if (window.lucide) lucide.createIcons();
  },

  /** `<select>` oculto: fuente de verdad del aula seleccionada. */
  _ensureCfgSel() {
    let sel = document.getElementById('cfgClassroomSel');
    if (sel) return sel;
    sel = document.createElement('select');
    sel.id = 'cfgClassroomSel';
    sel.className = 'sr-only';
    sel.setAttribute('aria-hidden', 'true');
    sel.tabIndex = -1;
    sel.innerHTML = this._classrooms
      .map(c => `<option value="${_esc(c.id)}">${_esc(c.name)}${c.level && c.level !== c.name ? ` · ${_esc(c.level)}` : ''}</option>`)
      .join('');
    document.body.appendChild(sel);
    return sel;
  },

  /** Una aula está activa salvo que se marque explícitamente `active: false`. */
  _cfgActive(classroomId) {
    const cfg = this._classroomConfig?.[String(classroomId)];
    return cfg?.active !== false;
  },

  /** Dibuja la lista lateral de aulas con su interruptor de activación. */
  _renderCfgRooms(term = '') {
    const list = document.getElementById('cfgRoomList');
    if (!list) return;
    const selected = String(document.getElementById('cfgClassroomSel')?.value || '');
    const needle = (term || '').trim().toLowerCase();

    const rooms = this._classrooms.filter(c => !needle ||
      `${c.name || ''} ${c.level || ''} ${canonOf(c)?.line || ''}`.toLowerCase().includes(needle));

    if (!rooms.length) {
      list.innerHTML = '<div class="dc-empty"><i data-lucide="search-x"></i><span>Sin coincidencias.</span></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    list.innerHTML = rooms.map(c => {
      const canon = canonOf(c);
      const key = String(c.id);
      const active = this._cfgActive(key);
      const isSel = key === selected;
      const areas = this._classroomConfig?.[key]?.areas || [];
      const total = areas.reduce((s, a) => s + (Number(a.weight) || 0), 0);
      return `<div class="cfg-room${isSel ? ' is-sel' : ''}${active ? '' : ' is-off'}" style="--room:${canon?.color || '#0B63C7'}" data-room="${_esc(key)}" role="button" tabindex="0" aria-pressed="${isSel}">
        <span class="cfg-room-info">
          <span class="cfg-room-name">${_esc(c.name || 'Aula')}</span>
          <span class="cfg-room-meta">${areas.length ? `${areas.length} áreas · ${total}%` : (canon?.line ? 'Línea ' + _esc(canon.line) : 'Sin configurar')}</span>
        </span>
        <button type="button" class="cfg-toggle${active ? ' is-on' : ''}" data-toggle="${_esc(key)}" title="${active ? 'Desactivar aula' : 'Activar aula'}" aria-label="${active ? 'Desactivar' : 'Activar'} ${_esc(c.name || 'aula')}"></button>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-room]').forEach(el => {
      const pick = () => {
        document.getElementById('cfgClassroomSel').value = el.dataset.room;
        this._syncCfgFromDom();
        this._renderCfgRooms(document.getElementById('cfgRoomSearch')?.value || '');
        this._renderCfgAreas(el.dataset.room);
      };
      el.addEventListener('click', (e) => { if (!e.target.closest('[data-toggle]')) pick(); });
      el.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('[data-toggle]')) { e.preventDefault(); pick(); }
      });
    });

    list.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.toggle;
        this._syncCfgFromDom();
        if (!this._classroomConfig[key]) this._classroomConfig[key] = { areas: this._defaultAreasFor(key) };
        const next = !this._cfgActive(key);
        this._classroomConfig[key].active = next;
        Helpers.toast(`${this._classrooms.find(c => String(c.id) === key)?.name || 'Aula'} ${next ? 'activada' : 'desactivada'}`, next ? 'success' : 'warning');
        this._renderCfgRooms(document.getElementById('cfgRoomSearch')?.value || '');
        this._renderCfgAreas(document.getElementById('cfgClassroomSel')?.value);
      });
    });

    if (window.lucide) lucide.createIcons();
  },

  _parseClassroomConfigs(evaluation) {
    if (evaluation?.scale_config?.classroom_configs) {
      try {
        const cfg = evaluation.scale_config.classroom_configs;
        if (cfg && typeof cfg === 'object') return cfg;
      } catch (_) {}
    }
    return {};
  },

  _defaultAreasFor(classroomId) {
    const c = this._classrooms.find(x => String(x.id) === String(classroomId)) || this._classrooms[0];
    const name = c?.name || '';
    const infant = /Párvulo|Pre-Kínder|Kínder|Pre-Primario/i.test(name);
    if (infant) {
      return [
        { name: 'Motricidad',           weight: 25, activities: 4, color: '#FF7A00' },
        { name: 'Lenguaje y Comunicación', weight: 25, activities: 4, color: '#6366F1' },
        { name: 'Desarrollo Socioafectivo', weight: 25, activities: 3, color: '#EC4899' },
        { name: 'Cognitivo',             weight: 25, activities: 3, color: '#28B54D' }
      ];
    }
    return [
      { name: 'Lenguaje',              weight: 20, activities: 5, color: '#6366F1' },
      { name: 'Matemáticas',           weight: 20, activities: 5, color: '#28B54D' },
      { name: 'Ciencias Naturales',    weight: 15, activities: 4, color: '#06B6D4' },
      { name: 'Ciencias Sociales',     weight: 15, activities: 4, color: '#F59E0B' },
      { name: 'Inglés',                weight: 15, activities: 4, color: '#8B5CF6' },
      { name: 'Formación Integral',    weight: 15, activities: 3, color: '#F43F5E' }
    ];
  },

_renderCfgAreas(classroomId) {
    const key = String(classroomId);
    if (!this._classroomConfig[key] || !this._classroomConfig[key].areas?.length) {
      this._classroomConfig[key] = { areas: this._defaultAreasFor(key) };
    }
    const c = this._classrooms.find(x => String(x.id) === key);
    const canon = canonOf(c);
    const active = this._cfgActive(key);
    const list = document.getElementById('cfgAreasList');
    if (!list) return;
    const areas = this._classroomConfig[key].areas;
    const pal = ['#6366F1','#28B54D','#F59E0B','#F43F5E','#06B6D4','#8B5CF6','#10B981','#EF4444','#FF7A00','#14B8A6'];

    // Cabecera del editor
    const accent = canon?.color || '#FF7A00';
    const editorTitle = document.getElementById('cfgEditorName');
    if (editorTitle) editorTitle.textContent = c?.name || 'Aula';
    const editorLine = document.getElementById('cfgEditorLine');
    if (editorLine) editorLine.textContent = canon?.line ? `Línea ${canon.line}` : (c?.level || 'Aula especial');
    const pip = document.querySelector('.cfg-editor-title .cfg-pip');
    if (pip) pip.style.background = accent;
    const lineEl = document.querySelector('.cfg-editor-line');
    if (lineEl) lineEl.style.color = accent;
    const offNote = document.getElementById('cfgOffNote');
    if (offNote) offNote.hidden = active;

    list.innerHTML = areas.length ? areas.map((a, i) => `
      <div class="cfg-row" data-idx="${i}" style="--area:${_esc(a.color || pal[i % pal.length])}">
        <span class="cfg-row-num" style="--area:${_esc(a.color || pal[i % pal.length])}">${i + 1}</span>
        <input data-field="name" type="text" value="${_esc(a.name || '')}" placeholder="Nombre del área" class="cfg-inp" aria-label="Nombre del área ${i + 1}">
        <input data-field="weight" type="number" min="0" max="100" step="1" value="${Number(a.weight || 0)}" class="cfg-inp cfg-inp--num" aria-label="Ponderación del área ${i + 1}">
        <input data-field="activities" type="number" min="1" max="10" step="1" value="${Math.min(10, Math.max(1, Number(a.activities || 5)))}" class="cfg-inp cfg-inp--num" aria-label="Actividades del área ${i + 1}">
        <input data-field="color" type="color" value="${_esc(a.color || pal[i % pal.length])}" class="cfg-color" aria-label="Color del área ${i + 1}">
        <button data-action="remove" class="cfg-del" type="button" title="Eliminar área" aria-label="Eliminar área ${i + 1}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `).join('') : '<div class="dc-empty" style="grid-column:1/-1"><i data-lucide="inbox"></i><span>Sin áreas. Agrega la primera.</span></div>';

    this._updateCfgWeightTotal();
  },

  _updateCfgWeightTotal() {
    const key = String(document.getElementById('cfgClassroomSel')?.value);
    const areas = this._classroomConfig?.[key]?.areas || [];
    const total = areas.reduce((s, a) => s + (Number(a.weight) || 0), 0);
    const el = document.getElementById('cfgWeightTotal');
    if (el) el.textContent = `${total}%`;
    const box = document.getElementById('cfgWeightBox');
    if (box) box.classList.toggle('is-ok', total === 100);
    const stats = document.getElementById('cfgStats');
    if (stats) {
      const actives = Object.entries(this._classroomConfig || {}).filter(([, v]) => v?.active !== false).length;
      stats.innerHTML =
        `<span class="cfg-stat"><i data-lucide="layers"></i> <b>${areas.length}</b> áreas</span>` +
        `<span class="cfg-stat cfg-stat--${total === 100 ? 'on' : 'warn'}"><i data-lucide="scale"></i> Total <b>${total}%</b></span>` +
        `<span class="cfg-stat cfg-stat--on"><i data-lucide="check-check"></i> <b>${actives}</b> aulas activas</span>` +
        `<span class="cfg-stat"><i data-lucide="info"></i> Las áreas se aplican al Gradebook y a los Boletines</span>`;
    }
    return total;
  },

  _bindCfgEvents() {
    const self = this;
    const sel = document.getElementById('cfgClassroomSel');
    sel?.addEventListener('change', (e) => {
      self._syncCfgFromDom();
      self._renderCfgRooms(document.getElementById('cfgRoomSearch')?.value || '');
      self._renderCfgAreas(e.target.value);
    });
    document.getElementById('cfgRoomSearch')?.addEventListener('input', Helpers.debounce((e) => {
      self._syncCfgFromDom();
      self._renderCfgRooms(e.target.value);
    }, 200));
    document.getElementById('cfgAddArea')?.addEventListener('click', () => {
      const key = String(sel.value);
      const pal = ['#6366F1','#28B54D','#F59E0B','#F43F5E','#06B6D4','#8B5CF6','#10B981','#EF4444','#FF7A00','#14B8A6'];
      self._syncCfgFromDom();
      if (!self._classroomConfig[key]) self._classroomConfig[key] = { areas: self._defaultAreasFor(key) };
      const n = (self._classroomConfig[key].areas?.length || 0);
      self._classroomConfig[key].areas.push({ name: `Nueva Área ${n+1}`, weight: 0, activities: 3, color: pal[n % pal.length] });
      self._renderCfgAreas(key);
      self._renderCfgRooms(document.getElementById('cfgRoomSearch')?.value || '');
    });
    document.getElementById('cfgResetDefault')?.addEventListener('click', () => {
      const key = String(sel.value);
      const room = self._classrooms.find(x => String(x.id) === key)?.name || 'el aula seleccionada';
      if (!confirm(`¿Restablecer la configuración de ${room} al esquema predeterminado?`)) return;
      const active = self._cfgActive(key);
      self._classroomConfig[key] = { areas: self._defaultAreasFor(key), active };
      self._renderCfgAreas(key);
      self._renderCfgRooms(document.getElementById('cfgRoomSearch')?.value || '');
    });
    document.getElementById('cfgAreasList')?.addEventListener('input', (e) => {
      const row = e.target.closest('.cfg-row');
      if (!row) return;
      if (e.target.dataset.field === 'color') {
        row.style.setProperty('--area', e.target.value);
        const num = row.querySelector('.cfg-row-num');
        if (num) num.style.setProperty('--area', e.target.value);
      }
      self._syncCfgFromDom();
      self._updateCfgWeightTotal();
    });
    document.getElementById('cfgAreasList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="remove"]');
      if (!btn) return;
      const row = btn.closest('.cfg-row');
      const idx = Number(row.dataset.idx);
      const key = String(sel.value);
      self._syncCfgFromDom();
      self._classroomConfig[key].areas.splice(idx, 1);
      self._renderCfgAreas(key);
      self._renderCfgRooms(document.getElementById('cfgRoomSearch')?.value || '');
    });
    document.getElementById('cfgSave')?.addEventListener('click', () => self._saveClassroomConfig());
  },

  _syncCfgFromDom() {
    const key = String(document.getElementById('cfgClassroomSel')?.value);
    if (!this._classroomConfig[key]) return;
    const rows = document.querySelectorAll('#cfgAreasList .cfg-row');
    const areas = [];
    rows.forEach(r => {
      const obj = {};
      r.querySelectorAll('[data-field]').forEach(inp => {
        const f = inp.dataset.field;
        let v = inp.value;
        if (f === 'weight' || f === 'activities') v = Number(v) || 0;
        obj[f] = v;
      });
      areas.push(obj);
    });
    this._classroomConfig[key].areas = areas;
  },

  async _saveClassroomConfig() {
    this._syncCfgFromDom();
    const currentKey = String(document.getElementById('cfgClassroomSel')?.value);
    if (this._cfgActive(currentKey)) {
      const total = this._updateCfgWeightTotal();
      if (total !== 100) {
        return Helpers.toast(`La suma de ponderaciones es ${total}%. Ajusta para que sea exactamente 100%.`, 'warning');
      }
    }
    // Solo se validan las aulas activas que ya tienen áreas configuradas
    for (const [key, val] of Object.entries(this._classroomConfig || {})) {
      if (val?.active === false) continue;
      if (!val?.areas?.length) continue;
      for (const a of val.areas) {
        if (!a.name || !String(a.name).trim()) return Helpers.toast('Todas las áreas deben tener nombre', 'warning');
        if (a.activities < 1 || a.activities > 10) return Helpers.toast('Cada área debe tener entre 1 y 10 actividades', 'warning');
      }
    }
    const next = { ...(this._evaluation?.scale_config || {}), classroom_configs: this._classroomConfig };
    const { error } = await supabase.from('eval_evaluations')
      .update({ scale_config: next, updated_at: new Date().toISOString() })
      .eq('id', this._evaluation.id);
    if (error) return Helpers.toast(error.message || 'Error al guardar configuración', 'error');
    this._evaluation = { ...this._evaluation, scale_config: next };
    const activeCount = Object.values(this._classroomConfig).filter(v => v?.active !== false).length;
    Helpers.toast(`Configuración guardada · ${activeCount} aula(s) activa(s)`, 'success');
    App.ui.closeModal();
    if (GradebookGrid && typeof GradebookGrid._bustClassroomCache === 'function') {
      try { await GradebookGrid._bustClassroomCache(); } catch (_) {}
    }
  },

  async _loadBase() {
    try {
      const { data: evals } = await supabase
        .from('eval_evaluations')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      this._evaluation = evals?.[0] || null;

      if (this._evaluation) {
        try {
          await supabase.rpc('boletin_ensure_structure', { p_evaluation_id: this._evaluation.id });
        } catch (_) {}
        const { data: periods } = await supabase
          .from('eval_periods')
          .select('*')
          .eq('evaluation_id', this._evaluation.id)
          .is('deleted_at', null)
          .order('sort_order')
          .order('created_at');
        this._periods = periods || [];
      }

      const [classRes, studRes] = await Promise.all([
        DirectorApi.getClassrooms(),
        DirectorApi.getStudents({ status: 'active' })
      ]);
      this._classrooms = classRes?.data || [];
      this._students = (studRes?.data || []).map(s => ({
        ...s,
        classroom_name: s.classrooms?.name || 'Sin aula',
        classroom_level: s.classrooms?.level || ''
      }));

      await this._loadEvalData();
    } catch (e) {
      console.error('[Grades] _loadBase', e);
    }
  },

  async _loadEvalData() {
    if (!this._evaluation) { this._scoresMap = {}; return; }
    const periodIds = this._periods.map(p => p.id);
    const { data: areas } = await supabase.from('eval_areas')
      .select('*').eq('evaluation_id', this._evaluation.id).is('deleted_at', null).order('sort_order');
    this._areas = areas || [];
    const { data: modules } = periodIds.length
      ? await supabase.from('eval_modules').select('*').in('period_id', periodIds).is('deleted_at', null).order('sort_order')
      : { data: [] };
    this._modules = modules || [];
    const moduleIds = this._modules.map(m => m.id);
    const { data: activities } = moduleIds.length
      ? await supabase.from('eval_activities').select('*').in('module_id', moduleIds).is('deleted_at', null).order('sort_order')
      : { data: [] };
    this._activities = activities || [];
    const studentIds = this._students.map(s => s.id);
    const { data: scores } = moduleIds.length && studentIds.length
      ? await supabase.from('eval_scores').select('*').in('module_id', moduleIds).in('student_id', studentIds)
      : { data: [] };
    this._scoresMap = buildScoresMap(scores || [], this._activities);
  },

  _bindEvents() {
    const periodSel = document.getElementById('gradesFilterPeriod');
    if (periodSel) {
      periodSel.innerHTML = '<option value="">Todos los períodos</option>' +
        this._periods.map(p => `<option value="${p.id}">${_esc(p.name)}${p.status === 'closed' ? ' (Cerrado)' : ''}</option>`).join('');
      periodSel.value = this._selPeriodId ?? '';
      periodSel.addEventListener('change', (e) => { this._selPeriodId = e.target.value || null; this._render(); });
    }

    const classSel = document.getElementById('gradesFilterClassroom');
    if (classSel) {
      classSel.innerHTML = '<option value="all">Todas las aulas</option>' +
        this._classrooms.map(c => `<option value="${c.id}">${_esc(c.name)}</option>`).join('');
      classSel.addEventListener('change', (e) => { this._selClassroomId = e.target.value || 'all'; this._render(); });
    }

    const search = document.getElementById('searchGradeStudent');
    if (search && !search._bound) {
      search._bound = true;
      search.addEventListener('input', Helpers.debounce(() => this._render(), 300));
    }

    document.getElementById('btnNewPeriod')?.addEventListener('click', () => this._openPeriodModal());
    document.getElementById('btnClassroomConfig')?.addEventListener('click', () => this.openClassroomConfigModal());
  },

  filter(value) {
    const input = document.getElementById('searchGradeStudent');
    if (input) { input.value = value; this._render(); }
  },

  _levelOf(avg) {
    if (avg == null) return { label: 'Sin evaluar', cls: 'bg-slate-100 text-slate-500' };
    return gradeToLevel(avg);
  },

  _avgFor(studentId) {
    const periodId = this._selPeriodId;
    const mods = periodId
      ? this._modules.filter(m => m.period_id === Number(periodId))
      : this._modules;
    const areaAvgs = this._areas.map(area => {
      const areaMods = mods
        .filter(m => m.area_id === area.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const cells = areaMods.map(m => {
        const act = this._activities.find(a => a.module_id === m.id);
        if (!act) return null;
        return normalizeScore(m, this._scoresMap[`${m.id}:${act.id}:${studentId}`] || null);
      });
      return avgOf(cells);
    });
    const weighted = areaAvgs.reduce((acc, avg, i) => {
      const w = Number(this._areas[i]?.weight) || 0;
      if (avg == null || w <= 0) return acc;
      acc.sum += avg * w;
      acc.w += w;
      return acc;
    }, { sum: 0, w: 0 });
    if (weighted.w > 0) return Math.round((weighted.sum / weighted.w) * 100) / 100;
    const evaluated = areaAvgs.filter(a => a != null);
    return evaluated.length ? avgOf(evaluated) : null;
  },

  _render() {
    const tableBody = document.getElementById('gradesTableBody');
    if (!tableBody) return;

    const search = (document.getElementById('searchGradeStudent')?.value || '').toLowerCase().trim();
    const classFilter = this._selClassroomId || 'all';

    let filtered = this._students.filter(s => {
      if (search && !s.name.toLowerCase().includes(search) && !String(s.matricula || '').toLowerCase().includes(search)) return false;
      if (classFilter !== 'all' && String(s.classroom_id) !== String(classFilter)) return false;
      return true;
    });

    const rows = filtered.map(s => ({ ...s, avg: this._avgFor(s.id) }));
    rows.sort((a, b) => ((b.avg ?? -1) - (a.avg ?? -1)) || a.name.localeCompare(b.name));

    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-16 text-slate-400 font-medium">No se encontraron estudiantes con los filtros aplicados.</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map(s => {
      const level = this._levelOf(s.avg);
      return `
        <tr class="hover:bg-indigo-50/30 border-b border-slate-100 transition-all cursor-pointer group"
            onclick="App.grades.openStudentDetail(${s.id})">
          <td class="px-6 py-4">
            <div class="flex items-center gap-4">
              ${s.avatar_url
                ? `<img src="${_esc(s.avatar_url)}" class="w-10 h-10 rounded-2xl object-cover">`
                : `<div class="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-sm group-hover:scale-110 transition-transform">${_esc(s.name).charAt(0)}</div>`}
              <div>
                <div class="font-black text-slate-800 text-sm">${_esc(s.name)}</div>
                <div class="text-[10px] text-slate-400 font-black uppercase tracking-tighter">${_esc(s.matricula || '')}</div>
              </div>
            </div>
          </td>
          <td class="px-4 py-4">
            <div class="font-bold text-slate-600 text-sm">${_esc(s.classroom_name)}</div>
            <div class="text-[10px] text-slate-400 font-bold uppercase">${_esc(s.classroom_level || '')}</div>
          </td>
          <td class="px-4 py-4 text-center">
            <span class="font-black text-lg ${s.avg != null ? gradeColor(s.avg) : 'text-slate-300'}">${s.avg != null ? s.avg.toFixed(1) : '—'}</span>
          </td>
          <td class="px-4 py-4 text-center">
            ${s.avg != null
              ? `<span class="px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-sm ${level.cls}">${level.label}</span>`
              : '<span class="text-slate-300 font-bold text-xs">Sin evaluar</span>'}
          </td>
          <td class="px-4 py-4 text-center">
            <button onclick="event.stopPropagation();App.grades.openStudentDetail(${s.id})"
              class="px-3 py-1.5 rounded-xl text-white text-[10px] font-black shadow-sm flex items-center gap-1.5 mx-auto" style="background:#6366F1">
              <i data-lucide="table-2" class="w-3.5 h-3.5"></i> Calificaciones
            </button>
          </td>
        </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  async openStudentDetail(studentId) {
    const student = this._students.find(s => String(s.id) === String(studentId));
    if (!student) return;
    if (!this._evaluation) return Helpers.toast('No hay un boletín configurado. Contacta al administrador.', 'warning');

    const cls = student.classrooms || {};
    const room = this._classrooms.find(c => String(c.id) === String(student.classroom_id)) || null;
    try {
      await GradebookGrid.open({
        student,
        classroom: {
          id: student.classroom_id,
          name: cls.name || room?.name || student.classroom_name,
          level: room?.level || student.classroom_level || ''
        },
        evaluationId: this._evaluation.id,
        periodId: this._selPeriodId ? Number(this._selPeriodId) : null,
        classroomId: student.classroom_id,
        role: 'directora',
        editable: false
      });
    } catch (e) {
      console.error('[Grades] cuadrícula', e);
      Helpers.toast('Error al abrir el Centro de Calificaciones', 'error');
    }
  },

  _openPeriodModal() {
    const ic = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 bg-slate-50/50 transition-all text-sm font-medium';
    const lc = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1';
    const y = new Date().getFullYear();
    const todayStr = new Date().toISOString().slice(0, 10);

    supabase.from('school_years').select('id, name').eq('is_current', true).maybeSingle().then(({ data: year }) => {
      window.openGlobalModal(`
        <div class="w-full max-w-md overflow-hidden">
          <div class="bg-indigo-600 p-6 text-white flex justify-between items-center">
            <h3 class="text-xl font-black">Nuevo Período</h3>
          </div>
          <div class="p-6 space-y-4">
            <div><label class="${lc}">Nombre del Período</label><input id="periodName" class="${ic}" placeholder="Ej: 1er Trimestre ${y}"></div>
            <div class="grid grid-cols-2 gap-4">
              <div><label class="${lc}">Fecha Inicio</label><input id="periodStart" type="date" value="${todayStr}" class="${ic}"></div>
              <div><label class="${lc}">Fecha Fin</label><input id="periodEnd" type="date" class="${ic}"></div>
            </div>
          </div>
          <div class="p-6 bg-slate-50 flex justify-end gap-3">
            <button onclick="App.ui.closeModal()" class="px-6 py-2.5 text-xs font-black uppercase text-slate-400">Cancelar</button>
            <button id="btnSavePeriod" class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-indigo-200">Crear Período</button>
          </div>
        </div>
      `);
      document.getElementById('btnSavePeriod')?.addEventListener('click', async () => {
        const name = document.getElementById('periodName')?.value.trim();
        const start = document.getElementById('periodStart')?.value;
        const end = document.getElementById('periodEnd')?.value;
        if (!name || !start || !end) return Helpers.toast('Completa todos los campos', 'warning');
        const { error } = await supabase.from('periods').insert({
          name, start_date: start, end_date: end,
          status: 'open', is_active: false,
          school_year_id: year?.id || null
        });
        if (error) return Helpers.toast(error.message || 'Error al crear período', 'error');
        Helpers.toast('Período creado correctamente', 'success');
        App.ui.closeModal();
        await this._refreshPeriods();
      });
      if (window.lucide) lucide.createIcons();
    });
  },

  async _refreshPeriods() {
    if (!this._evaluation) return;
    try {
      await supabase.rpc('boletin_ensure_structure', { p_evaluation_id: this._evaluation.id });
    } catch (_) {}
    const { data: periods } = await supabase.from('eval_periods')
      .select('*').eq('evaluation_id', this._evaluation.id).is('deleted_at', null)
      .order('sort_order').order('created_at');
    this._periods = periods || [];
    const sel = document.getElementById('gradesFilterPeriod');
    if (sel) {
      sel.innerHTML = '<option value="">Todos los períodos</option>' +
        this._periods.map(p => `<option value="${p.id}">${_esc(p.name)}${p.status === 'closed' ? ' (Cerrado)' : ''}</option>`).join('');
      sel.value = this._selPeriodId ?? '';
    }
    await this._loadEvalData();
    this._render();
  },

  _loadAllData() {
    return this._render();
  }
};
