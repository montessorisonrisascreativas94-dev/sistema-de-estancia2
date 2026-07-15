/**
 * Accounting Module - Directora
 * Contabilidad completa: Resumen ejecutivo, ingresos, gastos, nómina, flujo de caja, facturación, CxC, reportes
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const $el = id => document.getElementById(id);
const fmt = n => 'RD$' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

// Chart instances
let charts = {};

// Local state for gastos and nomina
let state = {
  gastos: [],
  nomina: []
};

export const AccountingModule = {
  async init() {
    await this.loadTab('resumen');
  },

  async loadTab(tab) {
    switch(tab) {
      case 'resumen':     await this.loadResumen(); break;
      case 'ingresos':    await this.loadIngresos(); break;
      case 'gastos':      await this.loadGastos(); break;
      case 'nomina':      await this.loadNomina(); break;
      case 'cashflow':    await this.loadCashflow(); break;
      case 'facturacion': await this.loadFacturacion(); break;
      case 'cxc':         await this.loadCXC(); break;
      case 'reportes':    /* just show UI */ break;
      case 'configuracion': /* just show UI */ break;
    }
  },

  async loadResumen() {
    await this.loadResumenKPIs();
    await this.loadResumenCharts();
  },

  async loadResumenKPIs() {
    const todayDate = today();
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    // Ingresos hoy
    const { data: paymentsToday } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'paid')
      .gte('paid_date', todayDate + 'T00:00:00')
      .lte('paid_date', todayDate + 'T23:59:59');

    const ingresosHoy = (paymentsToday || []).reduce((sum, p) => sum + Number(p.amount), 0);

    // Ingresos mes
    const { data: paymentsMonth } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'paid')
      .gte('paid_date', startOfMonth + 'T00:00:00');

    const ingresosMes = (paymentsMonth || []).reduce((sum, p) => sum + Number(p.amount), 0);

    // Pendiente cobrar y mora
    const { data: pendingCharges } = await supabase
      .from('student_charges')
      .select('amount, status, due_date');

    const pendienteCobrar = (pendingCharges || [])
      .filter(c => c.status === 'pending' || c.status === 'overdue')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const moraAcumulada = (pendingCharges || [])
      .filter(c => c.status === 'overdue')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    // Update UI
    if ($el('resIngresosHoy')) $el('resIngresosHoy').textContent = fmt(ingresosHoy);
    if ($el('resIngresosMes')) $el('resIngresosMes').textContent = fmt(ingresosMes);
    if ($el('resPendiente')) $el('resPendiente').textContent = fmt(pendienteCobrar);
    if ($el('resMora')) $el('resMora').textContent = fmt(moraAcumulada);
  },

  async loadResumenCharts() {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const ingresosMensuales = [120000,150000,130000,180000,160000,190000,210000,250000,230000,200000,220000,240000];
    const gastosMensuales = [80000,90000,85000,100000,95000,110000,120000,140000,130000,125000,135000,145000];
    const conceptos = ['Colegiaturas','Inscripciones','Uniformes','Libros','Actividades','Otros'];
    const montosConcepto = [60,15,10,5,7,3];
    const metodos = ['Efectivo','Tarjeta','Transferencia','Cheque'];
    const montosMetodo = [45,30,20,5];
    const estadoLabels = ['Pagados','Pendientes','Vencidos'];
    const estadoData = [75,20,5];

    this.renderChart('chartIngresosMensuales', 'bar', meses, [ingresosMensuales], ['Ingresos'], ['#0B63C7']);
    this.renderChart('chartIngresosGastos', 'bar', meses, [ingresosMensuales, gastosMensuales], ['Ingresos','Gastos'], ['#0B63C7','#EF4444']);
    this.renderChart('chartCobrosConcepto', 'doughnut', conceptos, [montosConcepto], [''], ['#0B63C7','#2563EB','#FF7A00','#FFD43B','#8B5CF6','#EC4899']);
    this.renderChart('chartMetodosPago', 'doughnut', metodos, [montosMetodo], [''], ['#0B63C7','#2563EB','#FF7A00','#64748B']);
    this.renderChart('chartMorosidad', 'doughnut', estadoLabels, [estadoData], [''], ['#0B63C7','#FFD43B','#EF4444']);
  },

  renderChart(canvasId, type, labels, datasets, datasetLabels, colors) {
    const canvas = $el(canvasId);
    if (!canvas || !window.Chart) return;

    // Destroy existing chart
    if (charts[canvasId]) charts[canvasId].destroy();

    const chartDatasets = datasets.map((data, i) => ({
      label: datasetLabels[i],
      data: data,
      backgroundColor: type === 'doughnut' ? colors : colors[i],
      borderRadius: type === 'bar' ? 8 : 0
    }));

    charts[canvasId] = new Chart(canvas, {
      type: type,
      data: { labels: labels, datasets: chartDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: type === 'doughnut' } },
        scales: type !== 'doughnut' ? { y: { beginAtZero: true } } : {}
      }
    });
  },

  async loadIngresos() {
    const { data: pays } = await supabase
      .from('payments')
      .select('id,amount,concept,method,paid_date,students:student_id(name)')
      .eq('status','paid')
      .order('paid_date', { ascending: false })
      .limit(100);

    const tbody = $el('ingresosTableBody');
    if (!tbody) return;

    if (!pays?.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400 text-sm">No hay ingresos registrados</td></tr>';
      return;
    }

    tbody.innerHTML = pays.map(p => `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 text-sm text-slate-700">${p.paid_date ? new Date(p.paid_date).toLocaleDateString('es-DO') : '—'}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(p.concept || '—')}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(p.students?.name || '—')}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(p.method || '—')}</td>
        <td class="px-4 py-3 text-right font-black text-slate-800">${fmt(p.amount)}</td>
      </tr>
    `).join('');
  },

  async loadGastos() {
    const tbody = $el('gastosTableBody');
    if (!tbody) return;

    if (!state.gastos?.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400 text-sm">No hay gastos registrados</td></tr>';
      return;
    }

    tbody.innerHTML = state.gastos.map((g, idx) => `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 text-sm text-slate-700">${g.fecha}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(g.concepto)}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(g.categoria)}</td>
        <td class="px-4 py-3 text-right font-black text-slate-800">${fmt(g.monto)}</td>
        <td class="px-4 py-3 text-center">
          <button onclick="AccountingModule.deleteGasto(${idx})" class="text-red-600 hover:text-red-800">
            <i data-lucide="trash" class="w-4 h-4 inline"></i>
          </button>
        </td>
      </tr>
    `).join('');
    if (window.lucide) lucide.createIcons();
  },

  openGastoModal() {
    const modalHtml = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="gastoModal">
        <div class="bg-white rounded-3xl overflow-hidden w-full max-w-md shadow-2xl animate-scaleIn">
          <div class="p-6 border-b border-slate-100" style="background: linear-gradient(135deg,#0B63C7,#0850A0)">
            <h3 class="text-lg font-black text-white">Nuevo Gasto</h3>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Fecha</label>
              <input type="date" id="gastoFecha" value="${today()}" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Concepto</label>
              <input type="text" id="gastoConcepto" placeholder="Ej: Material de oficina" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Categoría</label>
              <select id="gastoCategoria" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
                <option value="Servicios">Servicios</option>
                <option value="Materiales">Materiales</option>
                <option value="Nomina">Nómina</option>
                <option value="Mantenimiento">Mantenimiento</option>
                <option value="Otros">Otros</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Monto</label>
              <input type="number" id="gastoMonto" placeholder="0.00" step="0.01" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
          </div>
          <div class="p-6 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
            <button onclick="AccountingModule.closeGastoModal()" class="px-5 py-2.5 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-xl hover:bg-slate-100 transition-all">Cancelar</button>
            <button onclick="AccountingModule.saveGasto()" class="px-5 py-2.5 text-white font-black text-xs uppercase rounded-xl transition-all" style="background:#0B63C7">Guardar</button>
          </div>
        </div>
      </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);
    if (window.lucide) lucide.createIcons();
  },

  closeGastoModal() {
    $el('gastoModal')?.remove();
  },

  saveGasto() {
    const fecha = $el('gastoFecha').value;
    const concepto = $el('gastoConcepto').value;
    const categoria = $el('gastoCategoria').value;
    const monto = parseFloat($el('gastoMonto').value || '0');

    if (!concepto || !monto) {
      Helpers.toast('Completa todos los campos', 'warning');
      return;
    }

    state.gastos.unshift({ fecha, concepto, categoria, monto });
    this.closeGastoModal();
    this.loadGastos();
    Helpers.toast('Gasto guardado correctamente', 'success');
  },

  deleteGasto(idx) {
    if (!confirm('¿Eliminar este gasto?')) return;
    state.gastos.splice(idx,1);
    this.loadGastos();
    Helpers.toast('Gasto eliminado', 'success');
  },

  async loadNomina() {
    const tbody = $el('nominaTableBody');
    if (!tbody) return;

    if (!state.nomina?.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">No hay registros de nómina</td></tr>';
      return;
    }

    tbody.innerHTML = state.nomina.map((n, idx) => `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(n.empleado)}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(n.puesto)}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${n.periodo}</td>
        <td class="px-4 py-3 text-right font-black text-slate-800">${fmt(n.monto)}</td>
        <td class="px-4 py-3 text-center">
          <span class="px-2 py-1 rounded-full text-xs font-black ${n.estado === 'Pagado' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}">${n.estado}</span>
        </td>
        <td class="px-4 py-3 text-center">
          <button onclick="AccountingModule.deleteNomina(${idx})" class="text-red-600 hover:text-red-800">
            <i data-lucide="trash" class="w-4 h-4 inline"></i>
          </button>
        </td>
      </tr>
    `).join('');
    if (window.lucide) lucide.createIcons();
  },

  async openNominaModal() {
    // Load employees from profiles table (maestras, asistentes, encargadas)
    const { data: employees } = await supabase
      .from('profiles')
      .select('id, name, role')
      .in('role', ['maestra', 'asistente', 'encargada'])
      .order('name');

    const employeeOptions = (employees || []).map(e => 
      `<option value="${e.id}" data-role="${e.role}" data-name="${Helpers.escapeHTML(e.name)}">${Helpers.escapeHTML(e.name)} - ${e.role}</option>`
    ).join('');

    const modalHtml = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="nominaModal">
        <div class="bg-white rounded-3xl overflow-hidden w-full max-w-md shadow-2xl animate-scaleIn">
          <div class="p-6 border-b border-slate-100" style="background: linear-gradient(135deg,#0B63C7,#0850A0)">
            <h3 class="text-lg font-black text-white">Nuevo Pago de Nómina</h3>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Empleado</label>
              <select id="nominaEmpleadoSelect" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400" onchange="AccountingModule._updatePuestoField()">
                <option value="">Seleccionar empleado</option>
                ${employeeOptions}
              </select>
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Puesto</label>
              <input type="text" id="nominaPuesto" placeholder="Ej: Maestra de Preescolar" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Periodo</label>
              <input type="text" id="nominaPeriodo" placeholder="Ej: Quincena 1 - Enero 2026" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Monto</label>
              <input type="number" id="nominaMonto" placeholder="0.00" step="0.01" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">Estado</label>
              <select id="nominaEstado" class="w-full px-3 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-400">
                <option value="Pagado">Pagado</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </div>
          </div>
          <div class="p-6 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
            <button onclick="AccountingModule.closeNominaModal()" class="px-5 py-2.5 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-xl hover:bg-slate-100 transition-all">Cancelar</button>
            <button onclick="AccountingModule.saveNomina()" class="px-5 py-2.5 text-white font-black text-xs uppercase rounded-xl transition-all" style="background:#0B63C7">Guardar</button>
          </div>
        </div>
      </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);
    if (window.lucide) lucide.createIcons();
  },

  _updatePuestoField() {
    const select = $el('nominaEmpleadoSelect');
    const puestoInput = $el('nominaPuesto');
    if (!select || !puestoInput) return;
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.value) {
      puestoInput.value = selectedOption.dataset.role;
    } else {
      puestoInput.value = '';
    }
  },

  closeNominaModal() {
    $el('nominaModal')?.remove();
  },

  saveNomina() {
    const empleadoSelect = $el('nominaEmpleadoSelect');
    const selectedOption = empleadoSelect?.options[empleadoSelect.selectedIndex];
    const empleado = selectedOption?.dataset.name || '';
    const puesto = $el('nominaPuesto').value;
    const periodo = $el('nominaPeriodo').value;
    const monto = parseFloat($el('nominaMonto').value || '0');
    const estado = $el('nominaEstado').value;

    if (!empleado || !puesto || !periodo || !monto) {
      Helpers.toast('Completa todos los campos', 'warning');
      return;
    }

    state.nomina.unshift({ empleado, puesto, periodo, monto, estado });
    this.closeNominaModal();
    this.loadNomina();
    Helpers.toast('Pago de nómina guardado correctamente', 'success');
  },

  deleteNomina(idx) {
    if (!confirm('¿Eliminar este registro de nómina?')) return;
    state.nomina.splice(idx,1);
    this.loadNomina();
    Helpers.toast('Registro de nómina eliminado', 'success');
  },

  async loadCashflow(year = new Date().getFullYear()) {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const ingresosMensuales = [120000,150000,130000,180000,160000,190000,210000,250000,230000,200000,220000,240000];
    const gastosMensuales = [80000,90000,85000,100000,95000,110000,120000,140000,130000,125000,135000,145000];
    const totalIn = ingresosMensuales.reduce((s,v)=>s+v,0);
    const totalOut = gastosMensuales.reduce((s,v)=>s+v,0);
    const balance = totalIn - totalOut;

    if ($el('cfEntradas')) $el('cfEntradas').textContent = fmt(totalIn);
    if ($el('cfSalidas')) $el('cfSalidas').textContent = fmt(totalOut);
    if ($el('cfBalance')) $el('cfBalance').textContent = fmt(balance);

    this.renderChart('chartCashflow', 'bar', meses, [ingresosMensuales, gastosMensuales], ['Ingresos','Gastos'], ['#0B63C7','#EF4444']);
  },

  async loadFacturacion() {
    const { count: factEmitidas } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'issued');
    const { count: factPagadas } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'paid');
    const { count: factAnuladas } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'cancelled');

    if ($el('factEmitidas')) $el('factEmitidas').textContent = factEmitidas || 0;
    if ($el('factPagadas')) $el('factPagadas').textContent = factPagadas || 0;
    if ($el('factAnuladas')) $el('factAnuladas').textContent = factAnuladas || 0;
    if ($el('factPendientes')) $el('factPendientes').textContent = (factEmitidas || 0) - (factPagadas || 0);
  },

  async loadCXC() {
    const { data: charges } = await supabase
      .from('student_charges')
      .select('id, amount, status, student_enrollments:student_enrollment_id(students:student_id(name))');

    const total = (charges || []).reduce((sum,c)=>sum+Number(c.amount),0);
    const vencido = (charges || []).filter(c=>c.status==='overdue').reduce((sum,c)=>sum+Number(c.amount),0);
    const corriente = (charges || []).filter(c=>c.status==='pending').reduce((sum,c)=>sum+Number(c.amount),0);

    if ($el('cxcTotal')) $el('cxcTotal').textContent = fmt(total);
    if ($el('cxcVencido')) $el('cxcVencido').textContent = fmt(vencido);
    if ($el('cxcCorriente')) $el('cxcCorriente').textContent = fmt(corriente);

    // Ranking de morosidad
    const deudores = {};
    (charges || []).forEach(c => {
      const name = c.student_enrollments?.students?.name || 'Desconocido';
      if (!deudores[name]) deudores[name] = 0;
      if (c.status !== 'paid' && c.status !== 'cancelled') {
        deudores[name] += Number(c.amount);
      }
    });

    const ranking = Object.entries(deudores).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const rankingEl = $el('cxcRanking');
    if (rankingEl) {
      rankingEl.innerHTML = ranking.map(([name, amount]) => `
        <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
          <span class="font-black text-slate-700">${Helpers.escapeHTML(name)}</span>
          <span class="font-black text-amber-600">${fmt(amount)}</span>
        </div>
      `).join('') || '<div class="text-center py-8 text-slate-400 text-sm">No hay deudores</div>';
    }
  },

  // PDF Export functions
  exportIngresosPDF() { Helpers.toast('Exportación de ingresos a PDF en desarrollo', 'info'); },
  exportGastosPDF() { Helpers.toast('Exportación de gastos a PDF en desarrollo', 'info'); },
  exportNominaPDF() { Helpers.toast('Exportación de nómina a PDF en desarrollo', 'info'); },
  exportReporteDiarioPDF() { Helpers.toast('Exportación de reporte diario a PDF en desarrollo', 'info'); },
  exportReporteMensualPDF() { Helpers.toast('Exportación de reporte mensual a PDF en desarrollo', 'info'); },
  exportReporteMorosidadPDF() { Helpers.toast('Exportación de reporte de morosidad a PDF en desarrollo', 'info'); },
};

// Expose to window
window.AccountingModule = AccountingModule;
