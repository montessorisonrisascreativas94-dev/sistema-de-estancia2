/**
 * ════════════════════════════════════════════════════════════════════
 *  CENTRO ESCOLAR · Centro de Gestión Escolar (Panel de la Directora)
 *  ────────────────────────────────────────────────────────────────────
 *  Centro de comando de la estancia: resumen de salud, organigrama de
 *  aulas con ficha drill-down, calendario escolar central, monitoreo de
 *  maestras, centro de alertas y reporte semanal exportable a PDF.
 *
 *  Secciones internas (tabs):
 *    1. Resumen     → KPIs + semáforo + alertas + actividad de hoy
 *    2. Organización→ organigrama interactivo → ficha completa del aula
 *    3. Calendario  → calendario mensual con filtros + planificador anual
 *    4. Monitoreo   → desempeño operativo por maestra
 *    5. Reportes    → reporte semanal por aula + exportación PDF
 * ════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { StudentRecordModal } from '../shared/student-record-modal.js';
import {
  CANONICAL_CLASSROOMS,
  SPECIAL_CLASSROOMS_META,
  findCanonicalClassroom,
  findSpecialClassroom,
  sanitizeClassroomDisplayName,
  dedupeClassrooms,
} from '../shared/constants.js';

const esc = (v) => Helpers.escapeHTML(v == null ? '' : String(v));
const TABS = [
  { id: 'resumen',     label: 'Resumen',     icon: 'gauge' },
  { id: 'organizacion',label: 'Organización',icon: 'network' },
  { id: 'calendario',  label: 'Calendario',  icon: 'calendar' },
  { id: 'monitoreo',   label: 'Monitoreo',   icon: 'activity' },
  { id: 'reportes',    label: 'Reportes',    icon: 'file-text' },
];

/** Metadatos de los eventos de rutina (enum event_type) */
const EVENT_META = {
  desayuno:    { label: 'Desayuno',      icon: 'book-open',   color: '#F59E0B' },
  merienda:    { label: 'Merienda',      icon: 'book-open',   color: '#F59E0B' },
  almuerzo:    { label: 'Almuerzo',      icon: 'book-open',   color: '#16A34A' },
  biberon:     { label: 'Biberón',       icon: 'heart-pulse', color: '#0B63C7' },
  dormir:      { label: 'Siesta',        icon: 'clock',       color: '#8B5CF6' },
  despertar:   { label: 'Despertar',     icon: 'sparkles',    color: '#F59E0B' },
  panal:       { label: 'Cambio de pañal', icon: 'clipboard-list', color: '#64748B' },
  bano:        { label: 'Baño',          icon: 'clipboard-list', color: '#06B6D4' },
  temperatura: { label: 'Temperatura',   icon: 'heart-pulse', color: '#EF4444' },
  medicamento: { label: 'Medicamento',   icon: 'heart-pulse', color: '#EC4899' },
  foto:        { label: 'Foto',          icon: 'eye',         color: '#0B63C7' },
  nota:        { label: 'Nota',          icon: 'file-text',   color: '#64748B' },
};

const evMeta = (type) => EVENT_META[type] || { label: String(type || 'Evento'), icon: 'zap', color: '#0B63C7' };

