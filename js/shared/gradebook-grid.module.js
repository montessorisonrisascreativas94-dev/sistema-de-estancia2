/**
 * 📊 Centro de Calificaciones — cuadrícula unificada Áreas × Actividades.
 * Mismo modelo y diseño para Directora (lectura) y Maestra (edición):
 *   - Header del estudiante + tabla Área | A1..A5 | Promedio | Nivel.
 *   - Las actividades A1..A5 se llenan con las notas de los módulos del
 *     boletín (boletin_ensure_structure); el nombre real de la tarea
 *     vinculada (tasks.eval_module_id) se muestra en hover.
 *   - Directora: solo lectura (clic en una nota → detalle) + botones
 *     "Ver Boletín" y "Descargar PDF".
 *   - Maestra: clic en una nota abre el modal Nota + Comentario y guarda
 *     en eval_scores (mismo modelo que alimenta el boletín).
 * El overlay es independiente de #globalModalContainer (mismo patrón que
 * BoletinUI) para funcionar en ambos paneles.
 *
 * Uso:
 *   import { GradebookGrid } from '../shared/gradebook-grid.module.js';
 *   await GradebookGrid.open({
 *     student, classroom, evaluationId, periodId,
 *     role: 'directora' | 'maestra', editable: true|false, onSaved
 *   });
 */
import { Helpers } from './helpers.js';
import { supabase } from './supabase.js';
import { normalizeScore, avgOf, gradeColor, buildScoresMap } from './eval-utils.js';
import { BoletinUI } from './boletin.module.js';

function esc(s) { return Helpers.escapeHTML(String(s ?? '')); }
function nf(n, d = 1) { return n != null ? Number(n).toFixed(d) : '—'; }

