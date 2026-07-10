import { supabase } from '../../shared/supabase.js';
import { AppState } from '../state.js';
import { Helpers } from '../../shared/helpers.js';
import { QueryCache } from '../../shared/query-cache.js';

const STATUS_MAP = {
  paid:    { label: 'Aprobado',    cls: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'Pendiente',   cls: 'bg-amber-100 text-amber-700' },
  review:  { label: 'En Revisión', cls: 'bg-blue-100 text-blue-700' },
  overdue: { label: 'Vencido',     cls: 'bg-rose-100 text-rose-700' }
};

export const DashboardModule = {
  _chart: null,

  async init() {
    const dateEl = document.getElementById('dashboardDate');
    const updateDate = () => {
      if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('es-DO', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
      }
    };
    updateDate();
    // Update date at midnight
    const msUntilMidnight = () => {
      const now = new Date();
      const midnight = new Date(now); midnight.setHours(24,0,0,0);
      return midnight - now;
    };
    setTimeout(() => { updateDate(); setInterval(updateDate, 86400000); }, msUntilMidnight());

    await Promise.all([
      this.loadStats(),
      this.loadRecentPayments(),
      this._loadMiniChart(),
      this.loadPendingTransfers(),
      this.loadPreregBadge(),
    ]);
  },

  async loadStats() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const monthKey = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');

        // Stale-while-revalidate: mostrar datos cacheados inmediatamente, revalidar en background
        const cachedStats = QueryCache.getStale(
          'asis_dashboard_stats',
          async () => {
            const [studentsRes, attendanceRes, paymentsRes, incomeRes] = await Promise.allSettled([
              supabase.from('students').select('*', { count: 'exact', head: true }),
              supabase.from('attendance').select('*', { count: 'exact', head: true })
                .eq('date', today).in('status', ['present', 'presente']),
              supabase.from('payments').select('*', { count: 'exact', head: true })
                .in('status', ['pending', 'review']),
              supabase.from('payments').select('amount')
                .eq('status', 'paid').eq('month_paid', monthKey)
            ]);
            const get = (r) => r.status === 'fulfilled' ? r.value : {};
            return {
              studentsCount:   get(studentsRes).count  || 0,
              attendanceCount: get(attendanceRes).count || 0,
              paymentsCount:   get(paymentsRes).count  || 0,
              incomeTotal:     (get(incomeRes).data || []).reduce((s, p) => s + Number(p.amount || 0), 0)
            };
          },
          2 * 60_000,
          (fresh) => this._applyStats(fresh)
        );

        if (cachedStats) this._applyStats(cachedStats);

      } catch (e) {
        console.error('Error loading stats:', e);
      }
    }