export const SchoolCenterModule = {
  _tab: 'resumen',
  _aulaId: undefined,
  _data: null,
  _loadedAt: 0,
  _loading: false,
  _calDateState: null,
  _calFilter: 'todos',
  _calSelected: null,
  _reportId: null,
  _attIndex: null,
  _postsCache: [],

  /* ════════════════════════ CICLO DE VIDA ════════════════════════ */

  async init(force = false) {
    const root = document.getElementById('kscRoot');
    if (!root) return;

    if (!root.innerHTML.trim()) {
      root.innerHTML = this._shell();
      this._bind();
    }

    const stale = Date.now() - this._loadedAt > 60_000;
    if (!this._data || force || stale) {
      await this.load();
    } else {
      this._render();
    }
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  _shell() {
    return `
      <div class="ksc-hero">
        <div>
          <div class="ksc-hero-eyebrow">Centro de Gestión Escolar</div>
          <h1>Centro Escolar</h1>
          <p>Organización · Calendario · Monitoreo · Alertas — todo el flujo de la estancia en una sola pantalla.</p>
        </div>
        <div class="ksc-hero-right">
          <div class="ksc-date" id="kscDate"></div>
          <div class="ksc-sem ksc-sem--ok" id="kscSem"><i></i><span>Cargando estado…</span></div>
          <div class="ksc-hero-actions">
            <button class="ksc-btn-refresh" id="kscRefresh" type="button">
              <i data-lucide="refresh-cw"></i> Actualizar
            </button>
          </div>
        </div>
      </div>

      <div class="ksc-kpis" id="kscKpis"></div>

      <div class="ksc-tabs" id="kscTabs">
        ${TABS.map(t => `
          <button class="ksc-tab${this._tab === t.id ? ' active' : ''}" data-ksc-tab="${t.id}" type="button">
            <i data-lucide="${t.icon}"></i> ${t.label}
            <span class="ksc-tab-count" data-ksc-count="${t.id}" style="display:none">0</span>
          </button>`).join('')}
      </div>

      <div id="kscView"></div>`;
  },

  _bind() {
    const root = document.getElementById('kscRoot');
    if (!root || root._kscBound) return;
    root._kscBound = true;

    root.addEventListener('click', (e) => {
      const t = (sel) => e.target.closest(sel);
      let el;
      if ((el = t('[data-ksc-tab]')))               return this.go(el.dataset.kscTab);
      if ((el = t('[data-ksc-open-aula]')))         return this.openAula(el.dataset.kscOpenAula);
      if ((el = t('[data-ksc-student]')))           return this.openStudent(el.dataset.kscStudent);
      if ((el = t('[data-ksc-alert]')))             return this.followAlert(el.dataset.kscAlert, el.dataset.kscAula);
      if ((el = t('[data-ksc-report]')))            return this.setReport(el.dataset.kscReport);
      if ((el = t('[data-ksc-cal-filter]')))        return this.setCalFilter(el.dataset.kscCalFilter);
      if ((el = t('[data-ksc-cal-day]')))           return this.selectDay(el.dataset.kscCalDay);
      if ((el = t('[data-ksc-nav]')))               return this.calNav(el.dataset.kscNav);
      if ((el = t('[data-ksc-action]')))            return this._action(el.dataset.kscAction, el);
    });

    document.getElementById('kscRefresh')?.addEventListener('click', () => this.refresh());
  },

  _action(action, el) {
    switch (action) {
      case 'back':          this.back(); break;
      case 'refresh':       this.refresh(); break;
      case 'export-pdf':    this.exportPdf(); break;
      case 'export-csv':    this.exportCsv(); break;
      case 'go-aulas':       window.App?.navigation?.goTo('aulas'); break;
      case 'go-asistencia': window.App?.navigation?.goTo('asistencia'); break;
      case 'go-chat':       window.App?.navigation?.goTo('comunicacion'); break;
      case 'go-muro':       window.App?.navigation?.goTo('muro'); break;
      case 'go-maestros':   window.App?.navigation?.goTo('maestros'); break;
      case 'edit-aula': {
        const rid = el.dataset.kscId;
        if (rid && !String(rid).startsWith('__')) window.App?.rooms?.openModal?.(rid);
        break;
      }
      default: break;
    }
  },

  /* ════════════════════════ CARGA DE DATOS ════════════════════════ */

  /** Ejecuta una consulta sin tumbar todo el módulo si falla. */
  _q(query, fallback = []) {
    return query
      .then(r => (r?.error ? (console.warn('[CentroEscolar] query', r.error), fallback) : (r?.data ?? fallback)))
      .catch(e => (console.warn('[CentroEscolar] query excepción', e), fallback));
  },

  /** Estudiantes: reintenta sin birth_date si esa columna no existe en la BD. */
  async _studentsQuery() {
    try {
      const r = await supabase.from('students')
        .select('id, name, birth_date, classroom_id, parent_id')
        .eq('is_active', true).is('deleted_at', null).order('name').limit(2000);
      if (!r.error) return r.data ?? [];
      console.warn('[CentroEscolar] students con birth_date falló, reintento:', r.error);
    } catch (e) {
      console.warn('[CentroEscolar] students error', e);
    }
    try {
      const r2 = await supabase.from('students')
        .select('id, name, classroom_id, parent_id')
        .eq('is_active', true).is('deleted_at', null).order('name').limit(2000);
      if (r2.error) console.warn('[CentroEscolar] students (reintento) error:', r2.error);
      return r2.data ?? [];
    } catch (e) {
      console.warn('[CentroEscolar] students (reintento) excepción:', e);
      return [];
    }
  },

  async load() {
    if (this._loading) return;
    this._loading = true;

    const view = document.getElementById('kscView');
    if (view && !this._data) view.innerHTML = this._loadingHtml();

    const today = this._todayISO();
    const weekAgoISO = new Date(Date.now() - 6 * 864e5).toISOString();
    const weekAgoDate = this._dateISO(new Date(Date.now() - 6 * 864e5));

    try {
      const [
        aulasRaw, students, attWeek, logsToday, schedToday, eventsToday,
        postsWeek, msgUnread, msgWeek, tasks, incidents, staff,
        meetings, years, periods,
      ] = await Promise.all([
        this._q(supabase.from('classrooms')
          .select('id, name, level, capacity, is_live, teacher_id, teacher:teacher_id(name, avatar_url)')
          .is('deleted_at', null).order('name')),
        this._studentsQuery(),
        this._q(supabase.from('attendance')
          .select('id, student_id, classroom_id, status, date, created_at')
          .gte('date', weekAgoDate).lte('date', today).limit(6000)),
        this._q(supabase.from('daily_logs')
          .select('id, student_id, classroom_id, date, status, created_at')
          .eq('date', today).limit(4000)),
        this._q(supabase.from('classroom_daily_schedule')
          .select('classroom_id, events, schedule_date').eq('schedule_date', today).limit(200)),
        this._q(supabase.from('classroom_events')
          .select('id, classroom_id, event_type, event_time, event_date, teacher_id')
          .eq('event_date', today).order('event_time').limit(3000)),
        this._q(supabase.from('posts')
          .select('id, classroom_id, teacher_id, title, content, teacher_name, created_at')
          .gte('created_at', weekAgoISO).order('created_at', { ascending: false }).limit(500)),
        this._q(supabase.from('messages')
          .select('id, sender_id, receiver_id, content, created_at, sender:sender_id(name, role)')
          .eq('is_read', false).order('created_at').limit(600)),
        this._q(supabase.from('messages')
          .select('id, receiver_id, sender_id, created_at, read_at')
          .gte('created_at', weekAgoISO).order('created_at', { ascending: false }).limit(800)),
        this._q(supabase.from('tasks')
          .select('id, classroom_id, teacher_id, title, due_date, created_at')
          .order('created_at', { ascending: false }).limit(400)),
        this._q(supabase.from('incidents')
          .select('id, classroom_id, student_id, severity, status, description, reported_at, student:student_id(name)')
          .in('status', ['received', 'review']).order('reported_at', { ascending: false }).limit(300)),
        this._q(supabase.from('profiles')
          .select('id, name, role, avatar_url')
          .in('role', ['directora', 'encargada', 'maestra', 'asistente'])
          .is('deleted_at', null).order('name').limit(200)),
        this._q(supabase.from('meetings')
          .select('id, title, start_time, status, type, target_id')
          .not('start_time', 'is', null)
          .gte('start_time', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
          .order('start_time').limit(200)),
        this._q(supabase.from('school_years')
          .select('id, name, start_date, end_date, is_current')
          .order('start_date', { ascending: false }).limit(5)),
        this._q(supabase.from('periods')
          .select('id, name, start_date, end_date, status, is_active, classroom_id')
          .order('start_date', { ascending: false }).limit(60)),
      ]);

      this._data = this._compute({
        aulasRaw, students, attWeek, logsToday, schedToday, eventsToday,
        postsWeek, msgUnread, msgWeek, tasks, incidents, staff,
        meetings, years, periods, today, weekAgoDate,
      });

      this._loadedAt = Date.now();
      this._render();
      if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
    } catch (e) {
      console.error('[CentroEscolar] load error', e);
      Helpers.toast('No se pudo cargar el Centro Escolar', 'error');
      const view2 = document.getElementById('kscView');
      if (view2 && !this._data) {
        view2.innerHTML = `<div class="ksc-panel"><div class="ksc-empty"><i data-lucide="alert-triangle"></i>
          <div>No se pudieron cargar los datos. Intenta de nuevo.</div>
          <button class="ksc-mini-btn" data-ksc-action="refresh" type="button" style="margin-top:.6rem">
            <i data-lucide="refresh-cw"></i> Reintentar</button></div></div>`;
        if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
      }
    } finally {
      this._loading = false;
    }
  },

  async refresh() {
    const btn = document.getElementById('kscRefresh');
    const before = this._loadedAt;
    btn?.classList.add('is-spinning');
    await this.load();
    document.getElementById('kscRefresh')?.classList.remove('is-spinning');
    if (this._loadedAt !== before) Helpers.toast('Centro Escolar actualizado', 'success');
  },

  _loadingHtml() {
    return `
      <div class="ksc-grid-2">
        <div class="ksc-panel"><div class="ksc-panel-head"><div class="ksc-skel" style="width:160px;height:14px"></div></div>
          <div class="ksc-panel-body" style="display:flex;flex-direction:column;gap:.7rem">
            ${Array.from({ length: 5 }).map(() => '<div class="ksc-skel" style="height:54px"></div>').join('')}
          </div></div>
        <div class="ksc-panel"><div class="ksc-panel-head"><div class="ksc-skel" style="width:140px;height:14px"></div></div>
          <div class="ksc-panel-body" style="display:flex;flex-direction:column;gap:.7rem">
            ${Array.from({ length: 5 }).map(() => '<div class="ksc-skel" style="height:38px"></div>').join('')}
          </div></div>
      </div>`;
  },

  /* ════════════════════════ CÁLCULO / MODELO ════════════════════════ */

  _compute(d) {
    // ── 1. Aulas normalizadas + deduplicadas (mismo criterio que "Aulas")
    const norm = (d.aulasRaw || []).map(r => ({
      ...r,
      name:  sanitizeClassroomDisplayName(r.name),
      level: sanitizeClassroomDisplayName(r.level),
    }));

    const aulas = dedupeClassrooms(norm).map(r => {
      const canon = findCanonicalClassroom(r.level || r.name);
      const spec  = canon ? null : (findSpecialClassroom(r.name) || findSpecialClassroom(r.level));
      return {
        ...r,
        name:  canon?.displayLevel || spec?.displayName || r.name,
        level: canon?.level || spec?.key || r.level,
        color: r.color || canon?.color || spec?.color || '#0B63C7',
        capacity: r.capacity || canon?.capacity || 20,
      };
    });

    // Aulas canónicas ausentes en la BD (catálogo oficial incompleto)
    CANONICAL_CLASSROOMS.forEach(c => {
      const exists = aulas.some(r => {
        const f = findCanonicalClassroom(r.level || r.name);
        return f && f.id === c.id;
      });
      if (!exists) {
        aulas.push({
          id: null, __placeholder: true, name: c.displayLevel || c.name, level: c.level,
          color: c.color, capacity: c.capacity || 20, teacher_id: null, teacher: null,
        });
      }
    });
    SPECIAL_CLASSROOMS_META.forEach(m => {
      const exists = aulas.some(r => {
        const key = r.level || r.name || '';
        return !!findSpecialClassroom(key) || String(r.name) === m.displayName;
      });
      if (!exists) {
        aulas.push({ id: null, __special: true, name: m.displayName, level: m.key, color: m.color, capacity: 20, teacher_id: null, teacher: null });
      }
    });

    aulas.sort((a, b) => {
      const ca = findCanonicalClassroom(a.level || a.name);
      const cb = findCanonicalClassroom(b.level || b.name);
      const ia = ca ? ca.id : 9000;
      const ib = cb ? cb.id : 9000;
      if (ia !== ib) return ia - ib;
      return String(a.name || '').localeCompare(String(b.name || ''), 'es');
    });

    const byId = new Map();
    aulas.forEach(a => { if (a.id != null) byId.set(a.id, a); });

    const blank = () => ({
      students: [], nStudents: 0,
      attRecords: 0, present: 0, absent: 0, late: 0, noRecord: 0,
      weekDates: new Set(), weekRecords: 0, attWeekPct: 0,
      logs: 0, routinePct: 0,
      eventsToday: [], planToday: [],
      postsToday: 0, postsWeek: 0, lastPost: null,
      msgsPending: [], msgsIn: 0, msgsRead: 0, respMs: null,
      tasksWeek: 0, tasksPending: 0,
      incidents: [], lastActivity: null,
    });

    aulas.forEach(a => { a.m = blank(); });
    const orphan = { id: '__sin_aula', name: 'Sin aula asignada', color: '#94A3B8', __orphan: true, m: blank() };
    const bucket = new Map();
    bucket.set(null, orphan);

    const resolve = (classroomId) => {
      if (classroomId == null) return orphan;
      const a = byId.get(classroomId);
      if (a) return a;
      if (!bucket.has(classroomId)) bucket.set(classroomId, { ...orphan, id: '__orphan_' + classroomId, __orphan: true, m: blank() });
      return bucket.get(classroomId);
    };

    // ── 2. Estudiantes por aula
    (d.students || []).forEach(s => {
      const a = resolve(s.classroom_id);
      a.m.students.push(s);
      a.m.nStudents++;
    });

    // ── 3. Asistencia (hoy + semana)
    const today = d.today;
    (d.attWeek || []).forEach(r => {
      const a = resolve(r.classroom_id);
      a.m.weekDates.add(r.date);
      a.m.weekRecords++;
      if (r.date === today) {
        a.m.attRecords++;
        if (r.status === 'present') a.m.present++;
        else if (r.status === 'late') { a.m.present++; a.m.late++; }
        else if (r.status === 'absent') a.m.absent++;
        const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
        if (ts) a.m.lastActivity = maxTs(a.m.lastActivity, ts);
      }
    });

    // ── 4. Bitácora / rutina del día
    (d.logsToday || []).forEach(r => {
      const a = resolve(r.classroom_id);
      a.m.logs++;
      const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
      if (ts) a.m.lastActivity = maxTs(a.m.lastActivity, ts);
    });

    // ── 5. Plan del día (classroom_daily_schedule)
    (d.schedToday || []).forEach(r => {
      const a = resolve(r.classroom_id);
      const list = Array.isArray(r.events) ? r.events : [];
      a.m.planToday = list.filter(e => e && e.active !== false && this._planAppliesToday(e));
    });

    // ── 6. Eventos de rutina registrados hoy
    (d.eventsToday || []).forEach(ev => {
      const a = resolve(ev.classroom_id);
      a.m.eventsToday.push(ev);
      const ts = ev.event_time ? new Date(ev.event_time).getTime() : 0;
      if (ts) a.m.lastActivity = maxTs(a.m.lastActivity, ts);
    });

    // ── 7. Publicaciones
    (d.postsWeek || []).forEach(p => {
      const a = resolve(p.classroom_id);
      a.m.postsWeek++;
      const ts = p.created_at ? new Date(p.created_at).getTime() : 0;
      if (ts) a.m.lastActivity = maxTs(a.m.lastActivity, ts);
      if (p.created_at && p.created_at.slice(0, 10) === today) a.m.postsToday++;
      if (!a.m.lastPost || ts > a.m.lastPost) a.m.lastPost = ts;
    });

    // ── 8. Mensajes: pendientes (sin leer) por aula + tiempo de respuesta
    const parentToStudent = new Map();
    (d.students || []).forEach(s => { if (s.parent_id) parentToStudent.set(s.parent_id, s); });

    const respAcc = new Map(); // teacherId -> [ms...]
    (d.msgWeek || []).forEach(m => {
      if (!m.read_at || !m.created_at) return;
      const ms = new Date(m.read_at).getTime() - new Date(m.created_at).getTime();
      if (ms < 0 || ms > 7 * 864e5) return;
      if (!respAcc.has(m.receiver_id)) respAcc.set(m.receiver_id, []);
      respAcc.get(m.receiver_id).push(ms);
    });

    const seenPending = new Set();
    (d.msgUnread || []).forEach(m => {
      aulas.forEach(a => {
        if (!a.id || seenPending.has(m.id)) return;
        const teacherHit = a.teacher_id && m.receiver_id === a.teacher_id;
        const parentStudent = parentToStudent.get(m.sender_id);
        const parentHit = parentStudent && parentStudent.classroom_id === a.id;
        if (teacherHit || parentHit) {
          seenPending.add(m.id);
          a.m.msgsPending.push(m);
        }
      });
    });

    (d.msgWeek || []).forEach(m => {
      const a = aulas.find(x => x.id && x.teacher_id && x.teacher_id === m.receiver_id);
      if (a) a.m.msgsIn++;
      if (m.read_at) {
        const a2 = aulas.find(x => x.id && x.teacher_id && x.teacher_id === m.receiver_id);
        if (a2) a2.m.msgsRead++;
      }
    });

    // ── 9. Actividades (tareas)
    const weekMs = Date.now() - 7 * 864e5;
    (d.tasks || []).forEach(t => {
      const a = resolve(t.classroom_id);
      const created = t.created_at ? new Date(t.created_at).getTime() : 0;
      if (created >= weekMs) a.m.tasksWeek++;
      if (t.due_date) {
        const due = new Date(t.due_date).getTime();
        if (due <= Date.now() + 2 * 864e5) a.m.tasksPending++;
      }
    });

    // ── 10. Incidencias abiertas
    (d.incidents || []).forEach(i => {
      const a = resolve(i.classroom_id);
      a.m.incidents.push(i);
      const ts = i.reported_at ? new Date(i.reported_at).getTime() : 0;
      if (ts) a.m.lastActivity = maxTs(a.m.lastActivity, ts);
    });

    // ── 11. Métricas derivadas por aula
    const isWeekend = [0, 6].includes(new Date().getDay());
    aulas.forEach(a => {
      const m = a.m;
      const base = m.present > 0 ? m.present : m.nStudents;
      m.routinePct = base > 0 ? Math.min(100, Math.round((m.logs / base) * 100)) : 0;
      const days = m.weekDates.size || 0;
      m.attWeekPct = days > 0 && m.nStudents > 0
        ? Math.min(100, Math.round((m.weekRecords / (m.nStudents * days)) * 100))
        : 0;
      m.noRecord = m.nStudents > 0 ? Math.max(0, m.nStudents - m.attRecords) : 0;
      m.respMs = respAcc.get(a.teacher_id)?.length
        ? respAcc.get(a.teacher_id).reduce((x, y) => x + y, 0) / respAcc.get(a.teacher_id).length
        : null;

      const started = m.attRecords > 0;
      let status = 'ok';
      if (!a.id) status = 'muted';
      else if (!a.teacher_id && m.nStudents > 0) status = 'danger';
      else if (started && m.noRecord > 0) status = 'danger';
      else if (m.msgsPending.length >= 3) status = 'danger';
      else if (m.incidents.length > 0) status = 'danger';
      else if ((started && m.routinePct < 100) || m.msgsPending.length > 0 ||
               (isWeekend ? false : (m.postsToday === 0 && new Date().getHours() >= 11 && m.nStudents > 0))) status = 'warn';
      else if (!a.id) status = 'muted';
      a.status = status;
    });

    // ── 12. Alertas
    const alerts = [];
    aulas.forEach(a => {
      if (!a.id || a.__placeholder || a.__special) return;
      const m = a.m;
      if (!a.teacher_id && m.nStudents > 0) {
        alerts.push({ sev: 'danger', icon: 'user-x', title: a.name, desc: 'Aula sin maestra asignada.', aula: a.id, go: 'maestros' });
      }
      if (m.attRecords > 0 && m.noRecord > 0) {
        alerts.push({ sev: 'danger', icon: 'user-check', title: a.name, desc: `${m.noRecord} estudiante${m.noRecord > 1 ? 's' : ''} sin registro de asistencia hoy.`, aula: a.id, go: 'aula' });
      }
      if (m.msgsPending.length >= 3) {
        alerts.push({ sev: 'danger', icon: 'message-square', title: a.name, desc: `${m.msgsPending.length} mensajes de padres sin responder.`, aula: a.id, go: 'aula' });
      }
      if (m.msgsPending.length > 0 && m.msgsPending.length < 3) {
        alerts.push({ sev: 'warn', icon: 'message-square', title: a.name, desc: `${m.msgsPending.length} mensaje${m.msgsPending.length > 1 ? 's' : ''} pendiente${m.msgsPending.length > 1 ? 's' : ''} de respuesta.`, aula: a.id, go: 'aula' });
      }
      if (m.incidents.length > 0) {
        alerts.push({ sev: 'danger', icon: 'alert-triangle', title: a.name, desc: `${m.incidents.length} incidencia${m.incidents.length > 1 ? 's' : ''} abierta${m.incidents.length > 1 ? 's' : ''}.`, aula: a.id, go: 'aula' });
      }
      if (m.attRecords > 0 && m.routinePct < 100) {
        alerts.push({ sev: 'warn', icon: 'list-checks', title: a.name, desc: `Rutina del día incompleta (${m.routinePct}% de bitácora).`, aula: a.id, go: 'aula' });
      }
      if (!isWeekend && m.nStudents > 0 && m.postsToday === 0 && new Date().getHours() >= 11) {
        alerts.push({ sev: 'warn', icon: 'megaphone', title: a.name, desc: 'Sin publicación de actividad hoy.', aula: a.id, go: 'muro' });
      }
    });
    const order = { danger: 0, warn: 1, info: 2 };
    alerts.sort((x, y) => order[x.sev] - order[y.sev]);

    // ── 13. Feed de actividad de hoy
    const feed = [];
    (d.eventsToday || []).forEach(ev => {
      const meta = evMeta(ev.event_type);
      const a = byId.get(ev.classroom_id);
      feed.push({
        ts: ev.event_time ? new Date(ev.event_time).getTime() : 0,
        icon: meta.icon, color: meta.color,
        title: esc(`${meta.label} · ${a ? a.name : 'Aula'}`),
        meta: `${this._fmtTime(ev.event_time)} · rutina registrada`,
      });
    });
    (d.postsWeek || []).forEach(p => {
      if (!p.created_at || p.created_at.slice(0, 10) !== today) return;
      const a = byId.get(p.classroom_id);
      feed.push({
        ts: new Date(p.created_at).getTime(), icon: 'megaphone', color: '#16A34A',
        title: esc(`${a ? a.name : 'Muro'} publicó actividad`),
        meta: `${this._fmtTime(p.created_at)} · ${esc(p.title || p.content || 'Publicación').slice(0, 60)}`,
      });
    });
    (d.incidents || []).forEach(i => {
      if (!i.reported_at || i.reported_at.slice(0, 10) !== today) return;
      const a = byId.get(i.classroom_id);
      feed.push({
        ts: new Date(i.reported_at).getTime(), icon: 'alert-triangle', color: '#EF4444',
        title: esc(`Incidencia en ${a ? a.name : 'aula'}`),
        meta: `${this._fmtTime(i.reported_at)} · ${esc(i.student?.name || 'Estudiante')}`,
      });
    });
    (d.msgUnread || []).forEach(m => {
      if (!m.created_at || m.created_at.slice(0, 10) !== today) return;
      feed.push({
        ts: new Date(m.created_at).getTime(), icon: 'message-square', color: '#F59E0B',
        title: `Mensaje de ${esc(m.sender?.name || 'padre de familia')}`,
        meta: `${this._fmtTime(m.created_at)} · pendiente de respuesta`,
      });
    });
    feed.sort((a, b) => b.ts - a.ts);

    // ── 14. KPIs globales + salud
    const real = aulas.filter(a => a.id);
    const kpis = {
      aulas: real.length,
      estudiantes: aulas.reduce((n, a) => n + a.m.nStudents, 0),
      maestras: new Set(real.map(a => a.teacher_id).filter(Boolean)).size,
      rutinas: avg(real.filter(a => a.m.nStudents > 0).map(a => a.m.routinePct)),
      publicaciones: aulas.reduce((n, a) => n + a.m.postsWeek, 0),
      mensajes: aulas.reduce((n, a) => n + a.m.msgsPending.length, 0),
      actividades: aulas.reduce((n, a) => n + a.m.tasksPending, 0),
      publicadasHoy: real.filter(a => a.m.postsToday > 0).length,
    };

    const withStudents = aulas.filter(a => a.m.nStudents > 0);
    const attendedBase = withStudents.filter(a => a.m.attRecords > 0);
    const asistenciaPct = attendedBase.length
      ? Math.round((attendedBase.reduce((n, a) => n + a.m.present, 0) /
        Math.max(1, attendedBase.reduce((n, a) => n + a.m.attRecords, 0))) * 100)
      : null;
    const msgsWeekTotal = real.reduce((n, a) => n + a.m.msgsIn, 0);
    const msgsWeekRead = real.reduce((n, a) => n + a.m.msgsRead, 0);
    const msgsRespPct = msgsWeekTotal ? Math.round((msgsWeekRead / msgsWeekTotal) * 100) : null;
    const pubPct = withStudents.length ? Math.round((kpis.publicadasHoy / withStudents.length) * 100) : null;
    const rutinaPct = kpis.rutinas;

    const reds = alerts.filter(a => a.sev === 'danger').length;
    const warns = alerts.filter(a => a.sev === 'warn').length;
    const health = [
      { label: 'Aulas activas',   value: `${real.filter(a => a.teacher_id).length}/${real.length}`, pct: real.length ? Math.round((real.filter(a => a.teacher_id).length / real.length) * 100) : 100 },
      { label: 'Maestras activas',value: String(kpis.maestras), pct: kpis.maestras ? 100 : 0 },
      { label: 'Rutinas',         value: rutinaPct + '%', pct: rutinaPct },
      { label: 'Mensajes respondidos', value: msgsRespPct == null ? '—' : msgsRespPct + '%', pct: msgsRespPct ?? 100 },
      { label: 'Publicaciones',   value: pubPct == null ? '—' : pubPct + '%', pct: pubPct ?? 100 },
      { label: 'Asistencia',      value: asistenciaPct == null ? '—' : asistenciaPct + '%', pct: asistenciaPct ?? 100 },
      { label: 'Actividades',     value: kpis.actividades ? kpis.actividades + ' pend.' : '100%', pct: kpis.actividades ? 60 : 100 },
    ].map(h => ({ ...h, status: h.pct >= 90 ? 'ok' : h.pct >= 70 ? 'warn' : 'danger' }));

    const level = reds > 0 ? 'danger' : (warns > 0 ? 'warn' : 'ok');
    const semText = level === 'ok' ? 'Estancia operando normalmente'
      : level === 'warn' ? 'Requiere atención' : 'Requiere intervención';

    const pool = [...aulas.filter(a => a.id), ...Array.from(bucket.values()).filter(b => b.__orphan && b.m.nStudents > 0)];

    // Índices para vistas rápidas: asistencia de hoy por estudiante y posts de la semana
    this._attIndex = new Map();
    (d.attWeek || []).forEach(r => {
      if (r.date === today) this._attIndex.set(r.student_id, r);
    });
    this._postsCache = d.postsWeek || [];

    return {
      aulas, pool, alerts, feed, kpis, health, level, semText,
      staff: d.staff || [], meetings: d.meetings || [], years: d.years || [], periods: d.periods || [],
      msgUnread: d.msgUnread || [], students: d.students || [],
      tasks: d.tasks || [], incidents: d.incidents || [], posts: d.postsWeek || [],
      respAcc, today, isWeekend,
      weekRange: `${this._fmtShortDate(d.weekAgoDate)} – ${this._fmtShortDate(today)}`,
    };
  },

  /* ════════════════════════ RENDER ════════════════════════ */

  _render() {
    const root = document.getElementById('kscRoot');
    if (!root) return;
    if (!root.innerHTML.trim()) root.innerHTML = this._shell();

    const D = this._data;
    if (!D) return;

    const dateEl = document.getElementById('kscDate');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    }

    const sem = document.getElementById('kscSem');
    if (sem) {
      sem.className = `ksc-sem ksc-sem--${D.level === 'ok' ? 'ok' : D.level === 'warn' ? 'warn' : 'danger'}`;
      sem.innerHTML = `<i></i><span>${esc(D.semText)}</span>`;
    }

    const kpis = document.getElementById('kscKpis');
    if (kpis) {
      const K = D.kpis;
      const cards = [
        { label: 'Aulas activas',      value: K.aulas,           foot: 'catálogo operativo', color: '#0B63C7' },
        { label: 'Estudiantes',        value: K.estudiantes,     foot: 'matrícula activa',   color: '#0891B2' },
        { label: 'Maestras',           value: K.maestras,        foot: 'docentes en aula',   color: '#7C3AED' },
        { label: 'Rutina de hoy',      value: K.rutinas + '%',   foot: 'bitácora completada',color: '#16A34A' },
        { label: 'Publicaciones',      value: K.publicaciones,   foot: 'últimos 7 días',     color: '#F59E0B' },
        { label: 'Mensajes pendientes',value: K.mensajes,        foot: 'sin responder',      color: '#EF4444', alert: K.mensajes > 0 },
        { label: 'Actividades',        value: K.actividades,     foot: 'por vencer / vencidas', color: '#EC4899' },
      ];
      kpis.innerHTML = cards.map(c => `
        <div class="ksc-kpi${c.alert ? ' ksc-kpi--alert' : ''}" style="--kpi:${c.color}">
          <div class="ksc-kpi-label">${esc(c.label)}</div>
          <div class="ksc-kpi-value">${esc(c.value)}</div>
          <div class="ksc-kpi-foot">${esc(c.foot)}</div>
        </div>`).join('');
    }

    document.querySelectorAll('#kscTabs .ksc-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.kscTab === this._tab);
    });
    const cAlert = document.querySelector('[data-ksc-count="resumen"]');
    if (cAlert) {
      const n = D.alerts.length;
      cAlert.style.display = n ? '' : 'none';
      cAlert.textContent = n > 99 ? '99+' : n;
    }

    const view = document.getElementById('kscView');
    if (!view) return;
    if (this._tab === 'aula' && this._aulaId !== undefined) view.innerHTML = this._renderAula();
    else if (this._tab === 'organizacion') view.innerHTML = this._renderOrganizacion();
    else if (this._tab === 'calendario')   view.innerHTML = this._renderCalendario();
    else if (this._tab === 'monitoreo')    view.innerHTML = this._renderMonitoreo();
    else if (this._tab === 'reportes')     view.innerHTML = this._renderReportes();
    else                                   view.innerHTML = this._renderResumen();

    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  /* ---------- NAVEGACIÓN ---------- */

  go(tab) {
    if (this._tab === 'aula' && tab !== 'aula') this._aulaId = undefined;
    this._tab = tab;
    this._render();
    document.getElementById('kscView')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  openAula(id) {
    if (id == null || id === '' || id === 'undefined') return;
    this._aulaId = String(id);
    this._tab = 'aula';
    this._render();
    document.getElementById('kscView')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  back() {
    this._aulaId = undefined;
    this._tab = 'organizacion';
    this._render();
  },

  openStudent(id) {
    if (!id) return;
    StudentRecordModal.open('edit', Number(id));
  },

  followAlert(kind, aulaId) {
    if (kind === 'aula' && aulaId) return this.openAula(aulaId);
    const map = { maestros: 'maestros', asistencia: 'asistencia', muro: 'muro', chat: 'comunicacion' };
    window.App?.navigation?.goTo(map[kind] || 'aulas');
  },

  setReport(id) {
    this._reportId = id == null ? null : String(id);
    this._tab = 'reportes';
    this._render();
  },

  /* ════════════════════════ VISTA: RESUMEN ════════════════════════ */

  _renderResumen() {
    const D = this._data;
    const health = D.health.map(h => `
      <div class="ksc-bar">
        <div class="ksc-bar-head">
          <span class="ksc-bar-label">${esc(h.label)}</span>
          <span class="ksc-bar-value" style="color:${h.status === 'ok' ? '#16A34A' : h.status === 'warn' ? '#B45309' : '#B91C1C'}">${esc(h.value)}</span>
        </div>
        <div class="ksc-bar-track"><div class="ksc-bar-fill" style="--c:${h.status === 'ok' ? '#16A34A' : h.status === 'warn' ? '#F59E0B' : '#EF4444'};width:${Math.max(3, h.pct || 0)}%"></div></div>
      </div>`).join('');

    const alerts = D.alerts.length
      ? D.alerts.map((a, i) => `
        <div class="ksc-alert ksc-alert--${a.sev}">
          <div class="ksc-alert-ico"><i data-lucide="${esc(a.icon)}"></i></div>
          <div class="ksc-alert-txt">
            <div class="ksc-alert-title">${esc(a.title)}</div>
            <div class="ksc-alert-desc">${esc(a.desc)}</div>
          </div>
          <button class="ksc-alert-cta" data-ksc-alert="${esc(a.go)}" data-ksc-aula="${a.aula ?? ''}" type="button">Ver</button>
        </div>`).join('')
      : `<div class="ksc-ok-state"><i data-lucide="check-circle-2"></i> Nada requiere atención ahora mismo. Todo en orden.</div>`;

    const feed = D.feed.length
      ? D.feed.slice(0, 16).map(f => `
        <div class="ksc-feed-item">
          <div class="ksc-feed-dot" style="--c:${f.color}"><i data-lucide="${esc(f.icon)}"></i></div>
          <div class="ksc-feed-txt">
            <div class="ksc-feed-title">${f.title}</div>
            <div class="ksc-feed-meta">${f.meta}</div>
          </div>
        </div>`).join('')
      : `<div class="ksc-empty"><i data-lucide="clock"></i><div>Sin actividad registrada hoy.</div></div>`;

    const rows = D.pool.map(a => this._aulaRow(a)).join('') ||
      `<tr><td colspan="7"><div class="ksc-empty">Sin aulas registradas.</div></td></tr>`;

    return `
      <div class="ksc-grid-2">
        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="alert-triangle"></i> Requiere atención</h3>
            <span class="ksc-panel-sub">${D.alerts.length} alerta${D.alerts.length === 1 ? '' : 's'}</span>
          </div>
          <div class="ksc-panel-body"><div class="ksc-alerts">${alerts}</div></div>
        </div>

        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="activity"></i> Estado general</h3>
            <span class="ksc-panel-sub">Salud de la estancia</span>
          </div>
          <div class="ksc-panel-body"><div class="ksc-bars">${health}</div></div>
        </div>
      </div>

      <div class="ksc-grid-2">
        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="list-checks"></i> Estado de aulas · hoy</h3>
            <span class="ksc-panel-sub">Clic en un aula para abrir su ficha</span>
          </div>
          <div class="dc-table-wrap">
            <table class="ksc-table">
              <thead>
                <tr>
                  <th>Aula</th><th>Maestra</th><th>Asistencia</th><th>Rutina</th>
                  <th>Publica.</th><th>Mensajes</th><th>Última actividad</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>

        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="zap"></i> Actividad de hoy</h3>
            <span class="ksc-panel-sub">${D.feed.length} eventos</span>
          </div>
          <div class="ksc-feed">${feed}</div>
        </div>
      </div>`;
  },

  _aulaRow(a) {
    const m = a.m;
    const att = m.attRecords > 0
      ? `<span class="ksc-chip ${m.noRecord === 0 ? 'ksc-chip--ok' : 'ksc-chip--warn'}">${m.present}/${m.nStudents}${m.noRecord ? ` · ${m.noRecord} sin registro` : ''}</span>`
      : `<span class="ksc-chip ksc-chip--muted">—</span>`;
    const rut = m.nStudents === 0
      ? '<span class="ksc-chip ksc-chip--muted">—</span>'
      : `<span class="ksc-chip ${m.routinePct >= 100 ? 'ksc-chip--ok' : m.routinePct > 0 ? 'ksc-chip--warn' : 'ksc-chip--danger'}">${m.routinePct}%</span>`;
    const pub = `<span class="ksc-chip ${m.postsToday > 0 ? 'ksc-chip--ok' : m.postsWeek > 0 ? 'ksc-chip--warn' : 'ksc-chip--danger'}">${m.postsToday} hoy</span>`;
    const msg = m.msgsPending.length
      ? `<span class="ksc-chip ${m.msgsPending.length >= 3 ? 'ksc-chip--danger' : 'ksc-chip--warn'}">${m.msgsPending.length} pend.</span>`
      : '<span class="ksc-chip ksc-chip--ok">0</span>';

    return `
      <tr data-ksc-open-aula="${a.id ?? ''}"${a.id == null ? ' style="opacity:.55;cursor:default"' : ''}>
        <td>
          <div class="ksc-cell-room">
            <i class="pip" style="--room:${esc(a.color)}"></i>
            <div><b>${esc(a.name)}</b><span>${m.nStudents} estudiantes${a.__placeholder ? ' · pendiente de crear' : ''}</span></div>
          </div>
        </td>
        <td>${esc(a.teacher?.name || 'Sin asignar')}</td>
        <td>${att}</td>
        <td>${rut}</td>
        <td>${pub}</td>
        <td>${msg}</td>
        <td>${m.lastActivity ? esc(this._relTime(m.lastActivity)) : '—'}</td>
      </tr>`;
  },

  /* ════════════════════════ VISTA: ORGANIZACIÓN ════════════════════════ */

  _renderOrganizacion() {
    const D = this._data;
    const nodes = D.aulas.map(a => {
      const m = a.m;
      const initial = (a.teacher?.name || a.name || '?').trim().charAt(0).toUpperCase();
      const chips = [
        `<span class="ksc-chip ksc-chip--info">${m.nStudents} estudiantes</span>`,
        m.attRecords ? `<span class="ksc-chip ${m.noRecord ? 'ksc-chip--warn' : 'ksc-chip--ok'}">${m.present} presentes</span>` : '',
        `<span class="ksc-chip ${m.routinePct >= 100 ? 'ksc-chip--ok' : m.routinePct > 0 ? 'ksc-chip--warn' : 'ksc-chip--muted'}">rutina ${m.routinePct}%</span>`,
        `<span class="ksc-chip ksc-chip--${m.postsWeek ? 'ok' : 'muted'}">${m.postsWeek} publica.</span>`,
        m.msgsPending.length ? `<span class="ksc-chip ksc-chip--danger">${m.msgsPending.length} mensajes</span>` : '',
      ].filter(Boolean).join('');

      const node = `
        <div class="ksc-node" style="--room:${esc(a.color)}" data-ksc-open-aula="${a.id}">
          <div class="ksc-node-av">${a.teacher?.avatar_url ? `<img src="${esc(a.teacher.avatar_url)}" alt="">` : esc(a.teacher?.name ? initial : '–')}</div>
          <div class="ksc-node-main">
            <div class="ksc-node-name">${esc(a.name)}</div>
            <div class="ksc-node-meta">${esc(a.teacher?.name || 'Sin maestra asignada')} · ${esc(a.__placeholder ? 'Aula del catálogo sin crear' : (a.__special ? 'Clase especial' : 'Aula activa'))}</div>
          </div>
          <div class="ksc-node-chips">${chips}</div>
          <div class="ksc-node-go"><i data-lucide="chevron-right"></i></div>
        </div>`;

      return a.id == null
        ? `<div class="ksc-node" style="opacity:.65;--room:#94A3B8;cursor:default">
             <div class="ksc-node-av">–</div>
             <div class="ksc-node-main">
               <div class="ksc-node-name">${esc(a.name)}</div>
               <div class="ksc-node-meta">Catálogo oficial · aún sin crear en la BD</div>
             </div>
             <div class="ksc-node-chips"><span class="ksc-chip ksc-chip--muted">inactiva</span></div>
           </div>`
        : node;
    }).join('');

    const orphans = this._data.pool.filter(p => p.__orphan && p.m.nStudents > 0);
    const orphanHtml = orphans.map(o => `
      <div class="ksc-node" style="--room:#F59E0B" data-ksc-open-aula="${esc(o.id)}">
        <div class="ksc-node-av">?</div>
        <div class="ksc-node-main">
          <div class="ksc-node-name">${esc(o.name)}</div>
          <div class="ksc-node-meta">${o.m.nStudents} estudiantes esperando asignación</div>
        </div>
        <div class="ksc-node-chips"><span class="ksc-chip ksc-chip--warn">revisar</span></div>
        <div class="ksc-node-go"><i data-lucide="chevron-right"></i></div>
      </div>`).join('');

    const unassigned = D.students.filter(s => !s.classroom_id).length;

    return `
      <div class="ksc-panel">
        <div class="ksc-panel-head">
          <h3 class="ksc-panel-title"><i data-lucide="network"></i> Organigrama de aulas</h3>
          <span class="ksc-panel-sub">Haz clic en un aula para abrir su ficha completa</span>
        </div>
        <div class="ksc-org">
          <div class="ksc-org-root">
            <i data-lucide="home"></i>
            <div>
              <b>Dirección · Encargada de Educación</b>
              <span>${D.kpis.aulas} aulas · ${D.kpis.estudiantes} estudiantes · ${D.kpis.maestras} maestras</span>
            </div>
          </div>
          <div class="ksc-org-branch">
            ${nodes}
            ${orphanHtml}
            ${unassigned > 0 ? `
              <div class="ksc-node" style="--room:#F59E0B;cursor:pointer" data-ksc-action="go-aulas">
                <div class="ksc-node-av"><i data-lucide="user-plus"></i></div>
                <div class="ksc-node-main">
                  <div class="ksc-node-name">${unassigned} estudiante${unassigned > 1 ? 's' : ''} sin aula</div>
                  <div class="ksc-node-meta">Asignar desde el módulo de Aulas</div>
                </div>
                <div class="ksc-node-go"><i data-lucide="chevron-right"></i></div>
              </div>` : ''}
          </div>
        </div>
      </div>`;
  },

  /* ════════════════════════ VISTA: FICHA DE AULA (DRILL-DOWN) ════════════════════════ */

  _findAula() {
    if (this._aulaId == null) return null;
    return this._data.pool.find(a => String(a.id) === String(this._aulaId)) || null;
  },

  _renderAula() {
    const a = this._findAula();
    if (!a) { this._tab = 'organizacion'; return this._renderOrganizacion(); }
    const D = this._data;
    const m = a.m;

    // Mensajes: % respondido con base en la semana de la escuela
    const respPct = m.msgsIn ? Math.round((m.msgsRead / m.msgsIn) * 100) : (m.msgsPending.length ? 0 : 100);
    const bars = [
      { label: 'Asistencia hoy', pct: m.nStudents ? Math.round((m.present / m.nStudents) * 100) : 0, color: '#0B63C7', note: `${m.present} presentes${m.absent ? ` · ${m.absent} ausentes` : ''}${m.noRecord ? ` · ${m.noRecord} sin registro` : ''}` },
      { label: 'Rutina / bitácora', pct: m.routinePct, color: '#16A34A', note: `${m.logs} de ${m.present || m.nStudents} estudiantes con bitácora de hoy` },
      { label: 'Publicaciones', pct: Math.min(100, Math.round((m.postsWeek / 7) * 100)), color: '#F59E0B', note: `${m.postsWeek} esta semana · ${m.postsToday} hoy` },
      { label: 'Mensajes respondidos', pct: respPct, color: '#7C3AED', note: `${m.msgsPending.length} pendientes · ${m.msgsIn} recibidos (7 días)` },
      { label: 'Actividades', pct: m.tasksWeek ? 100 : 0, color: '#EC4899', note: `${m.tasksWeek} creadas esta semana · ${m.tasksPending} por vencer` },
    ];

    const stats = [
      { icon: 'users',        label: 'Estudiantes',        value: m.nStudents,                       foot: `${a.capacity || 20} de cupo` },
      { icon: 'user-check',   label: 'Asistencia hoy',     value: m.attRecords ? `${m.present}/${m.nStudents}` : '—', foot: m.noRecord ? `${m.noRecord} sin registro` : 'completa' },
      { icon: 'list-checks',  label: 'Rutina',             value: m.routinePct + '%',                foot: m.routinePct >= 100 ? 'completada' : 'en curso' },
      { icon: 'megaphone',    label: 'Publicaciones',      value: m.postsWeek,                       foot: `${m.postsToday} hoy` },
      { icon: 'message-square', label: 'Mensajes',         value: m.msgsPending.length,              foot: 'pendientes' },
      { icon: 'clipboard-list', label: 'Actividades',      value: m.tasksWeek,                       foot: `${m.tasksPending} por vencer` },
      { icon: 'alert-triangle', label: 'Incidencias',      value: m.incidents.length,                foot: 'abiertas' },
      { icon: 'clock',        label: 'Última actividad',   value: m.lastActivity ? this._fmtTime(m.lastActivity) : '—', foot: m.lastActivity ? this._relDay(m.lastActivity) : 'sin movimientos' },
    ];

    // Plan del día
    const plan = m.planToday.length
      ? m.planToday.map(ev => {
          const st = this._planStatus(ev);
          return `
            <div class="ksc-list-item">
              <div class="ksc-list-av" style="background:${esc(ev.color || '#E8F2FF')};color:#fff">${esc((ev.label || '?').charAt(0))}</div>
              <div class="ksc-list-main">
                <div class="ksc-list-title">${esc(ev.label || ev.id || 'Evento')}</div>
                <div class="ksc-list-sub">${esc(ev.startTime || ev.time || '—')}${ev.duration ? ` · ${Number(ev.duration)} min` : ''}</div>
              </div>
              <span class="ksc-chip ${st.cls}">${st.txt}</span>
            </div>`;
        }).join('')
      : `<div class="ksc-empty"><i data-lucide="calendar"></i><div>Sin plan de rutina cargado para hoy.</div></div>`;

    // Eventos registrados hoy
    const reg = m.eventsToday.length
      ? m.eventsToday.slice(-14).reverse().map(ev => {
          const meta = evMeta(ev.event_type);
          return `
            <div class="ksc-list-item">
              <div class="ksc-list-av" style="background:${meta.color}1f;color:${meta.color}"><i data-lucide="${meta.icon}"></i></div>
              <div class="ksc-list-main">
                <div class="ksc-list-title">${esc(meta.label)}</div>
                <div class="ksc-list-sub">${esc(this._fmtTime(ev.event_time))}</div>
              </div>
              <span class="ksc-chip ksc-chip--ok">registrado</span>
            </div>`;
        }).join('')
      : `<div class="ksc-empty"><i data-lucide="clock"></i><div>Aún no se registran eventos de rutina hoy.</div></div>`;

    // Estudiantes
    const studs = m.students.length
      ? m.students.map(s => {
          const rec = this._attendanceOf(s.id);
          const chip = !rec ? '<span class="ksc-chip ksc-chip--muted">sin registro</span>'
            : rec.status === 'present' ? '<span class="ksc-chip ksc-chip--ok">presente</span>'
            : rec.status === 'late' ? '<span class="ksc-chip ksc-chip--warn">tarde</span>'
            : rec.status === 'absent' ? '<span class="ksc-chip ksc-chip--danger">ausente</span>'
            : `<span class="ksc-chip ksc-chip--info">${esc(rec.status)}</span>`;
          return `
            <div class="ksc-list-item clickable" data-ksc-student="${s.id}">
              <div class="ksc-list-av">${esc((s.name || '?').charAt(0).toUpperCase())}</div>
              <div class="ksc-list-main">
                <div class="ksc-list-title">${esc(s.name)}</div>
                <div class="ksc-list-sub">${s.birth_date ? '🎂 ' + esc(String(s.birth_date).slice(0, 10)) : 'Sin fecha de nacimiento'}</div>
              </div>
              ${chip}
            </div>`;
        }).join('')
      : `<div class="ksc-empty"><i data-lucide="users"></i><div>Sin estudiantes asignados a esta aula.</div></div>`;

    // Publicaciones recientes
    const pubs = (this._postsOf(a.id) || []).slice(0, 5);
    const pubHtml = pubs.length
      ? pubs.map(p => `
          <div class="ksc-list-item">
            <div class="ksc-list-av" style="background:#DCFCE7;color:#15803D"><i data-lucide="megaphone"></i></div>
            <div class="ksc-list-main">
              <div class="ksc-list-title">${esc(p.title || p.content || 'Publicación')}</div>
              <div class="ksc-list-sub">${esc(this._relTime(p.created_at))}${p.teacher_name ? ' · ' + esc(p.teacher_name) : ''}</div>
            </div>
          </div>`).join('')
      : `<div class="ksc-empty"><i data-lucide="megaphone"></i><div>Sin publicaciones en los últimos 7 días.</div></div>`;

    // Mensajes pendientes
    const msgs = m.msgsPending.length
      ? m.msgsPending.slice(0, 8).map(msg => `
          <div class="ksc-list-item">
            <div class="ksc-list-av" style="background:#FEF3C7;color:#B45309"><i data-lucide="message-square"></i></div>
            <div class="ksc-list-main">
              <div class="ksc-list-title">${esc(msg.sender?.name || 'Padre de familia')}</div>
              <div class="ksc-list-sub">${esc((msg.content || '').slice(0, 70))} · ${esc(this._relTime(msg.created_at))}</div>
            </div>
            <span class="ksc-chip ksc-chip--danger">pendiente</span>
          </div>`).join('')
      : `<div class="ksc-empty"><i data-lucide="check-circle-2"></i><div>Todo respondido. Sin mensajes pendientes.</div></div>`;

    return `
      <div class="ksc-crumb" style="margin-bottom:.7rem">
        <button data-ksc-action="back" type="button">Centro Escolar</button>
        <i data-lucide="chevron-right"></i>
        <button data-ksc-action="back" type="button">Organización</button>
        <i data-lucide="chevron-right"></i>
        <b style="color:var(--ksc-ink)">${esc(a.name)}</b>
      </div>

      <div class="ksc-room-head" style="--room:${esc(a.color)}">
        <div class="ksc-room-title">
          <div class="ksc-room-avatar">${a.teacher?.avatar_url ? `<img src="${esc(a.teacher.avatar_url)}" alt="">` : esc((a.teacher?.name || a.name || '?').charAt(0).toUpperCase())}</div>
          <div>
            <h2>${esc(a.name)}</h2>
            <p>${esc(a.teacher?.name || 'Sin maestra asignada')} · ${m.nStudents} estudiantes${a.capacity ? ` · cupo ${a.capacity}` : ''}</p>
          </div>
        </div>
        <div class="ksc-room-actions">
          <button class="ksc-mini-btn" data-ksc-action="go-asistencia" type="button"><i data-lucide="calendar-check"></i> Asistencia</button>
          <button class="ksc-mini-btn" data-ksc-action="go-muro" type="button"><i data-lucide="megaphone"></i> Muro</button>
          <button class="ksc-mini-btn" data-ksc-action="go-chat" type="button"><i data-lucide="message-square"></i> Chat</button>
          ${a.id != null && !String(a.id).startsWith('__') ? `<button class="ksc-mini-btn" data-ksc-action="edit-aula" data-ksc-id="${a.id}" type="button"><i data-lucide="pencil"></i> Editar</button>` : ''}
          <button class="ksc-mini-btn" data-ksc-action="back" type="button"><i data-lucide="arrow-left"></i> Volver</button>
        </div>
      </div>

      <div class="ksc-stats">
        ${stats.map(s => `
          <div class="ksc-stat">
            <div class="ksc-stat-label"><i data-lucide="${s.icon}"></i> ${esc(s.label)}</div>
            <div class="ksc-stat-value">${esc(s.value)}</div>
            <div class="ksc-stat-foot">${esc(s.foot)}</div>
          </div>`).join('')}
      </div>

      <div class="ksc-grid-2">
        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="target"></i> Indicadores</h3>
            <span class="ksc-panel-sub">${esc(D.weekRange)}</span>
          </div>
          <div class="ksc-panel-body"><div class="ksc-bars">
            ${bars.map(b => `
              <div class="ksc-bar">
                <div class="ksc-bar-head">
                  <span class="ksc-bar-label">${esc(b.label)}</span>
                  <span class="ksc-bar-value">${b.pct}%</span>
                </div>
                <div class="ksc-bar-track"><div class="ksc-bar-fill" style="--c:${b.color};width:${Math.max(3, b.pct || 0)}%"></div></div>
                <div class="ksc-bar-note">${esc(b.note)}</div>
              </div>`).join('')}
          </div></div>
        </div>

        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="calendar"></i> Rutina de hoy</h3>
            <span class="ksc-panel-sub">${m.eventsToday.length} eventos registrados</span>
          </div>
          <div class="ksc-list">${plan}</div>
          <div class="ksc-panel-head" style="border-top:1px solid var(--ksc-line)">
            <h3 class="ksc-panel-title"><i data-lucide="check-circle-2"></i> Registrado hoy</h3>
          </div>
          <div class="ksc-list">${reg}</div>
        </div>
      </div>

      <div class="ksc-grid-3">
        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="users"></i> Estudiantes</h3>
            <span class="ksc-panel-sub">${m.nStudents} · clic para abrir ficha</span>
          </div>
          <div class="ksc-list" style="max-height:340px;overflow-y:auto">${studs}</div>
        </div>

        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="megaphone"></i> Publicaciones</h3>
            <span class="ksc-panel-sub">${m.postsWeek} esta semana</span>
          </div>
          <div class="ksc-list">${pubHtml}</div>
        </div>

        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="message-square"></i> Mensajes pendientes</h3>
            <span class="ksc-panel-sub">${m.msgsPending.length} sin responder</span>
          </div>
          <div class="ksc-list">${msgs}</div>
        </div>
      </div>`;
  },

  /* ════════════════════════ VISTA: CALENDARIO ════════════════════════ */

  _calDate() {
    if (!this._calDateState) this._calDateState = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return this._calDateState;
  },

  calNav(dir) {
    const step = Number(dir);
    if (!step) {
      const now = new Date();
      this._calDateState = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      const d = this._calDate();
      this._calDateState = new Date(d.getFullYear(), d.getMonth() + step, 1);
    }
    this._render();
  },

  setCalFilter(f) {
    this._calFilter = f;
    this._render();
  },

  selectDay(day) {
    this._calSelected = day;
    this._render();
  },

  _renderCalendario() {
    const D = this._data;
    const base = this._calDate();
    const year = base.getFullYear();
    const month = base.getMonth();
    const today = this._todayISO();
    const filter = this._calFilter || 'todos';

    // Eventos indexados por día
    const byDay = new Map();
    const push = (day, type, title, time) => {
      if (!day) return;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({ type, title, time });
    };

    // Recorremos el pool completo (publicaciones + mensajes + incidencias + eventos)
    (D.posts || this._postsCache || []).forEach(p => {
      if (p.created_at) push(p.created_at.slice(0, 10), 'actividad', `Publicación · ${p.title || p.content || 'actividad'}`, p.created_at);
    });
    (D.tasks || []).forEach(t => {
      const day = t.due_date ? String(t.due_date).slice(0, 10) : (t.created_at ? t.created_at.slice(0, 10) : null);
      if (day) push(day, 'actividad', `Tarea · ${t.title || 'Actividad'}`, t.due_date || t.created_at);
    });
    D.aulas.forEach(a => {
      (a.m.eventsToday || []).forEach(ev => push(ev.event_date || today, 'actividad', `${a.name} · ${evMeta(ev.event_type).label}`, ev.event_time));
    });
    (D.meetings || []).forEach(m => {
      if (m.start_time) push(m.start_time.slice(0, 10), 'reunion', `Reunión · ${m.title || 'Sin título'}`, m.start_time);
    });

    // Incidencias + tareas vencidas como pendientes
    D.pool.forEach(a => {
      (a.m.incidents || []).forEach(i => {
        if (i.reported_at) push(i.reported_at.slice(0, 10), 'alerta', `${a.name} · incidencia`, i.reported_at);
      });
    });

    const typeMeta = {
      todos:       { label: 'Todos',        color: '#0B63C7' },
      actividad:   { label: 'Actividad',    color: '#0B63C7' },
      reunion:     { label: 'Reunión',      color: '#F59E0B' },
      alerta:      { label: 'Alerta',       color: '#EF4444' },
      asistencia:  { label: 'Asistencia',   color: '#16A34A' },
    };

    // Marcar días con asistencia registrada
    const attDays = new Set();
    D.pool.forEach(a => a.m.weekDates?.forEach(d => attDays.add(d)));
    attDays.forEach(d => push(d, 'asistencia', 'Asistencia registrada', null));

    const first = new Date(year, month, 1);
    const startDow = (first.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const dayNum = i - startDow + 1;
      let y = year, mth = month, n = dayNum, out = false;
      if (dayNum < 1) { n = prevDays + dayNum; mth = month - 1; out = true; if (mth < 0) { mth = 11; y--; } }
      else if (dayNum > daysInMonth) { n = dayNum - daysInMonth; mth = month + 1; out = true; if (mth > 11) { mth = 0; y++; } }
      const iso = `${y}-${String(mth + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      const evs = (byDay.get(iso) || []).filter(e => filter === 'todos' || e.type === filter);
      const dots = evs.slice(0, 4).map(e => `<i class="ksc-dot" style="--d:${typeMeta[e.type]?.color || '#0B63C7'}"></i>`).join('');
      cells.push(`
        <div class="ksc-day${out ? ' is-out' : ''}${iso === today ? ' is-today' : ''}${iso === this._calSelected ? ' is-selected' : ''}"
             data-ksc-cal-day="${iso}" title="${esc(evs.map(e => e.title).join('\n'))}">
          <span class="ksc-day-num">${n}</span>
          <div class="ksc-day-dots">${dots}</div>
          ${evs.length ? `<span class="ksc-day-count">${evs.length} ev.</span>` : ''}
        </div>`);
      if (i >= 34 && dayNum > daysInMonth) break;
    }

    const sel = this._calSelected || today;
    const selEvents = (byDay.get(sel) || []).filter(e => filter === 'todos' || e.type === filter);
    const eventList = selEvents.length
      ? selEvents.map(e => `
          <div class="ksc-event-item">
            <span class="ksc-event-time">${e.time ? esc(this._fmtTime(e.time)) : 'todo el día'}</span>
            <div class="ksc-list-main">
              <div class="ksc-list-title">${esc(e.title)}</div>
              <div class="ksc-list-sub"><span class="ksc-chip" style="background:${(typeMeta[e.type]?.color || '#0B63C7')}1f;color:${typeMeta[e.type]?.color || '#0B63C7'}">${esc(typeMeta[e.type]?.label || e.type)}</span></div>
            </div>
          </div>`).join('')
      : `<div class="ksc-empty"><i data-lucide="calendar"></i><div>Sin eventos para el ${esc(this._fmtShortDate(sel))}.</div></div>`;

    // Planificador: años escolares + periodos
    const years = D.years.map(y => {
      const start = y.start_date ? new Date(y.start_date) : null;
      const end = y.end_date ? new Date(y.end_date) : null;
      let pct = 0;
      if (start && end) {
        const now = Date.now();
        pct = Math.max(0, Math.min(100, Math.round(((now - start.getTime()) / (end.getTime() - start.getTime())) * 100)));
      }
      return `
        <div class="ksc-period">
          <div style="display:flex;justify-content:space-between;gap:.6rem;align-items:center">
            <div class="ksc-period-name">${esc(y.name)} ${y.is_current ? '<span class="ksc-chip ksc-chip--ok">en curso</span>' : ''}</div>
            <div class="ksc-period-dates">${y.start_date ? esc(String(y.start_date).slice(0, 10)) : ''} → ${y.end_date ? esc(String(y.end_date).slice(0, 10)) : ''}</div>
          </div>
          <div class="ksc-period-track"><div class="ksc-period-fill" style="width:${pct}%"></div></div>
        </div>`;
    }).join('') || `<div class="ksc-empty">Sin años escolares registrados.</div>`;

    const periods = D.periods.slice(0, 8).map(p => {
      const s = p.start_date ? new Date(p.start_date) : null;
      const e = p.end_date ? new Date(p.end_date) : null;
      let pct = 0;
      if (s && e) pct = Math.max(0, Math.min(100, Math.round(((Date.now() - s.getTime()) / (e.getTime() - s.getTime())) * 100)));
      const cls = p.status === 'closed' ? 'ksc-chip--muted' : p.status === 'active' ? 'ksc-chip--ok' : 'ksc-chip--info';
      return `
        <div class="ksc-period">
          <div style="display:flex;justify-content:space-between;gap:.6rem;align-items:center">
            <div class="ksc-period-name">${esc(p.name || 'Periodo')}</div>
            <span class="ksc-chip ${cls}">${esc(p.status || 'programado')}</span>
          </div>
          <div class="ksc-period-dates">${p.start_date ? esc(String(p.start_date).slice(0, 10)) : '—'} → ${p.end_date ? esc(String(p.end_date).slice(0, 10)) : '—'}</div>
          <div class="ksc-period-track"><div class="ksc-period-fill" style="width:${pct}%"></div></div>
        </div>`;
    }).join('') || `<div class="ksc-empty">Sin periodos definidos. Créalos en Ciclo Escolar.</div>`;

    const monthName = base.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    return `
      <div class="ksc-cal">
        <div class="ksc-panel">
          <div class="ksc-cal-head">
            <div class="ksc-cal-month">${esc(monthName)}</div>
            <div class="ksc-cal-nav">
              <button class="ksc-nav-btn" data-ksc-nav="-1" type="button" aria-label="Mes anterior"><i data-lucide="chevron-left"></i></button>
              <button class="ksc-nav-btn" data-ksc-nav="0" type="button" aria-label="Hoy" title="Hoy"><i data-lucide="target"></i></button>
              <button class="ksc-nav-btn" data-ksc-nav="1" type="button" aria-label="Mes siguiente"><i data-lucide="chevron-right"></i></button>
            </div>
          </div>
          <div class="ksc-cal-filters">
            ${Object.entries(typeMeta).map(([k, v]) => `
              <button class="ksc-filter${filter === k ? ' active' : ''}" data-ksc-cal-filter="${k}" type="button">${esc(v.label)}</button>`).join('')}
          </div>
          <div class="ksc-cal-grid">
            ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="ksc-cal-dow">${d}</div>`).join('')}
            ${cells.join('')}
          </div>
          <div class="ksc-legend">
            ${Object.entries(typeMeta).filter(([k]) => k !== 'todos').map(([, v]) => `
              <span><i class="ksc-dot" style="--d:${v.color}"></i> ${esc(v.label)}</span>`).join('')}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:1rem">
          <div class="ksc-panel">
            <div class="ksc-panel-head">
              <h3 class="ksc-panel-title"><i data-lucide="calendar"></i> ${esc(this._fmtShortDate(sel))}</h3>
              <span class="ksc-panel-sub">${selEvents.length} evento${selEvents.length === 1 ? '' : 's'}</span>
            </div>
            <div>${eventList}</div>
          </div>

          <div class="ksc-panel">
            <div class="ksc-panel-head">
              <h3 class="ksc-panel-title"><i data-lucide="layers"></i> Planificador del año escolar</h3>
              <span class="ksc-panel-sub">${D.years.length} ciclo${D.years.length === 1 ? '' : 's'}</span>
            </div>
            <div class="ksc-panel-body">${years}</div>
            <div class="ksc-panel-head" style="border-top:1px solid var(--ksc-line)">
              <h3 class="ksc-panel-title"><i data-lucide="list-checks"></i> Periodos</h3>
              <span class="ksc-panel-sub">${D.periods.length} definidos</span>
            </div>
            <div class="ksc-panel-body">${periods}</div>
          </div>
        </div>
      </div>`;
  },

  /* ════════════════════════ VISTA: MONITOREO ════════════════════════ */

  _renderMonitoreo() {
    const D = this._data;
    const staffById = new Map(D.staff.map(s => [s.id, s]));

    const rows = [];
    D.aulas.filter(a => a.id).forEach(a => {
      const m = a.m;
      rows.push({
        id: a.teacher_id, name: a.teacher?.name || 'Sin asignar', role: 'Maestra', aula: a.name, color: a.color,
        rutina: m.routinePct, publicaciones: m.postsWeek, actividades: m.tasksWeek,
        recibidos: m.msgsIn, pendientes: m.msgsPending.length,
        respMs: m.respMs, ultima: m.lastActivity, incidencias: m.incidents.length,
        avatar: a.teacher?.avatar_url || null,
      });
    });
    // Personal sin aula (encargada / asistente) — seguimiento de mensajes
    const assignedIds = new Set(D.aulas.map(a => a.teacher_id).filter(Boolean));
    D.staff.filter(s => s.role === 'encargada' || s.role === 'asistente').forEach(s => {
      if (assignedIds.has(s.id)) return;
      const acc = D.respAcc?.get?.(s.id) || [];
      rows.push({
        id: s.id, name: s.name, role: s.role === 'encargada' ? 'Encargada' : 'Asistente', aula: '—', color: '#7C3AED',
        rutina: null, publicaciones: 0, actividades: 0,
        recibidos: acc.length, pendientes: (D.msgUnread || []).filter(m => m.receiver_id === s.id).length,
        respMs: acc.length ? acc.reduce((x, y) => x + y, 0) / acc.length : null,
        ultima: null, incidencias: 0, avatar: s.avatar_url || null,
      });
    });

    rows.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const tbody = rows.length ? rows.map(r => `
      <tr>
        <td>
          <div class="ksc-teacher-cell">
            <div class="ksc-avatar-sm">${r.avatar ? `<img src="${esc(r.avatar)}" alt="">` : esc((r.name || '?').charAt(0).toUpperCase())}</div>
            <div><b>${esc(r.name)}</b><span>${esc(r.role)}</span></div>
          </div>
        </td>
        <td>${r.aula === '—' ? '<span class="ksc-chip ksc-chip--muted">—</span>' : `<span class="ksc-chip" style="background:${esc(r.color)}1f;color:${esc(r.color)}">${esc(r.aula)}</span>`}</td>
        <td>${r.rutina == null ? '<span class="ksc-chip ksc-chip--muted">—</span>' : `<span class="ksc-chip ${r.rutina >= 100 ? 'ksc-chip--ok' : r.rutina > 0 ? 'ksc-chip--warn' : 'ksc-chip--danger'}">${r.rutina}%</span>`}</td>
        <td>${r.publicaciones}</td>
        <td>${r.actividades}</td>
        <td>${r.recibidos}</td>
        <td>${r.pendientes ? `<span class="ksc-chip ${r.pendientes >= 3 ? 'ksc-chip--danger' : 'ksc-chip--warn'}">${r.pendientes}</span>` : '<span class="ksc-chip ksc-chip--ok">0</span>'}</td>
        <td>${r.respMs == null ? '<span class="ksc-chip ksc-chip--muted">—</span>' : `<span class="ksc-chip ${r.respMs <= 3600e3 ? 'ksc-chip--ok' : r.respMs <= 7200e3 ? 'ksc-chip--warn' : 'ksc-chip--danger'}">${esc(this._fmtDuration(r.respMs))}</span>`}</td>
        <td>${r.ultima ? esc(this._fmtTime(r.ultima)) : '—'}</td>
      </tr>`).join('')
      : `<tr><td colspan="9"><div class="ksc-empty">Sin personal registrado.</div></td></tr>`;

    // Resumen de mensajes pendientes por aula
    const pend = D.aulas.filter(a => a.id && a.m.msgsPending.length).sort((a, b) => b.m.msgsPending.length - a.m.msgsPending.length);
    const pendHtml = pend.length ? pend.map(a => `
      <div class="ksc-list-item clickable" data-ksc-open-aula="${a.id}">
        <div class="ksc-list-av" style="background:${esc(a.color)}1f;color:${esc(a.color)}"><i data-lucide="message-square"></i></div>
        <div class="ksc-list-main">
          <div class="ksc-list-title">${esc(a.name)}</div>
          <div class="ksc-list-sub">${esc(a.teacher?.name || 'Sin maestra')}</div>
        </div>
        <span class="ksc-chip ${a.m.msgsPending.length >= 3 ? 'ksc-chip--danger' : 'ksc-chip--warn'}">${a.m.msgsPending.length} pendientes</span>
      </div>`).join('')
      : `<div class="ksc-empty"><i data-lucide="check-circle-2"></i><div>No hay mensajes sin responder.</div></div>`;

    // Tiempo promedio de respuesta
    const resp = rows.filter(r => r.respMs != null).sort((a, b) => a.respMs - b.respMs);
    const respHtml = resp.length ? resp.map(r => {
      const cls = r.respMs <= 3600e3 ? 'ksc-chip--ok' : r.respMs <= 7200e3 ? 'ksc-chip--warn' : 'ksc-chip--danger';
      return `
        <div class="ksc-list-item">
          <div class="ksc-avatar-sm">${r.avatar ? `<img src="${esc(r.avatar)}" alt="">` : esc((r.name || '?').charAt(0).toUpperCase())}</div>
          <div class="ksc-list-main">
            <div class="ksc-list-title">${esc(r.name)}</div>
            <div class="ksc-list-sub">${esc(r.aula)}</div>
          </div>
          <span class="ksc-chip ${cls}">${esc(this._fmtDuration(r.respMs))}</span>
        </div>`;
    }).join('')
      : `<div class="ksc-empty"><i data-lucide="clock"></i><div>Sin datos de respuesta esta semana.</div></div>`;

    return `
      <div class="ksc-panel">
        <div class="ksc-panel-head">
          <h3 class="ksc-panel-title"><i data-lucide="activity"></i> Monitoreo de maestras</h3>
          <span class="ksc-panel-sub">Indicador operativo de seguimiento · ${esc(D.weekRange)}</span>
        </div>
        <div class="dc-table-wrap">
          <table class="ksc-table">
            <thead>
              <tr>
                <th>Maestra</th><th>Aula</th><th>Rutina hoy</th><th>Publica.</th>
                <th>Actividades</th><th>Mensajes</th><th>Pendientes</th><th>Tiempo resp.</th><th>Última</th>
              </tr>
            </thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>

      <div class="ksc-grid-2">
        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="message-square"></i> Mensajes pendientes por aula</h3>
            <span class="ksc-panel-sub">${D.kpis.mensajes} en total</span>
          </div>
          <div class="ksc-list">${pendHtml}</div>
        </div>

        <div class="ksc-panel">
          <div class="ksc-panel-head">
            <h3 class="ksc-panel-title"><i data-lucide="clock"></i> Tiempo promedio de respuesta</h3>
            <span class="ksc-panel-sub">Seguimiento operativo, no punitivo</span>
          </div>
          <div class="ksc-list">${respHtml}</div>
        </div>
      </div>`;
  },

  /* ════════════════════════ VISTA: REPORTES ════════════════════════ */

  _renderReportes() {
    const D = this._data;
    const pool = D.aulas.filter(a => a.id);
    if (!pool.length) return `<div class="ksc-panel"><div class="ksc-empty">Sin aulas para reportar.</div></div>`;

    if (!this._reportId || !pool.some(a => String(a.id) === String(this._reportId))) {
      this._reportId = String(pool[0].id);
    }
    const a = pool.find(x => String(x.id) === String(this._reportId)) || pool[0];
    const m = a.m;

    const obs = [];
    if (m.nStudents > 0 && m.attRecords === 0) obs.push('Aún no se registra asistencia de hoy en el aula.');
    else if (m.noRecord > 0) obs.push(`${m.noRecord} estudiante(s) sin registro de asistencia hoy: verificar pase de lista.`);
    if (m.routinePct < 100 && m.nStudents > 0) obs.push(`La bitácora del día está al ${m.routinePct}%: falta completar registros.`);
    if (m.msgsPending.length) obs.push(`${m.msgsPending.length} mensaje(s) de padres sin respuesta: priorizar respuesta hoy.`);
    if (!m.postsWeek) obs.push('Sin publicaciones en la última semana: recomendar actividad al muro escolar.');
    if (m.incidents.length) obs.push(`${m.incidents.length} incidencia(s) abierta(s) para dar seguimiento.`);
    if (!a.teacher_id && m.nStudents) obs.push('El aula no tiene maestra asignada: riesgo operativo.');
    if (!obs.length) obs.push('Desempeño operativo dentro de los esperado. Sin observaciones críticas.');

    const metrics = [
      { span: 'Estudiantes', value: m.nStudents, note: `cupo ${a.capacity || 20}` },
      { span: 'Asistencia (7 días)', value: m.attWeekPct + '%', note: `${m.weekRecords || 0} registros` },
      { span: 'Rutina de hoy', value: m.routinePct + '%', note: `${m.logs} bitácoras` },
      { span: 'Publicaciones', value: m.postsWeek, note: `${m.postsToday} hoy` },
      { span: 'Actividades', value: m.tasksWeek, note: `${m.tasksPending} por vencer` },
      { span: 'Mensajes recibidos', value: m.msgsIn, note: `${m.msgsPending.length} pendientes` },
      { span: 'Mensajes respondidos', value: m.msgsIn ? m.msgsRead : '—', note: m.msgsIn ? `${Math.round((m.msgsRead / m.msgsIn) * 100)}%` : 'sin datos' },
      { span: 'Incidencias', value: m.incidents.length, note: 'abiertas' },
    ];

    const chips = pool.map(x => `
      <button class="ksc-room-chip${String(x.id) === String(this._reportId) ? ' active' : ''}"
              style="--room:${esc(x.color)}" data-ksc-report="${x.id}" type="button">
        <i></i> ${esc(x.name)}
      </button>`).join('');

    return `
      <div class="ksc-panel" style="margin-bottom:1rem">
        <div class="ksc-panel-head">
          <h3 class="ksc-panel-title"><i data-lucide="file-text"></i> Reporte semanal de aula</h3>
          <span class="ksc-panel-sub">Periodo ${esc(D.weekRange)}</span>
        </div>
        <div class="ksc-chips-row" style="padding-top:1rem">${chips}</div>
      </div>

      <div id="kscReportPaper" style="background:#fff;border:1px solid var(--ksc-line);border-radius:var(--ksc-radius);overflow:hidden">
        <div class="ksc-report-head">
          <div>
            <h3>REPORTE SEMANAL — ${esc(a.name)}</h3>
            <p>Colegio Montessori Sonrisas Creativas · Periodo ${esc(D.weekRange)} · ${esc(this._fmtShortDate(D.today))}</p>
            <p>Maestra: ${esc(a.teacher?.name || 'Sin asignar')} · Estudiantes: ${m.nStudents}</p>
          </div>
          <div class="ksc-report-actions">
            <button class="ksc-mini-btn" data-ksc-action="export-csv" type="button"><i data-lucide="download"></i> CSV</button>
            <button class="ksc-mini-btn" data-ksc-action="export-pdf" type="button"><i data-lucide="printer"></i> Exportar PDF</button>
          </div>
        </div>

        <div class="ksc-report-grid">
          ${metrics.map(x => `
            <div class="ksc-report-metric">
              <span>${esc(x.span)}</span>
              <b>${esc(x.value)}</b>
              <em>${esc(x.note)}</em>
            </div>`).join('')}
        </div>

        <div class="ksc-obs">
          <b>Observaciones</b>
          <ul>${obs.map(o => `<li>${esc(o)}</li>`).join('')}</ul>
        </div>
      </div>`;
  },

  /* ════════════════════════ EXPORTACIÓN ════════════════════════ */

  exportCsv() {
    const D = this._data;
    const pool = D.aulas.filter(a => a.id);
    const head = ['Aula', 'Maestra', 'Estudiantes', 'Asistencia hoy', 'Asistencia 7d', 'Rutina hoy %', 'Publicaciones 7d', 'Publicaciones hoy', 'Mensajes recibidos', 'Mensajes pendientes', 'Actividades', 'Incidencias'];
    const lines = [head.join(';')];
    pool.forEach(a => {
      const m = a.m;
      lines.push([
        a.name, a.teacher?.name || 'Sin asignar', m.nStudents,
        `${m.present}/${m.nStudents}`, m.attWeekPct + '%', m.routinePct,
        m.postsWeek, m.postsToday, m.msgsIn, m.msgsPending.length,
        m.tasksWeek, m.incidents.length,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `centro-escolar_${this._todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    Helpers.toast('Reporte CSV descargado', 'success');
  },

  async exportPdf() {
    const paper = document.getElementById('kscReportPaper');
    if (!paper) return Helpers.toast('Selecciona un aula para exportar', 'warning');

    if (window.html2pdf) {
      try {
        const clone = paper.cloneNode(true);
        clone.style.cssText = 'position:fixed;left:0;top:0;width:820px;background:#fff;opacity:0.01;pointer-events:none;z-index:-1';
        clone.querySelectorAll('button').forEach(b => b.remove());
        document.body.appendChild(clone);
        await new Promise(r => setTimeout(r, 350));
        const aula = (this._data?.aulas || []).find(x => String(x.id) === String(this._reportId));
        await html2pdf().set({
          margin: [8, 8, 8, 8],
          filename: `Reporte_${(aula?.name || 'aula').replace(/[^\w\sáéíóúñ-]/gi, '')}_${this._todayISO()}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
        }).from(clone).save();
        document.body.removeChild(clone);
        Helpers.toast('Reporte PDF generado', 'success');
        return;
      } catch (e) {
        console.warn('[CentroEscolar] html2pdf error', e);
      }
    }

    // Fallback: impresión nativa
    const win = window.open('', '_blank');
    if (!win) return Helpers.toast('No se pudo abrir la ventana de impresión', 'error');
    win.document.write(`<html><head><title>Reporte semanal</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
      h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:13px}
      td,th{border:1px solid #cbd5e1;padding:6px;text-align:left}</style></head>
      <body>${paper.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  },

  /* ════════════════════════ UTILIDADES ════════════════════════ */

  _attendanceOf(studentId) {
    return this._attIndex?.get?.(studentId) || null;
  },

  _planAppliesToday(ev) {
    const dow = new Date().getDay();
    if (Array.isArray(ev.days) && ev.days.length && !ev.days.includes(dow)) return false;
    if (ev.active === false) return false;
    return true;
  },

  _planStatus(ev) {
    const t = ev.startTime || ev.time;
    if (!t) return { txt: 'planificado', cls: 'ksc-chip--info' };
    const [h, mi] = String(t).split(':').map(Number);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, mi || 0);
    const end = new Date(start.getTime() + (Number(ev.duration) || 30) * 60000);
    if (now > end) return { txt: 'completado', cls: 'ksc-chip--ok' };
    if (now >= start) return { txt: 'en curso', cls: 'ksc-chip--warn' };
    return { txt: 'pendiente', cls: 'ksc-chip--info' };
  },

  _postsOf(classroomId) {
    const posts = this._postsCache || [];
    if (classroomId == null) return posts;
    return posts.filter(p => String(p.classroom_id) === String(classroomId));
  },

  _todayISO() { return this._dateISO(new Date()); },

  _dateISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  _fmtTime(ts) {
    if (!ts) return '—';
    const d = typeof ts === 'string' && ts.length <= 10 ? new Date(ts + 'T00:00:00') : new Date(ts);
    if (isNaN(d)) return '—';
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  },

  _fmtShortDate(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).length <= 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  _relDay(ts) {
    const d = new Date(ts);
    const today = this._todayISO();
    const iso = this._dateISO(d);
    if (iso === today) return 'Hoy';
    const y = this._dateISO(new Date(Date.now() - 864e5));
    if (iso === y) return 'Ayer';
    return this._fmtShortDate(iso);
  },

  _relTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d)) return '—';
    return `${this._relDay(ts)} — ${this._fmtTime(ts)}`;
  },

  _fmtDuration(ms) {
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const rest = min % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
  },
};

/** Promedio entero (0 si no hay datos). */
function avg(list) {
  const arr = (list || []).filter(v => Number.isFinite(v));
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function maxTs(current, ts) {
  if (!ts) return current || null;
  return current ? Math.max(current, ts) : ts;
}

window.App = window.App || {};
window.App.centro = SchoolCenterModule;
