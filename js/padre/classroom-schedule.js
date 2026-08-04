/**
 * Cronología del Aula — Panel de Padres
 * Muestra el plan del día configurado por la maestra
 * (classroom_daily_schedule) y marca en tiempo real el evento
 * que está en curso, con aviso (toast + sonido + vibración)
 * cuando un evento nuevo se activa.
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { AppState } from './appState.js';

const CONTAINER_ID = 'classroomScheduleCard';

let _channel = null;
let _ticker = null;
let _classroomId = null;
let _events = [];
let _lastActiveId = null;
let _audioCtx = null;

function _timeToMinutes(t) {
  if (!t) return 0;
  const parts = String(t).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}

function _nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function _statusOf(ev, nowMin) {
  const start = _timeToMinutes(ev.startTime);
  const end = start + (ev.duration || 30);
  if (nowMin < start) return 'pending';
  if (nowMin < end) return 'in_progress';
  return 'completed';
}

function _fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}:${m || '00'} ${ampm}`;
}

function _container() { return document.getElementById(CONTAINER_ID); }

function _notifyActive(ev) {
  if (document.hidden) return;
  Helpers.vibrate('medium');
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
    [660, 880, 990].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  } catch (_) {}
  const label = ev.label || 'Evento';
  const time = _fmtTime(ev.startTime);
  Helpers.toast(`🔔 ${label} — en curso (${time})`, 'success');
}

function _render() {
  const el = _container();
  if (!el) return;
  const nowMin = _nowMinutes();

  if (!_events.length) {
    el.innerHTML = `
      <div class="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
        <span class="text-2xl">🕐</span>
        <div>
          <p class="font-black text-sm text-[#334155]">Cronología del Aula</p>
          <p class="text-xs font-bold text-[#94A3B8]">La maestra aún no ha publicado la cronología de hoy</p>
        </div>
      </div>`;
    _lastActiveId = null;
    return;
  }

  const list = _events.map(ev => ({ ...ev, status: _statusOf(ev, nowMin) }));
  const active = list.find(e => e.status === 'in_progress');
  const next = list.find(e => e.status === 'pending');

  const newActiveId = active?.id || null;
  if (newActiveId && newActiveId !== _lastActiveId && _lastActiveId !== null) {
    _notifyActive(active);
  }
  _lastActiveId = newActiveId;

  const rows = list.map(ev => {
    const s = ev.status;
    const dot = s === 'in_progress'
      ? 'bg-[#28B54D] ring-4 ring-[#28B54D]/25 animate-pulse'
      : s === 'completed' ? 'bg-[#28B54D]' : 'bg-slate-300';
    return `
      <div class="flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${s === 'in_progress' ? 'bg-[#E8FFF0] border border-[#28B54D]/40 shadow-md' : s === 'completed' ? 'bg-[#F0FDF4] opacity-60' : 'bg-slate-50 border border-slate-100'}">
        <div class="w-2.5 h-2.5 rounded-full ${dot} shrink-0"></div>
        <span class="text-xl leading-none w-8 text-center shrink-0">${ev.emoji || '📌'}</span>
        <div class="flex-1 min-w-0">
          <p class="font-black text-sm ${s === 'completed' ? 'text-slate-400 line-through' : 'text-[#1A2340]'} truncate">${Helpers.escapeHTML(ev.label || 'Evento')}</p>
        </div>
        <span class="text-[10px] font-black px-2 py-1 rounded-lg shrink-0 ${s === 'in_progress' ? 'bg-[#28B54D] text-white' : 'bg-white border border-slate-200 text-slate-500'}">${_fmtTime(ev.startTime)}${ev.duration ? ` · ${ev.duration}min` : ''}</span>
      </div>`;
  }).join('');

  const nextBanner = next ? `
    <div class="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#E8F2FF] border border-[#0B63C7]/10">
      <span class="text-lg">⏭️</span>
      <p class="text-[11px] font-black text-[#0B63C7]">Siguiente: ${Helpers.escapeHTML(next.label)} — ${_fmtTime(next.startTime)}</p>
    </div>` : '';

  el.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-3">
        <span class="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366F1] to-[#D946EF] text-white flex items-center justify-center text-lg shadow-lg shadow-indigo-200">🕐</span>
        <div>
          <h3 class="font-black text-xl text-[#1A2340]">Cronología del Aula</h3>
          <p class="text-[10px] font-black text-[#64748B] uppercase tracking-[0.15em]">Hoy · ${new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>
    </div>
    ${active ? `
      <div class="flex items-center gap-3 p-3 mb-3 rounded-2xl" style="background:${active.color}15;border:2px solid ${active.color}30">
        <span class="text-3xl animate-bounce">${active.emoji || '🔔'}</span>
        <div class="flex-1 min-w-0">
          <div class="text-[9px] font-black uppercase tracking-widest" style="color:${active.color}">🔔 En curso ahora</div>
          <div class="text-sm font-black text-[#1A2340] truncate">${Helpers.escapeHTML(active.label || 'Evento')}</div>
        </div>
        <span class="text-[10px] font-black text-white px-2 py-1 rounded-lg shrink-0" style="background:${active.color}">${_fmtTime(active.startTime)}</span>
      </div>` : nextBanner}
    <div class="space-y-2 mb-3">${rows}</div>
    <button onclick="App.navigateTo('rutina-diaria')" class="w-full py-2.5 rounded-xl border-2 border-dashed border-[#0B63C7]/30 font-black text-[10px] uppercase tracking-widest text-[#0B63C7] hover:bg-[#E8F2FF] transition-all">
      Ver rutina completa del día →
    </button>`;
}

export const ClassroomSchedule = {
  async init() {
    const student = AppState.get('currentStudent');
    const classroomId = student?.classroom_id || student?.classrooms?.id || null;
    const el = _container();
    if (!classroomId) {
      if (el) el.innerHTML = '';
      return;
    }
    if (_channel && _classroomId === classroomId) return;

    if (_channel) { try { supabase.removeChannel(_channel); } catch (_) {} _channel = null; }
    _classroomId = classroomId;
    _lastActiveId = null;

    _channel = supabase
      .channel(`classroom-schedule-${classroomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classroom_daily_schedule', filter: `classroom_id=eq.${classroomId}` },
        () => { this.load(); }
      )
      .subscribe();

    if (!_ticker) _ticker = setInterval(() => _render(), 30000);

    await this.load();
  },

  async load() {
    if (!_classroomId) return;
    try {
      const { data, error } = await supabase
        .from('classroom_daily_schedule')
        .select('events')
        .eq('classroom_id', _classroomId)
        .eq('schedule_date', AppState.today())
        .maybeSingle();
      _events = error || !data ? [] : (data.events || []);
    } catch (_) {
      _events = [];
    }
    _render();
  },

  destroy() {
    if (_ticker) { clearInterval(_ticker); _ticker = null; }
    if (_channel) { try { supabase.removeChannel(_channel); } catch (_) {} _channel = null; }
    _classroomId = null;
    _events = [];
    _lastActiveId = null;
  }
};
