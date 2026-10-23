/**
 * TeacherExitBanner — Aviso de salida para el panel de la maestra.
 *
 *   • Barra sticky visible en TODAS las secciones que avisa cuando a uno o
 *     varios estudiantes se les aproxima la HORA DE SALIDA (≤ 30 min).
 *   • Botón "Gestionar salida" → modal para registrar la salida del niño
 *     (marca attendance.status='retirado', check_out y notifica al padre).
 *   - Bloquea el registro de rutina (daily_logs) para los estudiantes ya
 *     retirados hoy, mostrando un aviso (centralizado en upsertDailyLog).
 *
 * La hora de salida se toma de students.schedule (p. ej. "8:00-15:00").
 */

import { supabase, emitEvent } from '../shared/supabase.js';
import { AppState } from './state.js';
import { Helpers } from '../shared/helpers.js';
import { MaestraApi } from './api.js';
import { UI } from './modules/ui.js';

const BAR_ID = 'teacherExitBanner';
const MODAL_ID = 'teacherExitModal';
const WINDOW_MIN = 30;
const REFRESH_MS = 60 * 1000;

const _state = { students: [], exited: new Set(), present: new Set(), timer: null, bound: false, patched: false };
const ALERT_MIN = 10;

// ── Horario: "8:00-15:00" → { entry, exit } ──────────────────────────────────
function _parseSchedule(schedule) {
  const m = String(schedule || '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return {
    entry: { h: +m[1], min: +m[2] },
    exit:  { h: +m[3], min: +m[4] }
  };
}
function _minutesUntil(t, now) {
  const target = new Date(now);
  target.setHours(t.h, t.min, 0, 0);
  return Math.round((target - now) / 60000);
}
function _hhmm(t) {
  return `${String(t.h).padStart(2, '0')}:${String(t.min).padStart(2, '0')}`;
}
function _today() {
  try { return AppState.today(); } catch { return new Date().toISOString().split('T')[0]; }
}
function _esc(s) { return Helpers.escapeHTML(s ?? ''); }

// Una sola notificación por estudiante y día.
function _notifyKey(id) { return `txb_notified:${_today()}:${id}`; }
function _alreadyNotified(id) {
  try { return localStorage.getItem(_notifyKey(id)) === '1'; } catch { return false; }
}
function _markNotified(id) {
  try { localStorage.setItem(_notifyKey(id), '1'); } catch {}
}
function _maybeNotify(near) {
  const due = near.filter(x => x.mins <= ALERT_MIN && !_alreadyNotified(x.s.id));
  if (!due.length) return;
  due.forEach(x => _markNotified(x.s.id));
  const first = due[0];
  const names = due.map(x => (x.s.name || '').split(' ')[0]).filter(Boolean).join(', ');
  const minsTxt = first.mins <= 1 ? 'ahora' : `en ${first.mins} min`;
  Helpers.toast(`🚪 ${names} sale${due.length > 1 ? 'n' : ''} ${minsTxt}`, 'warning');
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification('Salida próxima', {
        body: `${names} sale${due.length > 1 ? 'n' : ''} ${minsTxt} (${_hhmm(first.sched.exit)}).`,
        tag: `txb-${_today()}-${first.s.id}`,
        icon: first.s.avatar_url || undefined
      });
      n.onclick = () => { try { window.focus(); _openModal(); } catch {} };
    }
  } catch {}
}