,

  _applyStats({ studentsCount, attendanceCount, paymentsCount, incomeTotal }) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('statStudents',   studentsCount);
    set('statAttendance', attendanceCount);
    set('statPayments',   paymentsCount);
    set('statIncome',     'RD$' + incomeTotal.toLocaleString('es-DO', { minimumFractionDigits: 0 }));
    set('welcomeName',    (AppState.get('profile')?.name || 'Asistente').split(' ')[0]);
    this._renderUrgentAlerts(paymentsCount, attendanceCount);
  },

  _renderUrgentAlerts(paymentsReview, pendingAbsences) {
    const container = document.getElementById('urgentAlertsWidget');
    if (!container) return;

    const alerts = [];
    
    if (paymentsReview > 0) {
      alerts.push({
        title: `${paymentsReview} Pagos por validar`,
        desc: 'Comprobantes pendientes de revisión bancaria.',
        icon: 'credit-card',
        color: 'rose',
        section: 'pagos'
      });
    }

    // Supongamos que reportes de ausencia son los estudiantes inactivos o algo similar por ahora
    // En una implementación real, sería una tabla de 'absence_reports'
    if (pendingAbsences > 0) {
      alerts.push({
        title: `Actividad de hoy`,
        desc: `${pendingAbsences} estudiantes ya ingresaron a la estancia.`,
        icon: 'users',
        color: 'amber',
        section: 'accesos'
      });
    }

    if (alerts.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = alerts.map(a => `
      <div onclick="window.App.navigateTo('${a.section}')" class="bg-${a.color}-50 border border-${a.color}-100 p-4 rounded-2xl flex items-start gap-4 cursor-pointer hover:shadow-md transition-all group">
        <div class="w-10 h-10 rounded-xl bg-${a.color}-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-${a.color}-200 group-hover:scale-110 transition-transform">
          <i data-lucide="${a.icon}" class="w-5 h-5"></i>
        </div>
        <div>
          <h4 class="text-sm font-black text-${a.color}-900">${a.title}</h4>
          <p class="text-xs text-${a.color}-700/70 font-bold mt-0.5">${a.desc}</p>
        </div>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  },

  async loadRecentPayments() {
    const container = document.getElementById('dashRecentPayments');
    if (!container) return;

    try {
      const { data, error } = await supabase
        .from('payments')
        .select('id, amount, status, month_paid, method, concept, created_at, students:student_id(name)')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) throw error;

      if (!data?.length) {
        container.innerHTML = '<div class="px-5 py-8 text-center text-slate-400 text-sm">Sin actividad reciente.</div>';
        return;
      }

      const STATUS = {
        paid:    { label:'Aprobado',    cls:'bg-emerald-100 text-emerald-700', dot:'bg-emerald-500' },
        pending: { label:'Pendiente',   cls:'bg-amber-100 text-amber-700',     dot:'bg-amber-500' },
        review:  { label:'Revisión',    cls:'bg-blue-100 text-blue-700',       dot:'bg-blue-500' },
        overdue: { label:'Vencido',     cls:'bg-rose-100 text-rose-700',       dot:'bg-rose-500' },
      };

      const timeAgo = (iso) => {
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'ahora';
        if (m < 60) return m + 'm';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h';
        return Math.floor(h / 24) + 'd';
      };

      container.innerHTML = data.map(p => {
        const st  = STATUS[p.status] || { label: p.status, cls: 'bg-slate-100 text-slate-600', dot:'bg-slate-400' };
        const amt = 'RD$' + Number(p.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 0 });
        const ini = (p.students?.name || '?').charAt(0).toUpperCase();
        const concept = p.concept || p.month_paid || 'Mensualidad';
        return `
          <div class="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/70 transition-colors group">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0d9488] to-[#0B63C7] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">${ini}</div>
            <div class="min-w-0 flex-1">
              <p class="font-black text-slate-800 text-sm truncate">${Helpers.escapeHTML(p.students?.name || 'Desconocido')}</p>
              <p class="text-[10px] text-slate-400 font-bold uppercase truncate">${Helpers.escapeHTML(concept)}</p>
            </div>
            <div class="text-right shrink-0 flex flex-col items-end gap-1">
              <p class="font-black text-sm text-slate-800">${amt}</p>
              <div class="flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full ${st.dot}"></span>
                <span class="text-[9px] font-black ${st.cls.split(' ')[1]}">${st.label}</span>
                <span class="text-[9px] text-slate-300 font-bold">· ${timeAgo(p.created_at)}</span>
              </div>
            </div>
          </div>`;
      }).join('');

    } catch (_) {
      container.innerHTML = Helpers.errorState('Error al cargar');
      if (window.lucide) lucide.createIcons();
    }
  },

  async _loadMiniChart() {
    const canvas = document.getElementById('incomeChart');
    if (!canvas || !window.Chart) return;
    try {
      const year = new Date().getFullYear();
      const { data } = await supabase
        .from('payments').select('amount, month_paid')
        .eq('status', 'paid')
        .like('month_paid', year + '-%');

      const vals = new Array(12).fill(0);
      (data || []).forEach(p => {
        const parts = (p.month_paid || '').split('-');
        const m = parts.length >= 2 ? parseInt(parts[1], 10) - 1 : -1;
        if (m >= 0 && m <= 11) vals[m] += Number(p.amount || 0);
      });

      if (this._chart) this._chart.destroy();
      this._chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: ['E','F','M','A','M','J','J','A','S','O','N','D'],
          datasets: [{
            data: vals,
            backgroundColor: vals.map((v, i) => {
              const now = new Date().getMonth();
              if (i === now) return 'rgba(11,99,199,0.9)';
              if (i < now) return 'rgba(40,181,77,0.75)';
              return 'rgba(203,213,225,0.5)';
            }),
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            callbacks: { label: ctx => 'RD$' + Number(ctx.raw).toLocaleString('es-DO', { minimumFractionDigits: 0 }) }
          }},
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#94a3b8' } },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: { font: { size: 9 }, color: '#94a3b8', callback: (v) => v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : '$' + v }
            }
          }
        }
      });
    } catch (e) {
      
    }
  },

  // ── Comprobantes pendientes de validar (panel lateral del dashboard) ──────
  async loadPendingTransfers() {
    const container = document.getElementById('dashPendingTransfers');
    if (!container) return;
    try {
      const { data } = await supabase
        .from('payments')
        .select('id, amount, month_paid, students:student_id(name)')
        .eq('status', 'review')
        .order('created_at', { ascending: false })
        .limit(4);

      if (!data?.length) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-2 font-bold">✅ Todo validado</p>';
        return;
      }

      const fmt = n => 'RD$' + Number(n||0).toLocaleString('es-DO', { minimumFractionDigits: 0 });
      container.innerHTML = data.map(p => `
        <div class="flex items-center justify-between py-1.5">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-[#FF7A00]/10 text-[#FF7A00] flex items-center justify-center text-xs font-black shrink-0">
              ${(p.students?.name || '?').charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0">
              <p class="text-xs font-black text-slate-700 truncate">${Helpers.escapeHTML(p.students?.name || '—')}</p>
              <p class="text-[10px] text-slate-400 font-bold">${p.month_paid || '—'}</p>
            </div>
          </div>
          <span class="text-xs font-black text-[#0B63C7] shrink-0">${fmt(p.amount)}</span>
        </div>`).join('');

    } catch (_) {
      container.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">—</p>';
    }
  },

  // ── Badge de pre-inscripciones pendientes en quick-access button ──────────
  async loadPreregBadge() {
    try {
      const { count } = await supabase
        .from('student_preregistrations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const b = document.getElementById('badge-dashboard-prereg');
      if (b) {
        if (count > 0) {
          b.textContent = count > 9 ? '9+' : String(count);
          b.classList.remove('hidden');
        } else {
          b.classList.add('hidden');
        }
      }
    } catch (_) {}
  }
};
