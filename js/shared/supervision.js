/**
 * 👁️ SupervisionEngine — Modo Supervisión de Aula
 * ------------------------------------------------
 * Arquitectura "como maestra, sin cambiar de cuenta".
 *
 *  - SupervisionEngine.enter({classroomId, teacherId, ...opts})
 *  - SupervisionEngine.exit({reason})
 *  - SupervisionEngine.registerAudit(action, payload)
 *  - SupervisionEngine.openInterventionModal(initialCtx)
 *  - SupervisionEngine.renderSupervisionBar()
 *
 * Integración:
 *   - Paneles staff (Directora/Asistente/Encargada):
 *       import SupervisionEngine from './shared/supervision.js';
 *       window.SupervisionEngine = SupervisionEngine;
 *   - Panel Maestra: boot desde URL ?supervision=true o desde localStorage.
 */

import { supabase, SUPABASE_URL } from './supabase.js';
import { TABLES, ROLES } from './constants.js';
import { safeToast } from '../maestra/modules/ui.js';

/* ──────────────────────────────────────────────────────────
 * Paleta de color premium por rol (coincidente con school-center.css)
 * ────────────────────────────────────────────────────────── */
const ROLE_ACCENT = Object.freeze({
  [ROLES.DIRECTORA]:  Object.freeze({ bg: '#0B63C7', glow: 'rgba(11,99,199,0.24)',  chip: '#0B63C7', label: 'Dirección' }),
  [ROLES.ASISTENTE]:  Object.freeze({ bg: '#0d9488', glow: 'rgba(13,148,136,0.24)',  chip: '#0d9488', label: 'Asistente'  }),
  [ROLES.ENCARGADA]:  Object.freeze({ bg: '#8B5CF6', glow: 'rgba(139,92,246,0.26)',  chip: '#8B5CF6', label: 'Encargada'  }),
  [ROLES.MAESTRA]:    Object.freeze({ bg: '#0284C7', glow: 'rgba(2,132,199,0.22)',   chip: '#0284C7', label: 'Maestra'    }),
  default:            Object.freeze({ bg: '#475569', glow: 'rgba(71,85,105,0.20)',   chip: '#475569', label: 'Staff'      })
});

const PRIORITY_META = Object.freeze([
  { key: 'baja',    label: 'Baja',    color: '#22C55E', dot: '#22C55E' },
  { key: 'media',   label: 'Media',   color: '#F59E0B', dot: '#F59E0B' },
  { key: 'alta',    label: 'Alta',    color: '#EF4444', dot: '#EF4444' },
  { key: 'critica', label: 'Crítica', color: '#B91C1C', dot: '#B91C1C' }
]);

const SECTION_SUB_MODULES = Object.freeze({
  't-home':          { module: 'inicio',      label: 'Inicio / Mis Clases' },
  't-attendance':    { module: 'asistencia',  label: 'Asistencia'         },
  't-students':      { module: 'estudiantes', label: 'Mi Aula / Estudiantes' },
  't-routine':       { module: 'rutinas',     label: 'Jornada / Rutinas'  },
  't-daily':         { module: 'rutinas',     label: 'Bitácora diaria'    },
  't-tasks':         { module: 'tareas',      label: 'Tareas'             },
  't-grades':        { module: 'calificaciones', label: 'Calificaciones' },
  't-feed':          { module: 'muro',        label: 'Muro / Comunicación' },
  't-class-detail':  { module: 'aula',        label: 'Detalle de Aula'     },
  't-chat':          { module: 'comunicacion', label: 'Familias / Chat'   },
  't-incidents':     { module: 'incidencias', label: 'Incidencias'        },
  't-videocall':     { module: 'videollamada', label: 'Videollamada'      }
});

const STORAGE_KEY = 'karpus_supervision_ctx_v1';

/* ──────────────────────────────────────────────────────────
 * Estado interno inmutable
 * ────────────────────────────────────────────────────────── */
const _state = {
  active: false,
  sessionId: null,
  classroomId: null,
  classroomName: null,
  teacherId: null,
  teacherName: null,
  initiatedBy: null,
  userRole: null,
  userName: null,
  userEmail: null,
  moduleOrigin: 'centro-escolar',
  subSection: null,
  startedAt: null,
  _timerTick: null,
  _barEl: null,
  _modalEl: null
};

/* ──────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────── */
const nowISO = () => new Date().toISOString();
const uuid    = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
  : 'sv_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

function _accentFor(role) {
  return ROLE_ACCENT[role] || ROLE_ACCENT.default;
}

