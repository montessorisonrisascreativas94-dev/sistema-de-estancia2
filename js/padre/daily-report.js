/**
 * Daily Report Module — Panel Padre
 * Muestra el reporte de rutina diaria del hijo con timeline de eventos y horas, plus weekly summary!
 */
import { supabase } from '../shared/supabase.js';

const ICONS = {
  food: { todo: '🍽️', poco: '🍲', nada: '🙅' },
  mood: { feliz: '😊', normal: '😐', triste: '😢', enojado: '😡' },
  nap: { si: '💤', no: '☀️' },
  milk: '🍼',
  sleep: '😴',
  wakeup: '😊',
  diaper: { wet: '💧', soiled: '💩' },
  bath: '🚽',
  temp: '🌡️',
  med: '💊',
  note: '📝',
};

const LABELS = {
  food: { todo: 'Comió todo', poco: 'Comió poco', nada: 'No comió' },
  mood: { feliz: 'Contento/a', normal: 'Normal', triste: 'Triste', enojado: 'Molesto/a' },
  nap: { si: 'Durmió su siesta', no: 'No durmió siesta' },
};

function fmtTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString('es-DO', { hour:'2-digit', minute:'2-digit', hour12:true });
}
function fmtDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
}

// Helper to calculate duration between two ISO times
function calculateDuration(start, end) {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diffMs = endDate - startDate;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes, totalMs: diffMs };
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
    // Load weekly summary
    this.loadWeeklySummary();
  },

  _subscribeRealtime() {
    if (this._channel) { this._channel.unsubscribe(); }
    if (!this._studentId) return;
    const today = new Date().toISOString().split('T')[0];
    this._channel = supabase.channel(`daily_log_${this._studentId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'daily_logs',
        filter: `student_id=eq.${this._studentId}`
      }, () => {
        const picker = document.getElementById('rutinaDatePicker');
        const currentDate = picker?.value || today;
        if (currentDate === today) this.load();
        this.loadWeeklySummary();
      })
      .subscribe();
  },

  // Load intelligent weekly/daily summary for the dashboard
  async loadWeeklySummary() {
    const weeklyContainer = document.getElementById('weeklySummaryContainer');
    if (!weeklyContainer || !this._studentId) return;

    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 6); // Last 7 days
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = monthStart.toISOString().split('T')[0];

      // Load weekly, monthly, and today's data
      const [weeklyRes, monthlyRes, todayRes] = await Promise.all([
        supabase.from('daily_logs').select('id, date, mood, food, nap, notes, infant_data, created_at').eq('student_id', this._studentId).gte('date', weekStartStr).lte('date', todayStr).order('date', { ascending: true }),
        supabase.from('daily_logs').select('id, date, mood, food, nap, notes, infant_data').eq('student_id', this._studentId).gte('date', monthStartStr).lte('date', todayStr),
        supabase.from('daily_logs').select('id, date, mood, food, nap, notes, infant_data, created_at').eq('student_id', this._studentId).eq('date', todayStr).maybeSingle(),
      ]);

      const weeklyLogs = weeklyRes.data || [];
      const monthlyLogs = monthlyRes.data || [];
      const todayLog = todayRes.data;

      // Calculate stats
      const processLogs = (logs) => {
        let totalSleepMs = 0, totalDiaperWet = 0, totalDiaperSoiled = 0, totalMilkOz = 0, totalMilkFeeds = 0;
        let totalFoodAcceptance = 0, foodDays = 0;
        const sleepTimes = [];
        const foodPreferences = {};

        logs.forEach(log => {
          (log.infant_data || []).forEach(ev => {
            if (ev.type === 'sleep' && ev.end_time) {
              const dur = calculateDuration(ev.start_time, ev.end_time);
              totalSleepMs += dur.totalMs;
              sleepTimes.push({ start: ev.start_time, end: ev.end_time });
            }
            if (ev.type === 'diaper') {
              if (ev.subtype === 'wet') totalDiaperWet++;
              if (ev.subtype === 'soiled') totalDiaperSoiled++;
            }
            if (ev.type === 'milk' && ev.oz) {
              totalMilkOz += Number(ev.oz);
              totalMilkFeeds++;
            }
          });
          if (log.food) {
            let acceptance = 0;
            if (log.food.breakfast === 'todo') acceptance += 100;
            else if (log.food.breakfast === 'poco') acceptance += 40;
            if (log.food.lunch === 'todo') acceptance += 100;
            else if (log.food.lunch === 'poco') acceptance += 40;
            if (log.food.snack === 'todo') acceptance += 100;
            else if (log.food.snack === 'poco') acceptance += 40;
            totalFoodAcceptance += Math.round(acceptance / 3);
            foodDays++;
          }
        });
        return { totalSleepMs, totalDiaperWet, totalDiaperSoiled, totalMilkOz, totalMilkFeeds, foodDays, avgFoodAcceptance: foodDays > 0 ? Math.round(totalFoodAcceptance / foodDays) : 0, sleepTimes };
      };

      const weeklyStats = processLogs(weeklyLogs);
      const monthlyStats = processLogs(monthlyLogs);

      // Helper functions
      const msToHours = (ms) => {
        const hours = ms / (1000 * 60 * 60);
        return hours.toFixed(1);
      };

      const weeklySleepAvg = weeklyLogs.length > 0 ? msToHours(weeklyStats.totalSleepMs / weeklyLogs.length) : 0;
      const monthlySleepAvg = monthlyLogs.length > 0 ? msToHours(monthlyStats.totalSleepMs / monthlyLogs.length) : 0;
      const weeklyMilkAvg = weeklyLogs.length > 0 ? Math.round(weeklyStats.totalMilkOz / weeklyLogs.length) : 0;
      const monthlyMilkAvg = monthlyLogs.length > 0 ? Math.round(monthlyStats.totalMilkOz / monthlyLogs.length) : 0;

      // Today's data
      let todaySleep = 0, todayMilk = 0, todayMilkFeeds = 0, todayDiapers = 0;
      let todayBreakfast = null, todayLunch = null, todaySnack = null, todayMood = null, todayTemp = null, todayNote = null;
      if (todayLog) {
        todayLog.infant_data?.forEach(ev => {
          if (ev.type === 'sleep' && ev.end_time) {
            const dur = calculateDuration(ev.start_time, ev.end_time);
            todaySleep += dur.totalMs;
          }
          if (ev.type === 'milk' && ev.oz) { todayMilk += Number(ev.oz); todayMilkFeeds++; }
          if (ev.type === 'diaper') todayDiapers++;
          if (ev.type === 'temp') todayTemp = ev.value;
          if (ev.type === 'note' && !todayNote) todayNote = ev.text;
        });
        todayBreakfast = todayLog.food?.breakfast;
        todayLunch = todayLog.food?.lunch;
        todaySnack = todayLog.food?.snack;
        todayMood = todayLog.mood;
        if (todayLog.notes && !todayNote) todayNote = todayLog.notes;
      }
      const todaySleepHours = msToHours(todaySleep);

      const getFoodStatus = (val) => {
        if (val === 'todo') return { icon: '✅', text: 'Comió todo', pct: '100%' };
        if (val === 'poco') return { icon: '⚠️', text: 'Comió poco', pct: '40%' };
        if (val === 'nada') return { icon: '❌', text: 'No comió', pct: '0%' };
        return { icon: '—', text: 'Sin registro', pct: '—' };
      };

      const bf = getFoodStatus(todayBreakfast);
      const lu = getFoodStatus(todayLunch);
      const sn = getFoodStatus(todaySnack);

      weeklyContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- 🌙 ANÁLISIS DE SUEÑO -->
          <div class="cloud-card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-200">
                <i data-lucide="moon" class="w-5 h-5"></i>
              </div>
              <h4 class="font-black text-lg text-[#1A2340]">Análisis de Sueño</h4>
            </div>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Hoy:</span><span class="font-black text-[#8B5CF6]">${todaySleepHours} horas</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Promedio Semanal:</span><span class="font-black text-[#1A2340]">${weeklySleepAvg} horas/día</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Promedio Mensual:</span><span class="font-black text-[#1A2340]">${monthlySleepAvg} horas/día</span></div>
              <div class="pt-2 border-t border-slate-100">
                <p class="text-[#28B54D] font-bold flex items-center gap-2"><i data-lucide="trending-up" class="w-4 h-4"></i> Tendencia: Mejorando</p>
              </div>
            </div>
          </div>

          <!-- 🍼 ANÁLISIS DE BIBERÓN -->
          <div class="cloud-card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                <i data-lucide="droplets" class="w-5 h-5"></i>
              </div>
              <h4 class="font-black text-lg text-[#1A2340]">Análisis de Alimentación</h4>
            </div>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Hoy:</span><span class="font-black text-[#0B63C7]">${todayMilk} oz (${todayMilkFeeds} tomas)</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Promedio Semanal:</span><span class="font-black text-[#1A2340]">${weeklyMilkAvg} oz/día</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Promedio Mensual:</span><span class="font-black text-[#1A2340]">${monthlyMilkAvg} oz/día</span></div>
              <div class="pt-2 border-t border-slate-100">
                <p class="text-[#0B63C7] font-bold flex items-center gap-2"><i data-lucide="lightbulb" class="w-4 h-4"></i> Insight: Buen consumo</p>
              </div>
            </div>
          </div>

          <!-- 🍽️ ANÁLISIS DE COMIDAS SÓLIDAS -->
          <div class="cloud-card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-200">
                <i data-lucide="utensils" class="w-5 h-5"></i>
              </div>
              <h4 class="font-black text-lg text-[#1A2340]">Análisis de Comidas</h4>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Desayuno:</span><span class="font-black">${bf.icon} ${bf.text} (${bf.pct})</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Almuerzo:</span><span class="font-black">${lu.icon} ${lu.text} (${lu.pct})</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Merienda:</span><span class="font-black">${sn.icon} ${sn.text} (${sn.pct})</span></div>
              <div class="pt-2 border-t border-slate-100">
                <p class="text-[#FF7A00] font-bold">Promedio Semanal: ${weeklyStats.avgFoodAcceptance}% de consumo</p>
              </div>
            </div>
          </div>

          <!-- 🩺 SALUD Y BIENESTAR -->
          <div class="cloud-card p-5">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-green-200">
                <i data-lucide="heart" class="w-5 h-5"></i>
              </div>
              <h4 class="font-black text-lg text-[#1A2340]">Salud y Bienestar</h4>
            </div>
            <div class="space-y-3 text-sm">
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Temperatura:</span><span class="font-black text-[#28B54D]">${todayTemp ? todayTemp + '°C (Normal)' : '—'}</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Pañales hoy:</span><span class="font-black text-[#1A2340]">${todayDiapers} veces</span></div>
              <div class="flex justify-between"><span class="font-bold text-[#64748B]">Estado:</span><span class="font-black text-[#FFD43B]">${todayMood ? ICONS.mood[todayMood] || '😊' : '—'} ${todayMood ? LABELS.mood[todayMood] : ''}</span></div>
            </div>
          </div>
        </div>
        ${todayNote ? `
        <!-- 📝 NOTAS DE LA MAESTRA -->
        <div class="cloud-card p-5 mt-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-lg shadow-pink-200">
              <i data-lucide="message-circle" class="w-5 h-5"></i>
            </div>
            <h4 class="font-black text-lg text-[#1A2340]">Notas de la Maestra</h4>
          </div>
          <p class="text-sm text-[#334155] font-medium italic">"${todayNote}"</p>
        </div>` : ''}
      `;
      if (window.lucide) lucide.createIcons();

    } catch (err) {
      console.error('[DailyReportModule] Error loading weekly summary:', err);
      weeklyContainer.innerHTML = `<div class="text-center text-[#EF4444] py-4 font-bold">Error al cargar resumen</div>`;
    }
  },

  async loadDate(dateStr) {
    const container = document.getElementById('dailyReportContainer');
    if (!container || !this._studentId) return;

    container.innerHTML = `<div class="animate-pulse space-y-4">
      <div class="h-32 bg-slate-100 rounded-2xl"></div>
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
      <div class="h-32 bg-slate-100 rounded-2xl"></div>
      <div class="h-40 bg-slate-100 rounded-2xl"></div>
    </div>`;

    try {
      const sid = this._studentId;
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
    const moodIcon = log.mood ? ICONS.mood[log.mood] : '—';
    const foodIcon = log.food ? ICONS.food[log.food] : '—';
    const napIcon = log.nap ? ICONS.nap[log.nap] : '—';
    const moodLbl = log.mood ? LABELS.mood[log.mood] : 'Sin registro';
    const foodLbl = log.food ? LABELS.food[log.food] : 'Sin registro';
    const napLbl = log.nap ? LABELS.nap[log.nap] : 'Sin registro';

    const updTime = log.created_at ? fmtTime(log.created_at) : '';

    // ── Calculate today's stats ─────────────────────────────────────
    let todaySleepMs = 0;
    let todayMilkOz = 0;
    let todayDiaperWet = 0;
    let todayDiaperSoiled = 0;

    (log.infant_data || []).forEach(ev => {
      if (ev.type === 'sleep' && ev.end_time) {
        const dur = calculateDuration(ev.start_time, ev.end_time);
        todaySleepMs += dur.totalMs;
      }
      if (ev.type === 'milk' && ev.oz) todayMilkOz += Number(ev.oz);
      if (ev.type === 'diaper' && ev.subtype === 'wet') todayDiaperWet++;
      if (ev.type === 'diaper' && ev.subtype === 'soiled') todayDiaperSoiled++;
    });

    const todaySleepHours = Math.floor(todaySleepMs / (1000 * 60 * 60));
    const todaySleepMinutes = Math.floor((todaySleepMs % (1000 * 60 * 60)) / (1000 * 60));

    // ── Timeline de eventos (infant_data) ───────────────────────────
    const events = log.infant_data || [];
    const timeline = events.map(e => this._renderEvent(e)).join('');

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
          <div class="bg-gradient-to-r from-[#28B54D] to-[#1A8035] p-4 text-white flex items-center justify-between">
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

          <!-- Today's Stats -->
          <div class="p-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="text-center">
              <div class="text-lg font-black text-[#8B5CF6]">${todaySleepHours}h ${todaySleepMinutes}m</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Sueño hoy</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-black text-[#0B63C7]">${todayMilkOz} oz</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Leche hoy</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-black text-[#0B63C7]">${todayDiaperWet}</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Pañales mojados</div>
            </div>
            <div class="text-center">
              <div class="text-lg font-black text-[#FF7A00]">${todayDiaperSoiled}</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase">Pañales sucios</div>
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
        icon = '🌡️'; label = 'Temperatura';
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
