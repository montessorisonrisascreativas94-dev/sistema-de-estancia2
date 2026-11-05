/**
 * 🔄 RealtimeSync — refresco automático de la vista activa ante cambios en BD.
 *
 * Escucha cambios (INSERT/UPDATE/DELETE) de las tablas indicadas mediante
 * Supabase Realtime y, con debounce, ejecuta el callback `onChange` que cada
 * panel usa para volver a pintar la sección visible SIN recargar la página.
 *
 * Características:
 *  - Varios canales (grupos de tablas) para que un fallo puntual no tumbe todo.
 *  - Debounce para agrupar ráfagas de cambios.
 *  - No refresca mientras el usuario escribe en un campo o hay pestaña oculta;
 *    deja el refresco pendiente y lo aplica al salir del campo / volver a la pestaña.
 *  - Emite `karpus:realtime-change` para integraciones que quieran reaccionar.
 */

import { supabase } from './supabase.js';

/**
 * Tablas núcleo de todo el sistema. Cada panel puede pasar una lista propia;
 * esta sirve como base para que "todo se vea en vivo".
 */
export const CORE_TABLES = [
  // Personas / estructura
  'profiles', 'students', 'student_enrollments', 'student_preregistrations',
  'student_promotions', 'student_charges', 'classrooms', 'teacher_schedules',
  // Asistencia / rutina
  'attendance', 'attendance_requests', 'door_punches', 'daily_logs',
  'nap_sessions', 'routine_events', 'classroom_routines', 'classroom_daily_schedule',
  // Dinero
  'payments', 'invoices', 'invoice_items', 'payment_plans', 'payment_concepts',
  'plan_installments', 'expenses', 'orders', 'order_items', 'payroll_records',
  // Comunicación
  'messages', 'message_attachments', 'message_reactions', 'conversations',
  'conversation_participants', 'classroom_chat', 'notifications',
  'posts', 'comments', 'likes',
  // Académico
  'tasks', 'task_evidences', 'grades', 'eval_scores', 'eval_evaluations',
  'report_cards', 'reports', 'school_activities', 'school_activity_evidences',
  'classroom_events', 'classroom_gallery',
  // Ciclo escolar / configuración
  'school_years', 'school_settings', 'school_month_configs',
  // Gestión
  'staff_permits', 'inquiries', 'incidents', 'interventions', 'parent_ratings',
  'meetings', 'meeting_attendance'
];

const GROUP_SIZE = 12;
const MAX_RETRIES = 4;
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

let _channels = [];
let _retryTimers = [];
let _started = false;
let _opts = null;
let _timer = null;
let _pending = new Map(); // table → último payload
let _refreshing = false;
let _dirty = false;
let _lastCatchUp = 0;

function _isEditing() {
  const el = document.activeElement;
  return !!(el && el.matches && el.matches(EDITABLE_SELECTOR));
}

function _schedule() {
  if (!_opts) return;
  if (document.hidden) {
    _dirty = true;
    return;
  }
  clearTimeout(_timer);
  _timer = setTimeout(_run, _opts.debounce);
}

async function _run() {
  if (!_opts || _refreshing) {
    _dirty = true;
    return;
  }
  if (_isEditing()) {
    // No interrumpir al usuario mientras escribe.
    _dirty = true;
    return;
  }

  const tables = [..._pending.keys()];
  const payloads = [..._pending.values()];
  _pending.clear();
  _dirty = false;
  _refreshing = true;

  try {
    window.dispatchEvent(new CustomEvent('karpus:realtime-change', {
      detail: { tables, payloads }
    }));
  } catch (_) {}

  try {
    await _opts.onChange({ tables, payloads });
  } catch (err) {
    console.warn('[RealtimeSync] No se pudo refrescar la vista:', err?.message || err);
  } finally {
    _refreshing = false;
    if (_pending.size) _schedule();
  }
}

function _onVisible() {
  if (document.hidden || !_started) return;
  // Red de seguridad: al volver a la pestaña refresca aunque no haya llegado
  // ningún evento (por ejemplo, si se perdió una conexión).
  if (Date.now() - _lastCatchUp > 20000) {
    _lastCatchUp = Date.now();
    _dirty = true;
  }
  if (_dirty) _schedule();
}

function _onFocusOut() {
  if (_dirty) _schedule();
}

function _onOnline() {
  if (!_started) return;
  _dirty = true;
  _schedule();
}

function _subscribeGroup(panel, tables, attempt = 0) {
  if (!_started) return;

  const channel = supabase.channel(
    `karpus-sync-${panel}-${attempt}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );

  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      _pending.set(table, payload);
      _schedule();
    });
  }

  _channels.push(channel);

  channel.subscribe((status) => {
    if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;

    // Este grupo falló (tabla inexistente, red, etc.). Se reintenta solo este
    // grupo, sin afectar a los demás canales que sí están funcionando.
    try { supabase.removeChannel(channel); } catch (_) {}
    _channels = _channels.filter(c => c !== channel);

    if (!_started || attempt >= MAX_RETRIES) {
      console.warn(`[RealtimeSync] Grupo ${panel} desactivado tras ${attempt} reintentos.`);
      return;
    }

    const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
    const t = setTimeout(() => _subscribeGroup(panel, tables, attempt + 1), delay);
    _retryTimers.push(t);
  });

  return channel;
}

export const RealtimeSync = {
  CORE_TABLES,

  /**
   * Inicia la sincronización en vivo del panel.
   * @param {object}   opts
   * @param {string}   opts.panel    — prefijo del canal (directora, encargada…)
   * @param {string[]} [opts.tables] — tablas a escuchar (por defecto CORE_TABLES)
   * @param {number}   [opts.debounce] — ms de agrupación (por defecto 700)
   * @param {Function} opts.onChange — callback que repinta la sección visible
   * @returns {object[]} canales de Supabase
   */
  start(opts = {}) {
    if (_started) return _channels;

    const { panel = 'app', tables = CORE_TABLES, debounce = 700, onChange } = opts;
    if (typeof onChange !== 'function') {
      console.warn('[RealtimeSync] onChange es obligatorio');
      return null;
    }

    _opts = { panel, debounce, onChange };
    _started = true;

    const unique = [...new Set((tables || []).filter(Boolean))];
    for (let i = 0; i < unique.length; i += GROUP_SIZE) {
      _subscribeGroup(panel, unique.slice(i, i + GROUP_SIZE));
    }

    document.addEventListener('visibilitychange', _onVisible);
    document.addEventListener('focusout', _onFocusOut);
    window.addEventListener('online', _onOnline);

    return _channels;
  },

  /** Detiene la sincronización (logout / cambio de panel). */
  stop() {
    _started = false;
    clearTimeout(_timer);
    _timer = null;
    _pending.clear();
    _dirty = false;
    _refreshing = false;
    _opts = null;

    _retryTimers.forEach(t => clearTimeout(t));
    _retryTimers = [];

    document.removeEventListener('visibilitychange', _onVisible);
    document.removeEventListener('focusout', _onFocusOut);
    window.removeEventListener('online', _onOnline);

    for (const channel of _channels) {
      try { supabase.removeChannel(channel); } catch (_) {}
    }
    _channels = [];
  },

  /** Fuerza un refresco inmediato (útil al volver a la pestaña). */
  refreshNow() {
    _dirty = true;
    clearTimeout(_timer);
    _timer = setTimeout(_run, 0);
  },

  get active() {
    return _started;
  },

  get pendingTables() {
    return [..._pending.keys()];
  }
};

export default RealtimeSync;