// ── CSS (una vez) ────────────────────────────────────────────────────────────
const CSS = `
#${BAR_ID}{position:sticky;top:0;z-index:160;padding:10px 16px 0}
#${BAR_ID}[hidden]{display:none}
.txb-bar{display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#0B63C7,#08498F);border-radius:18px;padding:12px 16px;box-shadow:0 10px 26px rgba(11,99,199,.35);animation:txbIn .4s cubic-bezier(.2,.85,.3,1.1) both}
.txb-ic{width:42px;height:42px;border-radius:13px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:21px;flex:0 0 auto}
.txb-txt{flex:1 1 auto;min-width:0}
.txb-title{margin:0;color:#fff;font-weight:900;font-size:14px;line-height:1.2}
.txb-sub{margin:2px 0 0;color:rgba(255,255,255,.85);font-weight:700;font-size:12px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.txb-btn{border:0;border-radius:12px;background:#FFD43B;color:#7A5B00;font-weight:900;font-size:12px;padding:10px 16px;cursor:pointer;white-space:nowrap;flex:0 0 auto;transition:filter .15s,transform .15s}
.txb-btn:hover{filter:brightness(1.05)}
.txb-btn:active{transform:translateY(1px)}
.txb-count{border-radius:999px;background:rgba(255,255,255,.22);color:#fff;font-weight:900;font-size:12px;padding:6px 11px;white-space:nowrap;flex:0 0 auto;letter-spacing:.02em}
.txb-bar.is-urgent{background:linear-gradient(135deg,#DC2626,#991B1B);box-shadow:0 10px 26px rgba(220,38,38,.4);animation:txbIn .4s cubic-bezier(.2,.85,.3,1.1) both,txbPulse 1.6s ease-in-out .4s infinite}
.txb-bar.is-urgent .txb-ic{background:rgba(255,255,255,.25)}
.txb-bar.is-urgent .txb-count{background:#fff;color:#B91C1C}
@keyframes txbPulse{0%,100%{box-shadow:0 10px 26px rgba(220,38,38,.4)}50%{box-shadow:0 10px 34px rgba(220,38,38,.65)}}
.txm-row.is-urgent{border-color:#FCA5A5;background:#FEF2F2}
.txm-count{font-size:10px;font-weight:900;color:#B91C1C;background:#FEE2E2;border-radius:999px;padding:3px 8px;white-space:nowrap}
@media(max-width:640px){.txb-sub{white-space:normal}}
@keyframes txbIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.txm-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #E6EBF2;border-radius:14px;background:#fff}
.txm-row+.txm-row{margin-top:8px}
.txm-row.is-near{border-color:#BFDBFE;background:#EFF6FF}
.txm-av{width:38px;height:38px;border-radius:12px;background:#E8F2FF;display:flex;align-items:center;justify-content:center;font-weight:900;color:#0B63C7;flex:0 0 auto;overflow:hidden}
.txm-av img{width:100%;height:100%;object-fit:cover}
.txm-info{flex:1 1 auto;min-width:0}
.txm-name{margin:0;font-weight:900;font-size:13px;color:#0F172A;line-height:1.2}
.txm-meta{margin:2px 0 0;font-size:11px;font-weight:700;color:#64748B}
.txm-go{border:0;border-radius:11px;background:#28B54D;color:#fff;font-weight:900;font-size:11px;padding:8px 14px;cursor:pointer;white-space:nowrap}
.txm-row.is-near .txm-btn-go{background:#0B63C7}
.txm-sect{font-size:11px;font-weight:900;color:#64748B;text-transform:uppercase;letter-spacing:.12em;margin:14px 0 8px}
.txm-empty{text-align:center;color:#94A3B8;font-weight:700;font-size:13px;padding:20px 0}
`;
function _injectCss() {
  if (typeof document === 'undefined' || document.getElementById('teacherExitCss')) return;
  const s = document.createElement('style');
  s.id = 'teacherExitCss';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ── Datos ────────────────────────────────────────────────────────────────────
async function _load() {
  const classrooms = AppState.get('classrooms') || [];
  const ids = classrooms.map(c => c.id).filter(Boolean);
  _state.students = [];
  _state.exited = new Set();
  _state.present = new Set();
  if (!ids.length) return;

  const today = _today();
  const [studentsRes, attRes] = await Promise.allSettled([
    supabase
      .from('students')
      .select('id, name, avatar_url, matricula, schedule, classroom_id, parent_id')
      .in('classroom_id', ids)
      .eq('is_active', true),
    supabase
      .from('attendance')
      .select('student_id, status, check_in, check_out')
      .in('classroom_id', ids)
      .eq('date', today)
  ]);

  const students = studentsRes.status === 'fulfilled' ? (studentsRes.value?.data || []) : [];
  const att = attRes.status === 'fulfilled' ? (attRes.value?.data || []) : [];

  _state.students = students;
  att.forEach(r => {
    const id = String(r.student_id);
    if (r.check_in) _state.present.add(id);
    if (r.status === 'retirado' || r.check_out) _state.exited.add(id);
  });

  AppState.set('exitedStudentIds', _state.exited);
}

function _near(now) {
  return _state.students
    .filter(s => {
      const id = String(s.id);
      if (_state.exited.has(id)) return false;
      if (!_state.present.has(id)) return false;
      const sched = _parseSchedule(s.schedule);
      if (!sched) return false;
      const mins = _minutesUntil(sched.exit, now);
      return mins > 0 && mins <= WINDOW_MIN;
    })
    .map(s => ({ s, mins: _minutesUntil(_parseSchedule(s.schedule).exit, now), sched: _parseSchedule(s.schedule) }))
    .sort((a, b) => a.mins - b.mins);
}

// ── Render ───────────────────────────────────────────────────────────────────
function _render() {
  const bar = document.getElementById(BAR_ID);
  if (!bar) return;
  _injectCss();
  const near = _near(new Date());
  if (!near.length) { bar.hidden = true; bar.innerHTML = ''; return; }
  _maybeNotify(near);

  const first = near[0];
  const mins = Math.max(0, first.mins);
  const urgent = mins <= ALERT_MIN;
  const names = near.slice(0, 3).map(n => n.s.name).join(', ');
  const extra = near.length > 3 ? ` y ${near.length - 3} más` : '';
  const minsTxt = mins <= 1 ? 'ahora' : `en ${mins} min`;
  bar.hidden = false;
  bar.innerHTML = `
    <div class="txb-bar${urgent ? ' is-urgent' : ''}">
      <div class="txb-ic">${urgent ? '🔔' : '🚪'}</div>
      <div class="txb-txt">
        <p class="txb-title">${near.length === 1 ? '1 estudiante próximo a salir' : `${near.length} estudiantes próximos a salir`}</p>
        <p class="txb-sub">${_esc(names)}${_esc(extra)} · sale${near.length > 1 ? 'n' : ''} a las ${_hhmm(first.sched.exit)} · ${minsTxt}</p>
      </div>
      <span class="txb-count">${mins <= 1 ? '¡Ahora!' : `${mins} min`}</span>
      <button class="txb-btn" data-txb-act="manage">Gestionar salida</button>
    </div>`;
}

function _studentRow(s, isNear, sched, mins = null) {
  const initial = _esc((s.name || '?').charAt(0));
  const av = s.avatar_url
    ? `<img src="${_esc(s.avatar_url)}" alt="">`
    : initial;
  const urgent = isNear && mins != null && mins <= ALERT_MIN;
  const timeLabel = sched
    ? `Hora de salida: ${_hhmm(sched.exit)}${mins != null ? ` · ${mins <= 1 ? 'ahora' : 'en ' + mins + ' min'}` : ''}`
    : 'Sin horario definido';
  return `
    <div class="txm-row${isNear ? ' is-near' : ''}${urgent ? ' is-urgent' : ''}">
      <div class="txm-av">${av}</div>
      <div class="txm-txt" style="flex:1 1 auto;min-width:0">
        <p class="txm-row-name" style="margin:0;font-weight:800;font-size:13px;color:#0F172A">${_esc(s.name)}</p>
        <p style="margin:2px 0 0;font-size:11px;font-weight:700;color:#64748B">${_esc(timeLabel)}</p>
      </div>
      ${urgent ? `<span class="txm-count">${mins <= 1 ? '¡Ahora!' : mins + ' min'}</span>` : ''}
      <button class="txb-btn" style="background:#28B54D;color:#fff" data-txb-reg="${_esc(String(s.id))}">Registrar salida</button>
    </div>`;
}

function _openModal() {
  const now = new Date();
  const near = _near(now);
  const nearIds = new Set(near.map(x => String(x.s.id)));
  const others = _state.students
    .filter(s => _state.present.has(String(s.id)) && !_state.exited.has(String(s.id)) && !nearIds.has(String(s.id)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const nearHTML = near.length
    ? near.map(x => _studentRow(x.s, true, x.sched, x.mins)).join('')
    : `<p style="font-size:12px;color:#94A3B8;font-weight:700;padding:4px 2px">Ninguno en este momento.</p>`;
  const othersHTML = others.length
    ? others.map(s => _studentRow(s, false, _parseSchedule(s.schedule))).join('')
    : `<p style="font-size:12px;color:#94A3B8;font-weight:700;padding:4px 2px">No hay otros estudiantes presentes.</p>`;

  const content = `
    <div style="background:#fff;border-radius:28px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#0B63C7,#08498F);padding:18px 20px;display:flex;align-items:center;gap:12px">
        <span style="font-size:22px">🚪</span>
        <div style="flex:1">
          <h3 style="margin:0;color:#fff;font-weight:900;font-size:16px">Gestionar salida</h3>
          <p style="margin:2px 0 0;color:rgba(255,255,255,.85);font-weight:700;font-size:12px">Registra la salida del estudiante</p>
        </div>
        <button onclick="UI.Modal.close('${MODAL_ID}')" style="border:0;background:rgba(255,255,255,.2);border-radius:12px;padding:8px;color:#fff;cursor:pointer">✕</button>
      </div>
      <div style="padding:18px 20px;max-height:70vh;overflow-y:auto">
        <h4 style="margin:0 0 10px;font-size:12px;font-weight:900;color:#0B63C7;text-transform:uppercase;letter-spacing:.1em">⏰ Próximos a salir (≤ ${WINDOW_MIN} min)</h4>
        ${nearHTML}
        <h4 style="margin:20px 0 10px;font-size:12px;font-weight:900;color:#64748B;text-transform:uppercase;letter-spacing:.1em">👥 Otros presentes hoy</h4>
        ${othersHTML}
      </div>
    </div>`;
  UI.Modal.open(MODAL_ID, content);
}

// ── Registrar salida ─────────────────────────────────────────────────────────
async function _registerExit(studentId) {
  const student = _state.students.find(s => String(s.id) === String(studentId));
  if (!student) return;
  const ok = await Helpers.confirm(`¿Registrar la salida de ${student.name}?\n\nSe notificará al padre/tutor.`);
  if (!ok) return;
  if (!student.matricula) { Helpers.toast('El estudiante no tiene matrícula registrada', 'error'); return; }

  try {
    let { data, error } = await supabase
      .rpc('process_door_punch', { p_code: student.matricula });
    if (error) throw error;
    // Si aún no tenía entrada (punch), la primera llamada registra el check-in;
    // llamamos de nuevo para obtener el check-out.
    if (data && data.success && data.type === 'check_in') {
      const second = await supabase.rpc('process_door_punch', { p_code: student.matricula });
      data = second.data || data;
    }
    if (!data || !data.success) {
      Helpers.toast(data?.message || 'No se pudo registrar la salida', 'warning');
      return;
    }
    if (data.type !== 'check_out') {
      Helpers.toast('No se pudo confirmar la salida del estudiante', 'warning');
    } else {
      Helpers.toast(`Salida de ${student.name} registrada`, 'success');
      emitEvent('attendance.checkout', {
        parent_id: student.parent_id,
        student_name: student.name,
        time: new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }),
        link: 'panel_padres.html'
      }).catch(() => {});
    }
    await _load();
    _render();
    if (document.getElementById(MODAL_ID)) _openModal();
  } catch (err) {
    Helpers.toast(err.message || 'Error al registrar la salida', 'error');
  }
}

// ── Guarda central: bloquear rutina tras la salida ───────────────────────────
function _installWriteGuard() {
  if (_state.patched) return;
  _state.patched = true;
  const orig = MaestraApi.upsertDailyLog.bind(MaestraApi);
  MaestraApi.upsertDailyLog = async function (payload) {
    const id = payload && payload.student_id != null ? String(payload.student_id) : null;
    if (id && _state.exited.has(id)) {
      Helpers.toast('El estudiante ya fue retirado hoy. No se puede registrar más rutina.', 'warning');
      return null;
    }
    return orig(payload);
  };
}

// ── Eventos ──────────────────────────────────────────────────────────────────
function _bind() {
  if (_state.bound) return;
  _state.bound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest(`#${BAR_ID} [data-txb-act="manage"]`)) { _openModal(); return; }
    const reg = e.target.closest(`[data-txb-reg]`);
    if (reg) { _registerExit(reg.dataset.txbReg); return; }
    if (e.target.closest(`#${BAR_ID} .txb-bar`) && !e.target.closest('button')) { _openModal(); }
  });
}

export const TeacherExitBanner = {
  async init() {
    _injectCss();
    _bind();
    _installWriteGuard();
    try { await _load(); } catch (_) {}
    _render();
    if (_state.timer) clearInterval(_state.timer);
    _state.timer = setInterval(async () => {
      try { await _load(); } catch (_) {}
      _render();
    }, REFRESH_MS);
  },
  async refresh() { await _load(); _render(); },
  isExited(studentId) { return _state.exited.has(String(studentId)); }
};
