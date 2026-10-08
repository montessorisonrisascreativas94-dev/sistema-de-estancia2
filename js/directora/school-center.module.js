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
import { supabase, sendPush as _scSendPush, fetchPostgREST, forceRefreshToken } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { StudentRecordModal } from '../shared/student-record-modal.js';
import { openGlobalModal, closeGlobalModal as _scCloseModal } from '../shared/modal.js';
import SupervisionEngine from '../shared/supervision.js';
import {
  CANONICAL_CLASSROOMS,
  SPECIAL_CLASSROOMS_META,
  findCanonicalClassroom,
  findSpecialClassroom,
  sanitizeClassroomDisplayName,
  dedupeClassrooms,
} from '../shared/constants.js';

const esc = (v) => Helpers.escapeHTML(v == null ? '' : String(v));

// 👁️ Motor de supervisión expuesto globalmente (disponible en todo el panel)
window.SupervisionEngine = SupervisionEngine;

const TABS = [
  { id: 'resumen',     label: 'Resumen',     icon: 'gauge' },
  { id: 'organizacion',label: 'Organización',icon: 'network' },
  { id: 'calendario',  label: 'Calendario',  icon: 'calendar' },
  { id: 'monitoreo',   label: 'Monitoreo',   icon: 'activity' },
  { id: 'reportes',    label: 'Reportes',    icon: 'file-text' },
  { id: 'intervenciones', label: 'Intervenciones', icon: 'siren' },
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
  _intFilter: 'open',
  _intList: [],
  _intNames: { rooms: {}, profs: {} },
  _intPromise: null,

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
    const crId = el?.dataset?.kscClassroom;
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
      case 'replyMsgs':
      case 'replyMsgsFromChip':
        if (crId && crId !== 'undefined' && crId !== '') this.openReplyMessagesModal(crId);
        break;
      case 'newPost':
        if (crId && crId !== 'undefined' && crId !== '') this.openNewPostModal(crId);
        break;
      case 'newEvent':
        if (crId && crId !== 'undefined' && crId !== '') this.openNewEventModal(crId);
        break;
      case 'superviseAula':
      case 'superviseAulaFromAlert': {
        if (!crId || crId === 'undefined' || crId === '') {
          Helpers.toast('Aula inválida para supervisión', 'error');
          break;
        }
        const aula = this._locateAula(crId);
        if (!aula) {
          Helpers.toast('Aula no encontrada en Centro Escolar', 'error');
          break;
        }
        const alertType  = el?.dataset?.kscAlertType  || null;
        const alertText  = el?.dataset?.kscAlertText  || null;
        const sectionJump = this._sectionJumpForAlert(alertType, el?.dataset?.kscGo);
        try {
          if (typeof window !== 'undefined') window.SupervisionEngine = SupervisionEngine;
        } catch (_) {}
        SupervisionEngine.enter({
          classroomId:   aula.id,
          classroomName: aula.name,
          teacherId:     aula.teacher_id || null,
          teacherName:   aula.teacher?.name || null,
          moduleOrigin:  action === 'superviseAulaFromAlert' ? `alerta:${alertType || 'sem'}` : 'centro-escolar',
          jumpToSection: sectionJump,
          alertType,
          alertText,
          source:        action
        }).then((ok) => {
          if (!ok) return;
          const ctx = SupervisionEngine.getContext();
          const qp = new URLSearchParams({
            supervision:   'true',
            classroomId:   String(ctx.classroomId || ''),
            classroomName: ctx.classroomName || '',
            teacherId:     ctx.teacherId ? String(ctx.teacherId) : '',
            teacherName:   ctx.teacherName || '',
            originModule:  ctx.moduleOrigin || 'centro-escolar'
          });
          if (sectionJump) qp.set('jumpTo', sectionJump);
          if (alertType)  qp.set('alertType', alertType);
          if (alertText)  qp.set('alertText', alertText);
          window.location.href = 'panel-maestra.html?' + qp.toString();
        });
        break;
      }
      case 'int-filter': {
        this._intFilter = el.dataset.kscIntFilter || 'open';
        this._render();
        break;
      }
      case 'int-create': {
        if (window.SupervisionEngine?.isActive?.()) {
          window.SupervisionEngine.openInterventionModal({});
        } else {
          Helpers.toast('Inicia el modo supervisión desde una ficha de aula para crear intervenciones.', 'info');
        }
        break;
      }
      case 'int-open':
      case 'int-close': {
        const rid = el?.dataset?.kscIntId;
        if (rid) this._openInterventionDetail(rid);
        break;
      }
      case 'new-activity': {
        const iso = el?.dataset?.kscDate || this._calSelected || this._todayISO();
        this.openNewActivityModal({ scheduled_date: iso });
        break;
      }
      case 'save-activity': {
        this._submitActivityModal();
        break;
      }
      default: break;
    }
  },

  /* ── Actividades Escolares (Planificación Central Staff) ── */

  /**
   * Abre el modal "Nueva Actividad" SaaS Premium.
   * Diseñado para Directora / Asistente / Encargada — ellos crean/planifican,
   * Maestra solo visualiza y registra evidencia individual (aunque ese
   * detalle del registro individual irá en su panel maestra).
   */
  openNewActivityModal(prefill = {}) {
    const D = this._data || {};
    const rooms = (D.aulas || []).filter(a => a.id);
    const staff = (D.staff || []).filter(s => s.role === 'maestra');
    const today = prefill.scheduled_date || this._todayISO();

    const typeOpts = [
      ['academica',        'Académica',         'book-open',        '#0B63C7'],
      ['extracurricular',  'Extracurricular',   'sparkles',         '#7C3AED'],
      ['cierre_periodo',   'Cierre Periodo',    'flag',             '#DB2777'],
      ['evaluacion',       'Evaluación',        'clipboard-check',  '#EA580C'],
      ['reunion_padres',   'Reunión Padres',    'users',            '#F59E0B'],
      ['excursion',        'Excursión',         'bus',              '#0891B2'],
      ['admin',            'Administrativa',    'file-cog',         '#64748B'],
      ['otra',             'Otra',              'pin',              '#475569'],
    ];
    const audienceOpts = [
      ['aula',            'Solo aula'],
      ['nivel',           'Nivel completo'],
      ['todo_el_centro',  'Todo el centro'],
      ['staff',           'Solo staff'],
    ];
    const priorityOpts = [
      ['baja',     'Baja',     '#22C55E'],
      ['media',    'Media',    '#F59E0B'],
      ['alta',     'Alta',     '#EF4444'],
      ['critica',  'Crítica',  '#B91C1C'],
    ];
    const statusOpts = [
      ['scheduled', 'Programada'],
      ['published', 'Publicada (visible padres)'],
      ['draft',     'Borrador'],
    ];

    const modalId = 'ksc_newActivity';
    const html = `
    <div class="spv-modal-backdrop" id="${modalId}_backdrop" data-ksc-close-activity="1">
      <div class="spv-modal spv-modal--xl" onclick="event.stopPropagation()" role="dialog" aria-modal="true"
           style="max-width:980px;border-radius:28px;border:3px solid rgba(13,71,161,.08);
                  box-shadow:0 24px 60px rgba(15,23,42,.28);overflow:hidden;background:var(--ksc-bg)">
        <!-- 🔝 HEADER GRADIENTE SAAS PREMIUM -->
        <div style="position:relative;padding:2.2rem 2.4rem 1.8rem;background:linear-gradient(135deg,#6D28D9 0%,#0B63C7 100%);color:#fff">
          <button type="button" class="spv-close" data-ksc-close-activity="1" aria-label="Cerrar">×</button>
          <div style="display:flex;align-items:center;gap:1.1rem;flex-wrap:wrap">
            <div style="width:56px;height:56px;border-radius:18px;background:rgba(255,255,255,.15);
                        display:flex;align-items:center;justify-content:center;backdrop-filter: blur(6px);
                        box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)">
              <i data-lucide="calendar-plus" style="width:28px;height:28px;color:#fff"></i>
            </div>
            <div style="flex:1;min-width:220px">
              <h2 style="margin:0;font-size:1.6rem;font-weight:800;letter-spacing:-.3px">Nueva Actividad Escolar</h2>
              <p style="margin:.35rem 0 0;color:rgba(255,255,255,.86);font-size:.96rem">
                Planificación central del Staff. Las actividades publicadas se mostrarán en el panel de la maestra y serán visibles solo lectura en el panel del padre.
              </p>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;min-width:420px">
              <div class="spv-kpi-sp" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)">
                <span>📚 Total aulas</span><b>${rooms.length}</b>
              </div>
              <div class="spv-kpi-sp" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)">
                <span>👩‍🏫 Maestras</span><b>${staff.length}</b>
              </div>
              <div class="spv-kpi-sp" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)">
                <span>📅 Fecha</span><b>${this._fmtShortDate(today)}</b>
              </div>
            </div>
          </div>
        </div>

        <!-- 📋 BODY -->
        <div style="padding:1.8rem 2.4rem 2rem;display:flex;flex-direction:column;gap:1.5rem">

          <!-- Fila 1: Título + Tipo -->
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:1.2rem">
            <label class="spv-field">
              <span><i data-lucide="type"></i> Título de la actividad <em>*</em></span>
              <input type="text" id="kscAct_title" maxlength="180" placeholder="Ej: Exposición de ciencias de Párvulos"
                     value="${esc(prefill.title || '')}">
            </label>
            <label class="spv-field">
              <span><i data-lucide="tag"></i> Tipo de actividad</span>
              <select id="kscAct_type">
                ${typeOpts.map(([v,l,i,c]) => `<option value="${v}" ${prefill.activity_type===v?'selected':''}>${l}</option>`).join('')}
              </select>
            </label>
          </div>

          <!-- Fila 2: Aula / Audiencia + Responsable -->
          <div style="display:grid;grid-template-columns:1.2fr 1.1fr 1fr;gap:1.2rem">
            <label class="spv-field">
              <span><i data-lucide="school"></i> Aula asignada <small>(vacío = todo el centro)</small></span>
              <select id="kscAct_classroom">
                <option value="">— Todo el centro / Sin aula —</option>
                ${rooms.map(r => `<option value="${r.id}" ${String(prefill.classroom_id||'')===String(r.id)?'selected':''}>${esc(r.name)} ${r.level ? '· ' + esc(r.level) : ''}</option>`).join('')}
              </select>
            </label>
            <label class="spv-field">
              <span><i data-lucide="users"></i> Audiencia</span>
              <select id="kscAct_audience">
                ${audienceOpts.map(([v,l]) => `<option value="${v}" ${prefill.target_audience===v?'selected':''}>${l}</option>`).join('')}
              </select>
            </label>
            <label class="spv-field">
              <span><i data-lucide="user-check"></i> Maestra responsable</span>
              <select id="kscAct_assigned">
                <option value="">— Sin asignar —</option>
                ${staff.map(s => `<option value="${s.id}" ${String(prefill.assigned_to||'')===String(s.id)?'selected':''}>${esc(s.name)}</option>`).join('')}
              </select>
            </label>
          </div>

          <!-- Fila 3: Fecha + Hora + Duración + Ubicación -->
          <div style="display:grid;grid-template-columns:1fr .8fr .8fr 1fr;gap:1.2rem">
            <label class="spv-field">
              <span><i data-lucide="calendar"></i> Fecha programada <em>*</em></span>
              <input type="date" id="kscAct_date" value="${today}">
            </label>
            <label class="spv-field">
              <span><i data-lucide="clock"></i> Hora inicio</span>
              <input type="time" id="kscAct_time" value="${prefill.scheduled_time || '08:00'}">
            </label>
            <label class="spv-field">
              <span><i data-lucide="hourglass"></i> Duración (min)</span>
              <input type="number" id="kscAct_dur" min="5" max="720" step="5" placeholder="60" value="${prefill.duration_minutes || 60}">
            </label>
            <label class="spv-field">
              <span><i data-lucide="map-pin"></i> Ubicación</span>
              <input type="text" id="kscAct_loc" maxlength="120" placeholder="Aula / Salón / Patio / Remoto" value="${esc(prefill.location || '')}">
            </label>
          </div>

          <!-- Fila 4: Prioridad + Estado -->
          <div style="display:grid;grid-template-columns:1.2fr 1.5fr .8fr;gap:1.2rem;align-items:end">
            <label class="spv-field">
              <span><i data-lucide="zap"></i> Prioridad</span>
              <div class="spv-chiprow" id="kscAct_priorityRow">
                ${priorityOpts.map(([v,l,c], i) => `
                  <button type="button" class="spv-chip-btn${(prefill.priority||'media')===v?' active':''}"
                          data-val="${v}" style="${v!=='media'?'':'--bc:#F59E0B'}" data-pri="${v}">
                    <span class="spv-chip-dot" style="background:${c}"></span>${l}
                  </button>`).join('')}
              </div>
              <input type="hidden" id="kscAct_priority" value="${prefill.priority || 'media'}">
            </label>
            <label class="spv-field">
              <span><i data-lucide="file-text"></i> Descripción</span>
              <textarea id="kscAct_desc" rows="2" maxlength="600" placeholder="Instrucciones para la maestra. Las actividades publicadas se muestran a padres en modo solo lectura.">${esc(prefill.description || '')}</textarea>
            </label>
            <label class="spv-field">
              <span><i data-lucide="eye"></i> Estado</span>
              <select id="kscAct_status">
                ${statusOpts.map(([v,l]) => `<option value="${v}" ${(prefill.status||'scheduled')===v?'selected':''}>${l}</option>`).join('')}
              </select>
            </label>
          </div>

          <!-- Errores -->
          <div id="kscAct_errors" style="display:none;margin:0;padding:.8rem 1rem;border-radius:16px;border:2px solid #FECACA;background:#FEF2F2;color:#991B1B;font-size:.92rem"></div>

          <!-- Footer -->
          <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:.4rem">
            <div class="spv-footnote">
              <i data-lucide="info"></i>
              Al publicar, los padres podrán ver solo la información de la actividad. Solo la maestra registra la evidencia por estudiante en su panel.
            </div>
            <div style="display:flex;gap:.8rem">
              <button type="button" class="spv-btn spv-btn--ghost" data-ksc-close-activity="1">Cancelar</button>
              <button type="button" class="spv-btn spv-btn--primary" data-ksc-action="save-activity" id="kscAct_saveBtn">
                <i data-lucide="send"></i> Guardar actividad
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    // ── Montar en DOM ──
    let wrap = document.getElementById(modalId + '_mount');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = modalId + '_mount';
      document.body.appendChild(wrap);
    }
    wrap.innerHTML = html;

    // ── Inyección de dependencias ──
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons({ root: wrap }));
    this._activityModalPriorityBinder();

    const close = () => { wrap.innerHTML = ''; document.removeEventListener('keydown', onEsc); };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onEsc);
    wrap.querySelectorAll('[data-ksc-close-activity]').forEach(b => b.addEventListener('click', close));
  },

  /** Vincula chips de prioridad al input oculto */
  _activityModalPriorityBinder() {
    const row = document.getElementById('kscAct_priorityRow');
    if (!row) return;
    const hidden = document.getElementById('kscAct_priority');
    row.querySelectorAll('.spv-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.pri;
        if (hidden) hidden.value = v;
        row.querySelectorAll('.spv-chip-btn').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  },

  /** Valida y envía el formulario de actividad a Supabase */
  async _submitActivityModal() {
    const errEl = document.getElementById('kscAct_errors');
    const saveBtn = document.getElementById('kscAct_saveBtn');
    const showError = (m) => { if (!errEl) return; errEl.style.display = 'block'; errEl.textContent = m; };

    const title    = (document.getElementById('kscAct_title')?.value || '').trim();
    const type     =  document.getElementById('kscAct_type')?.value  || 'academica';
    const aud      =  document.getElementById('kscAct_audience')?.value || 'aula';
    const crIdRaw  =  document.getElementById('kscAct_classroom')?.value || '';
    const crId     =  crIdRaw ? Number(crIdRaw) : null;
    const assign   =  document.getElementById('kscAct_assigned')?.value || null;
    const dateStr  = (document.getElementById('kscAct_date')?.value || '').trim();
    const timeStr  = (document.getElementById('kscAct_time')?.value || '').trim();
    const durRaw   = (document.getElementById('kscAct_dur')?.value || '').toString();
    const dur      = durRaw ? Number(durRaw) : null;
    const loc      = (document.getElementById('kscAct_loc')?.value || '').trim();
    const desc     = (document.getElementById('kscAct_desc')?.value || '').trim();
    const prio     =  document.getElementById('kscAct_priority')?.value || 'media';
    const status   =  document.getElementById('kscAct_status')?.value || 'scheduled';

    // Validaciones
    if (title.length < 3) return showError('El título debe tener al menos 3 caracteres.');
    if (!dateStr) return showError('Selecciona una fecha programada.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return showError('Fecha inválida.');
    if (dur && (Number.isNaN(dur) || dur < 5 || dur > 1440)) return showError('Duración debe estar entre 5 y 1440 minutos.');

    // Obtener el current user
    let uid = null;
    try {
      const { data } = await supabase.auth.getUser();
      uid = data?.user?.id || null;
    } catch (_) {}
    if (!uid) return showError('Sesión no válida. Actualiza la página.');

    if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '.6'; }
    showError('');

    // Audience se resuelve según aula
    let finalAud = aud;
    if (!crId && aud === 'aula') finalAud = 'todo_el_centro';
    else if (crId && aud === 'todo_el_centro') finalAud = 'aula';

    const payload = {
      title, activity_type: type, target_audience: finalAud,
      description: desc, priority: prio, status,
      scheduled_date: dateStr, scheduled_time: timeStr || null,
      duration_minutes: (dur && dur > 0) ? dur : null,
      location: loc || null, created_by: uid,
      classroom_id: (crId && Number.isFinite(crId)) ? crId : null,
      assigned_to: assign || null,
    };
    if (payload.status === 'published') payload.published_at = new Date().toISOString();

    try {
      const r = await supabase.from('school_activities').insert(payload).select().maybeSingle();
      if (r.error) throw r.error;

      const modalMount = document.getElementById('ksc_newActivity_mount');
      if (modalMount) modalMount.innerHTML = '';

      Helpers.toast('✅ Actividad guardada · ' + (r.data?.code || ''), 'success');

      // Notificación push hacia la maestra responsable si hay
      try {
        if (r.data?.assigned_to) {
          const targetProfiles = [r.data.assigned_to];
          sendPush({
            target_ids: targetProfiles,
            heading:  'Nueva actividad planificada',
            content:  `${title} · ${this._fmtShortDate(dateStr)}${timeStr?` · ${timeStr}`:''}`,
            url:      'panel-maestra.html?goto=t-actividades',
            data:     { kind: 'school_activity', id: String(r.data.id || '') },
          });
        }
      } catch (_) {}

      // Refrescar calendario inmediatamente (SPA update, no full reload)
      try { await this.refresh(); } catch (_) { if (window.lucide) lucide.createIcons(); }
    } catch (err) {
      console.warn('[CentroEscolar] save activity error:', err);
      showError('No se pudo guardar la actividad: ' + (err?.message || err?.code || 'error desconocido'));
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
    }
  },

  /* ── Intervenciones: acciones ─────────────────────────────── */
  _intStatusMeta(st) {
    const m = {
      open:        { label: 'Abierta',   color: '#EF4444', bg: 'rgba(239,68,68,.12)' },
      in_progress: { label: 'En curso',  color: '#F59E0B', bg: 'rgba(245,158,11,.15)' },
      resolved:    { label: 'Resuelta',  color: '#22C55E', bg: 'rgba(34,197,94,.12)' },
      closed:      { label: 'Cerrada',   color: '#64748B', bg: 'rgba(100,116,139,.14)' },
    };
    return m[st] || { label: st || '—', color: '#64748B', bg: 'rgba(100,116,139,.14)' };
  },
  _intPriorityColor(prio) {
    return { baja: '#22C55E', media: '#F59E0B', alta: '#EF4444', critica: '#B91C1C' }[prio] || '#64748B';
  },
  _intPriorityLabel(prio) {
    return { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' }[prio] || (prio || '—');
  },
  _intDate(ts) {
    try {
      return new Date(ts).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch (_) { return ''; }
  },
  async _loadIntervenciones() {
    try {
      const sup = supabase;
      const { data: rows, error } = await sup
        .from('interventions')
        .select('id, code, created_by, classroom_id, teacher_id, student_id, modulo, submodulo, situacion, prioridad, observacion, status, assigned_to, resolved_by, closed_at, created_at, session_id, metadata_jsonb')
        .order('created_at', { ascending: false })
        .limit(400);
      if (error) throw error;

      const roomIds = [...new Set((rows || []).map(r => r.classroom_id).filter(Boolean).map(String))];
      const profIds = [...new Set((rows || []).flatMap(r => [r.created_by, r.teacher_id, r.assigned_to, r.resolved_by]).filter(Boolean).map(String))];

      const [roomsRes, profsRes] = await Promise.all([
        roomIds.length ? sup.from('classrooms').select('id, name').in('id', roomIds) : Promise.resolve({ data: [] }),
        profIds.length ? sup.from('profiles').select('id, name').in('id', profIds) : Promise.resolve({ data: [] }),
      ]);

      this._intList = rows || [];
      this._intNames = {
        rooms: Object.fromEntries((roomsRes.data || []).map(r => [String(r.id), r.name])),
        profs: Object.fromEntries((profsRes.data || []).map(p => [String(p.id), p.name])),
      };
      if (this._tab === 'intervenciones') this._render();
    } catch (e) {
      console.warn('[KSC] No se pudieron cargar las intervenciones:', e?.message || e);
      this._intList = [];
    }
  },
  _ensureIntervencionesLoaded() {
    if (this._intPromise || this._intList.length) return;
    this._intPromise = this._loadIntervenciones().finally(() => { this._intPromise = null; });
  },
  _renderIntervenciones() {
    if (!this._intList.length) {
      return `
        <div class="ksc-int-toolbar">
          <div class="ksc-int-filters">${this._intFilterChips()}</div>
          <button type="button" class="spv-btn spv-btn--primary" data-ksc-action="int-create"><i data-lucide="siren"></i> Nueva intervención</button>
        </div>
        <div class="ksc-int-empty">Cargando intervenciones…</div>`;
    }
    const filtered = this._intFilter === 'todas'
      ? this._intList
      : this._intList.filter(r => r.status === this._intFilter);
    const cards = filtered.length
      ? filtered.map(r => this._intCard(r)).join('')
      : `<div class="ksc-int-empty">Sin intervenciones ${this._intFilter === 'todas' ? '' : this._intStatusMeta(this._intFilter).label.toLowerCase() + 's'}.</div>`;

    return `
      <div class="ksc-int-toolbar">
        <div class="ksc-int-filters">${this._intFilterChips()}</div>
        <button type="button" class="spv-btn spv-btn--primary" data-ksc-action="int-create"><i data-lucide="siren"></i> Nueva intervención</button>
      </div>
      <div class="ksc-int-grid">${cards}</div>`;
  },
  _intFilterChips() {
    const countFor = (st) => st === 'todas' ? this._intList.length : this._intList.filter(r => r.status === st).length;
    const opts = [['todas', 'Todas'], ['open', 'Abiertas'], ['in_progress', 'En curso'], ['resolved', 'Resueltas'], ['closed', 'Cerradas']];
    return opts.map(([key, label]) => {
      const st = this._intStatusMeta(key);
      const active = this._intFilter === key;
      return `<button type="button" class="ksc-int-filter${active ? ' active' : ''}" data-ksc-action="int-filter" data-ksc-int-filter="${key}" style="${key !== 'todas' ? `--ic:${st.color}` : ''}">${esc(label)} <b>${countFor(key)}</b></button>`;
    }).join('');
  },
  _intCard(r) {
    const st = this._intStatusMeta(r.status);
    const prio = this._intPriorityColor(r.prioridad);
    const aula = this._intNames.rooms[String(r.classroom_id)] || ('Aula #' + r.classroom_id);
    const maestra = r.teacher_id ? (this._intNames.profs[String(r.teacher_id)] || 'Maestra') : 'Sin asignar';
    return `
      <div class="ksc-int-card">
        <div class="ksc-int-top">
          <span class="ksc-int-code">${esc(r.code || ('INT-' + r.id))}</span>
          <span class="ksc-int-status" style="color:${st.color};background:${st.bg}"><i class="ksc-int-status-dot" style="background:${st.color}"></i>${st.label}</span>
        </div>
        <div class="ksc-int-title">${esc(r.situacion)}</div>
        <div class="ksc-int-meta">
          <span class="ksc-int-chip" style="--dc:${prio}">${esc(this._intPriorityLabel(r.prioridad))}</span>
          <span class="ksc-int-aula">${esc(aula)}</span>
          <span class="ksc-int-sep">·</span>
          <span class="ksc-int-teacher">${esc(maestra)}</span>
        </div>
        <div class="ksc-int-sub">${esc(r.modulo || 'aula')}${r.submodulo ? ' → ' + esc(r.submodulo) : ''}</div>
        <div class="ksc-int-foot">
          <span class="ksc-int-date"><i data-lucide="clock" class="w-3.5 h-3.5"></i> ${this._intDate(r.created_at)}</span>
          <div class="ksc-int-actions">
            <button type="button" class="spv-btn spv-btn--ghost" data-ksc-action="int-open" data-ksc-int-id="${r.id}"><i data-lucide="eye"></i> Ver</button>
            ${(r.status === 'open' || r.status === 'in_progress')
              ? `<button type="button" class="spv-btn spv-btn--danger" data-ksc-action="int-close" data-ksc-int-id="${r.id}"><i data-lucide="check-check"></i> Cerrar</button>`
              : ''}
          </div>
        </div>
      </div>`;
  },
  _openInterventionDetail(idStr) {
    const row = this._intList.find(i => String(i.id) === String(idStr));
    if (!row) return;
    const st = this._intStatusMeta(row.status);
    const prio = this._intPriorityColor(row.prioridad);
    const aula = this._intNames.rooms[String(row.classroom_id)] || ('Aula #' + row.classroom_id);
    const maestra = row.teacher_id ? (this._intNames.profs[String(row.teacher_id)] || 'Maestra') : 'Sin asignar';
    const creador = row.created_by ? (this._intNames.profs[String(row.created_by)] || 'Directivo') : 'Staff';
    const canClose = (row.status === 'open' || row.status === 'in_progress');

    const overlay = document.createElement('div');
    overlay.className = 'spv-modal-overlay';
    overlay.innerHTML = `
      <div class="spv-modal ksc-int-modal" role="dialog" aria-modal="true" aria-labelledby="kscIntTitle" style="--spv-accent:#0B63C7;--spv-glow:rgba(11,99,199,.16)">
        <div class="spv-modal-head">
          <div class="spv-modal-icon"><i data-lucide="siren"></i></div>
          <div style="min-width:0">
            <h3 id="kscIntTitle">${esc(row.code || ('INT-' + row.id))} · Intervención Directiva</h3>
            <p>${esc(aula)} · ${esc(maestra)} · <b>${esc(this._intPriorityLabel(row.prioridad))}</b></p>
          </div>
          <button type="button" class="spv-modal-close" data-ksc-int-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </div>
        <div class="spv-modal-body">
          <div class="ksc-int-detail-status" style="color:${st.color};background:${st.bg}">● ${st.label}</div>
          <div class="ksc-int-detail-block">
            <span class="ksc-int-detail-label">Situación detectada</span>
            <p class="ksc-int-detail-value">${esc(row.situacion)}</p>
          </div>
          <div class="ksc-int-detail-grid">
            <div class="ksc-int-detail-block"><span class="ksc-int-detail-label">Módulo</span><p class="ksc-int-detail-value">${esc(row.modulo || 'aula')}${row.submodulo ? ' — ' + esc(row.submodulo) : ''}</p></div>
            <div class="ksc-int-detail-block"><span class="ksc-int-detail-label">Aula</span><p class="ksc-int-detail-value">${esc(aula)}</p></div>
            <div class="ksc-int-detail-block"><span class="ksc-int-detail-label">Maestra responsable</span><p class="ksc-int-detail-value">${esc(maestra)}</p></div>
            <div class="ksc-int-detail-block"><span class="ksc-int-detail-label">Registrada por</span><p class="ksc-int-detail-value">${esc(creador)} · ${this._intDate(row.created_at)}</p></div>
          </div>
          <div class="ksc-int-detail-block">
            <span class="ksc-int-detail-label">Observación y acción requerida</span>
            <p class="ksc-int-detail-value">${esc(row.observacion || 'Sin observación.')}</p>
          </div>
          ${canClose ? `
          <label class="spv-field">
            <span>Motivo de cierre <span class="req">*</span></span>
            <textarea id="kscIntMotivo" rows="3" maxlength="500" placeholder="Motivo administrativo del cierre (queda en la auditoría)"></textarea>
          </label>` : ''}
        </div>
        <div class="spv-modal-foot">
          <button type="button" class="spv-btn spv-btn--ghost" data-ksc-int-close>Cancelar</button>
          ${canClose ? `<button type="button" class="spv-btn spv-btn--danger" data-ksc-int-close-send><i data-lucide="check-check"></i> Cerrar intervención</button>` : `<span class="ksc-int-detail-closed">Intervención cerrada el ${this._intDate(row.closed_at)}</span>`}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons({ root: overlay }));

    const teardown = () => { try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (_) {} };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) teardown(); });
    overlay.querySelectorAll('[data-ksc-int-close]').forEach(b => b.addEventListener('click', teardown));
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape' && overlay.isConnected) { teardown(); document.removeEventListener('keydown', esc); }
    });

    const sendBtn = overlay.querySelector('[data-ksc-int-close-send]');
    sendBtn?.addEventListener('click', async () => {
      const motivo = (overlay.querySelector('#kscIntMotivo')?.value || '').trim();
      if (motivo.length < 3) {
        Helpers.toast('Indica un motivo de cierre (mínimo 3 caracteres)', 'warning');
        return;
      }
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Cerrando…';
      const { data, error } = await supabase.rpc('close_intervention', { p_id: Number(row.id), p_motivo: motivo });
      if (error) {
        Helpers.toast('Error al cerrar: ' + (error.message || 'desconocido'), 'error');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i data-lucide="check-check"></i> Cerrar intervención';
        return;
      }
      try { window.SupervisionEngine?.registerAudit?.('intervention.close', { intervention_id: row.id, intervention_code: row.code, motivo }); } catch (_) {}
      Helpers.toast((data?.message || 'Intervención cerrada') + ' · ' + (row.code || ''), 'success');
      teardown();
      await this._loadIntervenciones();
      this._render();
    });
  },

  _locateAula(idStr) {
    if (!idStr) return null;
    const idNorm = String(idStr);
    const pool = (this._data?.aulas || []).concat(this._data?.pool || []);
    return pool.find(a => String(a.id) === idNorm) || null;
  },

  _sectionJumpForAlert(alertIcon, alertGo) {
    const go = (alertGo || '').toLowerCase();
    const ico = (alertIcon || '').toLowerCase();
    if (ico === 'message-square' || go === 'muro' || go === 'chat' || go.includes('mensaje')) return 't-chat';
    if (ico === 'user-check'     || go === 'aula' || go.includes('asisten'))                return 't-attendance';
    if (ico === 'list-checks'    || go.includes('rutina') || go.includes('jornada'))         return 't-routine';
    if (ico === 'megaphone'     || go.includes('publica') || go.includes('muro'))            return 't-feed';
    if (ico === 'alert-triangle'|| go.includes('inciden'))                                  return 't-incidents';
    if (go.includes('maestro'))                                                             return 't-home';
    if (go.includes('estudiante'))                                                          return 't-students';
    return 't-class-detail';
  },

  /* ════════════════════════ CARGA DE DATOS ════════════════════════ */

  /** Ejecuta una consulta sin tumbar todo el módulo si falla.
   *  Nivel 1: SDK normal.
   *  Nivel 2: Si el error es de auth (401/403/42501) → forzar refresh del token y REINTENTAR la misma query.
   *  Nivel 3: Si aún falla → devolver fallback.
   */
  async _q(builder, fallback = []) {
    try {
      // Nivel 1: ejecutar builder / thenable
      const r = await builder;
      if (!r?.error) return (r?.data ?? fallback);

      // Error detectado. Chequear si es de autorización/autenticación
      const code   = String(r.error?.code || '');
      const status = Number(r.error?.status || 0);
      const msg    = String(r.error?.message || '').toLowerCase();
      const isAuthError = (
        status === 401 || status === 403 ||
        code === '42501' || code === 'PGRST301' ||
        msg.includes('jwt') ||
        msg.includes('permission denied') ||
        msg.includes('unauthorized') ||
        msg.includes('token')
      );

      if (isAuthError) {
        console.warn('[CentroEscolar] Auth error detectado en SDK. Forzando refresh + reintento.',
          r.error?.message || r.error?.code || status);
        // Nivel 2: Forzar refresh de token
        const newToken = await forceRefreshToken();
        if (newToken && builder && typeof builder.eq === 'function') {
          try {
            const r2 = await builder;
            if (!r2?.error) return (r2?.data ?? fallback);
            console.warn('[CentroEscolar] Reintento post-refresh también falló:', r2.error?.message);
          } catch (e2) {
            console.warn('[CentroEscolar] Reintento excepción:', e2);
          }
        }
      }
      console.warn('[CentroEscolar] query → fallback. Error:',
        r.error?.message || r.error?.code || status);
      return fallback;
    } catch (e) {
      console.warn('[CentroEscolar] query excepción → fallback:', e?.message || e);
      return fallback;
    }
  },

  /** Estudiantes: 4 niveles de fallback.
   *  N1) SDK con birth_date
   *  N2) SDK sin birth_date (columna faltante en BD vieja)
   *  N3) Forzar refresh de token + reintento N2
   *  N4) FALLBACK FINAL: fetch directo a PostgREST sin pasar por SDK
   */
  async _studentsQuery() {
    // ── N1: SDK normal con birth_date
    try {
      const r = await supabase.from('students')
        .select('id, name, birth_date, classroom_id, parent_id')
        .eq('is_active', true).is('deleted_at', null)
        .order('name').limit(2000);
      if (!r.error) return r.data ?? [];
      console.warn('[CentroEscolar] N1 students con birth_date falló:',
        r.error?.message || r.error?.code || r.error?.status);
    } catch (e) {
      console.warn('[CentroEscolar] N1 students excepción:', e?.message || e);
    }

    // ── N2: SDK sin birth_date (por si la columna no existe en migración vieja)
    try {
      const r2 = await supabase.from('students')
        .select('id, name, classroom_id, parent_id')
        .eq('is_active', true).is('deleted_at', null)
        .order('name').limit(2000);
      if (!r2.error) return r2.data ?? [];
      console.warn('[CentroEscolar] N2 students (sin birth_date) falló:',
        r2.error?.message || r2.error?.code || r2.error?.status);
    } catch (e) {
      console.warn('[CentroEscolar] N2 students (sin birth_date) excepción:', e?.message || e);
    }

    // ── N3: Auth? → forzar refresh + reintento N2
    try {
      console.warn('[CentroEscolar] N3 students: forzando refresh de token y reintento...');
      const t = await forceRefreshToken();
      if (t) {
        const r3 = await supabase.from('students')
          .select('id, name, classroom_id, parent_id')
          .eq('is_active', true).is('deleted_at', null)
          .order('name').limit(2000);
        if (!r3.error) return r3.data ?? [];
      }
    } catch (_) { /* seguir */ }

    // ── N4: FALLBACK DEFINITIVO — PostgREST directo sin SDK
    console.warn('[CentroEscolar] N4 students: POSTGREST DIRECTO (último recurso)');
    return await fetchPostgREST('students', {
      select: 'id,name,classroom_id,parent_id',
      filters: { is_active: true },
      is:      { deleted_at: null },
      order:   { column: 'name', ascending: true },
      limit:   2000,
    }, []);
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
      // ✅ Promise.allSettled: una sola promesa que falle NO tumba el resto del dashboard.
      // (Lección aprendida del panel-maestra: Promise.all → fallo único = UI rota)
      const defaultFallbacks = [
        [],    // 0  aulasRaw
        [],    // 1  students
        [],    // 2  attWeek
        [],    // 3  logsToday
        [],    // 4  schedToday
        [],    // 5  eventsToday
        [],    // 6  postsWeek
        [],    // 7  msgUnread
        [],    // 8  msgWeek
        [],    // 9  tasks
        [],    // 10 incidents
        [],    // 11 staff
        [],    // 12 meetings
        [],    // 13 years
        [],    // 14 periods
        [],    // 15 schoolActivities
      ];
      const settled = await Promise.allSettled([
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
        // 15. school_activities: planificación central de directora/encargada/asistente
        //   (cargamos 4 meses de ventana: 1 hacia atrás + 3 hacia adelante para el calendario visual)
        this._q(supabase.from('school_activities')
          .select('id, code, title, description, activity_type, priority, status,'
                + ' classroom_id, target_audience, scheduled_date, scheduled_time,'
                + ' duration_minutes, location, created_by, assigned_to, published_at,'
                + ' starts_at, ends_at, completed_at, created_at')
          .gte('scheduled_date', _dateAddISO(today, -35))
          .lte('scheduled_date', _dateAddISO(today, 120))
          .order('scheduled_date', { ascending: true })
          .limit(1500)),
      ]);

      // Extraer valores: fulfilled → value, rejected → fallback por posición
      const results = settled.map((s, i) => {
        if (s.status === 'fulfilled') {
          return Array.isArray(s.value) ? s.value : (s.value ?? defaultFallbacks[i]);
        }
        console.warn('[CentroEscolar] Query allSettled rejected, usando fallback idx=' + i, s.reason);
        return defaultFallbacks[i];
      });

      const [
        aulasRaw, students, attWeek, logsToday, schedToday, eventsToday,
        postsWeek, msgUnread, msgWeek, tasks, incidents, staff,
        meetings, years, periods, schoolActivities,
      ] = results;

      this._data = this._compute({
        aulasRaw, students, attWeek, logsToday, schedToday, eventsToday,
        postsWeek, msgUnread, msgWeek, tasks, incidents, staff,
        meetings, years, periods, schoolActivities, today, weekAgoDate,
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
      schoolActivities: d.schoolActivities || [],
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
    else if (this._tab === 'intervenciones') {
      view.innerHTML = this._renderIntervenciones();
      this._ensureIntervencionesLoaded();
    }
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

    const secondaryCta = (a) => {
      if (!a.aula) return '';
      let act = null, lbl = null, icon = null;
      if (a.icon === 'message-square')       { act = 'replyMsgs';  lbl = 'Responder ahora';   icon = 'message-square-reply'; }
      else if (a.icon === 'megaphone')       { act = 'newPost';    lbl = 'Publicar ahora';    icon = 'megaphone'; }
      else if (a.icon === 'list-checks')     { act = 'newEvent';   lbl = 'Registrar evento';  icon = 'calendar-plus'; }
      else if (a.icon === 'alert-triangle')  { act = 'newEvent';   lbl = 'Registrar evento';  icon = 'calendar-plus'; }
      else if (a.icon === 'user-check')      { act = 'openAula';   lbl = 'Abrir aula';        icon = 'door-open'; }
      if (!act) return '';
      return `<button type="button" class="ksc-alert-cta-secondary" data-ksc-action="${esc(act)}" data-ksc-classroom="${esc(a.aula)}" data-ksc-open-aula="${act==='openAula'?esc(a.aula):''}" ${act==='openAula'?'data-ksc-action-override=""':''}><i data-lucide="${esc(icon)}"></i> ${esc(lbl)}</button>`;
    };
    const alerts = D.alerts.length
      ? D.alerts.map((a, i) => `
        <div class="ksc-alert ksc-alert--${a.sev}">
          <div class="ksc-alert-ico"><i data-lucide="${esc(a.icon)}"></i></div>
          <div class="ksc-alert-txt">
            <div class="ksc-alert-title">${esc(a.title)}</div>
            <div class="ksc-alert-desc">${esc(a.desc)}</div>
            ${secondaryCta(a)}
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

      ${a.id && !String(a.id).startsWith('__') ? this._renderQuickActionsBar(a) : ''}

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

    // Metadatos globales: colores / labels de school_activities
    const activityTypeMeta = {
      academica:         { label: 'Académica',         icon: 'book-open',  color: '#0B63C7' },
      extracurricular:   { label: 'Extracurricular',   icon: 'sparkles',   color: '#7C3AED' },
      cierre_periodo:    { label: 'Cierre Periodo',    icon: 'flag',       color: '#DB2777' },
      evaluacion:        { label: 'Evaluación',        icon: 'clipboard-check', color: '#EA580C' },
      reunion_padres:    { label: 'Reunión Padres',    icon: 'users',      color: '#F59E0B' },
      excursion:         { label: 'Excursión',         icon: 'bus',        color: '#0891B2' },
      admin:             { label: 'Administrativa',    icon: 'file-cog',   color: '#64748B' },
      otra:              { label: 'Otra',              icon: 'pin',        color: '#475569' },
    };
    const priorityColor = p => ({ baja:'#22C55E', media:'#F59E0B', alta:'#EF4444', critica:'#B91C1C' })[p] || '#64748B';
    const priorityLabel = p => ({ baja:'Baja', media:'Media', alta:'Alta', critica:'Crítica' })[p] || '—';
    const audienceLabel = a => ({ aula:'Aula', nivel:'Nivel', todo_el_centro:'Todo el centro', estudiante:'Estudiante', staff:'Staff' })[a] || '—';
    const statusLabel = s => ({ draft:'Borrador', scheduled:'Programada', published:'Publicada', in_progress:'En curso', completed:'Cumplida', archived:'Archivada' })[s] || s;
    const statusClass = s => ({ draft:'ksc-chip--muted', scheduled:'ksc-chip--info', published:'ksc-chip--ok', in_progress:'ksc-chip--warn', completed:'ksc-chip--ok', archived:'ksc-chip--muted' })[s] || 'ksc-chip--info';
    const aulaById = new Map(D.aulas.filter(a=>a.id).map(a => [String(a.id), a]));
    const staffById = new Map((D.staff || []).map(s => [String(s.id), s]));

    // Eventos indexados por día (se extiende push: ahora guarda objeto enriquecido)
    const byDay = new Map();
    const push = (day, type, title, time, extra = null) => {
      if (!day) return;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({ type, title, time, extra });
    };

    // ── 1. Publicaciones + tareas (historico existente)
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

    // ── 2. INCIDENCIAS (alert)
    D.pool.forEach(a => {
      (a.m.incidents || []).forEach(i => {
        if (i.reported_at) push(i.reported_at.slice(0, 10), 'alerta', `${a.name} · incidencia`, i.reported_at);
      });
    });

    // ── 3. ASISTENCIA
    const attDays = new Set();
    D.pool.forEach(a => a.m.weekDates?.forEach(d => attDays.add(d)));
    attDays.forEach(d => push(d, 'asistencia', 'Asistencia registrada', null));

    // ── 4. 🔥 NUEVO: SCHOOL_ACTIVITIES (planificación staff)
    //    - Las metemos como tipo extra "planificada" (visual destacado con icono propio)
    //    - Guardamos en extra: objeto completo para renderizarlo luego.
    (D.schoolActivities || []).forEach(a => {
      const meta = activityTypeMeta[a.activity_type] || activityTypeMeta.otra;
      const time = a.scheduled_time ? `${a.scheduled_date}T${a.scheduled_time}` : a.scheduled_date;
      const label =
        a.target_audience === 'todo_el_centro'
          ? `★ [Centro] ${a.title || 'Actividad'}`
          : (a.classroom_id ? `[${aulaById.get(String(a.classroom_id))?.name || 'Aula'}] ${a.title || 'Actividad'}`
                            : `[${audienceLabel(a.target_audience)}] ${a.title || 'Actividad'}`);
      push(a.scheduled_date, 'planificada', label, time, { kind: 'school_activity', id: a.id, meta, obj: a });
    });

    const typeMeta = {
      todos:       { label: 'Todos',          color: '#0B63C7' },
      planificada: { label: 'Planificada',    color: '#6D28D9' },
      actividad:   { label: 'Actividad',      color: '#0B63C7' },
      reunion:     { label: 'Reunión',        color: '#F59E0B' },
      alerta:      { label: 'Alerta',         color: '#EF4444' },
      asistencia:  { label: 'Asistencia',     color: '#16A34A' },
    };

    // ============================================================
    // GRID DE DÍAS + NUEVO BOTÓN "NUEVA ACTIVIDAD" SAAS PREMIUM
    // ============================================================
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
      const hasPlan = evs.some(e => e.type === 'planificada');
      cells.push(`
        <div class="ksc-day${out ? ' is-out' : ''}${iso === today ? ' is-today' : ''}${iso === this._calSelected ? ' is-selected' : ''}${hasPlan ? ' has-plan' : ''}"
             data-ksc-cal-day="${iso}" title="${esc(evs.map(e => e.title).join('\n'))}">
          <span class="ksc-day-num">${n}</span>
          <div class="ksc-day-dots">${dots}</div>
          ${evs.length ? `<span class="ksc-day-count">${evs.length} ev.</span>` : ''}
        </div>`);
      if (i >= 34 && dayNum > daysInMonth) break;
    }

    // ============================================================
    // Panel derecho: actividades del día seleccionado + PLANIFICADAS PROXIMAS
    // ============================================================
    const sel = this._calSelected || today;
    const selEvents = (byDay.get(sel) || []).filter(e => filter === 'todos' || e.type === filter);
    const eventList = selEvents.length
      ? selEvents.map(e => {
          if (e.extra?.kind === 'school_activity') {
            const a = e.extra.obj;
            const meta = e.extra.meta;
            const aula = a.classroom_id ? aulaById.get(String(a.classroom_id)) : null;
            return `
              <div class="ksc-event-item is-activity" data-ksc-activity="${a.id}">
                <span class="ksc-event-time">${a.scheduled_time ? esc(a.scheduled_time.slice(0,5)) : 'todo el día'}</span>
                <div class="ksc-list-main" style="width:100%">
                  <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
                    <div class="ksc-list-title" style="margin:0">${esc(a.title || 'Sin título')}</div>
                    <span class="ksc-chip" style="background:${meta.color}1A;color:${meta.color}">
                      <i data-lucide="${meta.icon}"></i> ${esc(meta.label)}
                    </span>
                    <span class="ksc-chip ksc-chip--muted">${esc(a.code || '')}</span>
                    <span class="ksc-chip ${statusClass(a.status)}">${esc(statusLabel(a.status))}</span>
                  </div>
                  <div class="ksc-list-sub" style="margin-top:.35rem">
                    ${aula ? `<span>🏫 ${esc(aula.name)}</span> · ` : ''}
                    <span>👥 ${esc(audienceLabel(a.target_audience))}</span> ·
                    <span>⚡ ${esc(priorityLabel(a.priority))}</span>
                    ${a.duration_minutes ? ` · ⏱ ${a.duration_minutes} min` : ''}
                    ${a.location ? ` · 📍 ${esc(a.location)}` : ''}
                    ${a.description ? `<div style="margin-top:.4rem;color:var(--ksc-text-dim)">${esc(String(a.description).slice(0,140))}</div>` : ''}
                  </div>
                </div>
              </div>`;
          }
          return `
            <div class="ksc-event-item">
              <span class="ksc-event-time">${e.time ? esc(this._fmtTime(e.time)) : 'todo el día'}</span>
              <div class="ksc-list-main">
                <div class="ksc-list-title">${esc(e.title)}</div>
                <div class="ksc-list-sub"><span class="ksc-chip" style="background:${(typeMeta[e.type]?.color || '#0B63C7')}1f;color:${typeMeta[e.type]?.color || '#0B63C7'}">${esc(typeMeta[e.type]?.label || e.type)}</span></div>
              </div>
            </div>`;
        }).join('')
      : `<div class="ksc-empty"><i data-lucide="calendar"></i><div>Sin eventos para el ${esc(this._fmtShortDate(sel))}.</div></div>`;

    // ──────────────────────────────────────────────────────────
    // KPI RÁPIDO: cuenta actividades planificadas / publicadas próximas
    // ──────────────────────────────────────────────────────────
    const upcoming = (D.schoolActivities || [])
      .filter(a => !['archived','completed','draft'].includes(a.status))
      .sort((x, y) => (String(x.scheduled_date) + (x.scheduled_time||'')).localeCompare(String(y.scheduled_date) + (y.scheduled_time||'')))
      .slice(0, 12);
    const upcomingList = upcoming.length
      ? upcoming.map(a => {
          const meta = activityTypeMeta[a.activity_type] || activityTypeMeta.otra;
          const aula = a.classroom_id ? aulaById.get(String(a.classroom_id)) : null;
          return `
            <div class="ksc-event-item is-activity-up" data-ksc-activity="${a.id}">
              <span class="ksc-event-time" style="min-width:4.6rem;flex:0 0 auto">
                <span style="display:block;font-weight:700;color:${meta.color}">${esc(String(a.scheduled_date||'').slice(8,10))}/${esc(String(a.scheduled_date||'').slice(5,7))}</span>
                <span style="display:block;font-size:.7rem;color:var(--ksc-text-dim)">${a.scheduled_time?esc(a.scheduled_time.slice(0,5)):'—'}</span>
              </span>
              <div class="ksc-list-main" style="width:100%">
                <div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap">
                  <div class="ksc-list-title" style="margin:0">${esc(a.title || 'Sin título')}</div>
                  <span class="ksc-chip ${statusClass(a.status)}">${esc(statusLabel(a.status))}</span>
                </div>
                <div class="ksc-list-sub" style="margin-top:.3rem;color:var(--ksc-text-dim)">
                  ${aula ? `🏫 ${esc(aula.name)}` : `👥 ${esc(audienceLabel(a.target_audience))}`}
                  <span style="margin:0 .35rem">·</span>
                  <span style="color:${priorityColor(a.priority)}">⚡ ${esc(priorityLabel(a.priority))}</span>
                  <span style="margin:0 .35rem">·</span>
                  ${a.assigned_to ? `👩‍🏫 ${esc(staffById.get(String(a.assigned_to))?.name || 'Responsable')}` : '👩‍🏫 Sin asignar'}
                </div>
              </div>
            </div>`;
        }).join('')
      : `<div class="ksc-empty"><i data-lucide="calendar-days"></i>
          <div>No hay actividades programadas próximamente.</div>
          <button class="ksc-mini-btn" data-ksc-action="new-activity" data-ksc-date="${today}" type="button" style="margin-top:.6rem">
            <i data-lucide="plus"></i> Crear la primera
          </button></div>`;

    const statsKPIs = (() => {
      const all = D.schoolActivities || [];
      const published = all.filter(a => a.status === 'published').length;
      const inProgress = all.filter(a => a.status === 'in_progress').length;
      const scheduled = all.filter(a => a.status === 'scheduled').length;
      const completed = all.filter(a => a.status === 'completed').length;
      const critical = all.filter(a => a.priority === 'critica' && !['archived','completed'].includes(a.status)).length;
      return `
        <div class="ksc-kpi-4row">
          <div class="ksc-kpi-mini"><div class="k"><span class="ksc-dot" style="--d:#0B63C7"></i> Programadas</div><div class="v">${scheduled}</div></div>
          <div class="ksc-kpi-mini"><div class="k"><span class="ksc-dot" style="--d:#16A34A"></i> Publicadas</div><div class="v">${published}</div></div>
          <div class="ksc-kpi-mini"><div class="k"><span class="ksc-dot" style="--d:#F59E0B"></i> En curso</div><div class="v">${inProgress}</div></div>
          <div class="ksc-kpi-mini"><div class="k"><span class="ksc-dot" style="--d:#B91C1C"></i> Críticas</div><div class="v">${critical}</div></div>
        </div>`;
    })();

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
        <div class="ksc-panel ksc-calendar-root">
          <div class="ksc-cal-head">
            <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:.65rem">
                <div style="width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#6D28D9 0%,#0B63C7 100%);
                            display:flex;align-items:center;justify-content:center;box-shadow:0 10px 22px rgba(109,40,217,.28)">
                  <i data-lucide="calendar-plus" style="color:#fff;width:22px;height:22px"></i>
                </div>
                <div>
                  <div class="ksc-cal-month" style="margin:0">${esc(monthName)}</div>
                  <div class="ksc-panel-sub" style="margin:.1rem 0 0 0;display:block">Planificación central de actividades escolares</div>
                </div>
              </div>
              <!-- 🔥 NUEVO BOTÓN SAAS PREMIUM: NUEVA ACTIVIDAD 🔥 -->
              <button class="ksc-btn-primary" data-ksc-action="new-activity" data-ksc-date="${sel}" type="button"
                      style="margin-left:auto;padding:.95rem 1.35rem;border-radius:16px;border:0;
                             background:linear-gradient(135deg,#6D28D9 0%,#0B63C7 100%);
                             color:#fff;font-weight:700;letter-spacing:.2px;
                             box-shadow:0 14px 32px rgba(13,71,161,.35);cursor:pointer;
                             display:inline-flex;align-items:center;gap:.65rem">
                <i data-lucide="plus" style="width:18px;height:18px"></i>
                Nueva Actividad
              </button>
            </div>
            <div class="ksc-cal-nav" style="margin-top:.6rem">
              <button class="ksc-nav-btn" data-ksc-nav="-1" type="button" aria-label="Mes anterior"><i data-lucide="chevron-left"></i></button>
              <button class="ksc-nav-btn" data-ksc-nav="0" type="button" aria-label="Hoy" title="Hoy"><i data-lucide="target"></i></button>
              <button class="ksc-nav-btn" data-ksc-nav="1" type="button" aria-label="Mes siguiente"><i data-lucide="chevron-right"></i></button>
            </div>
          </div>

          ${statsKPIs}

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
              <button class="ksc-mini-btn" data-ksc-action="new-activity" data-ksc-date="${sel}" type="button">
                <i data-lucide="plus"></i> Para hoy
              </button>
            </div>
            <div>${eventList}</div>
          </div>

          <div class="ksc-panel">
            <div class="ksc-panel-head">
              <h3 class="ksc-panel-title"><i data-lucide="layers"></i> Actividades próximas</h3>
              <span class="ksc-panel-sub">${upcoming.length} activa${upcoming.length === 1 ? '' : 's'}</span>
            </div>
            <div class="ksc-panel-body">${upcomingList}</div>

            <div class="ksc-panel-head" style="border-top:1px solid var(--ksc-line);margin-top:1rem">
              <h3 class="ksc-panel-title"><i data-lucide="flag"></i> Planificador año escolar</h3>
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

  /**
   * Helper: hoy + N días → "YYYY-MM-DD" (acepta negativos para fechas pasadas).
   * Se usa en los rangos de fecha de school_activities para no repetir código.
   */
  _dateAddISO(baseISO, days) {
    const [y, m, d] = String(baseISO).split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + Number(days || 0));
    return this._dateISO(dt);
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

  /* ══════════════ SPA HELPER: Actualización Parcial Sin Rebuild ══════════════ */
  _refreshAfterAction(classroomId, deltas = {}) {
    if (!this._data) return;
    const idStr = classroomId != null ? String(classroomId) : null;

    const target = idStr
      ? (this._data.aulas.find(a => String(a.id) === idStr) ||
         this._data.pool.find(a => String(a.id) === idStr))
      : null;

    if (target && target.m) {
      const m = target.m;
      if (deltas.decPendingMsgs && m.msgsPending.length) {
        m.msgsPending.splice(0, Math.min(Number(deltas.decPendingMsgs) || 1, m.msgsPending.length));
      }
      if (deltas.incPostsToday) m.postsToday = (m.postsToday || 0) + Number(deltas.incPostsToday);
      if (deltas.incPostsWeek)  m.postsWeek  = (m.postsWeek  || 0) + Number(deltas.incPostsWeek);
      if (deltas.incEventsToday) {
        const added = Number(deltas.incEventsToday) || 1;
        m.logs = (m.logs || 0) + added;
        const base = m.present > 0 ? m.present : m.nStudents;
        m.routinePct = base > 0 ? Math.min(100, Math.round((m.logs / base) * 100)) : 0;
      }
      if (deltas.recomputeRoutine && target.m.nStudents > 0) {
        const base = target.m.present > 0 ? target.m.present : target.m.nStudents;
        target.m.routinePct = base > 0 ? Math.min(100, Math.round((target.m.logs / base) * 100)) : 0;
      }

      const started = target.m.attRecords > 0;
      let s = 'ok';
      if (!target.id) s = 'muted';
      else if (!target.teacher_id && target.m.nStudents > 0) s = 'danger';
      else if (started && target.m.noRecord > 0) s = 'danger';
      else if (target.m.msgsPending.length >= 3) s = 'danger';
      else if (target.m.incidents.length > 0) s = 'danger';
      else if ((started && target.m.routinePct < 100) || target.m.msgsPending.length > 0 ||
               (this._data.isWeekend ? false : (target.m.postsToday === 0 && new Date().getHours() >= 11 && target.m.nStudents > 0))) s = 'warn';
      else if (!target.id) s = 'muted';
      target.status = s;
    }

    const D = this._data;
    D.kpis = D.kpis || {};
    if (target) {
      if (deltas.incPostsToday || deltas.incPostsWeek) {
        D.kpis.publicaciones = D.aulas.reduce((n, a) => n + (a.m?.postsWeek || 0), 0);
        D.kpis.publicadasHoy = D.aulas.filter(a => a.id && (a.m?.postsToday || 0) > 0).length;
      }
      if (deltas.incEventsToday || deltas.recomputeRoutine) {
        const real = D.aulas.filter(a => a.id);
        D.kpis.rutinas = avg(real.filter(a => a.m?.nStudents > 0).map(a => a.m.routinePct));
      }
      if (deltas.decPendingMsgs) {
        D.kpis.mensajes = D.aulas.reduce((n, a) => n + (a.m?.msgsPending?.length || 0), 0);
      }
      D.health = [
        { label: 'Aulas activas',   value: `${D.aulas.filter(a=>a.id&&a.teacher_id).length}/${D.aulas.filter(a=>a.id).length}`, pct: D.aulas.filter(a=>a.id).length ? Math.round((D.aulas.filter(a=>a.id&&a.teacher_id).length/D.aulas.filter(a=>a.id).length)*100) : 100 },
        { label: 'Maestras activas',value: String(D.kpis.maestras||0), pct: (D.kpis.maestras||0) ? 100 : 0 },
        { label: 'Rutinas',         value: (D.kpis.rutinas||0)+'%', pct: D.kpis.rutinas||0 },
        { label: 'Mensajes respondidos', value: D.kpis.mensajes!=null ? (100-D.kpis.mensajes)+'%' : '—', pct: 100-Math.min(100,D.kpis.mensajes||0) },
        { label: 'Publicaciones',   value: D.aulas.filter(a=>a.m?.nStudents>0).length ? Math.round(((D.kpis.publicadasHoy||0)/D.aulas.filter(a=>a.m?.nStudents>0).length)*100)+'%' : '—', pct: D.aulas.filter(a=>a.m?.nStudents>0).length ? Math.min(100,Math.round(((D.kpis.publicadasHoy||0)/D.aulas.filter(a=>a.m?.nStudents>0).length)*100)) : 100 },
        { label: 'Asistencia',      value: '—', pct: 100 },
        { label: 'Actividades',     value: D.kpis.actividades? D.kpis.actividades+' pend.' : '100%', pct: D.kpis.actividades ? 60 : 100 },
      ].map(h => ({ ...h, status: h.pct >= 90 ? 'ok' : h.pct >= 70 ? 'warn' : 'danger' }));

      const newAlerts = [];
      D.aulas.forEach(a => {
        if (!a.id || a.__placeholder || a.__special) return;
        const mm = a.m;
        if (!a.teacher_id && mm.nStudents > 0) newAlerts.push({ sev: 'danger', icon: 'user-x', title: a.name, desc: 'Aula sin maestra asignada.', aula: a.id, go: 'maestros' });
        if (mm.attRecords > 0 && mm.noRecord > 0) newAlerts.push({ sev: 'danger', icon: 'user-check', title: a.name, desc: `${mm.noRecord} estudiante${mm.noRecord>1?'s':''} sin registro de asistencia hoy.`, aula: a.id, go: 'aula' });
        if (mm.msgsPending.length >= 3) newAlerts.push({ sev: 'danger', icon: 'message-square', title: a.name, desc: `${mm.msgsPending.length} mensajes de padres sin responder.`, aula: a.id, go: 'aula' });
        if (mm.msgsPending.length > 0 && mm.msgsPending.length < 3) newAlerts.push({ sev: 'warn', icon: 'message-square', title: a.name, desc: `${mm.msgsPending.length} mensaje${mm.msgsPending.length>1?'s':''} pendiente${mm.msgsPending.length>1?'s':''} de respuesta.`, aula: a.id, go: 'aula' });
        if (mm.incidents.length > 0) newAlerts.push({ sev: 'danger', icon: 'alert-triangle', title: a.name, desc: `${mm.incidents.length} incidencia${mm.incidents.length>1?'s':''} abierta${mm.incidents.length>1?'s':''}.`, aula: a.id, go: 'aula' });
        if (mm.attRecords > 0 && mm.routinePct < 100) newAlerts.push({ sev: 'warn', icon: 'list-checks', title: a.name, desc: `Rutina del día incompleta (${mm.routinePct}% de bitácora).`, aula: a.id, go: 'aula' });
        if (!D.isWeekend && mm.nStudents > 0 && mm.postsToday === 0 && new Date().getHours() >= 11) newAlerts.push({ sev: 'warn', icon: 'megaphone', title: a.name, desc: 'Sin publicación de actividad hoy.', aula: a.id, go: 'muro' });
      });
      const o = { danger: 0, warn: 1, info: 2 };
      newAlerts.sort((x, y) => (o[x.sev]||0) - (o[y.sev]||0));
      D.alerts = newAlerts;

      const reds = newAlerts.filter(a => a.sev === 'danger').length;
      const warns = newAlerts.filter(a => a.sev === 'warn').length;
      D.level = reds > 0 ? 'danger' : (warns > 0 ? 'warn' : 'ok');
      D.semText = D.level === 'ok' ? 'Estancia operando normalmente'
        : D.level === 'warn' ? 'Requiere atención' : 'Requiere intervención';
    }

    this._rePaintHero();
    if (idStr) this._rePaintClassroomRow(idStr);
    this._rePaintSidebarBadge();
    if (this._tab === 'aula' && this._aulaId && String(this._aulaId) === idStr) {
      this._rePaintAulaStats(idStr);
    }
  },

  _rePaintHero() {
    const D = this._data;
    if (!D) return;
    const sem = document.getElementById('kscSem');
    if (sem) {
      sem.className = `ksc-sem ksc-sem--${D.level==='ok'?'ok':D.level==='warn'?'warn':'danger'}`;
      sem.innerHTML = `<i></i><span>${esc(D.semText)}</span>`;
    }
    const kpis = document.getElementById('kscKpis');
    if (kpis && D.kpis) {
      const K = D.kpis;
      const cards = [
        { v: K.aulas },
        { v: K.estudiantes },
        { v: K.maestras },
        { v: (K.rutinas ?? 0) + '%' },
        { v: K.publicaciones },
        { v: K.mensajes, alert: (K.mensajes||0) > 0 },
        { v: K.actividades },
      ];
      kpis.querySelectorAll('.ksc-kpi').forEach((node, i) => {
        const valEl = node.querySelector('.ksc-kpi-value');
        if (valEl && cards[i]) valEl.textContent = String(cards[i].v ?? '');
        if (typeof cards[i].alert === 'boolean') node.classList.toggle('ksc-kpi--alert', cards[i].alert);
      });
    }
  },

  _rePaintClassroomRow(idStr) {
    const target = this._data?.aulas?.find(a => String(a.id) === idStr) ||
                   this._data?.pool?.find(a => String(a.id) === idStr);
    if (!target) return;
    const tr = document.querySelector(`tr[data-ksc-open-aula="${CSS.escape ? CSS.escape(idStr) : idStr}"]`);
    if (!tr || !target.m) return;
    const m = target.m;
    const att = m.attRecords > 0
      ? `<span class="ksc-chip ${m.noRecord===0?'ksc-chip--ok':'ksc-chip--warn'}">${m.present}/${m.nStudents}${m.noRecord?` · ${m.noRecord} sin registro`:''}</span>`
      : `<span class="ksc-chip ksc-chip--muted">—</span>`;
    const rut = m.nStudents === 0
      ? '<span class="ksc-chip ksc-chip--muted">—</span>'
      : `<span class="ksc-chip ${m.routinePct>=100?'ksc-chip--ok':m.routinePct>0?'ksc-chip--warn':'ksc-chip--danger'}">${m.routinePct}%</span>`;
    const pub = `<span class="ksc-chip ${m.postsToday>0?'ksc-chip--ok':m.postsWeek>0?'ksc-chip--warn':'ksc-chip--danger'}">${m.postsToday} hoy</span>`;
    const msg = m.msgsPending.length
      ? `<button type="button" class="ksc-chip ksc-chip--${m.msgsPending.length>=3?'danger':'warn'} ksc-chip--clickable" data-ksc-action="replyMsgsFromChip" data-ksc-classroom="${esc(target.id)}">${m.msgsPending.length} pend.</button>`
      : '<span class="ksc-chip ksc-chip--ok">0</span>';
    const cells = tr.querySelectorAll('td');
    if (cells[2]) cells[2].innerHTML = att;
    if (cells[3]) cells[3].innerHTML = rut;
    if (cells[4]) cells[4].innerHTML = pub;
    if (cells[5]) cells[5].innerHTML = msg;
    if (cells[6] && m.lastActivity) cells[6].textContent = this._relTime(m.lastActivity);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  _rePaintAulaStats(idStr) {
    const target = this._data?.aulas?.find(a => String(a.id) === idStr) ||
                   this._data?.pool?.find(a => String(a.id) === idStr);
    if (!target || !target.m) return;
    const view = document.getElementById('kscView');
    if (!view) return;
    const statEls = view.querySelectorAll('.ksc-stat');
    const m = target.m;
    const statValues = [
      m.nStudents,
      m.attRecords ? `${m.present}/${m.nStudents}` : '—',
      m.routinePct + '%',
      m.postsWeek,
      m.msgsPending.length,
      m.tasksWeek,
      m.incidents.length,
      m.lastActivity ? this._fmtTime(m.lastActivity) : '—',
    ];
    statEls.forEach((el, i) => {
      const val = el.querySelector('.ksc-stat-value');
      if (val && statValues[i] != null) val.textContent = String(statValues[i]);
    });
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  _rePaintSidebarBadge() {
    const n = this._data?.alerts?.length || 0;
    const b = document.getElementById('badge-ksc');
    if (!b) return;
    if (n > 0) {
      b.textContent = n > 99 ? '99+' : String(n);
      b.classList.remove('hidden');
      b.style.display = '';
    } else {
      b.classList.add('hidden');
      b.style.display = 'none';
    }
  },

  /* ══════════════ BARRA DE ACCIONES RÁPIDAS (Ficha de Aula) ══════════════ */
  _renderQuickActionsBar(a) {
    const role = this._currentRole();
    const accent = role === 'asistente' ? '#0d9488' : role === 'encargada' ? '#8B5CF6' : '#0B63C7';
    const m = a.m || {};
    const pendMsgs = m.msgsPending?.length || 0;
    const btn = (k, icon, label, badge, badgeCls) => `
      <button type="button" class="ksc-qa-btn" data-ksc-action="${k}" data-ksc-classroom="${esc(a.id)}" style="--accent:${accent}">
        <span class="ksc-qa-icon"><i data-lucide="${icon}"></i></span>
        <span class="ksc-qa-label">${esc(label)}</span>
        ${badge != null ? `<span class="ksc-qa-badge ${badgeCls || ''}">${esc(badge)}</span>` : ''}
      </button>`;
    const spv = `
      <button type="button" class="ksc-qa-btn ksc-qa-btn--primary ksc-qa-btn--supervision" data-ksc-action="superviseAula" data-ksc-classroom="${esc(a.id)}" style="--accent:#6D28D9">
        <span class="ksc-qa-icon"><i data-lucide="eye"></i></span>
        <span class="ksc-qa-label">Supervisar aula</span>
        <span class="ksc-qa-badge is-new" title="Nuevo">NEW</span>
      </button>`;
    return `
      <div class="ksc-quick-actions" style="--accent:${accent}">
        ${btn('replyMsgs', 'message-square-reply', 'Responder mensajes', pendMsgs > 0 ? pendMsgs : null, pendMsgs >= 3 ? 'is-danger' : pendMsgs > 0 ? 'is-warn' : '')}
        ${btn('newPost', 'megaphone', 'Publicar en muro', null)}
        ${btn('newEvent', 'calendar-plus', 'Crear / Agendar evento', null)}
        ${spv}
      </div>`;
  },

  /* ══════════════ USUARIO ACTUAL ══════════════ */
  async _getCurrentUser() {
    if (this._cachedUser?.id) return this._cachedUser;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      let profile = null;
      try {
        const { data } = await supabase.from('profiles').select('id,name,role,avatar_url').eq('id', user.id).maybeSingle();
        profile = data || null;
      } catch (_) { profile = null; }
      this._cachedUser = { id: user.id, email: user.email, profile };
      return this._cachedUser;
    } catch (e) {
      console.warn('[CentroEscolar] _getCurrentUser error', e);
      return null;
    }
  },

  /* ══════════════ MODAL #1 — RESPONDER MENSAJES (T4/T5) ══════════════ */
  _scModalActive: null,
  openReplyMessagesModal(classroomId) {
    const aula = this._data?.aulas.find(x => x.id && String(x.id) === String(classroomId)) ||
                 this._data?.pool.find(x => x.id && String(x.id) === String(classroomId));
    if (!aula) return Helpers.toast('Aula no encontrada', 'error');
    this._scModalActive = { type: 'reply', classroomId, originTab: this._tab };
    const pend = aula.m?.msgsPending || [];
    const role = this._currentRole();
    const accent = role === 'asistente' ? '#0d9488' : role === 'encargada' ? '#8B5CF6' : '#0B63C7';
    const header = `
      <div class="ksc-modal-header" style="--accent:${accent}">
        <div class="ksc-modal-head-left">
          <div class="ksc-modal-avatar"><i data-lucide="message-square-reply"></i></div>
          <div>
            <h3>Responder mensajes</h3>
            <p><b>${esc(aula.name)}</b> · ${pend.length} pendiente${pend.length===1?'':'s'} · ${esc(aula.teacher?.name||'Sin maestra asignada')}</p>
          </div>
        </div>
        <button type="button" class="ksc-modal-close" data-ksc-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
      </div>`;
    const body = this._renderReplyBody(aula);
    const footer = `
      <div class="ksc-modal-footer" id="ksc-reply-footer" style="display:none">
        <textarea id="ksc-reply-input" rows="2" placeholder="Escribe tu respuesta… (Enter para enviar, Shift+Enter para nueva línea)"></textarea>
        <div class="ksc-reply-actions">
          <button type="button" class="ksc-qa-btn ksc-qa-btn--ghost" data-ksc-modal-close>Cancelar</button>
          <button type="button" class="ksc-qa-btn ksc-qa-btn--primary" id="ksc-reply-send" style="--accent:${accent}"><i data-lucide="send"></i> Enviar</button>
        </div>
      </div>`;
    const content = `
      <div class="ksc-modal" data-ksc-modal="replyMsgs" style="--accent:${accent}">
        ${header}
        <div class="ksc-modal-body">${body}</div>
        ${footer}
      </div>`;
    openGlobalModal(content, { width: 'min(1080px, 94vw)', maxHeight: '88vh' });
    this._bindReplyModal(classroomId, aula);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  _renderReplyBody(aula) {
    const pend = aula.m?.msgsPending || [];
    const listHtml = pend.length ? pend.map((m, idx) => `
      <div class="ksc-msg-item" data-ksc-msg-id="${esc(m.id)}" data-ksc-receiver="${esc(m.sender_id)}" data-ksc-index="${idx}">
        <div class="ksc-msg-av">${esc(((m.sender?.name||'?').charAt(0)).toUpperCase())}</div>
        <div class="ksc-msg-main">
          <div class="ksc-msg-title"><b>${esc(m.sender?.name||'Padre/Madre')}</b> <span class="ksc-msg-role">${esc(m.sender?.role || 'padre')}</span></div>
          <div class="ksc-msg-preview">${esc((m.content||'').slice(0, 140))}${m.content && m.content.length>140?'…':''}</div>
          <div class="ksc-msg-time">${esc(this._relTime(m.created_at))}</div>
        </div>
        <span class="ksc-chip ksc-chip--danger">sin leer</span>
      </div>`).join('')
      : `<div class="ksc-empty"><i data-lucide="check-circle-2"></i><div>¡Todo respondido en este aula!</div></div>`;
    return `
      <div class="ksc-reply-grid">
        <aside class="ksc-msg-list">
          <div class="ksc-msg-list-head">
            <div class="ksc-msg-list-title">Mensajes pendientes</div>
            <span class="ksc-chip ksc-chip--warn">${pend.length}</span>
          </div>
          <div class="ksc-msg-list-body" id="ksc-msg-list-body">${listHtml}</div>
        </aside>
        <section class="ksc-msg-thread" id="ksc-msg-thread">
          <div class="ksc-empty"><i data-lucide="messages-square"></i><div>Selecciona un mensaje de la izquierda para ver el hilo y responder.</div></div>
        </section>
      </div>`;
  },

  _bindReplyModal(classroomId, aula) {
    const modal = document.querySelector('[data-ksc-modal="replyMsgs"]');
    if (!modal) return;
    const close = () => {
      const origin = this._scModalActive?.originTab;
      this._scModalActive = null;
      this._scPendingAttachReply = null;
      _scCloseModal();
      if (origin && origin !== 'aula' && origin !== this._tab) this.go(origin);
    };
    modal.querySelectorAll('[data-ksc-modal-close]').forEach(b => b.addEventListener('click', close));
    Helpers.delegate(modal, '.ksc-msg-item', 'click', (_e, el) => this._openReplyThread(classroomId, aula, el));
    const input = document.getElementById('ksc-reply-input');
    const sendBtn = document.getElementById('ksc-reply-send');
    if (input) {
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 140) + 'px';
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn?.click(); }
      });
    }
    sendBtn?.addEventListener('click', () => this.sendReplyFromModal(classroomId, aula));
  },

  _openReplyThread(classroomId, aula, rowEl) {
    const receiverId = rowEl?.dataset?.kscReceiver;
    const msgId = rowEl?.dataset?.kscMsgId;
    if (!receiverId) return;
    document.querySelectorAll('.ksc-msg-item').forEach(x => x.classList.remove('active'));
    rowEl.classList.add('active');
    const threadEl = document.getElementById('ksc-msg-thread');
    const footer = document.getElementById('ksc-reply-footer');
    footer.style.display = 'flex';
    threadEl.innerHTML = `<div class="ksc-loading"><i data-lucide="loader-2"></i> Cargando hilo…</div>`;
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
    this._scPendingAttachReply = { classroomId, aula, receiverId, msgId };
    this._loadThreadAndRender(receiverId, aula);
  },

  async _loadThreadAndRender(receiverId, aula) {
    const me = await this._getCurrentUser();
    const threadEl = document.getElementById('ksc-msg-thread');
    if (!threadEl) return;
    const pair = [me?.id, receiverId].filter(Boolean);
    let conv = [];
    try {
      const { data, error } = await supabase.from('messages')
        .select('id,sender_id,receiver_id,content,created_at,is_read')
        .or(`and(sender_id.eq.${pair[0]},receiver_id.eq.${pair[1]}),and(sender_id.eq.${pair[1]},receiver_id.eq.${pair[0]})`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error) conv = (data || []).slice().reverse();
    } catch (_) { conv = []; }
    const bubbles = conv.map(m => {
      const mine = me && String(m.sender_id) === String(me.id);
      const name = aula.m?.msgsPending?.find(x => String(x.sender_id) === String(m.sender_id))?.sender?.name ||
                   (mine ? 'Tú' : 'Padre/Madre');
      return `<div class="ksc-bubble ${mine?'ksc-bubble--mine':'ksc-bubble--them'}">
        <div class="ksc-bubble-meta">${mine ? 'Tú' : esc(name)} · ${esc(this._fmtTime(m.created_at))}${m.is_read && !mine ? ' · ✔️ leído' : (!m.is_read && !mine ? ' · enviado' : '')}</div>
        <div class="ksc-bubble-body">${esc(m.content || '')}</div>
      </div>`;
    }).join('') || `<div class="ksc-empty"><i data-lucide="message-circle"></i><div>Aún no hay hilo. Escribe tu primera respuesta a continuación.</div>`;
    threadEl.innerHTML = `<div class="ksc-thread-head"><i data-lucide="users"></i> Conversación · ${esc(aula.name)}</div><div class="ksc-thread-bubbles" id="ksc-thread-bubbles">${bubbles}</div>`;
    const last = document.getElementById('ksc-thread-bubbles');
    if (last) requestAnimationFrame(() => { last.scrollTop = last.scrollHeight; });
    const inp = document.getElementById('ksc-reply-input');
    if (inp) setTimeout(() => inp.focus(), 50);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  async sendReplyFromModal(classroomId, aula) {
    const inp = document.getElementById('ksc-reply-input');
    const content = (inp?.value || '').trim();
    const attach = this._scPendingAttachReply;
    if (!content) { Helpers.toast('Escribe un mensaje primero', 'warn'); inp?.focus(); return; }
    if (!attach?.receiverId) { Helpers.toast('Selecciona un mensaje para responder', 'warn'); return; }
    const me = await this._getCurrentUser();
    if (!me) return Helpers.toast('Sesión no válida', 'error');
    const payload = { sender_id: me.id, receiver_id: attach.receiverId, content, created_at: new Date().toISOString(), is_read: false };
    const sendSdk = () => supabase.from('messages').insert(payload).select().maybeSingle();
    let result = null;
    try {
      const r = await sendSdk();
      if (r?.error && ['401','403','42501','PGRST'].some(x => String(r.error?.code || r.error?.message || '').includes(x))) throw r.error;
      result = r?.data || null;
    } catch (eSdk) {
      try {
        const anonKey = window.__sc_anon_key || (supabase.supabaseUrl ? (supabase.auth.session?.()?.access_token) : null);
        const cfg = supabase;
        const url = `${cfg.supabaseUrl || (window.__scUrl||'')}/rest/v1/messages`;
        const headers = {
          'Content-Type': 'application/json',
          'apikey': cfg.supabaseAnonKey || window.__scAnonKey || '',
          'Authorization': `Bearer ${cfg.supabaseAnonKey || window.__scAnonKey || ''}`,
          'Prefer': 'return=representation',
        };
        const raw = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (raw.ok) result = (await raw.json())[0] || payload;
      } catch (eFb) {
        console.warn('[CentroEscolar] fallback also failed', eFb);
      }
    }
    if (!result) return Helpers.toast('No se pudo enviar la respuesta. Intenta de nuevo.', 'error');
    Helpers.toast('Respuesta enviada ✔️', 'success');
    inp.value = ''; inp.style.height = 'auto';
    try {
      if (window.UnreadMessages && typeof window.UnreadMessages.recalcBadge === 'function') window.UnreadMessages.recalcBadge();
      else if (window.BadgeSystem) try { window.BadgeSystem.refresh('chat'); } catch(_){}
    } catch(_) {}
    try { _scSendPush && _scSendPush({ include_player_ids: [attach.receiverId], headings: { en: 'Nuevo mensaje' }, contents: { en: content.slice(0, 120) } }); } catch(_) {}
    this._refreshAfterAction(classroomId, { decPendingMsgs: 1 });
    const listEl = document.getElementById('ksc-msg-list-body');
    if (listEl && aula) {
      const a = this._data?.aulas.find(x=>x.id&&String(x.id)===String(classroomId)) || this._data?.pool.find(x=>x.id&&String(x.id)===String(classroomId));
      const pend = a?.m?.msgsPending || [];
      listEl.innerHTML = pend.length ? pend.map((m, idx) => `
        <div class="ksc-msg-item ${attach.msgId===m.id?'':''}" data-ksc-msg-id="${esc(m.id)}" data-ksc-receiver="${esc(m.sender_id)}" data-ksc-index="${idx}">
          <div class="ksc-msg-av">${esc(((m.sender?.name||'?').charAt(0)).toUpperCase())}</div>
          <div class="ksc-msg-main">
            <div class="ksc-msg-title"><b>${esc(m.sender?.name||'Padre/Madre')}</b> <span class="ksc-msg-role">${esc(m.sender?.role || 'padre')}</span></div>
            <div class="ksc-msg-preview">${esc((m.content||'').slice(0,140))}${m.content && m.content.length>140?'…':''}</div>
            <div class="ksc-msg-time">${esc(this._relTime(m.created_at))}</div>
          </div>
          <span class="ksc-chip ksc-chip--danger">sin leer</span>
        </div>`).join('')
      : `<div class="ksc-empty"><i data-lucide="check-circle-2"></i><div>¡Todo respondido en este aula!</div></div>`;
    }
    this._loadThreadAndRender(attach.receiverId, aula);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  /* ══════════════ MODAL #2 — PUBLICAR EN MURO (T7/T8) ══════════════ */
  openNewPostModal(classroomId) {
    const aula = this._data?.aulas.find(x => x.id && String(x.id) === String(classroomId)) ||
                 this._data?.pool.find(x => x.id && String(x.id) === String(classroomId));
    if (!aula) return Helpers.toast('Aula no encontrada', 'error');
    this._scModalActive = { type: 'post', classroomId, originTab: this._tab };
    const role = this._currentRole();
    const accent = role === 'asistente' ? '#0d9488' : role === 'encargada' ? '#8B5CF6' : '#0B63C7';
    const canGlobal = ['directora','encargada','admin'].includes(role);
    const header = `
      <div class="ksc-modal-header" style="--accent:${accent}">
        <div class="ksc-modal-head-left">
          <div class="ksc-modal-avatar"><i data-lucide="megaphone"></i></div>
          <div>
            <h3>Nueva publicación</h3>
            <p>Aula fijada: <b>${esc(aula.name)}</b> · ${new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
          </div>
        </div>
        <button type="button" class="ksc-modal-close" data-ksc-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
      </div>`;
    const content = `
      <div class="ksc-modal" data-ksc-modal="newPost" style="--accent:${accent}">
        ${header}
        <div class="ksc-modal-body">
          <div class="ksc-composer">
            <div class="ksc-composer-tags">
              <span class="ksc-chip" style="background:${esc(aula.color)}1f;color:${esc(aula.color)};border:3px solid ${esc(aula.color)}33;border-radius:18px;padding:6px 14px;">
                <i data-lucide="school"></i> Aula · ${esc(aula.name)} <i data-lucide="lock"></i>
              </span>
              ${canGlobal ? `
                <label class="ksc-composer-global">
                  <input type="checkbox" id="ksc-post-is-global">
                  <span>Publicar también como <b>anuncio general</b> (muro de todas las familias)</span>
                </label>` : ''}
            </div>
            <input type="text" id="ksc-post-title" class="ksc-inp" placeholder="Título (opcional) · ejemplo: Actividad de la semana del libro" maxlength="120">
            <textarea id="ksc-post-content" rows="5" class="ksc-inp ksc-inp--area" placeholder="Cuéntale a las familias cómo va el día, la actividad de hoy, fotos, recordatorios…" maxlength="4000"></textarea>
            <div class="ksc-composer-tools">
              <label class="ksc-tool-btn" title="Agregar fotos/videos">
                <i data-lucide="image-plus"></i> Adjuntar medios
                <input type="file" id="ksc-post-files" accept="image/*,video/*" multiple hidden>
              </label>
              <div id="ksc-post-preview" class="ksc-post-preview"></div>
            </div>
          </div>
        </div>
        <div class="ksc-modal-footer">
          <div style="flex:1;color:#64748B;font-size:12px;font-weight:600" id="ksc-post-counter">0 caracteres</div>
          <button type="button" class="ksc-qa-btn ksc-qa-btn--ghost" data-ksc-modal-close>Cancelar</button>
          <button type="button" class="ksc-qa-btn ksc-qa-btn--primary" id="ksc-post-submit" style="--accent:${accent}"><i data-lucide="send"></i> Publicar</button>
        </div>
      </div>`;
    openGlobalModal(content, { width: 'min(880px, 94vw)', maxHeight: '88vh' });
    this._bindNewPostModal(classroomId, aula);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  _bindNewPostModal(classroomId, aula) {
    const modal = document.querySelector('[data-ksc-modal="newPost"]');
    if (!modal) return;
    const close = () => {
      const origin = this._scModalActive?.originTab;
      this._scModalActive = null;
      this._scPendingPostFiles = null;
      _scCloseModal();
      if (origin && origin !== 'aula' && origin !== this._tab) this.go(origin);
    };
    modal.querySelectorAll('[data-ksc-modal-close]').forEach(b => b.addEventListener('click', close));
    const content = document.getElementById('ksc-post-content');
    const counter = document.getElementById('ksc-post-counter');
    const files = document.getElementById('ksc-post-files');
    const preview = document.getElementById('ksc-post-preview');
    const submit = document.getElementById('ksc-post-submit');
    if (content) {
      content.addEventListener('input', () => {
        counter.textContent = `${content.value.length} caracteres${content.value.length>=3500?` · ${4000-content.value.length} restantes`:''}`;
        submit.disabled = content.value.trim().length === 0;
        submit.style.opacity = content.value.trim().length === 0 ? '0.55' : '1';
        submit.style.cursor = content.value.trim().length === 0 ? 'not-allowed' : 'pointer';
      });
    }
    if (submit) submit.disabled = true;
    this._scPendingPostFiles = [];
    if (files) files.addEventListener('change', async (e) => {
      const chosen = Array.from(e.target.files || []).slice(0, 4);
      preview.innerHTML = '';
      this._scPendingPostFiles = [];
      for (const f of chosen) {
        const url = URL.createObjectURL(f);
        const isVideo = f.type.startsWith('video');
        const div = document.createElement('div');
        div.className = 'ksc-preview-item';
        div.innerHTML = isVideo
          ? `<video src="${url}" controls muted></video><button type="button" class="ksc-preview-x" title="Quitar"><i data-lucide="x"></i></button>`
          : `<img src="${url}" alt="preview"><button type="button" class="ksc-preview-x" title="Quitar"><i data-lucide="x"></i></button>`;
        preview.appendChild(div);
        this._scPendingPostFiles.push(f);
        div.querySelector('.ksc-preview-x').addEventListener('click', () => {
          const idx = this._scPendingPostFiles.indexOf(f);
          if (idx >= 0) this._scPendingPostFiles.splice(idx, 1);
          div.remove();
        });
        if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
      }
    });
    submit?.addEventListener('click', () => this.submitPostFromCenter(classroomId, aula));
  },

  async submitPostFromCenter(classroomId, aula) {
    const title = (document.getElementById('ksc-post-title')?.value || '').trim();
    const content = (document.getElementById('ksc-post-content')?.value || '').trim();
    const isGlobal = !!document.getElementById('ksc-post-is-global')?.checked;
    const submit = document.getElementById('ksc-post-submit');
    if (!content) { Helpers.toast('Contenido requerido', 'warn'); return; }
    if (submit) { submit.disabled = true; submit.textContent = 'Publicando…'; }
    const me = await this._getCurrentUser();
    if (!me) { Helpers.toast('Sesión no válida', 'error'); if (submit) submit.disabled=false; return; }
    let mediaUrls = [];
    const pendingFiles = this._scPendingPostFiles || [];
    if (pendingFiles.length) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        for (let i = 0; i < pendingFiles.length; i++) {
          const f = pendingFiles[i];
          const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
          const key = `posts/classroom_${classroomId}/${Date.now()}_${i}_${Math.random().toString(36).slice(2,6)}.${ext}`;
          const cfg = supabase;
          const uploadUrl = `${cfg.supabaseUrl || window.__scUrl || ''}/storage/v1/object/public/class-media/${key}`;
          try {
            const r = await supabase.storage.from('class-media').upload(key, f, { cacheControl: '3600', upsert: true });
            if (r?.error) throw r.error;
            mediaUrls.push(uploadUrl);
          } catch (e) {
            try {
              const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': f.type }, body: f });
              if (res.ok) mediaUrls.push(uploadUrl);
            } catch (efb) { console.warn('[CentroEscolar] media fallback failed', efb); }
          }
        }
      } catch (eU) { console.warn('[CentroEscolar] media upload error', eU); }
    }
    const target = isGlobal ? null : classroomId;
    const payload = {
      classroom_id: target, teacher_id: me.id, teacher_name: me.profile?.name || 'Dirección',
      title: title || null, content, media_urls: mediaUrls.length ? mediaUrls : null,
      created_at: new Date().toISOString(),
    };
    let row = null;
    try {
      const r = await supabase.from('posts').insert(payload).select().maybeSingle();
      if (r?.error && ['401','403','42501','PGRST'].some(x => String(r.error?.code || r.error?.message || '').includes(x))) throw r.error;
      row = r?.data || null;
    } catch (eSdk) {
      try {
        const cfg = supabase;
        const url = `${cfg.supabaseUrl || window.__scUrl || ''}/rest/v1/posts`;
        const headers = {
          'Content-Type': 'application/json',
          'apikey': cfg.supabaseAnonKey || window.__scAnonKey || '',
          'Authorization': `Bearer ${cfg.supabaseAnonKey || window.__scAnonKey || ''}`,
          'Prefer': 'return=representation',
        };
        const raw = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (raw.ok) row = (await raw.json())[0] || payload;
      } catch (eFb) { console.warn('[CentroEscolar] post fallback failed', eFb); }
    }
    if (!row) { Helpers.toast('No se pudo publicar. Intenta de nuevo.', 'error'); if (submit) { submit.disabled=false; submit.textContent='Publicar'; } return; }
    if (this._postsCache && !Array.isArray(this._postsCache)) this._postsCache = [];
    if (Array.isArray(this._postsCache)) this._postsCache.unshift({ ...row, teacher: { name: row.teacher_name || me.profile?.name } });
    this._refreshAfterAction(classroomId, { incPostsToday: 1, incPostsWeek: 1 });
    this._injectFeedItem({
      ts: new Date(row.created_at || Date.now()).getTime(), icon: 'megaphone', color: '#16A34A',
      title: `${esc(aula.name)} publicó actividad`, meta: `${this._fmtTime(row.created_at || new Date().toISOString())} · ${esc(title || content).slice(0,60)}`,
    });
    Helpers.toast('Publicación creada ✔️', 'success');
    const origin = this._scModalActive?.originTab;
    this._scModalActive = null; this._scPendingPostFiles = null; _scCloseModal();
    if (origin && origin !== 'aula' && origin !== this._tab) this.go(origin);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  _injectFeedItem(item) {
    const view = document.getElementById('kscView');
    if (!view) return;
    const feed = view.querySelector('.ksc-feed');
    if (!feed) return;
    const node = document.createElement('div');
    node.className = 'ksc-feed-item';
    node.style.animation = 'fadeUp .35s ease both';
    node.innerHTML = `
      <div class="ksc-feed-dot" style="--c:${esc(item.color||'#0B63C7')}"><i data-lucide="${esc(item.icon||'zap')}"></i></div>
      <div class="ksc-feed-txt">
        <div class="ksc-feed-title">${item.title||''}</div>
        <div class="ksc-feed-meta">${item.meta||''}</div>
      </div>`;
    feed.insertBefore(node, feed.firstChild);
    const limit = 16;
    while (feed.childElementCount > limit) feed.removeChild(feed.lastChild);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  /* ══════════════ MODAL #3 — CREAR / AGENDAR EVENTO (T9/T10) ══════════════ */
  openNewEventModal(classroomId) {
    const aula = this._data?.aulas.find(x => x.id && String(x.id) === String(classroomId)) ||
                 this._data?.pool.find(x => x.id && String(x.id) === String(classroomId));
    if (!aula) return Helpers.toast('Aula no encontrada', 'error');
    this._scModalActive = { type: 'event', classroomId, originTab: this._tab };
    this._scEventCache = { selectedType: null, tab: 'now' };
    const role = this._currentRole();
    const accent = role === 'asistente' ? '#0d9488' : role === 'encargada' ? '#8B5CF6' : '#0B63C7';
    const types = Object.entries(EVENT_META || {}).map(([key, m]) => ({ key, ...m }));
    const students = aula.m?.students || [];
    const todayStr = this._todayISO();
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const header = `
      <div class="ksc-modal-header" style="--accent:${accent}">
        <div class="ksc-modal-head-left">
          <div class="ksc-modal-avatar"><i data-lucide="calendar-plus"></i></div>
          <div>
            <h3>Crear / Agendar Evento</h3>
            <p>Aula · <b>${esc(aula.name)}</b> · ${students.length} estudiante${students.length===1?'':'s'}</p>
          </div>
        </div>
        <button type="button" class="ksc-modal-close" data-ksc-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
      </div>`;
    const typeChips = types.map(t => `
      <button type="button" class="ksc-type-chip" data-ksc-event-type="${esc(t.key)}" style="--c:${esc(t.color)}">
        <i data-lucide="${esc(t.icon||'zap')}"></i>
        <span>${esc(t.label)}</span>
      </button>`).join('');
    const studentRows = students.length ? students.map(s => `
      <label class="ksc-student-row">
        <input type="checkbox" class="ksc-student-check" data-ksc-student="${esc(s.id)}" checked>
        <div class="ksc-student-av">${esc(((s.name||'?').charAt(0)).toUpperCase())}</div>
        <div class="ksc-student-name">${esc(s.name)}</div>
      </label>`).join('')
      : `<div class="ksc-empty"><i data-lucide="users"></i><div>Este aula no tiene estudiantes registrados.</div></div>`;
    const content = `
      <div class="ksc-modal" data-ksc-modal="newEvent" style="--accent:${accent}">
        ${header}
        <div class="ksc-tabs">
          <button type="button" class="ksc-tab ksc-tab--sm active" data-ksc-event-tab="now"><i data-lucide="zap"></i> Registrar ahora</button>
          <button type="button" class="ksc-tab ksc-tab--sm" data-ksc-event-tab="future"><i data-lucide="calendar-clock"></i> Agendar futuro</button>
        </div>
        <div class="ksc-modal-body">
          <div class="ksc-event-type-head"><span class="ksc-event-type-label">Tipo de evento</span><span id="ksc-event-type-sel" style="color:#64748B;font-weight:600;font-size:12px">elige uno</span></div>
          <div class="ksc-type-grid" id="ksc-type-grid">${typeChips}</div>
          <div class="ksc-event-date-row" id="ksc-event-date-row" style="display:none">
            <label><span>Fecha</span><input type="date" id="ksc-event-date" value="${esc(todayStr)}" class="ksc-inp"></label>
            <label><span>Hora</span><input type="time" id="ksc-event-time" value="${esc(timeStr)}" class="ksc-inp"></label>
          </div>
          <textarea id="ksc-event-notes" rows="2" class="ksc-inp ksc-inp--area" placeholder="Notas / detalles (opcional) — temperatura, síntomas, observaciones de medicación, etc."></textarea>
          <div class="ksc-students-head">
            <label class="ksc-checkall">
              <input type="checkbox" id="ksc-check-all" checked>
              <span>Aplicar a todo el grupo (${students.length})</span>
            </label>
            <span class="ksc-chip ksc-chip--info" id="ksc-selected-count">${students.length} seleccionados</span>
          </div>
          <div class="ksc-student-list">${studentRows}</div>
        </div>
        <div class="ksc-modal-footer">
          <button type="button" class="ksc-qa-btn ksc-qa-btn--ghost" data-ksc-modal-close>Cancelar</button>
          <button type="button" class="ksc-qa-btn ksc-qa-btn--primary" id="ksc-event-submit" style="--accent:${accent}" disabled><i data-lucide="save"></i> Guardar evento</button>
        </div>
      </div>`;
    openGlobalModal(content, { width: 'min(1000px, 94vw)', maxHeight: '90vh' });
    this._bindNewEventModal(classroomId, aula, students.length);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  _bindNewEventModal(classroomId, aula, totalStudents) {
    const modal = document.querySelector('[data-ksc-modal="newEvent"]');
    if (!modal) return;
    const close = () => {
      const origin = this._scModalActive?.originTab;
      this._scModalActive = null;
      _scCloseModal();
      if (origin && origin !== 'aula' && origin !== this._tab) this.go(origin);
    };
    modal.querySelectorAll('[data-ksc-modal-close]').forEach(b => b.addEventListener('click', close));
    const dateRow = document.getElementById('ksc-event-date-row');
    const selTypeText = document.getElementById('ksc-event-type-sel');
    const submit = document.getElementById('ksc-event-submit');
    const updSubmit = () => {
      const ok = !!this._scEventCache?.selectedType && this._getSelectedStudents().length > 0;
      if (submit) { submit.disabled = !ok; submit.style.opacity = ok ? '1' : '0.55'; submit.style.cursor = ok ? 'pointer' : 'not-allowed'; }
    };
    modal.querySelectorAll('[data-ksc-event-tab]').forEach(b => b.addEventListener('click', () => {
      modal.querySelectorAll('[data-ksc-event-tab]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const tab = b.dataset.kscEventTab;
      this._scEventCache.tab = tab;
      if (dateRow) dateRow.style.display = tab === 'future' ? 'flex' : 'none';
    }));
    modal.querySelectorAll('.ksc-type-chip').forEach(chip => chip.addEventListener('click', () => {
      modal.querySelectorAll('.ksc-type-chip').forEach(x => x.classList.remove('active'));
      chip.classList.add('active');
      const type = chip.dataset.kscEventType;
      this._scEventCache.selectedType = type;
      const meta = EVENT_META?.[type] || { label: type };
      if (selTypeText) { selTypeText.innerHTML = `<span style="color:${esc(meta.color||'#0B63C7')};font-weight:800">✔ ${esc(meta.label||type)}</span>`; }
      updSubmit();
    }));
    const allCheck = document.getElementById('ksc-check-all');
    const count = document.getElementById('ksc-selected-count');
    const recalcCount = () => {
      const n = this._getSelectedStudents().length;
      if (count) count.textContent = `${n} seleccionado${n===1?'':'s'}`;
      if (allCheck) allCheck.checked = totalStudents > 0 && n === totalStudents;
      updSubmit();
    };
    if (allCheck) allCheck.addEventListener('change', () => {
      modal.querySelectorAll('.ksc-student-check').forEach(cb => { cb.checked = allCheck.checked; });
      recalcCount();
    });
    Helpers.delegate(modal, '.ksc-student-check', 'change', recalcCount);
    submit?.addEventListener('click', () => this.recordEventFromCenter(classroomId, aula));
  },

  _getSelectedStudents() {
    const nodes = document.querySelectorAll('.ksc-student-check:checked');
    return Array.from(nodes).map(x => x.dataset.kscStudent).filter(Boolean);
  },

  async recordEventFromCenter(classroomId, aula) {
    const type = this._scEventCache?.selectedType;
    if (!type) return Helpers.toast('Elige un tipo de evento', 'warn');
    const studentIds = this._getSelectedStudents();
    if (!studentIds.length) return Helpers.toast('Selecciona al menos un estudiante', 'warn');
    const tab = this._scEventCache?.tab || 'now';
    let dateISO, timeStr;
    if (tab === 'future') {
      dateISO = (document.getElementById('ksc-event-date')?.value || this._todayISO());
      timeStr = (document.getElementById('ksc-event-time')?.value || '12:00');
    } else {
      const now = new Date();
      dateISO = this._todayISO();
      timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    }
    const notes = (document.getElementById('ksc-event-notes')?.value || '').trim();
    const me = await this._getCurrentUser();
    if (!me) return Helpers.toast('Sesión no válida', 'error');
    const submit = document.getElementById('ksc-event-submit');
    if (submit) { submit.disabled = true; submit.textContent = 'Guardando…'; }
    const eventTimeIso = `${dateISO}T${timeStr}:00`;
    const payload = {
      classroom_id: classroomId, teacher_id: me.id, event_type: type, event_date: dateISO, event_time: eventTimeIso,
    };
    let eventRow = null;
    try {
      const r = await supabase.from('classroom_events').insert(payload).select().maybeSingle();
      if (r?.error && ['401','403','42501','PGRST'].some(x => String(r.error?.code || r.error?.message || '').includes(x))) throw r.error;
      eventRow = r?.data || null;
    } catch (eSdk) {
      try {
        const cfg = supabase;
        const url = `${cfg.supabaseUrl || window.__scUrl || ''}/rest/v1/classroom_events`;
        const headers = {
          'Content-Type': 'application/json',
          'apikey': cfg.supabaseAnonKey || window.__scAnonKey || '',
          'Authorization': `Bearer ${cfg.supabaseAnonKey || window.__scAnonKey || ''}`,
          'Prefer': 'return=representation',
        };
        const raw = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (raw.ok) eventRow = (await raw.json())[0] || payload;
      } catch (eFb) { console.warn('[CentroEscolar] event fallback failed', eFb); }
    }
    if (!eventRow) { Helpers.toast('No se pudo crear el evento', 'error'); if (submit){ submit.disabled=false; submit.textContent='Guardar evento';} return; }
    const eid = eventRow.id;
    const participants = studentIds.map(sid => ({
      event_id: eid, student_id: sid, status: 'present', extra_data: notes ? { notes } : null,
    }));
    let participantsOk = true;
    try {
      const rp = await supabase.from('event_participants').insert(participants);
      if (rp?.error) throw rp.error;
    } catch (eP) {
      try {
        const cfg = supabase;
        const url = `${cfg.supabaseUrl || window.__scUrl || ''}/rest/v1/event_participants`;
        const headers = {
          'Content-Type': 'application/json',
          'apikey': cfg.supabaseAnonKey || window.__scAnonKey || '',
          'Authorization': `Bearer ${cfg.supabaseAnonKey || window.__scAnonKey || ''}`,
          'Prefer': 'return=minimal',
        };
        const raw = await fetch(url, { method: 'POST', headers, body: JSON.stringify(participants) });
        participantsOk = raw.ok;
      } catch (eFb2) { participantsOk = false; }
    }
    const meta = evMeta(type);
    const delta = dateISO === this._todayISO() ? 1 : 0;
    this._refreshAfterAction(classroomId, { incEventsToday: delta, recomputeRoutine: !!delta });
    if (delta) {
      const target = this._data?.aulas.find(x=>x.id&&String(x.id)===String(classroomId)) || this._data?.pool.find(x=>x.id&&String(x.id)===String(classroomId));
      if (target?.m?.eventsToday && eventRow) target.m.eventsToday.push({ ...eventRow, _inline: true });
      this._injectFeedItem({
        ts: new Date(eventTimeIso).getTime(), icon: meta.icon, color: meta.color,
        title: `${esc(meta.label||'Evento')} · ${esc(aula.name)}`,
        meta: `${this._fmtTime(eventTimeIso)} · ${participants.length} estudiante${participants.length===1?'':'s'}`,
      });
    }
    this._showEventUndoBanner(eid, type, participantCountOk => {
      if (participantCountOk) {
        this._refreshAfterAction(classroomId, { recomputeRoutine: true });
        Helpers.toast(`${esc(meta.label||'Evento')} registrado ✔️`, 'success');
      } else {
        Helpers.toast('Evento creado (participantes no guardados)', 'warn');
      }
      const origin = this._scModalActive?.originTab;
      this._scModalActive = null; _scCloseModal();
      if (origin && origin !== 'aula' && origin !== this._tab) this.go(origin);
    }, participantsOk);
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  _showEventUndoBanner(eventId, eventType, done, participantsOk) {
    this._hideEventUndoBanner();
    const meta = evMeta(eventType);
    const container = document.createElement('div');
    container.id = 'ksc-undo-banner';
    container.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:white;border:3px solid #DBEAFE;border-radius:28px;box-shadow:0 14px 36px rgba(15,23,42,.10);padding:10px 16px;display:flex;align-items:center;gap:12px;z-index:99999;animation:fadeUp .3s ease both;';
    container.innerHTML = `
      <span style="color:#16A34A;font-weight:800;display:flex;align-items:center;gap:6px;font-size:13px;">
        <i data-lucide="check-circle"></i> ${esc(meta.label||'Evento')} registrado
      </span>
      <button id="ksc-undo-btn" type="button" style="background:#0B63C7;color:white;border:none;padding:7px 14px;border-radius:50px;font-weight:700;cursor:pointer;font-size:12px;letter-spacing:.03em;">DESHACER</button>
      <span id="ksc-undo-timer" style="color:#94A3B8;font-size:12px;font-weight:600;">10s</span>`;
    document.body.appendChild(container);
    let remaining = 10;
    let cancelled = false;
    const t = setInterval(() => {
      remaining--;
      const el = document.getElementById('ksc-undo-timer');
      if (el) el.textContent = `${remaining}s`;
      if (remaining <= 0) {
        clearInterval(t);
        if (!cancelled && !container._removed) { container._removed = true; try { document.body.removeChild(container); } catch(_){} done(participantsOk); }
      }
    }, 1000);
    document.getElementById('ksc-undo-btn').addEventListener('click', async () => {
      cancelled = true; clearInterval(t);
      try { await supabase.from('classroom_events').delete().eq('id', eventId); Helpers.toast('Evento deshecho', 'success'); }
      catch(_) { try {
        const cfg = supabase;
        const url = `${cfg.supabaseUrl || window.__scUrl || ''}/rest/v1/classroom_events?id=eq.${eventId}`;
        const headers = { 'Content-Type':'application/json', 'apikey': cfg.supabaseAnonKey || window.__scAnonKey || '', 'Authorization': `Bearer ${cfg.supabaseAnonKey || window.__scAnonKey || ''}` };
        const r = await fetch(url, { method: 'DELETE', headers }); if (!r.ok) throw new Error(); Helpers.toast('Evento deshecho', 'success');
      } catch(_2){ Helpers.toast('No se pudo deshacer (ya fue aplicado)', 'warn'); } }
      try { if (!container._removed) { container._removed = true; document.body.removeChild(container); } } catch(_){}
      const origin = this._scModalActive?.originTab;
      this._scModalActive = null; _scCloseModal();
      if (origin && origin !== 'aula' && origin !== this._tab) this.go(origin);
    });
    if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
  },

  _hideEventUndoBanner() {
    const b = document.getElementById('ksc-undo-banner'); if (b && !b._removed) { b._removed = true; try { document.body.removeChild(b); } catch(_){} }
  },

  /* ══════════════ DETECCIÓN DE ROL Y PANEL ACTUAL ══════════════ */
  _currentRole() {
    const path = (window.location.pathname || '').toLowerCase();
    if (/panel_asistente/.test(path)) return 'asistente';
    if (/panel_control|panel_encargada/.test(path)) return 'encargada';
    return 'directora';
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