function _fmtElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _emit(type, detail) {
  try {
    const ev = new CustomEvent('supervision:' + type, {
      detail: Object.freeze({ ...detail, timestamp: nowISO() }),
      bubbles: true, cancelable: false
    });
    window.dispatchEvent(ev);
  } catch (_) {}
}

/* ──────────────────────────────────────────────────────────
 * Persistencia localStorage (solo metadata, NO tokens)
 * ────────────────────────────────────────────────────────── */
function _persist() {
  try {
    if (!_state.active) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload = {
      active: true,
      sessionId: _state.sessionId,
      classroomId: _state.classroomId,
      classroomName: _state.classroomName,
      teacherId: _state.teacherId,
      teacherName: _state.teacherName,
      moduleOrigin: _state.moduleOrigin,
      subSection: _state.subSection,
      startedAt: _state.startedAt,
      _ts: nowISO()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function _restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.active || !parsed.classroomId) return null;
    return parsed;
  } catch (_) { return null; }
}

/* ──────────────────────────────────────────────────────────
 * Cross-tab sync: si otra pestaña sale de supervisión → también salimos
 * ────────────────────────────────────────────────────────── */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    try {
      if (e.newValue == null && _state.active) {
        console.warn('[Supervision] Otra pestaña salió de supervisión. Forzando salida local.');
        _teardownBar({ silent: true });
        Object.assign(_state, { active: false, sessionId: null, classroomId: null, teacherId: null, startedAt: null });
        if (_state._timerTick) { clearInterval(_state._timerTick); _state._timerTick = null; }
      }
    } catch (_) {}
  });
}

/* ──────────────────────────────────────────────────────────
 * Injectar headers X-Supervision-* en fetch → trigger server
 * ────────────────────────────────────────────────────────── */
function _augmentRequest(args) {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
  const isSupabase = typeof url === 'string' && url.includes(SUPABASE_URL);
  if (!isSupabase || !_state.active) return args;
  const options = args[1] || {};
  options.headers = options.headers || {};
  options.headers['X-Supervision-Active']      = 'true';
  if (_state.sessionId)   options.headers['X-Supervision-Session-Id']   = String(_state.sessionId);
  if (_state.classroomId) options.headers['X-Supervision-Classroom-Id'] = String(_state.classroomId);
  if (_state.teacherId)   options.headers['X-Supervision-Teacher-Id']   = String(_state.teacherId);
  args[1] = options;
  return args;
}

if (typeof window !== 'undefined') {
  const origFetch = window.fetch;
  // Evitar envolver doble si otro módulo ya lo extendió
  if (!window.__SUPERVISION_FETCH_PATCHED__) {
    window.__SUPERVISION_FETCH_PATCHED__ = true;
    window.fetch = async function supervisionFetch(...args) {
      const patched = _augmentRequest(args);
      return origFetch.apply(this, patched);
    };
  }
}

/* ──────────────────────────────────────────────────────────
 * 1) Crear sesión en BD (supervision_sessions)
 *    — Diseño IDEMPOTENTE —
 *    Paso A: UPDATE ended_at a sesiones ABIERTAS propias (mismo usuario).
 *    Paso B: INSERT nuevo registro.
 *    Paso C: Si falla con PK duplicate (409 / 23505) → SELECT la sesión
 *            existente y reusarla (boot desde storage/restart).
 *    Paso D: Si INSERT falla con RLS/403/401 → aceptar modo local,
 *            no matar el flujo: la sesión sigue funcionando client-side
 *            con auditoría solo en consola.
 * ────────────────────────────────────────────────────────── */