export const GradebookGrid = {
  S: null,
  _overlay: null,
  _inner: null,

  async open(opts) {
    this._close();
    this.S = {
      student: opts.student || null,
      classroom: opts.classroom || null,
      classroomId: opts.classroomId || opts.student?.classroom_id || opts.classroom?.id || null,
      evaluationId: opts.evaluationId,
      periodId: opts.periodId || null,
      role: opts.role || 'directora',
      editable: !!opts.editable,
      onSaved: opts.onSaved || null,
      evaluation: null,
      periods: [],
      period: null,
      areas: [],
      modules: [],
      activities: [],
      scoresMap: {},
      areaNotes: {},
      activityLabels: [],
      scaleConfig: null,
      taskByModule: {}
    };
    this._openOverlay();
    this._inner.innerHTML = '<div class="flex justify-center py-16"><div class="animate-spin w-8 h-8 border-2 border-[#FF7A00] rounded-full border-t-transparent"></div><span class="ml-3 text-sm font-bold text-slate-500">Cargando calificaciones...</span></div>';
    try {
      await this._load();
      this._render();
    } catch (err) {
      console.error('[GradebookGrid]', err);
      if (this._inner) this._inner.innerHTML = Helpers.errorState(err?.message || 'Error al cargar el Centro de Calificaciones');
    }
  },

  // ── CARGA DE DATOS ────────────────────────────────────────────────
  async _load() {
    const S = this.S;
    if (!S.evaluationId) throw new Error('No hay un boletín configurado');
    if (!S.student?.id) throw new Error('Estudiante no encontrado');

    const [evalRes, periodsRes, areasRes, studRes] = await Promise.all([
      supabase.from('eval_evaluations').select('*').eq('id', S.evaluationId).maybeSingle(),
      supabase.from('eval_periods').select('*').eq('evaluation_id', S.evaluationId).is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from('eval_areas').select('*').eq('evaluation_id', S.evaluationId).is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from('students').select('*, classroom:classroom_id(id, name, level)').eq('id', S.student.id).maybeSingle()
    ]);

    S.evaluation = evalRes.data || null;
    if (!S.evaluation) throw new Error('No hay un boletín configurado');
    S.periods = periodsRes.data || [];
    if (!S.periods.length) throw new Error('El boletín no tiene períodos creados');
    S.period = S.periodId && S.periods.find(p => p.id === Number(S.periodId))
      ? S.periods.find(p => p.id === Number(S.periodId))
      : S.periods[0];
    S.periodId = S.period.id;
    S.areas = areasRes.data || [];
    if (studRes.data) S.student = { ...S.student, ...studRes.data };
    if (!S.classroom) S.classroom = studRes.data?.classroom || null;

    S.activityLabels = Array.isArray(S.evaluation.activity_labels) && S.evaluation.activity_labels.length
      ? S.evaluation.activity_labels
      : [1, 2, 3, 4, 5].map(i => ({ name: `Actividad ${i}`, max_value: 100 }));
    S.scaleConfig = S.evaluation.scale_config && S.evaluation.scale_config.levels
      ? S.evaluation.scale_config
      : { min: 0, max: 100, levels: [
          { label: 'AD', min: 90, max: 100, color: '#10B981' },
          { label: 'A', min: 80, max: 89, color: '#22C55E' },
          { label: 'B', min: 70, max: 79, color: '#F59E0B' },
          { label: 'C', min: 60, max: 69, color: '#F97316' },
          { label: 'D', min: 0, max: 59, color: '#EF4444' }
        ] };

    const { data: modules } = await supabase.from('eval_modules')
      .select('*').eq('period_id', S.period.id).is('deleted_at', null).order('sort_order').order('created_at');
    S.modules = modules || [];
    const moduleIds = S.modules.map(m => m.id);

    const [actsRes, scoresRes, notesRes] = await Promise.all([
      moduleIds.length
        ? supabase.from('eval_activities').select('*').in('module_id', moduleIds).is('deleted_at', null).order('sort_order').order('created_at')
        : { data: [] },
      moduleIds.length
        ? supabase.from('eval_scores').select('*').in('module_id', moduleIds).eq('student_id', S.student.id)
        : { data: [] },
      S.areas.length
        ? supabase.from('eval_area_notes').select('*').in('area_id', S.areas.map(a => a.id)).eq('student_id', S.student.id).eq('period_id', S.period.id)
        : { data: [] }
    ]);

    let taskRows = [];
    try {
      const { data } = moduleIds.length
        ? await supabase.from('tasks').select('id, title, eval_module_id').not('eval_module_id', 'is', null).in('eval_module_id', moduleIds)
        : { data: [] };
      taskRows = data || [];
    } catch (_) { taskRows = []; }

    S.activities = actsRes.data || [];
    S.scoresMap = buildScoresMap(scoresRes.data || [], S.activities);
    const notesMap = {};
    (notesRes.data || []).forEach(n => { notesMap[`${n.area_id}`] = n; });
    S.areaNotes = notesMap;
    const taskMap = {};
    taskRows.forEach(t => { if (!taskMap[`${t.eval_module_id}`]) taskMap[`${t.eval_module_id}`] = t.title; });
    S.taskByModule = taskMap;
  },

  async _reloadScores() {
    const S = this.S;
    const moduleIds = S.modules.map(m => m.id);
    const { data: scores } = moduleIds.length
      ? await supabase.from('eval_scores').select('*').in('module_id', moduleIds).eq('student_id', S.student.id)
      : { data: [] };
    S.scoresMap = buildScoresMap(scores || [], S.activities);
  },

  // ── CÁLCULOS ──────────────────────────────────────────────────────
  _compute() {
    const S = this.S;
    const periodModules = S.modules.filter(m => m.period_id === S.period.id);
    const rows = S.areas.map(area => {
      const areaMods = periodModules
        .filter(m => m.area_id === area.id)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const cells = areaMods.slice(0, S.activityLabels.length).map((m, i) => {
        const activity = S.activities.find(a => a.module_id === m.id) || null;
        const score = activity ? S.scoresMap[`${m.id}:${activity.id}:${S.student.id}`] : null;
        const norm = activity ? normalizeScore(m, score) : null;
        const name = S.taskByModule[`${m.id}`] || activity?.name || m.name;
        return { module: m, activity, score, norm, name, slot: i };
      });
      while (cells.length < S.activityLabels.length) {
        cells.push({ module: null, activity: null, score: null, norm: null, name: null, slot: cells.length });
      }
      const avg = avgOf(cells.map(c => c.norm));
      const note = S.areaNotes[`${area.id}`] || null;
      return { area, cells, avg, note };
    });
    const evaluated = rows.filter(r => r.avg != null);
    let overall = null;
    if (evaluated.length) {
      const evWeight = evaluated.reduce((s, r) => s + (Number(r.area.weight) || 0), 0);
      overall = evWeight > 0
        ? Math.round((evaluated.reduce((s, r) => s + r.avg * (Number(r.area.weight) || 0), 0) / evWeight) * 100) / 100
        : avgOf(evaluated.map(r => r.avg));
    }
    return { rows, overall };
  },

  _levelOf(avg) {
    const levels = (this.S.scaleConfig?.levels || []).slice().sort((a, b) => (b.min ?? 0) - (a.min ?? 0));
    if (avg == null) return { label: 'Sin evaluar', color: '#94A3B8' };
    const hit = levels.find(l => avg >= (l.min ?? 0));
    if (hit) return { label: hit.label, color: hit.color || '#6366F1' };
    const last = levels[levels.length - 1];
    return { label: last?.label || '—', color: last?.color || '#EF4444' };
  },

  // ── RENDER ────────────────────────────────────────────────────────
  _render() {
    const S = this.S;
    if (!this._inner) return;
    const data = this._compute();
    const overallLvl = this._levelOf(data.overall);
    const stu = S.student || {};
    const isTeacher = S.role === 'maestra';
    const roomName = S.classroom?.name || '';
    const roomLevel = S.classroom?.level || '';

    this._inner.innerHTML = `
      <button onclick="GradebookGrid._close()" class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all z-10">
        <i data-lucide="x" class="w-6 h-6"></i>
      </button>
      <div class="p-4 sm:p-6">
        <div class="flex flex-wrap items-center gap-4 mb-5">
          <div class="w-14 h-14 rounded-2xl overflow-hidden bg-orange-100 flex items-center justify-center shrink-0" style="border:2px solid #FFEDD5">
            ${stu.avatar_url ? `<img src="${esc(stu.avatar_url)}" class="w-full h-full object-cover">` : `<span class="text-lg font-black" style="color:#EA580C">${esc((stu.name || '?').charAt(0))}</span>`}
          </div>
          <div class="flex-1 min-w-[200px]">
            <div class="font-black text-lg text-slate-800 leading-tight">${esc(stu.name || 'Estudiante')}</div>
            <div class="text-[11px] text-slate-400 font-bold mt-0.5">${esc(stu.matricula || '')}${roomName ? ` · ${esc(roomName)}${roomLevel ? ` (${esc(roomLevel)})` : ''}` : ''}</div>
          </div>
          <div class="text-right">
            <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1.5" style="background:${isTeacher ? 'linear-gradient(135deg,#28B54D,#1A8035)' : '#F1F5F9'};color:${isTeacher ? '#fff' : '#64748B'}">
              <i data-lucide="${isTeacher ? 'pencil' : 'eye'}" class="w-3 h-3"></i> ${isTeacher ? 'Editable' : 'Solo lectura'}
            </span>
            <div class="text-[10px] font-bold text-slate-400 mt-1">Período: ${esc(S.period?.name || '')}</div>
          </div>
        </div>

        <div class="overflow-x-auto rounded-2xl border border-slate-200 mb-5">
          <table class="w-full text-sm" style="min-width:680px">
            <thead>
              <tr style="background:#FFFBEB">
                <th class="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Áreas</th>
                ${S.activityLabels.map((l, i) => `<th class="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-wider text-slate-500" title="${esc(l.name || '')}">${esc(l.name || 'A' + (i + 1))}</th>`).join('')}
                <th class="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-wider text-slate-500">Promedio</th>
                <th class="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-wider text-slate-500">Nivel</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${data.rows.map((row, ai) => this._rowHtml(row, ai)).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td class="px-3 py-3 font-black text-white" style="background:#1A2340">Promedio General</td>
                <td colspan="${S.activityLabels.length}" style="background:#F8FAFC"></td>
                <td class="px-3 py-3 text-center font-black text-lg" style="background:#1A2340;color:#4ADE80">${nf(data.overall)}</td>
                <td class="px-3 py-3 text-center" style="background:#1A2340">
                  ${data.overall != null ? `<span class="px-2.5 py-1 rounded-full text-[9px] font-black uppercase" style="background:${overallLvl.color};color:#fff">${esc(overallLvl.label)}</span>` : '<span class="text-xs font-bold" style="color:#94A3B8">—</span>'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <p class="text-[11px] text-slate-400 font-bold mr-auto">${isTeacher ? '💡 Haz clic en una nota para editarla.' : 'Haz clic en una nota para ver el detalle de la actividad.'}</p>
          <button onclick="GradebookGrid._showBoletin()" class="px-4 py-2.5 rounded-xl text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg" style="background:${isTeacher ? 'linear-gradient(135deg,#28B54D,#1A8035);box-shadow:0 4px 14px rgba(40,181,77,.25)' : '#1A2340'}">
            <i data-lucide="book-open" class="w-4 h-4"></i> Ver Boletín
          </button>
          <button onclick="GradebookGrid._downloadPdf()" class="px-4 py-2.5 rounded-xl text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg" style="background:linear-gradient(135deg,#FF7A00,#F43F5E);box-shadow:0 4px 14px rgba(244,63,94,.25)">
            <i data-lucide="file-down" class="w-4 h-4"></i> Descargar PDF
          </button>
        </div>
      </div>`;

    if (window.lucide) window.lucide.createIcons();
  },

  _rowHtml(row, ai) {
    const S = this.S;
    const lvl = this._levelOf(row.avg);
    const obs = row.note?.observation || '';
    const areaTitle = obs ? `${row.area.name} — ${obs}` : row.area.name;
    return `
      <tr class="${S.editable ? 'hover:bg-green-50/40' : 'hover:bg-orange-50/40'} transition-colors">
        <td class="px-3 py-2.5 font-black text-slate-700 whitespace-nowrap" title="${esc(areaTitle)}">
          <span class="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style="background:${esc(row.area.color || '#6366F1')}"></span>
          ${esc(row.area.name)}
        </td>
        ${row.cells.map((cell, ci) => this._cellHtml(cell, ai, ci)).join('')}
        <td class="px-3 py-2.5 text-center font-black text-sm ${row.avg != null ? '' : 'text-slate-300'}" style="${row.avg != null ? `color:${lvl.color}` : ''}">${nf(row.avg)}</td>
        <td class="px-3 py-2.5 text-center">${row.avg != null ? `<span class="px-2.5 py-1 rounded-full text-[9px] font-black uppercase" style="background:${lvl.color};color:#fff">${esc(lvl.label)}</span>` : '<span class="text-slate-300 font-bold text-xs">Sin evaluar</span>'}</td>
      </tr>`;
  },

  _cellHtml(cell, ai, ci) {
    const S = this.S;
    if (cell.norm == null) return '<td class="px-3 py-2.5 text-center"><span class="text-slate-300 font-black">—</span></td>';
    const color = gradeColor(cell.norm);
    const title = `${cell.name || `A${ci + 1}`} · Nota ${nf(cell.norm)}/100${cell.score?.observation ? ' · ' + esc(cell.score.observation) : ''}`;
    const action = S.editable ? `GradebookGrid._openEdit(${ai},${ci})` : `GradebookGrid._openDetail(${ai},${ci})`;
    return `
      <td class="px-3 py-2.5 text-center">
        <button onclick="${action}" title="${title}"
          class="inline-flex flex-col items-center justify-center min-w-[52px] px-2 py-1.5 rounded-xl transition-all active:scale-95 ${S.editable ? 'hover:ring-2 hover:ring-green-300 cursor-pointer' : 'cursor-pointer'}">
          <span class="font-black text-sm leading-none" style="color:${color}">${nf(cell.norm)}</span>
          <span class="text-[8px] font-black uppercase tracking-wide mt-0.5" style="color:${color};opacity:.7">A${ci + 1}</span>
        </button>
      </td>`;
  },

  // ── EDICIÓN (maestra) ─────────────────────────────────────────────
  _openEdit(ai, ci) {
    const data = this._compute();
    const row = data.rows[ai];
    const cell = row.cells[ci];
    if (!cell?.activity) return Helpers.toast('Esta actividad aún no tiene una tarea asignada', 'warning');
    const S = this.S;
    const label = S.activityLabels[ci]?.name || `A${ci + 1}`;
    const current = cell.score?.value != null ? cell.score.value : '';
    this._nested(`
      <div class="p-6">
        <div class="flex items-center gap-3 mb-5">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style="background:${esc(row.area.color || '#6366F1')}"><i data-lucide="pencil" class="w-6 h-6"></i></div>
          <div>
            <h3 class="text-lg font-black text-slate-800">Calificar actividad</h3>
            <p class="text-xs font-bold text-slate-400">${esc(cell.name || label)} · ${esc(row.area.name)}</p>
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Nota (0-100)</label>
          <input id="gbNoteInput" type="number" min="0" max="100" step="0.01" value="${esc(current)}" placeholder="Ej: 95"
            class="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-green-100 focus:border-green-400 bg-slate-50/50 text-sm font-bold">
        </div>
        <div class="mb-5">
          <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Comentario del docente</label>
          <textarea id="gbCommentInput" rows="3" placeholder="Comentario para la actividad..." class="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-green-100 focus:border-green-400 bg-slate-50/50 text-sm resize-y">${esc(cell.score?.observation || '')}</textarea>
        </div>
        <div class="flex items-center justify-between gap-3">
          <button onclick="GradebookGrid._nestedClose()" class="px-5 py-2.5 text-xs font-black uppercase text-slate-400 hover:text-slate-600">Cancelar</button>
          <div class="flex items-center gap-3">
            ${cell.score ? '<button onclick="GradebookGrid._clearScore(' + ai + ',' + ci + ')" class="px-3 py-2 text-[10px] font-black uppercase text-rose-400 hover:text-rose-600">Quitar nota</button>' : ''}
            <button onclick="GradebookGrid._saveEdit(${ai},${ci})" class="px-6 py-2.5 bg-[#28B54D] text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-green-100 active:scale-95 transition-all flex items-center gap-2"><i data-lucide="save" class="w-4 h-4"></i> Guardar</button>
          </div>
        </div>
      </div>`);
  },

  async _saveEdit(ai, ci) {
    const data = this._compute();
    const row = data.rows[ai];
    const cell = row.cells[ci];
    if (!cell?.activity) return;
    const S = this.S;
    const input = document.getElementById('gbNoteInput');
    const comment = document.getElementById('gbCommentInput')?.value.trim() || null;
    let value = input?.value;
    if (value === '' || value == null) return Helpers.toast('Ingresa una nota', 'warning');
    value = Number(value);
    if (Number.isNaN(value) || value < 0 || value > 100) return Helpers.toast('La nota debe estar entre 0 y 100', 'warning');

    const uid = await this._currentUid();
    const { error } = await supabase.from('eval_scores').upsert({
      module_id: cell.module.id,
      activity_id: cell.activity.id,
      student_id: S.student.id,
      value,
      observation: comment,
      evaluated_by: uid
    }, { onConflict: 'activity_id,student_id' });

    if (error) return Helpers.toast(error.message || 'Error al guardar la nota', 'error');
    this._nestedClose();
    await this._reloadScores();
    this._render();
    if (typeof S.onSaved === 'function') S.onSaved(cell, value);
    Helpers.toast('Nota guardada correctamente', 'success');
  },

  async _clearScore(ai, ci) {
    const data = this._compute();
    const cell = data.rows[ai]?.cells[ci];
    if (!cell?.activity) return;
    const { error } = await supabase.from('eval_scores')
      .delete().eq('activity_id', cell.activity.id).eq('student_id', this.S.student.id);
    if (error) return Helpers.toast(error.message || 'Error al quitar la nota', 'error');
    this._nestedClose();
    await this._reloadScores();
    this._render();
    Helpers.toast('Calificación eliminada', 'success');
  },

  // ── DETALLE (directora / lectura) ─────────────────────────────────
  async _openDetail(ai, ci) {
    const data = this._compute();
    const row = data.rows[ai];
    const cell = row.cells[ci];
    if (!cell?.activity) return;
    const S = this.S;
    const label = S.activityLabels[ci]?.name || `A${ci + 1}`;
    const obs = cell.score?.observation || '';
    let evidences = [];
    try {
      const { data: evs } = await supabase.from('eval_evidences').select('*').eq('activity_id', cell.activity.id).eq('student_id', S.student.id);
      evidences = evs || [];
    } catch (_) {}
    this._nested(`
      <div class="p-6">
        <div class="flex items-center gap-3 mb-5">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style="background:${esc(row.area.color || '#6366F1')}"><i data-lucide="file-text" class="w-6 h-6"></i></div>
          <div>
            <h3 class="text-lg font-black text-slate-800">${esc(cell.name || label)}</h3>
            <p class="text-xs font-bold text-slate-400">${esc(row.area.name)} · ${esc(S.period.name)}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="rounded-2xl border border-slate-200 p-3">
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:3px">Área</div>
            <div style="font-size:13px;font-weight:800;color:#1A2340">${esc(row.area.name)}</div>
          </div>
          <div class="rounded-2xl border border-slate-200 p-3">
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:3px">Actividad</div>
            <div style="font-size:13px;font-weight:800;color:#1A2340">${esc(cell.activity.name || label)}</div>
          </div>
          <div class="rounded-2xl border border-slate-200 p-3">
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:3px">Nota</div>
            <div style="font-size:13px;font-weight:800;color:${cell.norm != null ? gradeColor(cell.norm) : '#94A3B8'}">${nf(cell.norm)} / 100</div>
          </div>
          <div class="rounded-2xl border border-slate-200 p-3">
            <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:3px">Promedio del área</div>
            <div style="font-size:13px;font-weight:800;color:${row.avg != null ? this._levelOf(row.avg).color : '#94A3B8'}">${nf(row.avg)}</div>
          </div>
        </div>
        <div class="mb-4">
          <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:4px">Comentario del docente</div>
          <p class="text-sm text-slate-600 bg-amber-50 rounded-xl p-3" style="border:1px solid #FDE68A">${esc(obs) || '<span style="color:#CBD5E1">Sin comentario.</span>'}</p>
        </div>
        <div>
          <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:6px">Archivos y fotos (${evidences.length})</div>
          ${evidences.length
            ? `<div class="flex flex-wrap gap-2">${evidences.map(ev => `<a href="${esc(ev.file_url)}" target="_blank" rel="noopener" class="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center gap-1.5"><i data-lucide="paperclip" class="w-3.5 h-3.5"></i> Ver evidencia</a>`).join('')}</div>`
            : '<p class="text-xs text-slate-400">Sin evidencias adjuntas.</p>'}
        </div>
        <button onclick="GradebookGrid._nestedClose()" class="mt-5 w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"><i data-lucide="arrow-left" class="w-4 h-4"></i> Volver a la cuadrícula</button>
      </div>`);
  },

  // ── BOLETÍN Y PDF ─────────────────────────────────────────────────
  async _showBoletin() {
    const S = this.S;
    if (!this._inner) return;
    this._inner.innerHTML = '<div class="flex justify-center py-16"><div class="animate-spin w-8 h-8 border-2 border-[#FF7A00] rounded-full border-t-transparent"></div><span class="ml-3 text-sm font-bold text-slate-500">Generando boletín...</span></div>';
    try {
      await BoletinUI.init({
        container: this._inner,
        evaluationId: S.evaluationId,
        periodId: S.period.id,
        studentId: S.student.id,
        classroomId: S.classroomId,
        role: S.role,
        onClose: () => this._render()
      });
    } catch (e) {
      console.error('[GradebookGrid] boletin', e);
      Helpers.toast('Error al abrir el boletín', 'error');
      this._render();
    }
  },

  async _downloadPdf() {
    const S = this.S;
    const holder = document.createElement('div');
    holder.style.display = 'none';
    document.body.appendChild(holder);
    try {
      await BoletinUI.init({
        container: holder,
        evaluationId: S.evaluationId,
        periodId: S.period.id,
        studentId: S.student.id,
        classroomId: S.classroomId,
        role: S.role
      });
      BoletinUI._pdf();
    } catch (e) {
      console.error('[GradebookGrid] PDF', e);
      Helpers.toast('Error al generar el PDF', 'error');
    } finally {
      holder.remove();
    }
  },

  // ── OVERLAYS ──────────────────────────────────────────────────────
  _openOverlay() {
    this._close();
    const wrap = document.createElement('div');
    wrap.id = 'gbGridModal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow-y:auto;';
    const inner = document.createElement('div');
    inner.id = 'gbGridInner';
    inner.className = 'bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative animate-scaleIn';
    inner.style.cssText = 'animation:scaleIn .18s ease;max-width:960px;';
    wrap.appendChild(inner);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) this._close(); });
    document.body.appendChild(wrap);
    this._overlay = wrap;
    this._inner = inner;
    if (window.lucide) window.lucide.createIcons();
  },

  _nested(html) {
    this._nestedClose();
    const wrap = document.createElement('div');
    wrap.id = 'gbNestedModal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:12px;';
    wrap.innerHTML = `<div class="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto relative" style="animation:scaleIn .18s ease">${html}</div>`;
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) this._nestedClose(); });
    document.body.appendChild(wrap);
    if (window.lucide) window.lucide.createIcons();
  },

  _nestedClose() {
    document.getElementById('gbNestedModal')?.remove();
  },

  _close() {
    this._nestedClose();
    this._overlay?.remove();
    this._overlay = null;
    this._inner = null;
    this.S = null;
  },

  async _currentUid() {
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.id || null;
    } catch (_) { return null; }
  }
};

window.GradebookGrid = GradebookGrid;
