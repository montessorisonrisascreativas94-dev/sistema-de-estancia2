/**
 * Daily Report Module — Panel Padre
 * Muestra el reporte de rutina diaria del hijo con timeline de eventos y horas.
 */
import { supabase } from '../shared/supabase.js';

const ICONS = {
  food:    { todo:'🍽️', poco:'🍲', nada:'🙅' },
  mood:    { feliz:'😊', normal:'😐', triste:'😢', enojado:'😡' },
  nap:     { si:'💤', no:'☀️' },
  milk:    '🍼',
  sleep:   '😴',
  wakeup:  '😊',
  diaper:  { wet:'💧', soiled:'💩' },
  bath:    '🚽',
  temp:    '🌡',
  med:     '💊',
  note:    '📝',
};

const LABELS = {
  food:  { todo:'Comió todo', poco:'Comió poco', nada:'No comió' },
  mood:  { feliz:'Contento/a', normal:'Normal', triste:'Triste', enojado:'Molesto/a' },
  nap:   { si:'Durmió su siesta', no:'No durmió siesta' },
};

function fmtTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString('es-DO', { hour:'2-digit', minute:'2-digit', hour12:true });
}
function fmtDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
}

export const DailyReportModule = {
  _studentId: null,

  setStudent(id) {
    this._studentId = id;
    // Inicializar date picker a hoy
    const picker = document.getElementById('rutinaDatePicker');
    if (picker) picker.value = new Date().toISOString().split('T')[0];
    // Suscripción realtime — actualiza automáticamente cuando la maestra guarda
    this._subscribeRealtime();
  },

  _subscribeRealtime() {
    if (this._channel) { this._channel.unsubscribe(); }
    if (!this._studentId) return;
    const today = new Date().toISOString().split('T')[0];
    this._channel = window.supabase?.channel(`daily_log_${this._studentId}`)
      ?.on('postgres_changes', {
        event: '*', schema: 'public', table: 'daily_logs',
        filter: `student_id=eq.${this._studentId}`
      }, () => {
        const picker = document.getElementById('rutinaDatePicker');
        const currentDate = picker?.value || today;
        if (currentDate === today) this.load();
      })
      ?.subscribe();
  },

  async loadDate(dateStr) {
    const container = document.getElementById('dailyReportContainer');
    if (!container || !this._studentId) return;

    container.innerHTML = `<div class="animate-pulse space-y-4">
      <div class="h-28 bg-slate-100 rounded-2xl"></div>
      <div class="h-40 bg-slate-100 rounded-2xl"></div>
    </div>`;

    try {
      const { data: log } = await supabase
        .from('daily_logs')
        .select('id, student_id, date, mood, food, nap, notes, infant_data, created_at, status')
        .eq('student_id', this._studentId)
        .eq('date', dateStr)
        .eq('status', 'published')
        .maybeSingle();

      const dateLabel = fmtDate(dateStr + 'T12:00:00');

      if (!log) {
        container.innerHTML = `
          <div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
            <div class="text-5xl mb-3">📋</div>
            <h4 class="font-black text-slate-600 text-lg">Sin reporte para este día</h4>
            <p class="text-xs text-slate-300 mt-3 font-bold uppercase tracking-wider capitalize">${dateLabel}</p>
          </div>`;
        return;
      }
      container.innerHTML = this._renderReport(log, dateLabel);
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<p class="text-center text-rose-500 py-8 font-bold">Error al cargar el reporte.</p>`;
    }
  },

  async load() {
    const container = document.getElementById('dailyReportContainer');
    if (!container) return;

    container.innerHTML = `<div class="animate-pulse space-y-4">
      <div class="h-28 bg-slate-100 rounded-2xl"></div>
      <div class="h-40 bg-slate-100 rounded-2xl"></div>
    </div>`;

    try {
      const sid   = this._studentId;
      if (!sid) { container.innerHTML = `<p class="text-center text-slate-400 py-8">No se encontró el estudiante.</p>`; return; }

      const today = new Date().toISOString().split('T')[0];

      const { data: log, error } = await supabase
        .from('daily_logs')
        .select('id, student_id, date, mood, food, nap, notes, infant_data, created_at, status')
        .eq('student_id', sid)
        .eq('date', today)
        .eq('status', 'published')
        .maybeSingle();

      if (error) throw error;

      const todayLabel = fmtDate(new Date().toISOString());

      if (!log) {
        container.innerHTML = `
          <div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
            <div class="text-5xl mb-3">📋</div>
            <h4 class="font-black text-slate-600 text-lg">Sin reporte por ahora</h4>
            <p class="text-sm text-slate-400 mt-1">La maestra aún no ha registrado la rutina de hoy.</p>
            <p class="text-xs text-slate-300 mt-3 font-bold uppercase tracking-wider">${todayLabel}</p>
          </div>`;
        return;
      }

      container.innerHTML = this._renderReport(log, todayLabel);
      if (window.lucide) lucide.createIcons();

    } catch (e) {
      console.error('[DailyReport]', e);
      container.innerHTML = `<p class="text-center text-rose-500 py-8 font-bold">Error al cargar el reporte.</p>`;
    }
  },

  _renderReport(log, todayLabel) {
    // ── Resumen rápido ──────────────────────────────────────────────
    const moodIcon  = log.mood ? ICONS.mood[log.mood]  : '—';
    const foodIcon  = log.food ? ICONS.food[log.food]  : '—';
    const napIcon   = log.nap  ? ICONS.nap[log.nap]    : '—';
    const moodLbl   = log.mood ? LABELS.mood[log.mood]  : 'Sin registro';
    const foodLbl   = log.food ? LABELS.food[log.food]  : 'Sin registro';
    const napLbl    = log.nap  ? LABELS.nap[log.nap]    : 'Sin registro';

    const updTime   = log.created_at ? fmtTime(log.created_at) : '';

    // ── Timeline de eventos (infant_data) ───────────────────────────
    const events    = log.infant_data || [];
    const timeline  = events.map(e => this._renderEvent(e)).join('');

    return `
    <style>
      .dr-card{background:white;border-radius:20px;border:1px solid #f1f5f9;box-shadow:0 2px 12px rgba(0,0,0,.04);overflow:hidden}
      .dr-timeline-item{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid #f8fafc}
      .dr-timeline-item:last-child{border:none}
      .dr-dot{width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;background:#f8fafc}
      .dr-summary-chip{display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:16px;background:#f8fafc;border:1px solid #f1f5f9}
    </style>

    <div class="space-y-5">
      <!-- Header del reporte -->
      <div class="dr-card">
        <div class="bg-gradient-to-r from-[#28B54D] to-[#239943] p-4 text-white flex items-center justify-between">
          <div>
            <div class="font-black text-lg leading-tight">Reporte del Día</div>
            <div class="text-xs text-green-100 font-bold capitalize">${todayLabel}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-green-100 font-bold">Última actualización</div>
            <div class="font-black text-sm">${updTime}</div>
          </div>
        </div>

        <!-- Resumen 3 indicadores -->
        <div class="grid grid-cols-3 divide-x divide-slate-100 p-2">
          <div class="dr-summary-chip flex-col text-center rounded-none border-0 bg-transparent">
            <span class="text-2xl">${moodIcon}</span>
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">Ánimo</span>
            <span class="text-xs font-bold text-slate-600">${moodLbl}</span>
          </div>
          <div class="dr-summary-chip flex-col text-center rounded-none border-0 bg-transparent">
            <span class="text-2xl">${foodIcon}</span>
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">Comida</span>
            <span class="text-xs font-bold text-slate-600">${foodLbl}</span>
          </div>
          <div class="dr-summary-chip flex-col text-center rounded-none border-0 bg-transparent">
            <span class="text-2xl">${napIcon}</span>
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">Siesta</span>
            <span class="text-xs font-bold text-slate-600">${napLbl}</span>
          </div>
        </div>
      </div>

      ${log.notes ? `
      <div class="dr-card p-4 flex items-start gap-3">
        <span class="text-xl mt-0.5">📝</span>
        <div>
          <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Observación de la maestra</div>
          <p class="text-sm font-medium text-slate-700 leading-relaxed">${log.notes}</p>
        </div>
      </div>` : ''}

      ${events.length > 0 ? `
      <div class="dr-card p-4">
        <div class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <i data-lucide="clock" class="w-3.5 h-3.5"></i> Timeline de eventos
        </div>
        <div class="space-y-0">${timeline}</div>
      </div>` : ''}
    </div>`;
  },

  _renderEvent(e) {
    const time = e.created_at ? fmtTime(e.created_at) : (e.start_time ? fmtTime(e.start_time) : '');
    let icon = '📌', label = e.type, detail = '';

    switch (e.type) {
      case 'milk':
        icon = '🍼'; label = 'Biberón'; detail = e.oz ? `${e.oz} oz` : ''; break;
      case 'sleep':
        icon = '😴'; label = 'Durmió';
        if (e.end_time) {
          const dur = e.duration || '';
          detail = dur ? `Siesta de ${dur}` : `Despertó: ${fmtTime(e.end_time)}`;
        } else {
          detail = 'En siesta...';
        }
        break;
      case 'diaper':
        icon = e.subtype === 'wet' ? '💧' : '💩';
        label = e.subtype === 'wet' ? 'Pañal mojado' : 'Pañal sucio'; break;
      case 'bath':
        icon = '🚽'; label = 'Fue al baño'; break;
      case 'temp':
        icon = '🌡'; label = 'Temperatura';
        detail = e.value ? `${e.value}°` : '';
        if (e.value >= 38) detail += ' ⚠️ Fiebre';
        break;
      case 'med':
        icon = '💊'; label = 'Medicamento';
        detail = [e.name, e.dose].filter(Boolean).join(' — '); break;
      case 'note':
        icon = '📝'; label = 'Nota'; detail = e.text || ''; break;
      default:
        label = e.type; break;
    }

    return `
    <div class="dr-timeline-item">
      <div class="dr-dot">${icon}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-black text-slate-700">${label}</span>
          <span class="text-[10px] font-bold text-slate-400 shrink-0">${time}</span>
        </div>
        ${detail ? `<p class="text-xs text-slate-500 mt-0.5">${detail}</p>` : ''}
      </div>
    </div>`;
  },
};

// Disponible globalmente para llamadas desde HTML
window.DailyReportModule = DailyReportModule;