async function _createSessionDb({ context }) {
  // —— Paso A: Cerrar sesiones ABIERTAS que tenga este usuario
  //    (no nos importa si falla: puede que no existan, o RLS no deje;
  //    seguimos adelante).
  try {
    await supabase
      .from(TABLES.SUPERVISION_SESSIONS)
      .update({
        ended_at: nowISO(),
        context_json: supabase.raw(
          `COALESCE(context_json, '{}'::jsonb) || $1::jsonb`,
          [{ supersededAt: nowISO(), supersededBy: _state.sessionId, reason: 'new_session' }]
        )
      })
      .eq('usuario_id', _state.initiatedBy)
      .is('ended_at', null);
  } catch (_) { /* ignorar */ }

  const payload = {
    id:            _state.sessionId,
    usuario_id:    _state.initiatedBy,
    role:          _state.userRole,
    classroom_id:  _state.classroomId,
    teacher_id:    _state.teacherId || null,
    module_origin: _state.moduleOrigin,
    started_at:    _state.startedAt,
    context_json:  (context && typeof context === 'object') ? context : {}
  };

  // —— Paso B: INSERT
  try {
    const { data, error } = await supabase
      .from(TABLES.SUPERVISION_SESSIONS)
      .insert(payload)
      .select('id, started_at')
      .maybeSingle();
    if (!error) return data || { id: _state.sessionId, started_at: _state.startedAt };

    const code = String(error?.code || '');
    const status = Number(error?.status || 0);

    // —— Paso C: PK duplicate (23505 = unique_violation) o HTTP 409 Conflict.
    //    Reusamos la sesión existente.
    if (code === '23505' || status === 409 ||
        (error?.message || '').toLowerCase().includes('duplicate key')) {
      console.warn('[Supervision] PK duplicate en session ' + _state.sessionId
        + ' → reutilizando sesión existente (rehydration desde storage/restart).');
      try {
        const r = await supabase
          .from(TABLES.SUPERVISION_SESSIONS)
          .select('id, started_at, ended_at, classroom_id, usuario_id')
          .eq('id', _state.sessionId)
          .maybeSingle();
        if (!r.error && r.data) return r.data;
      } catch (_) { /* seguir a fallback */ }
      // Fallback silencioso: sessionId no nos sirve en BD pero la UI no se rompe.
      return { id: _state.sessionId, started_at: _state.startedAt, __localOnly: true };
    }

    // —— Paso D: Cualquier otro error (RLS 42501, 401, 403, 500...)
    //    NO bloquear el flujo: devolvemos un session record "local".
    //    La barra, auditoría cliente y navegación siguen funcionando.
    console.warn('[Supervision] No se pudo insertar supervision_sessions en BD:',
      error?.code, error?.message, '→ modo local-only activado (UI NO se bloquea).');
    return { id: _state.sessionId, started_at: _state.startedAt, __localOnly: true };
  } catch (e) {
    console.warn('[Supervision] Excepción creando sesión BD:', e?.message || e,
      '→ modo local-only activado (UI NO se bloquea).');
    return { id: _state.sessionId, started_at: _state.startedAt, __localOnly: true };
  }
}

async function _closeSessionDb({ reason }) {
  if (!_state.sessionId) return null;
  try {
    const { data, error } = await supabase
      .from(TABLES.SUPERVISION_SESSIONS)
      .update({
        ended_at: nowISO(),
        context_json: supabase.raw(
          `COALESCE(context_json, '{}'::jsonb) || $1::jsonb`,
          [{ closeReason: reason || 'manual', closedAt: nowISO() }]
        )
      })
      .eq('id', _state.sessionId)
      .eq('usuario_id', _state.initiatedBy)  // ✅ Añadimos usuario_id como safeguard:
                                             //    si el RLS lo permite, actualiza;
                                             //    si no, 0 rows afectadas pero NO error.
      .select('id, ended_at')
      .maybeSingle();
    if (error) {
      // No más warnings ruidosos — solo debug
      console.debug('[Supervision] closeSession: no pudo actualizar (esperable si session no es tuya o ya cerró).',
        error.code, error.message);
      return null;
    }
    return data || null;
  } catch (e) {
    console.debug('[Supervision] Excepción cerrando sesión BD:', e?.message || e);
    return null;
  }
}

/* ──────────────────────────────────────────────────────────
 * 2) Auditoría (supervision_audit_log)
 * ────────────────────────────────────────────────────────── */
async function _writeAudit({ action, module, payload }) {
  if (!_state.active) return null;
  try {
    const row = {
      session_id: _state.sessionId || null,
      usuario_id: _state.initiatedBy,
      role: _state.userRole,
      classroom_id: _state.classroomId,
      teacher_id: _state.teacherId || null,
      modulo_afectado: module,
      accion_realizada: action,
      student_id: payload?.student_id || payload?.studentId || null,
      table_name: payload?.table_name || payload?.table || null,
      record_id: payload?.record_id || payload?.recordId || null,
      metadata_jsonb: payload || {}
    };
    const { data, error } = await supabase
      .from(TABLES.SUPERVISION_AUDIT)
      .insert([row])
      .select('id, created_at')
      .maybeSingle();
    if (error) {
      console.warn('[Supervision] Error escribiendo audit_log:', error.message);
      return null;
    }
    return data || null;
  } catch (e) {
    console.warn('[Supervision] Excepción audit_log:', e?.message || e);
    return null;
  }
}

/* ──────────────────────────────────────────────────────────
 * 3) Interventions (tickets)
 * ────────────────────────────────────────────────────────── */
