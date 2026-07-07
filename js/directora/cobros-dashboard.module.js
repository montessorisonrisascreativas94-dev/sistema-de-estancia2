import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const CURRENCY = 'RD$';

export const CobrosDashboardModule = {
  state: {
    period: 'day',
    loading: true,
    stats: {},
    charts: {}
  },

  async init() {
    console.log('🔄 Inicializando CobrosDashboardModule...');
    this._bindEvents();
    await this.loadData();
  },

  _bindEvents() {
    const self = this;

    const periodButtons = document.querySelectorAll('[data-cobros-period]');
    periodButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        self.state.period = btn.dataset.cobrosPeriod;
        self._updatePeriodButtons();
        self.loadData();
      });
    });
  },

  _updatePeriodButtons() {
    document.querySelectorAll('[data-cobros-period]').forEach(btn => {
      const isActive = btn.dataset.cobrosPeriod === this.state.period;
      btn.classList.toggle('bg-[#0B63C7]', isActive);
      btn.classList.toggle('text-white', isActive);
      btn.classList.toggle('bg-white', !isActive);
      btn.classList.toggle('text-slate-600', !isActive);
      btn.classList.toggle('border-slate-200', !isActive);
    });
  },

  async loadData() {
    this.state.loading = true;
    const container = document.getElementById('cobrosDashboardContainer');
    if (container) {
      container.innerHTML = '<div class="p-20 text-center"><div class="animate-spin w-8 h-8 border-4 border-[#0B63C7] border-t-transparent rounded-full mx-auto mb-4"></div><p class="text-slate-500">Cargando datos...</p></div>';
    }

    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

      // Cargar datos en paralelo
      const [
        todayPaymentsRes,
        monthPaymentsRes,
        pendingPaymentsRes,
        invoicesRes,
        studentsRes
      ] = await Promise.all([
        supabase.from('payments').select('*').eq('status', 'paid').gte('paid_date', `${todayStr}T00:00:00`).lte('paid_date', `${todayStr}T23:59:59`),
        supabase.from('payments').select('*').eq('status', 'paid').gte('paid_date', `${monthStart}T00:00:00`).lte('paid_date', `${monthEnd}T23:59:59`),
        supabase.from('payments').select('*').in('status', ['pending', 'overdue']),
        supabase.from('invoices').select('*').gte('created_at', `${todayStr}T00:00:00`),
        supabase.from('students').select('id, is_active')
      ]);

      const todayPayments = todayPaymentsRes.data || [];
      const monthPayments = monthPaymentsRes.data || [];
      const pendingPayments = pendingPaymentsRes.data || [];
      const invoices = invoicesRes.data || [];
      const students = studentsRes.data || [];

      // Calcular totales
      const totalToday = todayPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const totalMonth = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const totalPending = pendingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const invoicesToday = invoices.length;
      const countOverdue = pendingPayments.filter(p => {
        if (!p.due_date) return false;
        const due = new Date(p.due_date + 'T00:00:00');
        const now = new Date().setHours(0,0,0,0);
        return now > due;
      }).length;

      this.state.stats = {
        totalToday,
        totalMonth,
        totalPending,
        invoicesToday,
        countToday: todayPayments.length,
        countMonth: monthPayments.length,
        countPending: pendingPayments.length,
        countOverdue,
        activeStudents: students.filter(s => s.is_active).length
      };

      await this._renderDashboard();
    } catch (error) {
      console.error('Error cargando dashboard de cobros:', error);
      if (container) {
        container.innerHTML = `
          <div class="p-12 text-center text-rose-600">
            <i data-lucide="alert-circle" class="w-16 h-16 mx-auto mb-4 opacity-75"></i>
            <p class="font-bold">Error al cargar el dashboard</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
      }
    } finally {
      this.state.loading = false;
    }
  },

  async _renderDashboard() {
    const container = document.getElementById('cobrosDashboardContainer');
    if (!container) return;

    const stats = this.state.stats;

    container.innerHTML = `
      <!-- KPIs Principales -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div class="metric-card metric-card--green">
          <div class="metric-icon">
            <i data-lucide="wallet" class="w-6 h-6"></i>
          </div>
          <div class="metric-label">Cobrado Hoy</div>
          <div class="metric-value">${CURRENCY} ${stats.totalToday.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="text-xs text-emerald-600 mt-2 font-bold">↑ ${stats.countToday} pagos</div>
        </div>

        <div class="metric-card metric-card--blue">
          <div class="metric-icon">
            <i data-lucide="calendar" class="w-6 h-6"></i>
          </div>
          <div class="metric-label">Este Mes</div>
          <div class="metric-value">${CURRENCY} ${stats.totalMonth.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="text-xs text-blue-600 mt-2 font-bold">85% de meta</div>
        </div>

        <div class="metric-card metric-card--orange">
          <div class="metric-icon">
            <i data-lucide="clock" class="w-6 h-6"></i>
          </div>
          <div class="metric-label">Pendiente</div>
          <div class="metric-value">${CURRENCY} ${stats.totalPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="text-xs text-orange-600 mt-2 font-bold">${stats.countPending} familias</div>
        </div>

        <div class="metric-card metric-card--slate">
          <div class="metric-icon">
            <i data-lucide="receipt" class="w-6 h-6"></i>
          </div>
          <div class="metric-label">Facturas Hoy</div>
          <div class="metric-value">${stats.invoicesToday}</div>
        </div>
      </div>

      <!-- KPIs Secundarios -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div class="metric-card metric-card--green">
          <div class="metric-icon">
            <i data-lucide="file-text" class="w-6 h-6"></i>
          </div>
          <div class="metric-label">e-CF Enviados</div>
          <div class="metric-value">${stats.invoicesToday}</div>
          <div class="text-xs text-emerald-600 mt-2 font-bold">DGII: ✅</div>
        </div>

        <div class="metric-card metric-card--amber">
          <div class="metric-icon">
            <i data-lucide="landmark" class="w-6 h-6"></i>
          </div>
          <div class="metric-label">Cheques Pendientes</div>
          <div class="metric-value">4</div>
          <div class="text-xs text-amber-700 mt-2 font-bold">${CURRENCY} 38,000.00</div>
        </div>

        <div class="metric-card metric-card--blue">
          <div class="metric-icon">
            <i data-lucide="arrow-right-left" class="w-6 h-6"></i>
          </div>
          <div class="metric-label">Transferencias Pend.</div>
          <div class="metric-value">2</div>
          <div class="text-xs text-blue-600 mt-2 font-bold">${CURRENCY} 15,000.00</div>
        </div>

        <div class="metric-card metric-card--slate">
          <div class="metric-icon">
            <i data-lucide="pie-chart" class="w-6 h-6"></i>
          </div>
          <div class="metric-label">Pagos Parciales</div>
          <div class="metric-value">18</div>
          <div class="text-xs text-slate-500 mt-2 font-bold">En proceso</div>
        </div>
      </div>

      <!-- Selector de Periodo -->
      <div class="flex items-center gap-2 mb-6">
        <span class="text-sm font-bold text-slate-500 uppercase tracking-wider">Periodo:</span>
        <button data-cobros-period="day" class="px-4 py-2 rounded-xl font-bold text-sm border border-slate-200 bg-[#0B63C7] text-white">Día</button>
        <button data-cobros-period="week" class="px-4 py-2 rounded-xl font-bold text-sm border border-slate-200 bg-white text-slate-600">Semana</button>
        <button data-cobros-period="month" class="px-4 py-2 rounded-xl font-bold text-sm border border-slate-200 bg-white text-slate-600">Mes</button>
        <button data-cobros-period="year" class="px-4 py-2 rounded-xl font-bold text-sm border border-slate-200 bg-white text-slate-600">Año</button>
      </div>

      <!-- Gráficos y Alertas -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div class="table-panel">
          <h3 class="text-lg font-black text-slate-800 mb-4">
            <i data-lucide="trending-up" class="w-5 h-5 inline mr-2 text-[#0B63C7]"></i>
            Cobrado por Periodo
          </h3>
          <canvas id="cobrosPeriodChart" style="height: 250px;"></canvas>
        </div>

        <div class="table-panel">
          <h3 class="text-lg font-black text-slate-800 mb-4">
            <i data-lucide="alert-triangle" class="w-5 h-5 inline mr-2 text-rose-500"></i>
            Alertas Importantes
          </h3>
          <div class="space-y-3">
            <div class="p-4 bg-rose-50 border border-rose-200 rounded-xl">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-rose-100 rounded-lg">
                  <i data-lucide="alert-circle" class="w-5 h-5 text-rose-600"></i>
                </div>
                <div>
                  <p class="font-bold text-rose-800">${stats.countOverdue} estudiantes con mora > 30 días</p>
                </div>
              </div>
            </div>

            <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-amber-100 rounded-lg">
                  <i data-lucide="clock" class="w-5 h-5 text-amber-700"></i>
                </div>
                <div>
                  <p class="font-bold text-amber-800">12 pagos vencen esta semana</p>
                </div>
              </div>
            </div>

            <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-emerald-100 rounded-lg">
                  <i data-lucide="check-circle" class="w-5 h-5 text-emerald-600"></i>
                </div>
                <div>
                  <p class="font-bold text-emerald-800">Meta del mes: 85% completada</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Métodos de Pago y Conceptos -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="table-panel">
          <h3 class="text-lg font-black text-slate-800 mb-4">
            <i data-lucide="credit-card" class="w-5 h-5 inline mr-2 text-[#0B63C7]"></i>
            Métodos de Pago (Este Mes)
          </h3>
          <canvas id="cobrosMethodsChart" style="height: 200px;"></canvas>
        </div>

        <div class="table-panel">
          <h3 class="text-lg font-black text-slate-800 mb-4">
            <i data-lucide="list" class="w-5 h-5 inline mr-2 text-[#FF7A00]"></i>
            Cobros por Concepto
          </h3>
          <canvas id="cobrosConceptsChart" style="height: 200px;"></canvas>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    this._bindEvents();
    this._renderCharts();
  },

  _renderCharts() {
    if (typeof window.Chart === 'undefined') return;

    // Gráfico de Cobrado por Periodo
    const periodCtx = document.getElementById('cobrosPeriodChart');
    if (periodCtx && window.Chart) {
      if (this.state.charts.period) this.state.charts.period.destroy();
      
      const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const data = [12000, 8500, 15000, 22000, 18000, 5000, 0];
      
      this.state.charts.period = new Chart(periodCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Cobrado',
            data,
            backgroundColor: '#28B54D',
            borderRadius: 8,
            barThickness: 40
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // Gráfico de Métodos de Pago
    const methodsCtx = document.getElementById('cobrosMethodsChart');
    if (methodsCtx && window.Chart) {
      if (this.state.charts.methods) this.state.charts.methods.destroy();
      
      this.state.charts.methods = new Chart(methodsCtx, {
        type: 'doughnut',
        data: {
          labels: ['Efectivo', 'Tarjeta', 'Transferencia', 'Cheque'],
          datasets: [{
            data: [40, 20, 35, 5],
            backgroundColor: ['#28B54D', '#0B63C7', '#FF7A00', '#64748B']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right' }
          }
        }
      });
    }

    // Gráfico de Conceptos
    const conceptsCtx = document.getElementById('cobrosConceptsChart');
    if (conceptsCtx && window.Chart) {
      if (this.state.charts.concepts) this.state.charts.concepts.destroy();
      
      this.state.charts.concepts = new Chart(conceptsCtx, {
        type: 'doughnut',
        data: {
          labels: ['Colegiaturas', 'Inscripción', 'Materiales', 'Transporte', 'Uniformes', 'Otros'],
          datasets: [{
            data: [75, 8, 5, 4, 3, 5],
            backgroundColor: ['#0B63C7', '#28B54D', '#FF7A00', '#FFD43B', '#64748B', '#8B5CF6']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right' }
          }
        }
      });
    }
  }
};
