/**
 * 🧾 Boletín Inteligente — presentación unificada de calificaciones.
 *
 * Reemplaza la Boleta en Vivo del Constructor. Mismo diseño en Directora
 * y Maestra (solo cambian los permisos). Es un documento de PRESENTACIÓN:
 * las notas NO se editan aquí; llegan desde las tareas calificadas.
 *
 * Estructura auto-generada por boletin_ensure_structure:
 *   áreas × (A1..A5 módulos) por período · 1 actividad por módulo.
 *
 * Uso:
 *   import { BoletinUI } from '../shared/boletin.module.js';
 *   await BoletinUI.init({
 *     container, evaluationId, periodId, studentId,
 *     role: 'directora' | 'maestra', onClose, onAddNote
 *   });
 */
import { Helpers } from './helpers.js';
import { supabase } from './supabase.js';
import { normalizeScore, avgOf, gradeColor } from './eval-utils.js';

function esc(s) { return Helpers.escapeHTML(String(s ?? '')); }
function nf(n, d = 1) { return n != null ? Number(n).toFixed(d) : '—'; }

const STAFF_ROLES = ['directora', 'admin', 'asistente', 'encargada', 'maestra'];

export const BoletinUI = {
  S: null,

  async init(opts) {
    this.S = {
      container: typeof opts.container === 'string' ? document.getElementById(opts.container) : opts.container,
      evaluationId: opts.evaluationId,
      periodId: opts.periodId,
      studentId: opts.studentId,
      classroomId: opts.classroomId,
      role: opts.role || 'directora',
      onClose: opts.onClose || null,
      onAddNote: opts.onAddNote || null,
      evaluation: null,
      schoolYear: null,
      school: { school_name: 'Colegio Montessori Sonrisas Creativas', logo_url: null },
      student: null,
      students: [],
      classroom: null,
      periods: [],
      period: null,
      areas: [],
      modules: [],
      activities: [],
      scoresMap: {},
      areaNotes: {},
      generalNote: null,
      activityLabels: [],
      scaleConfig: null,
      history: [],
      historyLoaded: false,
      selPeriodId: opts.periodId || null
    };
    const c = this.S.container;
    if (!c) return;
    c.innerHTML = `<div class="flex justify-center py-16">
      <div class="animate-spin w-8 h-8 border-2 border-[#FF7A00] rounded-full border-t-transparent"></div>
      <span class="ml-3 text-sm font-bold text-slate-500">Generando boletín...</span>
    </div>`;
    try {
      await this._loadBase();
      await this._ensureStructure();
      await this._loadPeriods();
      if (!this.S.periods.length) {
        c.innerHTML = `<div class="text-center py-16 text-slate-400 text-sm">El boletín de este año escolar no tiene períodos. Crea períodos desde el año escolar o la configuración.</div>`;
        return;
      }
      if (!this.S.selPeriodId) this.S.selPeriodId = this.S.periods[0].id;
      this.S.period = this.S.periods.find(p => p.id === this.S.selPeriodId) || this.S.periods[0];
      this.S.selPeriodId = this.S.period.id;
      await this._loadChildren();
      await this._loadScores();
      await this._loadNotes();
      if (!this.S.student) {
        c.innerHTML = Helpers.errorState('No se encontró el estudiante');
        return;
      }
      this._render();
    } catch (err) {
      console.error('[BoletinUI]', err);
      c.innerHTML = Helpers.errorState('Error al cargar el Boletín Inteligente');
    }
  },

  async _currentUid() {
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.id || null;
    } catch (_) { return null; }
  },

  async _loadBase() {
    const S = this.S;
    const [evalRes, schoolRes, studRes] = await Promise.all([
      supabase.from('eval_evaluations').select('*').eq('id', S.evaluationId).maybeSingle(),
      supabase.from('school_settings').select('school_name, logo_url').eq('id', 1).maybeSingle(),
      supabase.from('students').select('*, classroom:classroom_id(id, name, level, teacher_id, teacher:teacher_id(name))').eq('id', S.studentId).maybeSingle()
    ]);
    S.evaluation = evalRes.data || { id: S.evaluationId, name: 'Boletín Inteligente' };
    S.school = {
      school_name: schoolRes.data?.school_name || 'Colegio Montessori Sonrisas Creativas',
      logo_url: schoolRes.data?.logo_url || null
    };
    S.student = studRes.data || null;
    S.classroom = S.student?.classroom || null;
    S.tutorName = '—';
    if (S.student?.p1_name) {
      S.tutorName = S.student.p1_name;
    } else if (S.student?.parent_id) {
      try {
        const { data: p } = await supabase.from('profiles').select('name').eq('id', S.student.parent_id).maybeSingle();
        S.tutorName = p?.name || '—';
      } catch (_) { S.tutorName = '—'; }
    }
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
    if (S.evaluation.school_year_id) {
      const { data: year } = await supabase.from('school_years').select('*').eq('id', S.evaluation.school_year_id).maybeSingle();
      S.schoolYear = year || null;
    }
    if (S.role === 'maestra' && S.classroomId) {
      const { data: students } = await supabase
        .from('students')
        .select('id, name, matricula, p1_email, p2_email')
        .eq('classroom_id', S.classroomId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name');
      S.students = students || [];
    }
  },

  async _ensureStructure() {
    const { data, error } = await supabase.rpc('boletin_ensure_structure', { p_evaluation_id: this.S.evaluationId });
    if (error && !String(error.message || error).includes('function') ) {
      console.warn('[BoletinUI] ensure_structure', error);
    }
    return data || null;
  },

  async _loadPeriods() {
    const { data: periods } = await supabase
      .from('eval_periods')
      .select('*')
      .eq('evaluation_id', this.S.evaluationId)
      .is('deleted_at', null)
      .order('sort_order')
      .order('created_at');
    this.S.periods = periods || [];
  },

  async _loadChildren() {
    const S = this.S;
    const [areasRes, modsRes] = await Promise.all([
      supabase.from('eval_areas').select('*').eq('evaluation_id', S.evaluationId).is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from('eval_modules').select('*').eq('period_id', S.period.id).is('deleted_at', null).order('sort_order').order('created_at')
    ]);
    S.areas = areasRes.data || [];
    S.modules = modsRes.data || [];
    const moduleIds = S.modules.map(m => m.id);
    const { data: acts } = moduleIds.length
      ? await supabase.from('eval_activities').select('*').in('module_id', moduleIds).is('deleted_at', null).order('sort_order').order('created_at')
      : { data: [] };
    S.activities = acts || [];
  },

  async _loadScores() {
    const S = this.S;
    const moduleIds = S.modules.map(m => m.id);
    const { data: scores } = moduleIds.length
      ? await supabase.from('eval_scores').select('*').in('module_id', moduleIds).eq('student_id', S.studentId)
      : { data: [] };
    S.scoresMap = buildScoresMap(scores || [], S.activities);
  },

  async _loadNotes() {
    const S = this.S;
    const areaIds = S.areas.map(a => a.id);
    const [areaNotesRes, generalRes] = await Promise.all([
      areaIds.length
        ? supabase.from('eval_area_notes').select('*').in('area_id', areaIds).eq('student_id', S.studentId).eq('period_id', S.period.id)
        : { data: [] },
      supabase.from('eval_boleta_notes').select('*').eq('student_id', S.studentId).eq('period_id', S.period.id).maybeSingle()
    ]);
    const map = {};
    (areaNotesRes.data || []).forEach(n => { map[`${n.area_id}`] = n; });
    S.areaNotes = map;
    S.generalNote = generalRes.data || null;
  },

  _levelOf(avg) {
    const levels = (this.S.scaleConfig?.levels || []).slice().sort((a, b) => (b.min ?? 0) - (a.min ?? 0));
    if (avg == null) return { label: 'Sin evaluar', color: '#94A3B8' };
    const hit = levels.find(l => avg >= (l.min ?? 0));
    if (hit) return { label: hit.label, color: hit.color || '#6366F1' };
    const last = levels[levels.length - 1];
    return { label: last?.label || '—', color: last?.color || '#EF4444' };
  },

  _compute() {
    const S = this.S;
    const periodModules = S.modules.filter(m => m.period_id === S.period.id);
    const areas = S.areas.map(area => {
      const areaMods = periodModules
        .filter(m => m.area_id === area.id)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const cells = areaMods.slice(0, S.activityLabels.length).map((m, i) => {
        const acts = S.activities.filter(a => a.module_id === m.id);
        const activity = acts[0] || null;
        const score = activity ? S.scoresMap[`${m.id}:${activity.id}:${S.studentId}`] : null;
        const norm = activity ? normalizeScore(m, score) : null;
        return { module: m, activity, score, norm, slot: i };
      });
      while (cells.length < S.activityLabels.length) cells.push({ module: null, activity: null, score: null, norm: null, slot: cells.length });
      const avg = avgOf(cells.map(c => c.norm));
      const note = S.areaNotes[`${area.id}`] || null;
      return { area, cells, avg, note };
    });
    const evaluated = areas.filter(a => a.avg != null);
    let overall = null;
    if (evaluated.length) {
      const evWeight = evaluated.reduce((s, a) => s + (Number(a.area.weight) || 0), 0);
      overall = evWeight > 0
        ? Math.round((evaluated.reduce((s, a) => s + a.avg * (Number(a.area.weight) || 0), 0) / evWeight) * 100) / 100
        : avgOf(evaluated.map(a => a.avg));
    }
    return { areas, overall };
  },

  _render() {
    const S = this.S;
    const c = S.container;
    const period = S.period;
    const data = this._compute();
    const overallLvl = this._levelOf(data.overall);
    const isTeacher = S.role === 'maestra';

    c.innerHTML = `
      <div class="boletin-wrap max-w-5xl mx-auto px-3 sm:px-4 py-4">
        <style>
          .boletin-wrap { font-family: 'Inter', system-ui, sans-serif; }
          .boletin-head { display:flex; align-items:center; gap:16px; background:linear-gradient(135deg,#FFF7ED,#FFEDD5); border:1px solid #FED7AA; border-radius:24px; padding:18px 22px; }
          .boletin-head .b-logo { width:72px; height:72px; border-radius:16px; overflow:hidden; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(234,88,12,.15); }
          .boletin-head .b-logo img { width:100%; height:100%; object-fit:cover; }
          .boletin-head h1 { font-size:20px; font-weight:900; color:#1A2340; line-height:1.1; letter-spacing:.2px; }
          .boletin-head h2 { font-size:14px; font-weight:900; color:#EA580C; text-transform:uppercase; letter-spacing:2px; margin-top:2px; }
          .boletin-head .b-year { font-size:11px; font-weight:700; color:#7C2D12; margin-top:4px; }
          .boletin-card { background:#fff; border:1px solid #E2E8F0; border-radius:20px; box-shadow:0 8px 30px rgba(0,0,0,.04); }
          .b-table { width:100%; border-collapse:collapse; font-size:13px; }
          .b-table th { background:#FFFBEB; color:#9A3412; font-size:10.5px; font-weight:900; text-transform:uppercase; letter-spacing:.8px; padding:10px 8px; border:1px solid #FED7AA; }
          .b-table td { border:1px solid #E2E8F0; padding:8px; }
          .b-table td.b-area { font-weight:800; color:#1A2340; background:#F8FAFC; white-space:nowrap; }
          .b-table td.b-area .b-dot { display:inline-block; width:10px; height:10px; border-radius:9999px; margin-right:8px; }
          .b-score { display:inline-flex; flex-direction:column; align-items:center; justify-content:center; min-width:52px; padding:6px 8px; border-radius:12px; cursor:pointer; transition:all .15s; }
          .b-score:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.12); }
          .b-score .v { font-weight:900; font-size:15px; line-height:1; }
          .b-score .l { font-size:8.5px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; margin-top:2px; opacity:.75; }
          .b-empty { color:#CBD5E1; font-weight:900; font-size:15px; }
          .b-note-cell { font-size:11px; color:#64748B; font-weight:600; }
          .b-chip { display:inline-block; padding:3px 10px; border-radius:9999px; font-size:11px; font-weight:900; color:#fff; }
          .b-obs { resize:none; }
          @media print {
            body { background:#fff !important; }
            .no-print { display:none !important; }
            .boletin-wrap { max-width:100%; padding:0; }
            .boletin-head, .boletin-card { box-shadow:none !important; }
            .b-score { cursor:default; }
            .b-score:hover { transform:none; box-shadow:none; }
          }
        </style>

        <div class="flex flex-wrap items-center gap-2 mb-4 no-print">
          <button onclick="BoletinUI._back()" class="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-slate-50 flex items-center gap-2 transition-all">
            <i data-lucide="arrow-left" class="w-4 h-4"></i> Volver
          </button>
          <select onchange="BoletinUI._switchPeriod(this.value)" class="px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 bg-white shadow-sm outline-none focus:ring-2 focus:ring-orange-300">
            ${S.periods.map(p => `<option value="${p.id}" ${p.id === S.period.id ? 'selected' : ''}>${esc(p.name)}${p.status === 'closed' ? ' (Cerrado)' : ''}</option>`).join('')}
          </select>
          ${period.boletin_sent_at ? `<span class="px-3 py-1.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5"><i data-lucide="check-check" class="w-3.5 h-3.5"></i> Boletín enviado</span>` : ''}
          <div class="ml-auto flex flex-wrap gap-2">
            <button onclick="BoletinUI._print()" class="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-slate-50 flex items-center gap-2 transition-all">
              <i data-lucide="printer" class="w-4 h-4"></i> Imprimir
            </button>
            <button onclick="BoletinUI._pdf()" class="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-slate-50 flex items-center gap-2 transition-all">
              <i data-lucide="file-down" class="w-4 h-4"></i> PDF
            </button>
            <button onclick="BoletinUI._openHistory()" class="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-slate-50 flex items-center gap-2 transition-all">
              <i data-lucide="history" class="w-4 h-4"></i> Historial
            </button>
            <button onclick="BoletinUI._openObservationsModal()" class="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm hover:bg-slate-50 flex items-center gap-2 transition-all">
              <i data-lucide="sticky-note" class="w-4 h-4"></i> Observaciones
            </button>
            ${isTeacher ? `
              <button onclick="BoletinUI._addNote()" class="px-4 py-2 bg-[#28B54D] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-green-100 hover:bg-[#239943] flex items-center gap-2 transition-all">
                <i data-lucide="plus" class="w-4 h-4"></i> Agregar Nota
              </button>
              <button onclick="BoletinUI._enviarBoletin()" class="px-4 py-2 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-2 transition-all" style="background:linear-gradient(135deg,#FF7A00,#F43F5E);box-shadow:0 4px 14px rgba(244,63,94,.25)">
                <i data-lucide="send" class="w-4 h-4"></i> Enviar Boletín
              </button>` : ''}
          </div>
        </div>

        <div class="boletin-head mb-5">
          <div class="b-logo">
            ${S.school.logo_url ? `<img src="${esc(S.school.logo_url)}" alt="logo">` : '<span style="font-size:30px">🎓</span>'}
          </div>
          <div>
            <h1>${esc(S.school.school_name)}</h1>
            <h2>Boletín de Calificaciones</h2>
            <div class="b-year">Año Escolar ${esc(S.schoolYear?.name || '—')} · <span style="font-weight:900;color:#EA580C">${esc(period.name)}</span></div>
          </div>
          <div class="ml-auto text-right hidden sm:block">
            <div style="font-size:10px;font-weight:900;color:#9A3412;text-transform:uppercase;letter-spacing:1px">Promedio general</div>
            <div style="font-size:34px;font-weight:900;line-height:1.1;${data.overall != null ? `color:${this._levelOf(data.overall).color}` : 'color:#CBD5E1'}">${nf(data.overall)}</div>
            <div style="margin-top:4px"><span class="b-chip" style="background:${overallLvl.color}">${esc(overallLvl.label)}</span></div>
          </div>
        </div>

        <div class="boletin-card p-4 sm:p-5 mb-5">
          <div class="flex flex-wrap items-center gap-4">
            <div class="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center shrink-0" style="border:2px solid #FFEDD5">
              ${S.student.avatar_url ? `<img src="${esc(S.student.avatar_url)}" class="w-full h-full object-cover">` : '<span style="font-size:28px">👧</span>'}
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-1 flex-1">
              <div class="col-span-2 md:col-span-4"><div style="font-weight:900;font-size:18px;color:#1A2340">${esc(S.student.name)}</div></div>
              ${this._metaItem('Matrícula', S.student.matricula || '—')}
              ${this._metaItem('Curso', S.classroom ? `${S.classroom.name}${S.classroom.level ? ` · ${S.classroom.level}` : ''}` : '—')}
              ${this._metaItem('Edad', this._studentAge())}
              ${this._metaItem('Docente', S.classroom?.teacher?.name || '—')}
              ${this._metaItem('Tutor', this._tutorName())}
              ${this._metaItem('Fecha', new Date().toLocaleDateString('es-DO'))}
              ${this._metaItem('Estado', period.status === 'closed' ? 'Período cerrado' : 'Período abierto')}
            </div>
          </div>
        </div>

        <div class="boletin-card overflow-hidden mb-5">
          <div class="table-scroll-wrap">
            <table class="b-table" style="min-width:760px">
              <thead>
                <tr>
                  <th style="text-align:left">Áreas</th>
                  ${S.activityLabels.map((l, i) => `<th>${esc(l.name || `A${i + 1}`)}</th>`).join('')}
                  <th>Promedio</th>
                  <th>Nivel</th>
                  <th style="text-align:left;min-width:150px">Observación</th>
                </tr>
              </thead>
              <tbody>
                ${data.areas.map((row, ai) => this._areaRowHtml(row, ai)).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td class="b-area" style="background:#1A2340;color:#fff;border-color:#1A2340">Promedio General</td>
                  <td colspan="${S.activityLabels.length}" style="background:#F8FAFC"></td>
                  <td style="text-align:center;background:#1A2340;color:#4ADE80;font-weight:900;font-size:16px;border-color:#1A2340">${nf(data.overall)}</td>
                  <td style="text-align:center;background:#1A2340;border-color:#1A2340"><span class="b-chip" style="background:${overallLvl.color}">${esc(overallLvl.label)}</span></td>
                  <td style="background:#F8FAFC"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div class="boletin-card p-5 mb-5" style="display:${data.overall == null ? 'none' : ''}">
          <div style="font-weight:900;color:#1A2340;margin-bottom:10px;display:flex;align-items:center;gap:8px"><i data-lucide="message-square-quote" class="w-4 h-4" style="color:#EA580C"></i> Observación general del período</div>
          <div style="font-size:13px;color:#475569;line-height:1.6;white-space:pre-wrap">${esc(S.generalNote?.comment || '') || '<span style="color:#CBD5E1">Sin comentario aún. Presiona "Observaciones" para redactarlo.</span>'}</div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 no-print">
          <button onclick="BoletinUI._back()" class="py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
            <i data-lucide="arrow-left" class="w-4 h-4"></i> Volver a estudiantes
          </button>
          <button onclick="BoletinUI._print()" class="py-3.5 bg-[#1A2340] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2">
            <i data-lucide="printer" class="w-4 h-4"></i> Imprimir boletín
          </button>
          <button onclick="BoletinUI._pdf()" class="py-3.5 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2" style="background:linear-gradient(135deg,#FF7A00,#F43F5E)">
            <i data-lucide="file-down" class="w-4 h-4"></i> Descargar PDF
          </button>
        </div>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
  },

  _metaItem(label, value) {
    return `<div><div style="font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8">${esc(label)}</div><div style="font-size:12.5px;font-weight:800;color:#1A2340">${esc(value)}</div></div>`;
  },

  _studentAge() {
    const st = this.S.student;
    if (!st) return '—';
    if (st.age != null && st.age_type) return `${st.age} ${st.age_type}`;
    if (st.age != null) return String(st.age);
    return '—';
  },

  _tutorName() {
    const S = this.S;
    return S.tutorName || S.student?.p1_name || '—';
  },

  _autoObs(avg) {
    if (avg == null) return '';
    if (avg >= 90) return 'Excelente desempeño en esta área. ¡Sigue así!';
    if (avg >= 80) return 'Muy buen avance. Continúa reforzando los logros.';
    if (avg >= 70) return 'Buen progreso. Se sugiere práctica constante.';
    if (avg >= 60) return 'Desempeño en proceso. Refuerza desde casa con apoyo.';
    return 'Requiere acompañamiento y refuerzo continuo.';
  },

  _areaRowHtml(row, ai) {
    const lvl = this._levelOf(row.avg);
    const obs = row.note?.observation || this._autoObs(row.avg);
    return `
      <tr>
        <td class="b-area"><span class="b-dot" style="background:${esc(row.area.color || '#6366F1')}"></span>${esc(row.area.name)}</td>
        ${row.cells.map((cell, ci) => `
          <td style="text-align:center">
            ${cell.norm != null
              ? `<div class="b-score" onclick="BoletinUI._openDetail(${ai},${ci})" title="Ver detalle de ${esc(row.area.name)}">
                   <span class="v" style="color:${gradeColor(cell.norm)}">${nf(cell.norm)}</span>
                   <span class="l" style="color:${gradeColor(cell.norm)}">A${cell.slot + 1}</span>
                 </div>`
              : `<span class="b-empty">—</span>`}
          </td>`).join('')}
        <td style="text-align:center;font-weight:900;font-size:15px;${row.avg != null ? `color:${lvl.color}` : 'color:#CBD5E1'}">${nf(row.avg)}</td>
        <td style="text-align:center">${row.avg != null ? `<span class="b-chip" style="background:${lvl.color}">${esc(lvl.label)}</span>` : '<span style="color:#CBD5E1;font-weight:900">—</span>'}</td>
        <td class="b-note-cell">${esc(obs) || '—'}</td>
      </tr>`;
  },

  async _openDetail(areaIdx, cellIdx) {
    const data = this._compute();
    const row = data.areas[areaIdx];
    const cell = row.cells[cellIdx];
    if (!cell || !cell.activity) return;
    const S = this.S;
    const { module: m, activity: act, norm, score } = cell;
    const label = S.activityLabels[cellIdx]?.name || `A${cellIdx + 1}`;

    let evidences = [];
    try {
      const { data: evs } = await supabase.from('eval_evidences').select('*').eq('activity_id', act.id).eq('student_id', S.studentId);
      evidences = evs || [];
    } catch (_) {}

    const obs = score?.observation || '';
    const maxVal = Number(act.max_value) || 100;
    const equiv = norm != null && maxVal !== 100 ? Math.round((norm / 100) * maxVal * 100) / 100 : null;

    const content = `
      <div class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style="background:${esc(row.area.color || '#6366F1')}">
            <i data-lucide="file-text" class="w-6 h-6"></i>
          </div>
          <div>
            <h3 class="text-lg font-black text-slate-800">${esc(label)}</h3>
            <p class="text-xs font-bold text-slate-400">${esc(row.area.name)} · ${esc(S.period.name)}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          ${this._detailItem('Área', row.area.name, row.area.color)}
          ${this._detailItem('Actividad', act.name || label)}
          ${this._detailItem('Fecha', act.activity_date ? new Date(act.activity_date).toLocaleDateString('es-DO') : '—')}
          ${this._detailItem('Valor', `${maxVal} pts`)}
          ${this._detailItem('Nota', norm != null ? `${nf(norm)} / 100${equiv != null ? ` (${equiv}/${maxVal})` : ''}` : 'Sin calificar', norm != null ? gradeColor(norm) : '#94A3B8')}
          ${this._detailItem('Promedio del área', nf(row.avg), row.avg != null ? this._levelOf(row.avg).color : '#94A3B8')}
        </div>
        <div class="mb-4">
          <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:4px">Descripción</div>
          <p class="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">${esc(act.description) || '<span style="color:#CBD5E1">Sin descripción.</span>'}</p>
        </div>
        <div class="mb-4">
          <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:4px">Comentario del docente</div>
          <p class="text-sm text-slate-600 bg-amber-50 rounded-xl p-3" style="border:1px solid #FDE68A">${esc(obs) || '<span style="color:#CBD5E1">Sin comentario.</span>'}</p>
        </div>
        <div>
          <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:6px">Archivos y fotos (${evidences.length})</div>
          ${evidences.length
            ? `<div class="flex flex-wrap gap-2">${evidences.map(ev => `
                <a href="${esc(ev.file_url)}" target="_blank" rel="noopener" class="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center gap-1.5">
                  <i data-lucide="paperclip" class="w-3.5 h-3.5"></i> Ver evidencia
                </a>`).join('')}</div>`
            : '<p class="text-xs text-slate-400">Sin evidencias adjuntas.</p>'}
        </div>
      </div>`;
    this._openModal(content, true);
  },

  _detailItem(label, value, color = '#1A2340') {
    return `
      <div class="rounded-2xl border border-slate-200 p-3">
        <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:3px">${esc(label)}</div>
        <div style="font-size:13px;font-weight:800;color:${esc(color)}">${esc(value)}</div>
      </div>`;
  },

  _openObservationsModal() {
    const S = this.S;
    const data = this._compute();
    const g = S.generalNote || {};
    const content = `
      <div class="p-6">
        <div class="flex items-center gap-3 mb-5">
          <div class="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center"><i data-lucide="sticky-note" class="w-6 h-6 text-orange-600"></i></div>
          <div>
            <h3 class="text-lg font-black text-slate-800">Observaciones</h3>
            <p class="text-xs font-bold text-slate-400">${esc(S.student?.name)} · ${esc(S.period.name)}</p>
          </div>
        </div>
        <div class="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          <div class="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#059669;margin-bottom:3px">Fortalezas</div>
            <textarea id="blnStrengths" rows="2" class="w-full px-3 py-2 bg-white border border-emerald-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 resize-y">${esc(g.strengths || '')}</textarea>
          </div>
          <div class="rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
            <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#E11D48;margin-bottom:3px">Aspectos a mejorar</div>
            <textarea id="blnWeaknesses" rows="2" class="w-full px-3 py-2 bg-white border border-rose-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rose-300 resize-y">${esc(g.weaknesses || '')}</textarea>
          </div>
          <div class="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
            <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;color:#4F46E5;margin-bottom:3px">Comentario general</div>
            <textarea id="blnComment" rows="2" class="w-full px-3 py-2 bg-white border border-indigo-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300 resize-y">${esc(g.comment || '')}</textarea>
          </div>
          ${data.areas.map(row => `
            <div class="rounded-2xl border border-slate-200 p-4">
              <div class="flex items-center gap-2 mb-2">
                <span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:${esc(row.area.color || '#6366F1')}"></span>
                <span style="font-weight:900;font-size:13px;color:#1A2340">${esc(row.area.name)}</span>
                ${row.avg != null ? `<span class="b-chip" style="background:${this._levelOf(row.avg).color}">${esc(this._levelOf(row.avg).label)}</span>` : ''}
              </div>
              <textarea data-area-note="${row.area.id}" rows="2" placeholder="Observación inteligente para esta área..." class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-200 resize-y">${esc(row.note?.observation || this._autoObs(row.avg))}</textarea>
            </div>`).join('')}
        </div>
        <button onclick="BoletinUI._saveObservations()" class="mt-5 w-full py-3.5 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-[.98] transition-all" style="background:linear-gradient(135deg,#FF7A00,#F43F5E);box-shadow:0 6px 18px rgba(244,63,94,.25)">
          <i data-lucide="save" class="w-4 h-4"></i> Guardar observaciones
        </button>
      </div>`;
    this._openModal(content, true);
  },

  async _saveObservations() {
    const S = this.S;
    const strengths = document.getElementById('blnStrengths')?.value.trim() || null;
    const weaknesses = document.getElementById('blnWeaknesses')?.value.trim() || null;
    const comment = document.getElementById('blnComment')?.value.trim() || null;
    const uid = await this._currentUid();
    const payload = { student_id: S.studentId, period_id: S.period.id, classroom_id: S.classroom?.id || null, strengths, weaknesses, comment, created_by: uid };
    if (S.generalNote?.id) {
      await supabase.from('eval_boleta_notes').update({ strengths, weaknesses, comment, updated_at: new Date().toISOString() }).eq('id', S.generalNote.id);
    } else {
      await supabase.from('eval_boleta_notes').insert(payload);
    }
    const areaWrites = [];
    document.querySelectorAll('[data-area-note]').forEach(ta => {
      const areaId = Number(ta.dataset.areaNote);
      const text = ta.value.trim() || null;
      areaWrites.push({ areaId, text });
    });
    for (const w of areaWrites) {
      if (w.text == null) {
        await supabase.from('eval_area_notes').delete().eq('student_id', S.studentId).eq('period_id', S.period.id).eq('area_id', w.areaId);
        continue;
      }
      const existing = S.areaNotes[`${w.areaId}`];
      if (existing?.id) {
        await supabase.from('eval_area_notes').update({ observation: w.text, updated_at: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await supabase.from('eval_area_notes').insert({ student_id: S.studentId, period_id: S.period.id, area_id: w.areaId, observation: w.text, created_by: uid });
      }
    }
    await this._loadNotes();
    this._closeModal();
    Helpers.toast('Observaciones guardadas', 'success');
    this._render();
  },

  _back() {
    if (this.S.onClose) this.S.onClose();
  },

  _addNote() {
    if (typeof this.S.onAddNote === 'function') { this.S.onAddNote(); return; }
    if (window.App?.openNewTaskModal) { window.App.openNewTaskModal(); return; }
    Helpers.toast('No disponible en este panel', 'warning');
  },

  async _switchPeriod(periodId) {
    this.S.selPeriodId = Number(periodId);
    this.S.period = this.S.periods.find(p => p.id === this.S.selPeriodId) || this.S.periods[0];
    const c = this.S.container;
    if (c) c.innerHTML = `<div class="flex justify-center py-16"><div class="animate-spin w-8 h-8 border-2 border-[#FF7A00] rounded-full border-t-transparent"></div></div>`;
    await this._loadChildren();
    await this._loadScores();
    await this._loadNotes();
    this._render();
  },

  _print() {
    const S = this.S;
    const html = this._printHtml();
    const w = window.open('', '_blank', 'width=900,height=1150');
    if (!w) return Helpers.toast('Permite las ventanas emergentes para imprimir', 'warning');
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  },

  _printHtml() {
    const S = this.S;
    const data = this._compute();
    const overallLvl = this._levelOf(data.overall);
    const g = S.generalNote || {};
    const today = new Date().toLocaleDateString('es-DO');
    const rows = data.areas.map(row => {
      const obs = row.note?.observation || this._autoObs(row.avg);
      return `<tr>
        <td class="area" style="background:${esc(row.area.color || '#F8FAFC')}22">${esc(row.area.name)}</td>
        ${row.cells.map(cell => `<td class="num">${cell.norm != null ? nf(cell.norm) : '—'}</td>`).join('')}
        <td class="num prom">${nf(row.avg)}</td>
        <td class="num">${row.avg != null ? esc(this._levelOf(row.avg).label) : '—'}</td>
        <td class="obs">${esc(obs)}</td>
      </tr>`;
    }).join('');
    const headCols = `<th>Áreas</th>${S.activityLabels.map(l => `<th>${esc(l.name || 'A')}</th>`).join('')}<th>Promedio</th><th>Nivel</th><th>Observación</th>`;

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Boletín ${esc(S.student?.name || '')}</title>
      <style>
        * { box-sizing:border-box; }
        body { font-family:Arial,Helvetica,sans-serif; color:#111827; margin:24px; font-size:12px; }
        .head { display:flex; align-items:center; gap:14px; border-bottom:3px solid #F43F5E; padding-bottom:12px; margin-bottom:14px; }
        .logo { width:64px; height:64px; overflow:hidden; border-radius:12px; background:#FFF7ED; display:flex; align-items:center; justify-content:center; }
        .logo img { width:100%; height:100%; object-fit:cover; }
        .head-txt { flex:1; }
        .head-txt h1 { font-size:20px; margin:0; color:#1A2340; }
        .head-txt h2 { font-size:13px; margin:3px 0 0; color:#F43F5E; text-transform:uppercase; letter-spacing:1.5px; }
        .head-txt .yr { font-size:10.5px; margin-top:4px; color:#7C2D12; font-weight:700; }
        .overall { text-align:right; }
        .overall .lb { font-size:9px; font-weight:800; text-transform:uppercase; color:#9A3412; letter-spacing:1px; }
        .overall .vv { font-size:30px; font-weight:900; }
        .student { display:grid; grid-template-columns:72px 1fr; gap:14px; border:1px solid #E2E8F0; border-radius:12px; padding:12px; margin-bottom:14px; background:#FAFBFC; }
        .student .photo { width:72px; height:72px; border-radius:10px; overflow:hidden; background:#F1F5F9; }
        .student .photo img { width:100%; height:100%; object-fit:cover; }
        .meta { display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px 18px; }
        .meta .m .k { font-size:8.5px; font-weight:800; text-transform:uppercase; letter-spacing:.6px; color:#94A3B8; }
        .meta .m .v { font-size:12px; font-weight:800; color:#1A2340; }
        table { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:14px; }
        th, td { border:1px solid #CBD5E1; padding:5px 6px; }
        th { background:#FFFBEB; color:#9A3412; font-size:9px; text-transform:uppercase; }
        td.num { text-align:center; font-weight:700; }
        td.prom { background:#FFEDD5; font-weight:900; }
        td.area { font-weight:800; background:#F8FAFC; }
        td.obs { font-size:10px; color:#475569; }
        .tfoot td { background:#1A2340; color:#fff; font-weight:900; }
        .notes { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px; }
        .note { border:1px solid #E2E8F0; border-radius:10px; padding:8px 10px; }
        .note.wide { grid-column:1/-1; }
        .note .k { font-size:8.5px; font-weight:800; text-transform:uppercase; color:#64748B; margin-bottom:3px; letter-spacing:.6px; }
        .note .v { font-size:11px; white-space:pre-wrap; }
        .sign { display:flex; justify-content:space-between; gap:18px; margin-top:22px; }
        .sign .box { flex:1; text-align:center; font-size:9.5px; color:#64748B; }
        .sign .box .line { border-top:1.5px solid #94A3B8; height:34px; margin-bottom:5px; }
        .foot { margin-top:10px; font-size:8px; color:#94A3B8; text-align:right; }
      </style></head><body>
        <div class="head">
          <div class="logo">${S.school.logo_url ? `<img src="${esc(S.school.logo_url)}">` : '<span style="font-size:28px">🎓</span>'}</div>
          <div class="head-txt">
            <h1>${esc(S.school.school_name)}</h1>
            <h2>Boletín de Calificaciones</h2>
            <div class="yr">Año Escolar ${esc(S.schoolYear?.name || '—')} · ${esc(S.period.name)}</div>
          </div>
          <div class="overall">
            <div class="lb">Promedio general</div>
            <div class="vv" style="color:${overallLvl.color}">${nf(data.overall)}</div>
            <div style="font-weight:900;font-size:11px;color:${overallLvl.color}">${esc(overallLvl.label)}</div>
          </div>
        </div>

        <div class="student">
          <div class="photo">${S.student.avatar_url ? `<img src="${esc(S.student.avatar_url)}">` : '<span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:26px">👧</span>'}</div>
          <div class="meta">
            <div class="m" style="grid-column:1/-1"><div class="v" style="font-size:16px">${esc(S.student.name)}</div></div>
            <div class="m"><div class="k">Matrícula</div><div class="v">${esc(S.student.matricula || '—')}</div></div>
            <div class="m"><div class="k">Curso</div><div class="v">${esc(S.classroom?.name || '—')}</div></div>
            <div class="m"><div class="k">Edad</div><div class="v">${esc(this._studentAge())}</div></div>
            <div class="m"><div class="k">Docente</div><div class="v">${esc(S.classroom?.teacher?.name || '—')}</div></div>
            <div class="m"><div class="k">Tutor</div><div class="v">${esc(this._tutorName())}</div></div>
            <div class="m"><div class="k">Fecha</div><div class="v">${today}</div></div>
            <div class="m"><div class="k">Estado</div><div class="v">${S.period.status === 'closed' ? 'Período cerrado' : 'Período abierto'}</div></div>
          </div>
        </div>

        <table>
          <thead><tr>${headCols}</tr></thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr class="tfoot">
              <td>Promedio General</td>
              <td colspan="${S.activityLabels.length}" style="background:#1A2340"></td>
              <td class="num" style="color:#4ADE80">${nf(data.overall)}</td>
              <td class="num" style="color:${overallLvl.color}">${esc(overallLvl.label)}</td>
              <td style="background:#1A2340"></td>
            </tr>
          </tfoot>
        </table>

        <div class="notes">
          <div class="note"><div class="k">Fortalezas</div><div class="v">${esc(g.strengths) || '—'}</div></div>
          <div class="note"><div class="k">Aspectos a mejorar</div><div class="v">${esc(g.weaknesses) || '—'}</div></div>
          <div class="note wide"><div class="k">Comentario general</div><div class="v">${esc(g.comment) || '—'}</div></div>
        </div>

        <div class="sign">
          <div class="box"><div class="line"></div>Maestra de Aula</div>
          <div class="box"><div class="line"></div>Directora</div>
          <div class="box"><div class="line"></div>Padre / Madre / Tutor</div>
        </div>
        <div class="foot">Documento generado el ${today} · Colegio Montessori Sonrisas Creativas</div>
      </body></html>`;
  },

  _pdf() {
    if (!window.jspdf?.jsPDF) return Helpers.toast('El generador de PDF no está disponible. Intenta de nuevo.', 'warning');
    const S = this.S;
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p', 'mm', 'a4');
      this._pdfPage(doc, S.student, S.period);
      const clean = s => String(s || 'boletin').replace(/[^\w\-]+/g, '_');
      doc.save(`Boletin_${clean(S.student.matricula || S.student.name)}_${clean(S.period.name)}.pdf`);
    } catch (err) {
      console.error('[BoletinUI] PDF', err);
      Helpers.toast('Error al generar el PDF', 'error');
    }
  },

  _pdfPage(doc, student, period, quiet = false) {
    const S = this.S;
    const pw = doc.internal.pageSize.getWidth();
    const ml = 14;
    const data = this._computeFor(student, period);
    const overallLvl = this._levelOf(data.overall);
    const g = S.generalNote || {};

    let y = 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(S.school.school_name, ml, y);
    doc.setFontSize(10);
    doc.setTextColor(244, 63, 94);
    doc.text('BOLETÍN DE CALIFICACIONES', ml, y + 5);
    doc.setTextColor(124, 45, 18);
    doc.setFontSize(9);
    doc.text(`Año Escolar ${S.schoolYear?.name || '—'} · ${period.name}`, ml, y + 9.5);
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(244, 63, 94);
    doc.setLineWidth(0.8);
    doc.line(ml, y + 11.5, pw - ml, y + 11.5);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Promedio general: ${nf(data.overall)} · Nivel: ${overallLvl.label}`, pw / 2, y + 5, { align: 'center' });
    y += 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(student.name, ml, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 90, 110);
    const meta = [
      `Matrícula: ${student.matricula || '—'}`,
      `Curso: ${S.classroom?.name || '—'}${S.classroom?.level ? ` (${S.classroom.level})` : ''}`,
      `Edad: ${this._studentAge()}`,
      `Docente: ${S.classroom?.teacher?.name || '—'}`,
      `Tutor: ${this._tutorName()}`,
      `Fecha: ${new Date().toLocaleDateString('es-DO')}`
    ];
    meta.forEach((m, i) => {
      const col = i % 2 === 0 ? ml : pw / 2;
      const row = Math.floor(i / 2);
      doc.text(m, col, y + row * 4.5);
    });
    y += 15;

    const headCols = ['Áreas', ...S.activityLabels.map(l => String(l.name || 'A').slice(0, 14)), 'Promedio', 'Nivel'];
    const body = data.areas.map(row => [
      row.area.name,
      ...row.cells.map(cell => (cell.norm != null ? nf(cell.norm) : '—')),
      { content: nf(row.avg), styles: { fontStyle: 'bold', fillColor: [255, 237, 213] } },
      { content: row.avg != null ? this._levelOf(row.avg).label : '—', styles: { fontStyle: 'bold' } }
    ]);
    body.push([{ content: 'PROMEDIO GENERAL', colSpan: headCols.length - 1, styles: { fillColor: [26, 35, 64], textColor: 255, fontStyle: 'bold' } }, { content: nf(data.overall), styles: { fillColor: [26, 35, 64], textColor: [74, 222, 128], fontStyle: 'bold' } }]);

    doc.autoTable({
      startY: y,
      margin: { left: ml, right: ml },
      head: [headCols],
      body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.6, halign: 'center' },
      headStyles: { fillColor: [255, 251, 235], textColor: [154, 52, 18], halign: 'center' },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }
    });
    y = doc.lastAutoTable.finalY + 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const noteBlocks = [
      ['Fortalezas', g.strengths || ''],
      ['Aspectos a mejorar', g.weaknesses || ''],
      ['Comentario general', g.comment || '']
    ];
    noteBlocks.forEach(([t, v]) => {
      if (y > 240) { doc.addPage(); y = 16; }
      doc.text(t.toUpperCase(), ml, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(v || '—', pw - ml * 2);
      doc.text(lines, ml, y + 4);
      y += 6 + lines.length * 3.6;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
    });
    y += 6;

    if (y > 225) { doc.addPage(); y = 16; }
    const signY = y + 40;
    const signW = (pw - ml * 2 - 16) / 3;
    ['Maestra de Aula', 'Directora', 'Padre / Madre / Tutor'].forEach((role, i) => {
      const x = ml + i * (signW + 8);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.4);
      doc.line(x, signY, x + signW, signY);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(role, x + signW / 2, signY + 5, { align: 'center' });
    });
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Boletín Inteligente · Colegio Montessori Sonrisas Creativas', ml, signY + 12);
  },

  async _pdfPageFor(doc, student, period, quiet = false) {
    const S = this.S;
    const moduleIds = S.modules.map(m => m.id);
    const areaIds = S.areas.map(a => a.id);
    const [scoresRes, areaRes, generalRes] = await Promise.all([
      moduleIds.length
        ? supabase.from('eval_scores').select('*').in('module_id', moduleIds).eq('student_id', student.id)
        : { data: [] },
      areaIds.length
        ? supabase.from('eval_area_notes').select('*').in('area_id', areaIds).eq('student_id', student.id).eq('period_id', period.id)
        : { data: [] },
      supabase.from('eval_boleta_notes').select('*').eq('student_id', student.id).eq('period_id', period.id).maybeSingle()
    ]);
    const saved = { studentId: S.studentId, scoresMap: S.scoresMap, areaNotes: S.areaNotes, generalNote: S.generalNote };
    S.studentId = student.id;
    S.scoresMap = buildScoresMap(scoresRes.data || [], S.activities);
    const map = {};
    (areaRes.data || []).forEach(n => { map[`${n.area_id}`] = n; });
    S.areaNotes = map;
    S.generalNote = generalRes.data || null;
    try {
      this._pdfPage(doc, student, period, quiet);
    } finally {
      S.studentId = saved.studentId;
      S.scoresMap = saved.scoresMap;
      S.areaNotes = saved.areaNotes;
      S.generalNote = saved.generalNote;
    }
  },

  _computeFor(student, period) {
    const S = this.S;
    const savedStudentId = S.studentId;
    const savedPeriod = S.period;
    S.studentId = student.id;
    S.period = period;
    const data = this._compute();
    S.studentId = savedStudentId;
    S.period = savedPeriod;
    return data;
  },

  async _openHistory() {
    const S = this.S;
    if (!S.historyLoaded) {
      const { data } = await supabase
        .from('eval_score_history')
        .select('*, student:student_id(name), activity:activity_id(name)')
        .eq('student_id', S.studentId)
        .order('created_at', { ascending: false })
        .limit(100);
      S.history = data || [];
      S.historyLoaded = true;
    }
    const rows = S.history.length
      ? S.history.map(h => `
          <tr>
            <td class="px-3 py-2 text-sm font-bold text-slate-700">${esc(h.activity?.name || '—')}</td>
            <td class="px-3 py-2 text-sm text-slate-500">${esc(h.action)}</td>
            <td class="px-3 py-2 text-sm text-slate-500">${esc(h.new_value ? JSON.stringify(h.new_value.value ?? h.new_value.stars ?? h.new_value.level ?? '') : '—')}</td>
            <td class="px-3 py-2 text-sm text-slate-400">${h.created_at ? new Date(h.created_at).toLocaleString('es-DO') : '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" class="text-center py-8 text-slate-400 text-sm">Sin cambios registrados.</td></tr>';

    const content = `
      <div class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center"><i data-lucide="history" class="w-6 h-6 text-indigo-600"></i></div>
          <div>
            <h3 class="text-lg font-black text-slate-800">Historial de calificaciones</h3>
            <p class="text-xs font-bold text-slate-400">${esc(S.student?.name)} · últimos cambios</p>
          </div>
        </div>
        <div class="table-scroll-wrap rounded-2xl border border-slate-200 max-h-[55vh] overflow-y-auto">
          <table class="w-full text-left text-sm border-separate border-spacing-0">
            <thead class="bg-slate-50 text-slate-500 text-[10px] uppercase font-black sticky top-0">
              <tr><th class="px-3 py-2.5">Actividad</th><th class="px-3 py-2.5">Acción</th><th class="px-3 py-2.5">Valor</th><th class="px-3 py-2.5">Fecha</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">${rows}</tbody>
          </table>
        </div>
      </div>`;
    this._openModal(content, true);
  },

  async _enviarBoletin() {
    const S = this.S;
    if (S.role !== 'maestra') return;
    if (!S.students.length) return Helpers.toast('No hay estudiantes en el aula', 'warning');
    if (S.period.status === 'closed') return Helpers.toast('El período está cerrado. No se puede enviar el boletín.', 'warning');

    const ok = await Helpers.confirm(`¿Enviar el boletín de ${esc(S.period.name)} a los padres de ${S.students.length} estudiantes? Se generará un PDF por estudiante y se enviará por correo.`);
    if (!ok) return;

    if (!window.jspdf?.jsPDF) return Helpers.toast('El generador de PDF no está disponible.', 'warning');

    const results = [];
    for (const st of S.students) {
      const emails = [st.p1_email, st.p2_email].filter(e => e && typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (!emails.length) { results.push({ name: st.name, status: 'sin email' }); continue; }
      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        await this._pdfPageFor(doc, st, S.period, true);
        const b64 = doc.output('datauristring').split(',')[1];
        const html = `<div style="font-family:Arial,sans-serif;background:#fff;padding:24px;border-radius:12px">
          <h2 style="margin:0 0 8px;color:#1A2340;font-size:18px">Boletín de ${esc(st.name)}</h2>
          <p style="margin:0 0 16px;color:#6B7280;font-size:13px">Adjunto encontrarás el boletín de calificaciones de <strong>${esc(S.period.name)}</strong>. ¡Gracias por acompañar su aprendizaje!</p>
        </div>`;
        const { data, error } = await supabase.functions.invoke('send-email', {
          body: {
            to: emails,
            subject: `Boletín de ${st.name} — ${S.period.name}`,
            html,
            attachments: [{ filename: `Boletin_${String(st.name).replace(/[^\w\-]+/g, '_')}_${String(S.period.name).replace(/[^\w\-]+/g, '_')}.pdf`, content: b64 }]
          }
        });
        results.push({ name: st.name, status: error || data?.error ? 'error' : 'ok' });
      } catch (e) {
        results.push({ name: st.name, status: 'error' });
      }
    }

    const sent = results.filter(r => r.status === 'ok').length;
    const failed = results.filter(r => r.status === 'error').length;
    const noEmail = results.filter(r => r.status === 'sin email').length;

    if (sent > 0) {
      await supabase.from('eval_periods').update({ boletin_sent_at: new Date().toISOString() }).eq('id', S.period.id);
      S.period.boletin_sent_at = new Date().toISOString();
    }
    Helpers.toast(`Enviados: ${sent} · Fallidos: ${failed} · Sin correo: ${noEmail}`, sent > 0 ? 'success' : 'warning', 6000);
    this._render();
  },

  _openModal(content, wide = false) {
    this._closeModal();
    const wrap = document.createElement('div');
    wrap.id = 'blnModal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow-y:auto;';
    wrap.innerHTML = `
      <div class="bg-white rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[90vh] overflow-y-auto relative animate-scaleIn" style="animation:scaleIn .18s ease">
        <button onclick="BoletinUI._closeModal()" class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all z-10">
          <i data-lucide="x" class="w-6 h-6"></i>
        </button>
        ${content}
      </div>`;
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) this._closeModal(); });
    document.body.appendChild(wrap);
    if (window.lucide) window.lucide.createIcons();
  },

  _closeModal() {
    document.getElementById('blnModal')?.remove();
  }
};

window.BoletinUI = BoletinUI;