async function _createInterventionDb(input) {
  const payload = {
    created_by: _state.initiatedBy,
    role: _state.userRole,
    classroom_id: input.classroomId ?? _state.classroomId,
    teacher_id:   input.teacherId   ?? _state.teacherId  ?? null,
    student_id:   input.studentId   ?? null,
    modulo:       input.module      ?? (_state.subSection ? (SECTION_SUB_MODULES[_state.subSection]?.module || 'aula') : 'aula'),
    submodulo:    input.submodulo   ?? (_state.subSection ? (SECTION_SUB_MODULES[_state.subSection]?.label || _state.subSection) : null),
    situacion:    input.situacion   ?? 'Situación detectada',
    prioridad:    input.prioridad   ?? 'alta',
    observacion:  input.observacion ?? '',
    assigned_to:  input.assignedTo  ?? _state.teacherId ?? null,
    session_id:   _state.sessionId ?? null,
    metadata_jsonb: {
      moduleOrigin: _state.moduleOrigin,
      subSection:   _state.subSection,
      userName:     _state.userName,
      userEmail:    _state.userEmail,
      closedOrigin: input.closedOrigin || 'supervision_modal',
      ...(input.metadata || {})
    }
  };
  try {
    const { data, error } = await supabase
      .from(TABLES.INTERVENTIONS)
      .insert([payload])
      .select('id, code, status, assigned_to, created_at')
      .maybeSingle();
    if (error) {
      safeToast('Error creando intervención: ' + (error.message || 'desconocido'), 'error');
      return null;
    }
    return data || null;
  } catch (e) {
    safeToast('Error inesperado creando intervención', 'error');
    console.error(e);
    return null;
  }
}

/* ──────────────────────────────────────────────────────────
 * Renderizado: Barra sticky de supervisión
 * ────────────────────────────────────────────────────────── */
function _teardownBar({ silent = false } = {}) {
  try {
    if (_state._barEl && _state._barEl.parentNode) _state._barEl.parentNode.removeChild(_state._barEl);
  } catch (_) {}
  _state._barEl = null;
  try {
    document.body.classList.remove('supervision-active');
    document.documentElement.classList.remove('supervision-active');
  } catch (_) {}
  if (!silent) safeToast('Has salido del modo supervisión', 'info');
}

function _mountBar() {
  _teardownBar({ silent: true });
  const accent = _accentFor(_state.userRole);
  const bar = document.createElement('div');
  bar.id = 'karpus-supervision-bar';
  bar.className = 'supervision-sticky-bar';
  bar.setAttribute('data-role', _state.userRole || 'staff');
  bar.style.setProperty('--spv-accent', accent.bg);
  bar.style.setProperty('--spv-glow', accent.glow);

  bar.innerHTML = `
    <div class="spv-inner">
      <div class="spv-identity">
        <span class="spv-eye" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </span>
        <div class="spv-title-wrap">
          <h3 class="spv-title">Modo Supervisión</h3>
          <div class="spv-sub">
            <span class="spv-role-chip">${_esc(accent.label)}</span>
            <span class="spv-dot"></span>
            <span class="spv-classroom">${_esc(_state.classroomName || ('Aula #' + (_state.classroomId || '')))}</span>
            <span class="spv-sep">·</span>
            <span class="spv-teacher">${_esc(_state.teacherName || 'Maestra sin asignar')}</span>
          </div>
        </div>
      </div>
      <div class="spv-meta">
        <span class="spv-chip spv-chip--module"><i data-lucide="layers-3"></i> ${_esc(_state.subSection ? (SECTION_SUB_MODULES[_state.subSection]?.label || _state.subSection) : (SECTION_SUB_MODULES[_state.moduleOrigin]?.label || _state.moduleOrigin || 'Centro Escolar'))}</span>
        <span class="spv-chip spv-chip--time"><i data-lucide="timer"></i> <b data-spv-timer>0s</b></span>
      </div>
      <div class="spv-actions">
        <button type="button" class="spv-btn spv-btn--ghost" data-spv-act="back" title="Volver al Centro Escolar">
          <i data-lucide="arrow-left"></i>
          <span>Volver al Centro</span>
        </button>
        <button type="button" class="spv-btn spv-btn--danger" data-spv-act="intervene" title="Registrar intervención">
          <i data-lucide="siren"></i>
          <span>Intervención</span>
        </button>
        <button type="button" class="spv-btn spv-btn--primary" data-spv-act="exit" title="Salir de supervisión">
          <i data-lucide="log-out"></i>
          <span>Salir</span>
        </button>
      </div>
    </div>`;

  const host = document.getElementById('supervisionBarHost') || document.body;
  host.prepend(bar);

  bar.querySelectorAll('[data-spv-act]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const act = btn.getAttribute('data-spv-act');
      if (act === 'exit')      return exit({ reason: 'manual' });
      if (act === 'back')      return _backToCenter();
      if (act === 'intervene') return openInterventionModal({});
    });
  });

  document.body.classList.add('supervision-active');
  document.documentElement.classList.add('supervision-active');
  _state._barEl = bar;

  // Lucide icons async-safe
  try {
    if (window.lucide?.createIcons) requestAnimationFrame(() => window.lucide.createIcons({ root: bar }));
  } catch (_) {}

  // Tick timer
  if (_state._timerTick) clearInterval(_state._timerTick);
  _state._timerTick = setInterval(() => {
    if (!_state.active || !_state.startedAt) return;
    const timerEls = document.querySelectorAll('[data-spv-timer]');
    const ms = Date.now() - new Date(_state.startedAt).getTime();
    timerEls.forEach((el) => { el.textContent = _fmtElapsed(ms); });
  }, 1000);
}

/* ──────────────────────────────────────────────────────────
 * Bar helpers / navegación
 * ────────────────────────────────────────────────────────── */
function _backToCenter() {
  registerAudit('nav.salida_centro', { module: 'navegacion' });
  const role = (_state.userRole || 'directora').toLowerCase();
  const map = { directora: 'panel_directora.html', asistente: 'panel_asistente.html', encargada: 'panel_encargada.html' };
  const target = map[role] || 'panel_directora.html';
  const url = target + '#ksc?tab=aula&aula=' + encodeURIComponent(String(_state.classroomId || ''));
  window.location.href = url;
}

function setSubSection(sectionId) {
  if (!_state.active) return;
  const prev = _state.subSection;
  _state.subSection = sectionId || null;
  _persist();
  // Actualizar chip en barra sin reconstruir todo
  if (_state._barEl) {
    const lbl = sectionId ? (SECTION_SUB_MODULES[sectionId]?.label || sectionId)
                          : (SECTION_SUB_MODULES[_state.moduleOrigin]?.label || _state.moduleOrigin || 'Centro Escolar');
    const chipText = _state._barEl.querySelector('.spv-chip--module');
    if (chipText) chipText.lastChild.textContent = ' ' + lbl;
  }
  if (prev !== sectionId) {
    _writeAudit({ action: 'nav.cambio_seccion', module: 'navegacion', payload: { from: prev, to: sectionId } });
  }
}

/* ──────────────────────────────────────────────────────────
 * Modal de Intervención
 * ────────────────────────────────────────────────────────── */
function _teardownModal() {
  try { if (_state._modalEl && _state._modalEl.parentNode) _state._modalEl.parentNode.removeChild(_state._modalEl); } catch (_) {}
  _state._modalEl = null;
}

function openInterventionModal(initialCtx = {}) {
  if (!_state.active) {
    safeToast('Inicia el modo supervisión primero', 'warning');
    return null;
  }
  _teardownModal();
  const accent = _accentFor(_state.userRole);
  const sectionLabel = _state.subSection ? (SECTION_SUB_MODULES[_state.subSection]?.label || _state.subSection) : 'Centro Escolar';
  const moduleValue  = _state.subSection ? (SECTION_SUB_MODULES[_state.subSection]?.module || 'aula') : (initialCtx.module || 'aula');

  const wrap = document.createElement('div');
  wrap.className = 'spv-modal-overlay';
  wrap.innerHTML = `
    <div class="spv-modal" role="dialog" aria-modal="true" aria-labelledby="spvIntTitle" style="--spv-accent:${accent.bg};--spv-glow:${accent.glow}">
      <div class="spv-modal-head">
        <div class="spv-modal-icon"><i data-lucide="siren"></i></div>
        <div>
          <h3 id="spvIntTitle">Registrar Intervención Directiva</h3>
          <p>Contexto: <b>${_esc(_state.classroomName || 'Aula')}</b> · ${_esc(_state.teacherName || 'Maestra')} · Sección <b>${_esc(sectionLabel)}</b></p>
        </div>
        <button type="button" class="spv-modal-close" data-spv-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
      </div>
      <div class="spv-modal-body">
        <div class="spv-grid-2">
          <label class="spv-field">
            <span>Nombre de la situación</span>
            <input type="text" id="spvIntSituacion" maxlength="160" placeholder="Ej: Registro de almuerzo incompleto 4/12" value="${_esc(initialCtx.situacion || '')}"/>
          </label>
          <label class="spv-field">
            <span>Prioridad</span>
            <div class="spv-priorities" role="radiogroup" aria-label="Prioridad">
              ${PRIORITY_META.map((p, i) => `
                <label class="spv-prio" style="--prio:${p.color}">
                  <input type="radio" name="spvIntPrio" value="${p.key}" ${(initialCtx.prioridad || 'alta') === p.key ? 'checked' : ''}/>
                  <span class="spv-dot"></span>
                  <span>${p.label}</span>
                </label>`).join('')}
            </div>
          </label>
          <label class="spv-field">
            <span>Módulo</span>
            <input type="text" id="spvIntModule" maxlength="40" placeholder="asistencia, rutinas, tareas, muro..." value="${_esc(initialCtx.module || moduleValue)}"/>
          </label>
          <label class="spv-field">
            <span>Sub-módulo / Lugar exacto</span>
            <input type="text" id="spvIntSub" maxlength="80" placeholder="Ej: Almuerzo, Baño, Siesta..." value="${_esc(initialCtx.submodulo || (initialCtx.subSection ? sectionLabel : ''))}"/>
          </label>
        </div>
        <label class="spv-field">
          <span>Observación y acción requerida <span class="req">*</span></span>
          <textarea id="spvIntObs" rows="4" maxlength="2000" placeholder="Describe la situación detectada y qué acción se requiere.">${_esc(initialCtx.observacion || '')}</textarea>
        </label>
      </div>
      <div class="spv-modal-foot">
        <button type="button" class="spv-btn spv-btn--ghost" data-spv-modal-close>Cancelar</button>
        <button type="button" class="spv-btn spv-btn--danger" id="spvIntSubmit">
          <i data-lucide="send"></i>
          <span>Crear intervención</span>
        </button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  _state._modalEl = wrap;

  if (window.lucide?.createIcons) requestAnimationFrame(() => window.lucide.createIcons({ root: wrap }));

  const close = () => _teardownModal();
  wrap.querySelectorAll('[data-spv-modal-close]').forEach((b) => b.addEventListener('click', close));
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', function esc(ev) {
    if (ev.key === 'Escape' && _state._modalEl === wrap) { close(); document.removeEventListener('keydown', esc); }
  });

  const submitBtn = wrap.querySelector('#spvIntSubmit');
  submitBtn?.addEventListener('click', async () => {
    const situacion = (wrap.querySelector('#spvIntSituacion').value || '').trim();
    const prioridad = (wrap.querySelector('input[name="spvIntPrio"]:checked')?.value) || 'alta';
    const modulo    = (wrap.querySelector('#spvIntModule').value || '').trim() || 'aula';
    const submodulo = (wrap.querySelector('#spvIntSub').value || '').trim() || null;
    const observacion = (wrap.querySelector('#spvIntObs').value || '').trim();

    if (!observacion || observacion.length < 6) {
      safeToast('Describe la observación (mínimo 6 caracteres)', 'warning');
      return;
    }
    if (!situacion) {
      safeToast('Indica el nombre de la situación detectada', 'warning');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');

    const created = await _createInterventionDb({
      situacion, prioridad, module: modulo, submodulo, observacion,
      studentId: initialCtx.studentId || null,
      teacherId: initialCtx.teacherId || _state.teacherId || null,
      classroomId: initialCtx.classroomId || _state.classroomId
    });

    if (created?.id) {
      _writeAudit({ action: 'intervention.create', module: modulo, payload: { intervention_code: created.code, intervention_id: created.id, prioridad, situacion, submodulo } });
      _emit('intervention-created', { intervention: created });
      safeToast(`Intervención ${created.code} creada correctamente`, 'success');
      close();
    } else {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
    }
  });
  return wrap;
}

/* ──────────────────────────────────────────────────────────
 * ENTRY: enter()
 * ────────────────────────────────────────────────────────── */
async function enter(opts = {}) {
  const classroomId = opts.classroomId ?? _state.classroomId;
  const teacherId   = opts.teacherId   ?? _state.teacherId;
  if (!classroomId) {
    safeToast('Supervisión: falta classroomId', 'error');
    return false;
  }
  // Usuario actual
  let authUser = null;
  try {
    const { data } = await supabase.auth.getUser();
    authUser = data?.user || null;
  } catch (_) { authUser = null; }
  if (!authUser) {
    safeToast('Sesión no válida para supervisión', 'error');
    window.location.href = 'login.html';
    return false;
  }
  let profile = null;
  try {
    const { data } = await supabase.from('profiles').select('id, role, name, email').eq('id', authUser.id).maybeSingle();
    profile = data || null;
  } catch (_) { profile = null; }

  const role = (profile?.role || opts.role || '').toLowerCase();
  if (![ROLES.DIRECTORA, ROLES.ASISTENTE, ROLES.ENCARGADA, ROLES.MAESTRA].includes(role)) {
    safeToast('Tu rol no puede iniciar supervisión de aula', 'error');
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    window.location.href = 'login.html?error=role';
    return false;
  }

  // Nombre de aula y maestra (si no lo pasan)
  let { classroomName, teacherName } = opts;
  if (!classroomName || !teacherName) {
    try {
      const q = supabase
        .from('classrooms')
        .select('id, name, level, capacity, teacher:teacher_id(id, name, email)')
        .eq('id', classroomId);
      if (typeof teacherId !== 'undefined' && teacherId != null) {
        // nada extra, se respeta lo cargado por teacher_id FK
      }
      const { data } = await q.maybeSingle();
      if (data) {
        if (!classroomName) classroomName = data.name;
        if (!teacherName && data.teacher?.name) teacherName = data.teacher.name;
        if (!teacherId   && data.teacher?.id)   teacherId   = data.teacher.id;
      }
    } catch (e) { console.warn('[Supervision] metadata aula/maestra no cargada:', e); }
  }

  // (cierre de sesiones previas eliminado de aquí — ahora vive dentro de _createSessionDb, Paso A)

  Object.assign(_state, {
    active: true,
    sessionId: opts.sessionId || uuid(),
    classroomId,
    classroomName: classroomName || null,
    teacherId: teacherId || null,
    teacherName: teacherName || null,
    initiatedBy: authUser.id,
    userRole: role,
    userName: profile?.name || authUser.email?.split('@')[0] || 'Usuario',
    userEmail: profile?.email || authUser.email || null,
    moduleOrigin: opts.moduleOrigin || 'centro-escolar',
    subSection:   opts.jumpToSection || opts.subSection || null,
    startedAt:    opts.startedAt   || nowISO()
  });

  // ✅ Garantía de UI: montar BARRA y PERSISTIR ANTES de cualquier operación de red.
  //    De este modo, incluso si _createSessionDb / BD fallan por completo:
  //    → la barra aparece
  //    → localStorage tiene el contexto
  //    → setActiveSection / navegación de secciones FUNCIONAN
  _persist();
  _mountBar();

  // Operaciones de red NO BLOQUEANTES — no afectan la UI si fallan.
  try {
    await _createSessionDb({
      context: { alertType: opts.alertType || null, alertText: opts.alertText || null }
    });
  } catch (_) { /* sin efecto: ya devuelve fallback local */ }
  try {
    _writeAudit({
      action: 'supervision.enter',
      module: _state.moduleOrigin,
      payload: { source: opts.source || 'manual' }
    });
  } catch (_) { /* auditoría opcional */ }
  _emit('enter', { context: _getContext() });

  // ✅ Jump to section con MULTIPLES mecanismos de fallback
  //    (asegura que funcione en panel-maestra sin importar el orden de carga)
  if (_state.subSection) {
    const sectionId = _state.subSection;
    const doJump = () => {
      // Estrategia 1: método oficial del panel (maestra/directora)
      if (typeof window.App?.setActiveSection === 'function') {
        try { window.App.setActiveSection(sectionId, { fromSupervision: true }); return; }
        catch (_) { /* seguir */ }
      }
      // Estrategia 2: disparar click() sobre el tab del sidebar/nav
      const tabBtn = document.querySelector(`[data-section="${sectionId}"], [data-id="${sectionId}"], #${sectionId}-tab, .tab-btn[data-target="${sectionId}"]`);
      if (tabBtn && typeof tabBtn.click === 'function') {
        try { tabBtn.click(); return; } catch (_) {}
      }
      // Estrategia 3: dispatch evento custom (otros paneles lo escuchan)
      try {
        window.dispatchEvent(new CustomEvent('ksc:navigate', {
          detail: { section: sectionId, fromSupervision: true }, bubbles: true
        }));
      } catch (_) {}
    };
    // Intentar YA, luego 60ms, luego 250ms, luego 700ms
    // (cubre casos donde window.App se inicializa DESPUÉS del boot)
    doJump();
    setTimeout(doJump, 60);
    setTimeout(doJump, 250);
    setTimeout(doJump, 700);
  }

  safeToast('👁️ Modo supervisión activo · ' + (classroomName || _state.classroomId), 'info');
  return true;
}

/* ──────────────────────────────────────────────────────────
 * ENTRY: exit()
 * ────────────────────────────────────────────────────────── */
async function exit({ reason = 'manual', skipRedirect = false } = {}) {
  if (!_state.active) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    return true;
  }
  const ctx = _getContext();
  try { _writeAudit({ action: 'supervision.exit', module: _state.moduleOrigin || 'navegacion', payload: { reason } }); } catch (_) {}

  // ✅ Cierre de BD con TIMEOUT LÍMITE 1s.
  //    Si hay timeout de red, RLS tarda mucho, o endpoint caído, NO
  //    bloqueamos la navegación al panel (redirect) ni el teardown.
  (async () => {
    try {
      await Promise.race([
        _closeSessionDb({ reason }),
        new Promise((resolve) => setTimeout(() => resolve(null), 1000))
      ]);
    } catch (_) { /* silent */ }
  })();

  if (_state._timerTick) { clearInterval(_state._timerTick); _state._timerTick = null; }
  _teardownBar({ silent: true });
  Object.assign(_state, {
    active: false, sessionId: null, classroomId: null, classroomName: null,
    teacherId: null, teacherName: null, subSection: null, startedAt: null
  });
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  try { _emit('exit', { context: ctx, reason }); } catch (_) {}
  safeToast('Modo supervisión finalizado', 'success');

  if (!skipRedirect) {
    // Volver al panel del rol
    const role = (ctx.userRole || 'directora').toLowerCase();
    const map = { directora: 'panel_directora.html', asistente: 'panel_asistente.html', encargada: 'panel_encargada.html', maestra: 'panel-maestra.html' };
    const target = map[role] || 'panel_directora.html';
    window.location.href = target + '#ksc';
  }
  return true;
}

/* ──────────────────────────────────────────────────────────
 * ENTRY: registerAudit(action, payload)
 * ────────────────────────────────────────────────────────── */
function registerAudit(action, payload = {}) {
  if (!_state.active) return null;
  const module = payload?.module || payload?.modulo || payload?.section
    || (_state.subSection ? (SECTION_SUB_MODULES[_state.subSection]?.module || 'aula') : 'aula');
  return _writeAudit({ action, module, payload });
}

/* ──────────────────────────────────────────────────────────
 * Getters
 * ────────────────────────────────────────────────────────── */
function isActive() { return !!_state.active; }
function getContext() { return _getContext(); }
function renderSupervisionBar() { if (_state.active) _mountBar(); }

function _getContext() {
  return Object.freeze({
    active:         _state.active,
    sessionId:      _state.sessionId,
    classroomId:    _state.classroomId,
    classroomName:  _state.classroomName,
    teacherId:      _state.teacherId,
    teacherName:    _state.teacherName,
    initiatedBy:    _state.initiatedBy,
    userRole:       _state.userRole,
    userName:       _state.userName,
    moduleOrigin:   _state.moduleOrigin,
    subSection:     _state.subSection,
    startedAt:      _state.startedAt
  });
}

/* ──────────────────────────────────────────────────────────
 * Boot: restaurar desde URL params o desde storage
 * ────────────────────────────────────────────────────────── */
async function bootFromEnvironment({ panelRole = null, isMaestraPanel = false } = {}) {
  try {
    if (typeof window === 'undefined') return false;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const isSupervisionParam = params.get('supervision') === 'true';
    const stored = _restore();
    if (!isSupervisionParam && !(stored && stored.active)) return false;

    const classroomId = params.get('classroomId') || stored?.classroomId;
    if (!classroomId) return false;

    const opts = {
      classroomId,
      teacherId:     params.get('teacherId')   || stored?.teacherId   || null,
      classroomName: params.get('classroomName') || params.get('classroom') || stored?.classroomName || null,
      teacherName:   params.get('teacherName') || stored?.teacherName || null,
      moduleOrigin:  params.get('originModule') || params.get('moduleOrigin') || stored?.moduleOrigin || 'centro-escolar',
      jumpToSection: params.get('jumpTo')     || params.get('section')    || stored?.subSection || null,
      sessionId:     stored?.sessionId || null,
      startedAt:     stored?.startedAt || null,
      alertType:     params.get('alertType') || null,
      alertText:     params.get('alertText') || null,
      source:        isSupervisionParam ? 'url' : 'storage',
      role:          panelRole || null
    };
    return await enter(opts);
  } catch (e) {
    console.warn('[Supervision] bootFromEnvironment falló:', e?.message || e);
    return false;
  }
}

/* ──────────────────────────────────────────────────────────
 * Exports
 * ────────────────────────────────────────────────────────── */
export const SupervisionEngine = Object.freeze({
  enter, exit, isActive, getContext, setSubSection,
  registerAudit, openInterventionModal, renderSupervisionBar,
  bootFromEnvironment
});

export default SupervisionEngine;
