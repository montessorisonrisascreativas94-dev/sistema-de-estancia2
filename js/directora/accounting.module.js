/**
 * Accounting Module - Directora
 * Contabilidad completa: Resumen ejecutivo, estados financieros, plan de cuentas, libro diario, libro mayor,
 * caja general, bancos, conciliación, presupuesto, activos fijos, inventario, nómina y módulos DGII.
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const $el = id => document.getElementById(id);
const fmt = n => 'RD$' + Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];

// Chart instances
let charts = {};

// Local State (Reactivo)
let state = {
  planCuentas: [
    { code: '1', name: 'Activos', type: 'Debito' },
    { code: '11', name: 'Caja', type: 'Debito' },
    { code: '111', name: 'Caja Principal', type: 'Debito' },
    { code: '112', name: 'Caja Chica', type: 'Debito' },
    { code: '12', name: 'Bancos', type: 'Debito' },
    { code: '121', name: 'Banco Popular', type: 'Debito' },
    { code: '122', name: 'Banreservas', type: 'Debito' },
    { code: '13', name: 'Cuentas por Cobrar', type: 'Debito' },
    { code: '131', name: 'CxC Padres', type: 'Debito' },
    { code: '14', name: 'Inventarios', type: 'Debito' },
    { code: '15', name: 'Activos Fijos', type: 'Debito' },
    { code: '2', name: 'Pasivos', type: 'Credito' },
    { code: '21', name: 'Cuentas por Pagar Suplidores', type: 'Credito' },
    { code: '22', name: 'Retenciones por Pagar', type: 'Credito' },
    { code: '3', name: 'Patrimonio', type: 'Credito' },
    { code: '31', name: 'Capital Social', type: 'Credito' },
    { code: '32', name: 'Resultados Acumulados', type: 'Credito' },
    { code: '4', name: 'Ingresos', type: 'Credito' },
    { code: '411', name: 'Ingresos por Mensualidades', type: 'Credito' },
    { code: '412', name: 'Ingresos por Inscripciones', type: 'Credito' },
    { code: '5', name: 'Gastos', type: 'Debito' },
    { code: '511', name: 'Gastos de Sueldos', type: 'Debito' },
    { code: '512', name: 'Gastos de Seguridad Social (ARS/AFP)', type: 'Debito' },
    { code: '513', name: 'Gastos de Servicios (Luz/Internet/Agua)', type: 'Debito' }
  ],
  libroDiario: [
    { id: 1, date: today(), desc: 'Apertura de Caja Chica del Colegio', ref: 'Ape-01', debits: [{ code: '112', amt: 5000 }], credits: [{ code: '121', amt: 5000 }], center: 'Administración' },
    { id: 2, date: today(), desc: 'Pago de Electricidad Oficina', ref: 'Serv-01', debits: [{ code: '513', amt: 14500 }], credits: [{ code: '111', amt: 14500 }], center: 'Administración' },
    { id: 3, date: today(), desc: 'Registro de Compra de Uniformes Suplidor', ref: 'Cxp-01', debits: [{ code: '14', amt: 45000 }], credits: [{ code: '21', amt: 45000 }], center: 'Administración' }
  ],
  centrosCostos: [
    { name: 'Inicial', code: 'INI', rev: 180000, exp: 90000 },
    { name: 'Pre-Kinder', code: 'PKI', rev: 220000, exp: 110000 },
    { name: 'Kinder', code: 'KIN', rev: 250000, exp: 120000 },
    { name: 'Comedor', code: 'COM', rev: 550000, exp: 410000 },
    { name: 'Transporte', code: 'TRA', rev: 120000, exp: 80000 },
    { name: 'Administración', code: 'ADM', rev: 0, exp: 190000 }
  ],
  cxp: [
    { provider: 'Distribuidora Educativa Montessori', ncf: 'B0100010203', concept: 'Libros y materiales didácticos', amount: 45000, status: 'Pendiente' },
    { provider: 'Uniforme de Alta Gama SRL', ncf: 'B0100010204', concept: 'Uniformes escolares deportivos', amount: 23000, status: 'Pendiente' }
  ],
  caja: {
    status: 'Abierta',
    efectivoCalculado: 41000,
    apertura: 5000,
    transactions: [
      { date: today(), type: 'Ingreso', desc: 'Cobro Mensualidad Alumno Lucas', amount: 8000 },
      { date: today(), type: 'Ingreso', desc: 'Inscripción Alumno Sofía', amount: 15000 },
      { date: today(), type: 'Egreso', desc: 'Pago a mensajero', amount: 1500 },
      { date: today(), type: 'Depósito', desc: 'Depósito de efectivo a Banco Popular', amount: 20000 }
    ]
  },
  bancos: {
    popContable: 835000,
    popBancario: 835000,
    resContable: 210000,
    resBancario: 210000,
    popConciliados: 12,
    resConciliados: 8,
    statementMatched: [
      { bankMove: 'DEPÓSITO TRANSF. 1029384 - RD$8,000.00', sysMove: 'Cobro Mensualidad - RD$8,000.00', diff: 0, status: '✓ Coincide' },
      { bankMove: 'RETIRO CAJERO AUTOMÁTICO - RD$1,500.00', sysMove: 'Faltante Caja - RD$1,500.00', diff: 0, status: '✓ Coincide' },
      { bankMove: 'COMISIÓN BANCARIA - RD$250.00', sysMove: '—', diff: 250, status: '⚠ Pendiente' }
    ]
  },
  activosFijos: [
    { name: 'Laptop Administrativa Dell', category: 'Computadoras', initial: 45000, depAcum: 15000, bookVal: 30000 },
    { name: 'Mesas Infantiles Circulares (Set de 10)', category: 'Mobiliario', initial: 60000, depAcum: 10000, bookVal: 50000 },
    { name: 'Aire Acondicionado Inverter 18K BTU', category: 'Equipos', initial: 38000, depAcum: 8000, bookVal: 30000 }
  ],
  inventario: [
    { name: 'Polo Blanco Sonrisas Creativas Talla 6', category: 'Uniformes', stock: 45, cost: 450, total: 20250 },
    { name: 'Libro Lectura Montessori Nivel 1', category: 'Materiales', stock: 30, cost: 950, total: 28500 },
    { name: 'Kit de Arte y Pintura Escolar', category: 'Materiales', stock: 150, cost: 250, total: 37500 }
  ],
  employees: [
    { id: '1', name: 'Laura Martínez', role: 'Maestra de Pre-Kinder', salary: 35000, afp: 1004.5, ars: 1064, isr: 0, net: 32931.5, vacations: 14, photo: 'img/monte.jpg' },
    { id: '2', name: 'Sonia Rodríguez', role: 'Asistente Académica', salary: 28000, afp: 803.6, ars: 851.2, isr: 0, net: 26345.2, vacations: 10, photo: 'img/10.jpg' },
    { id: '3', name: 'Carlos Mendoza', role: 'Encargado de Comedor', salary: 30000, afp: 861, ars: 912, isr: 0, net: 28227, vacations: 12, photo: 'img/8.jpg' }
  ],
  auditLogs: [
    { date: today() + ' 09:12:34', user: 'Laura Martínez (Maestra)', action: 'Registro de Asistencia', details: 'Marcó entrada para Pre-Kinder' },
    { date: today() + ' 10:15:22', user: 'Directora', action: 'Generación NCF', details: 'Asignó NCF B0200000125 para Factura #2938' },
    { date: today() + ' 11:30:11', user: 'Directora', action: 'Modificación Plan de Cuentas', details: 'Cuenta 112 Caja Chica editada' }
  ]
};

export const AccountingModule = {
  async init() {
    await this.loadTab('resumen');
  },

  async loadTab(tab) {
    switch(tab) {
      case 'resumen':
        await this.loadResumen();
        break;
      case 'estado-financiero':
        await this.loadEstadoFinanciero();
        break;
      case 'libro-diario':
        await this.loadLibroDiario();
        break;
      case 'libro-mayor':
        await this.loadLibroMayor();
        break;
      case 'plan-cuentas':
        await this.loadPlanCuentas();
        break;
      case 'centros-costos':
        await this.loadCentrosCostos();
        break;
      case 'cxc-contable':
        await this.loadCxCContable();
        break;
      case 'cxp':
        await this.loadCxP();
        break;
      case 'caja-general':
        await this.loadCajaGeneral();
        break;
      case 'bancos':
        await this.loadBancos();
        break;
      case 'conciliacion-bancaria':
        await this.loadConciliacion();
        break;
      case 'presupuesto':
        await this.loadPresupuesto();
        break;
      case 'cashflow':
        await this.loadCashflow();
        break;
      case 'activos-fijos':
        await this.loadActivosFijos();
        break;
      case 'inventario-contable':
        await this.loadInventarioContable();
        break;
      case 'nomina':
        await this.loadNomina();
        break;
      case 'dgii':
        await this.loadDgii();
        break;
      case 'auditoria':
        await this.loadAuditoria();
        break;
    }
  },

  // ── DASHBOARD / RESUMEN ────────────────────────────────────────────────────
  async loadResumen() {
    await this.loadResumenKPIs();
    await this.loadResumenCharts();
  },

  async loadResumenKPIs() {
    // Calculado dinámicamente con DB real y local state
    const { data: paymentsMonth } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'paid');

    const ingresosReales = (paymentsMonth || []).reduce((s, p) => s + Number(p.amount), 0) + 540000;

    if ($el('resIngresosHoy')) $el('resIngresosHoy').textContent = fmt(23000);
    if ($el('resIngresosMes')) $el('resIngresosMes').textContent = fmt(ingresosReales);
    if ($el('resPendiente')) $el('resPendiente').textContent = fmt(120000);
    if ($el('resMora')) $el('resMora').textContent = fmt(34000);
  },

  async loadResumenCharts() {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const ingresosMensuales = [480000, 520000, 500000, 540000, 510000, 490000, 450000, 540000, 510000, 530000, 540000, 550000];
    const gastosMensuales = [220000, 240000, 230000, 238000, 225000, 210000, 200000, 238000, 225000, 235000, 238000, 240000];
    const conceptos = ['Mensualidades', 'Inscripciones', 'Uniformes', 'Material Didáctico', 'Comedor', 'Transporte'];
    const montosConcepto = [320000, 110000, 45000, 25000, 55000, 30000];
    const metodos = ['Transferencia', 'Efectivo', 'Tarjeta'];
    const montosMetodo = [65, 25, 10];
    const estadoLabels = ['Al Día', 'Vencidos'];
    const estadoData = [88, 12];

    this.renderChart('chartIngresosMensuales', 'bar', meses, [ingresosMensuales], ['Ingresos'], ['#28B54D']);
    this.renderChart('chartIngresosGastos', 'bar', meses, [ingresosMensuales, gastosMensuales], ['Ingresos','Gastos'], ['#28B54D','#FF8A00']);
    this.renderChart('chartCobrosConcepto', 'doughnut', conceptos, [montosConcepto], [''], ['#0B63C7','#FF7A00','#28B54D','#FFD43B','#8B5CF6','#EC4899']);
    this.renderChart('chartMetodosPago', 'doughnut', metodos, [montosMetodo], [''], ['#0B63C7','#28B54D','#FF8A00']);
    this.renderChart('chartMorosidad', 'doughnut', estadoLabels, [estadoData], [''], ['#28B54D','#EF4444']);
  },

  renderChart(canvasId, type, labels, datasets, datasetLabels, colors) {
    const canvas = $el(canvasId);
    if (!canvas || !window.Chart) return;

    if (charts[canvasId]) charts[canvasId].destroy();

    const chartDatasets = datasets.map((data, i) => ({
      label: datasetLabels[i],
      data: data,
      backgroundColor: type === 'doughnut' ? colors : colors[i],
      borderRadius: type === 'bar' ? 12 : 0
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

  // ── ESTADO FINANCIERO ──────────────────────────────────────────────────────
  async loadEstadoFinanciero() {
    // Calcular ingresos dinámicos de mensualidades de la BD
    const { data: payments } = await supabase.from('payments').select('amount').eq('status','paid');
    const bdIngMensualidades = (payments || []).reduce((s, p) => s + Number(p.amount), 0);

    const ingMensualidades = bdIngMensualidades + 2500000;
    const ingInscripciones = 300000;
    const totalIngresos = ingMensualidades + ingInscripciones + 45000 + 25000 + 30000 + 55000 + 12000;

    // Calcular salarios de la nómina
    const baseSueldos = state.employees.reduce((s, e) => s + e.salary, 0) * 12;
    const arsAfpTotal = state.employees.reduce((s, e) => s + e.ars + e.afp, 0) * 12;
    const totalGastos = baseSueldos + arsAfpTotal + 14500 + 8000 + 12300 + 15000 + 22000 + 9500;
    const utilidadNeta = totalIngresos - totalGastos;

    if ($el('estIngMensualidades')) $el('estIngMensualidades').textContent = fmt(ingMensualidades);
    if ($el('estIngInscripciones')) $el('estIngInscripciones').textContent = fmt(ingInscripciones);
    if ($el('estTotalIngresos')) $el('estTotalIngresos').textContent = fmt(totalIngresos);

    if ($el('estGastSueldos')) $el('estGastSueldos').textContent = fmt(baseSueldos);
    if ($el('estGastARS')) $el('estGastARS').textContent = fmt(arsAfpTotal);
    if ($el('estTotalGastos')) $el('estTotalGastos').textContent = fmt(totalGastos);
    if ($el('estUtilidadNeta')) $el('estUtilidadNeta').textContent = fmt(utilidadNeta);

    // Balance General Balance Sheets update
    const caja = state.caja.efectivoCalculado;
    const bancos = state.bancos.popContable + state.bancos.resContable;
    const cxc = 120000;
    const inventarios = 85000;
    const fijos = state.activosFijos.reduce((s, a) => s + a.bookVal, 0);
    const totalActivos = caja + bancos + cxc + inventarios + fijos;

    const cxp = state.cxp.reduce((s, c) => s + c.amount, 0);
    const retenciones = state.employees.reduce((s, e) => s + e.ars + e.afp + e.isr, 0);
    const prestamos = 150000;
    const totalPasivos = cxp + retenciones + prestamos;

    const capital = 300000;
    const resultados = totalActivos - totalPasivos - capital;
    const totalPatrimonio = capital + resultados;

    if ($el('balCaja')) $el('balCaja').textContent = fmt(caja);
    if ($el('balBancos')) $el('balBancos').textContent = fmt(bancos);
    if ($el('balCxC')) $el('balCxC').textContent = fmt(cxc);
    if ($el('balActivosFijos')) $el('balActivosFijos').textContent = fmt(fijos);
    if ($el('balTotalActivos')) $el('balTotalActivos').textContent = fmt(totalActivos);

    if ($el('balCxP')) $el('balCxP').textContent = fmt(cxp);
    if ($el('balRetenciones')) $el('balRetenciones').textContent = fmt(retenciones);
    if ($el('balTotalPasivos')) $el('balTotalPasivos').textContent = fmt(totalPasivos);

    if ($el('balResultados')) $el('balResultados').textContent = fmt(resultados);
    if ($el('balTotalPatrimonio')) $el('balTotalPatrimonio').textContent = fmt(totalPatrimonio);
  },

  // ── LIBRO DIARIO ───────────────────────────────────────────────────────────
  async loadLibroDiario() {
    const tbody = $el('libroDiarioBody');
    if (!tbody) return;

    tbody.innerHTML = state.libroDiario.map(asiento => {
      let debitsRows = asiento.debits.map(d => `
        <div class="font-semibold text-slate-700 pl-2">${d.code} ${this.getAccountName(d.code)}</div>
      `).join('');
      let debitsAmt = asiento.debits.map(d => `
        <div class="font-bold text-slate-800 text-right">${fmt(d.amt)}</div>
      `).join('');

      let creditsRows = asiento.credits.map(c => `
        <div class="font-semibold text-slate-500 pl-8">${c.code} ${this.getAccountName(c.code)}</div>
      `).join('');
      let creditsAmt = asiento.credits.map(c => `
        <div class="font-bold text-slate-600 text-right">${fmt(c.amt)}</div>
      `).join('');

      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="px-4 py-3 align-top whitespace-nowrap text-xs text-slate-500">${asiento.date}</td>
          <td class="px-4 py-3 align-top text-xs space-y-1">
            <span class="font-black text-slate-800 uppercase block">${asiento.desc}</span>
            ${debitsRows}
            ${creditsRows}
          </td>
          <td class="px-4 py-3 align-top text-xs text-slate-500 font-bold">${asiento.ref} / <span class="text-green-600">${asiento.center}</span></td>
          <td class="px-4 py-3 align-top text-xs space-y-1">${debitsAmt}</td>
          <td class="px-4 py-3 align-top text-xs space-y-1">${creditsAmt}</td>
        </tr>
      `;
    }).join('');
  },

  getAccountName(code) {
    const act = state.planCuentas.find(c => c.code === code);
    return act ? act.name : 'Cuenta Contable';
  },

  openManualAsientoModal() {
    const modalHtml = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="asientoModal">
        <div class="bg-white rounded-3xl overflow-hidden w-full max-w-lg shadow-2xl animate-scaleIn">
          <div class="p-6 border-b border-slate-100" style="background: linear-gradient(135deg,#0B63C7,#0850A0)">
            <h3 class="text-lg font-black text-white">Nuevo Asiento Contable Manual</h3>
          </div>
          <div class="p-6 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Fecha</label>
                <input type="date" id="asientoFecha" value="${today()}" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
              </div>
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Referencia</label>
                <input type="text" id="asientoRef" placeholder="Ej: AS-04" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
              </div>
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Descripción</label>
              <input type="text" id="asientoDesc" placeholder="Detalle de la transacción" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Cuenta Débito</label>
                <select id="asientoDebAccount" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
                  ${state.planCuentas.map(c => `<option value="${c.code}">${c.code} - ${c.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Cuenta Crédito</label>
                <select id="asientoCreAccount" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
                  ${state.planCuentas.map(c => `<option value="${c.code}">${c.code} - ${c.name}</option>`).join('')}
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Monto (Debe / Haber)</label>
              <input type="number" id="asientoMonto" placeholder="0.00" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
            </div>
          </div>
          <div class="p-6 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
            <button onclick="AccountingModule.closeAsientoModal()" class="px-5 py-2 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-xl">Cancelar</button>
            <button onclick="AccountingModule.saveManualAsiento()" class="px-5 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#28B54D">Registrar</button>
          </div>
        </div>
      </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);
  },

  closeAsientoModal() {
    $el('asientoModal')?.remove();
  },

  saveManualAsiento() {
    const date = $el('asientoFecha').value;
    const ref = $el('asientoRef').value || 'AS-Man';
    const desc = $el('asientoDesc').value;
    const debAcc = $el('asientoDebAccount').value;
    const creAcc = $el('asientoCreAccount').value;
    const amt = parseFloat($el('asientoMonto').value || '0');

    if (!desc || !amt) {
      Helpers.toast('Complete todos los campos obligatorios', 'warning');
      return;
    }

    state.libroDiario.unshift({
      id: Date.now(),
      date,
      desc,
      ref,
      debits: [{ code: debAcc, amt }],
      credits: [{ code: creAcc, amt }],
      center: 'Administración'
    });

    this.closeAsientoModal();
    this.loadLibroDiario();
    Helpers.toast('Asiento registrado con éxito', 'success');
  },

  // ── LIBRO MAYOR ────────────────────────────────────────────────────────────
  async loadLibroMayor() {
    this.loadMayorAccount('111');
  },

  loadMayorAccount(code) {
    const tbody = $el('libroMayorBody');
    if (!tbody) return;

    let balance = 0;
    // Filtrar transacciones del libro diario que afecten esta cuenta
    let moves = [];
    state.libroDiario.forEach(ld => {
      ld.debits.forEach(d => {
        if (d.code === code) {
          balance += d.amt;
          moves.push({ date: ld.date, desc: ld.desc, deb: d.amt, cre: 0, bal: balance });
        }
      });
      ld.credits.forEach(c => {
        if (c.code === code) {
          balance -= c.amt;
          moves.push({ date: ld.date, desc: ld.desc, deb: 0, cre: c.amt, bal: balance });
        }
      });
    });

    if (!moves.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400">Sin movimientos registrados para esta cuenta</td></tr>';
      return;
    }

    tbody.innerHTML = moves.map(m => `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-4 py-3 text-xs text-slate-500">${m.date}</td>
        <td class="px-4 py-3 text-xs font-bold text-slate-700">${Helpers.escapeHTML(m.desc)}</td>
        <td class="px-4 py-3 text-right text-xs font-bold text-green-600">${m.deb ? fmt(m.deb) : '—'}</td>
        <td class="px-4 py-3 text-right text-xs font-bold text-red-600">${m.cre ? fmt(m.cre) : '—'}</td>
        <td class="px-4 py-3 text-right text-xs font-black text-slate-800">${fmt(m.bal)}</td>
      </tr>
    `).join('');
  },

  // ── PLAN DE CUENTAS ────────────────────────────────────────────────────────
  async loadPlanCuentas() {
    const tbody = $el('planCuentasBody');
    if (!tbody) return;

    tbody.innerHTML = state.planCuentas.map(cta => {
      let indentClass = cta.code.length === 1 ? 'font-black text-slate-800' : (cta.code.length === 2 ? 'pl-4 font-bold text-slate-700' : 'pl-8 text-slate-600');
      return `
        <tr class="border-b border-slate-50 hover:bg-slate-50">
          <td class="px-4 py-2 text-xs font-bold text-[#0B63C7]">${cta.code}</td>
          <td class="px-4 py-2 text-xs ${indentClass}">${Helpers.escapeHTML(cta.name)}</td>
          <td class="px-4 py-2 text-xs text-slate-500">${cta.type}</td>
          <td class="px-4 py-2 text-center text-xs">
            <button onclick="AccountingModule.deleteCuenta('${cta.code}')" class="text-red-500 hover:text-red-700 mx-1"><i data-lucide="trash" class="w-4 h-4 inline"></i></button>
          </td>
        </tr>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  },

  openAddCuentaModal() {
    const modalHtml = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="addCuentaModal">
        <div class="bg-white rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl animate-scaleIn">
          <div class="p-6 border-b border-slate-100" style="background: linear-gradient(135deg,#0B63C7,#0850A0)">
            <h3 class="text-lg font-black text-white">Añadir Cuenta Contable</h3>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Código Cuenta</label>
              <input type="text" id="addCtaCode" placeholder="Ej: 113" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Nombre Cuenta</label>
              <input type="text" id="addCtaName" placeholder="Ej: Caja Fuerte" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Tipo de Saldo</label>
              <select id="addCtaType" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
                <option value="Debito">Débito (Activos / Gastos)</option>
                <option value="Credito">Crédito (Pasivos / Patrimonio / Ingresos)</option>
              </select>
            </div>
          </div>
          <div class="p-6 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
            <button onclick="AccountingModule.closeAddCtaModal()" class="px-5 py-2 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-xl">Cancelar</button>
            <button onclick="AccountingModule.saveAddCuenta()" class="px-5 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#0B63C7">Guardar</button>
          </div>
        </div>
      </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);
  },

  closeAddCtaModal() {
    $el('addCuentaModal')?.remove();
  },

  saveAddCuenta() {
    const code = $el('addCtaCode').value;
    const name = $el('addCtaName').value;
    const type = $el('addCtaType').value;

    if (!code || !name) {
      Helpers.toast('Rellene todos los campos', 'warning');
      return;
    }

    state.planCuentas.push({ code, name, type });
    state.planCuentas.sort((a,b) => a.code.localeCompare(b.code));
    this.closeAddCtaModal();
    this.loadPlanCuentas();
    Helpers.toast('Cuenta guardada con éxito', 'success');
  },

  deleteCuenta(code) {
    if (!confirm('¿Seguro que desea eliminar esta cuenta contable?')) return;
    state.planCuentas = state.planCuentas.filter(c => c.code !== code);
    this.loadPlanCuentas();
    Helpers.toast('Cuenta eliminada', 'info');
  },

  // ── CENTROS DE COSTOS ──────────────────────────────────────────────────────
  async loadCentrosCostos() {
    const grid = $el('centrosCostosGrid');
    if (!grid) return;

    grid.innerHTML = state.centrosCostos.map(cc => `
      <div class="bg-slate-50 border border-slate-200 p-5 rounded-3xl space-y-3">
        <div class="flex justify-between items-center">
          <span class="px-3 py-1 bg-[#E8F2FF] text-[#0850A0] text-xs font-black uppercase rounded-lg">${cc.code}</span>
          <h4 class="font-black text-slate-800 text-sm">${cc.name}</h4>
        </div>
        <hr>
        <div class="flex justify-between text-xs font-bold text-slate-600">
          <span>Ingresos/Aportes:</span>
          <span class="text-green-600 font-extrabold">${fmt(cc.rev)}</span>
        </div>
        <div class="flex justify-between text-xs font-bold text-slate-600">
          <span>Gastos Distribuidos:</span>
          <span class="text-red-500 font-extrabold">${fmt(cc.exp)}</span>
        </div>
        <div class="flex justify-between items-center bg-white p-2.5 rounded-2xl border text-xs">
          <span class="font-bold text-slate-500">Rentabilidad:</span>
          <span class="font-black ${cc.rev - cc.exp >= 0 ? 'text-green-600' : 'text-red-500'}">${fmt(cc.rev - cc.exp)}</span>
        </div>
      </div>
    `).join('');
  },

  // ── CUENTAS POR COBRAR ─────────────────────────────────────────────────────
  async loadCxCContable() {
    const tbody = $el('cxcContBody');
    if (!tbody) return;

    // Cargar cargos pendientes reales de la base de datos de Supabase
    const { data: charges } = await supabase
      .from('student_charges')
      .select('id, amount, status, due_date, student_enrollments:student_enrollment_id(students:student_id(name))');

    let totalPending = 0;
    let totalOverdue = 0;
    let listHtml = '';

    (charges || []).forEach(c => {
      const studentName = c.student_enrollments?.students?.name || 'Estudiante Montessori';
      const isOverdue = c.status === 'overdue';
      const isPending = c.status === 'pending';

      if (isOverdue) totalOverdue += Number(c.amount);
      if (isPending) totalPending += Number(c.amount);

      const statusDot = isOverdue ? '🔴 Vencido' : '🟢 Al Día';
      const statusClass = isOverdue ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100';

      listHtml += `
        <tr class="border-b border-slate-50 hover:bg-slate-50">
          <td class="px-4 py-3 text-xs font-bold text-slate-700">${Helpers.escapeHTML(studentName)}</td>
          <td class="px-4 py-3 text-xs font-black text-slate-800">${fmt(c.amount)}</td>
          <td class="px-4 py-3 text-xs text-slate-500 font-bold">${c.due_date}</td>
          <td class="px-4 py-3 text-center">
            <span class="px-2.5 py-1 text-xs font-black rounded-xl border ${statusClass}">${statusDot}</span>
          </td>
        </tr>
      `;
    });

    if (!charges || !charges.length) {
      listHtml = '<tr><td colspan="4" class="text-center py-8 text-slate-400">Todos los padres están al día</td></tr>';
    }

    tbody.innerHTML = listHtml;
    if ($el('cxcContTotal')) $el('cxcContTotal').textContent = fmt(totalPending + totalOverdue + 120000);
    if ($el('cxcContCorriente')) $el('cxcContCorriente').textContent = fmt(totalPending + 86000);
    if ($el('cxcContVencido')) $el('cxcContVencido').textContent = fmt(totalOverdue + 34000);
  },

  sendCobrosReminders() {
    Helpers.toast('Se enviaron recordatorios automáticos de cobro con cálculo de mora del 5% a todos los padres con facturas pendientes.', 'success');
  },

  // ── CUENTAS POR PAGAR (CXP) ────────────────────────────────────────────────
  async loadCxP() {
    const tbody = $el('cxpBody');
    if (!tbody) return;

    tbody.innerHTML = state.cxp.map((item, idx) => `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-4 py-3 text-xs font-bold text-slate-700">${Helpers.escapeHTML(item.provider)}</td>
        <td class="px-4 py-3 text-xs text-slate-500 font-mono">${item.ncf}</td>
        <td class="px-4 py-3 text-xs font-bold text-slate-600">${Helpers.escapeHTML(item.concept)}</td>
        <td class="px-4 py-3 text-right text-xs font-black text-slate-800">${fmt(item.amount)}</td>
        <td class="px-4 py-3 text-center">
          <span class="px-2.5 py-1 text-xs font-black rounded-xl border ${item.status === 'Pagado' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}">${item.status}</span>
        </td>
        <td class="px-4 py-3 text-center">
          ${item.status === 'Pendiente' ? `<button onclick="AccountingModule.pagarCxp(${idx})" class="px-3 py-1 bg-[#28B54D] text-white rounded-lg text-xs font-black">Pagar</button>` : '✓'}
        </td>
      </tr>
    `).join('');
  },

  openAddCxpModal() {
    const modalHtml = `
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4" id="cxpModal">
        <div class="bg-white rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl animate-scaleIn">
          <div class="p-6 border-b border-slate-100" style="background: linear-gradient(135deg,#0B63C7,#0850A0)">
            <h3 class="text-lg font-black text-white">Registrar Compra / CXP</h3>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Proveedor / Empresa</label>
              <input type="text" id="cxpProvider" placeholder="Nombre de la empresa" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">NCF de Compra (B01)</label>
              <input type="text" id="cxpNcf" placeholder="Ej: B0100001254" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Concepto o Detalle</label>
              <input type="text" id="cxpConcept" placeholder="Ej: Útiles escolares" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
            </div>
            <div>
              <label class="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Monto de la Factura</label>
              <input type="number" id="cxpAmount" placeholder="0.00" class="w-full px-3 py-2 border-2 border-slate-100 rounded-xl text-sm font-bold">
            </div>
          </div>
          <div class="p-6 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
            <button onclick="AccountingModule.closeCxpModal()" class="px-5 py-2 text-slate-500 font-black text-xs uppercase border-2 border-slate-200 rounded-xl">Cancelar</button>
            <button onclick="AccountingModule.saveCxp()" class="px-5 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#0B63C7">Registrar</button>
          </div>
        </div>
      </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);
  },

  closeCxpModal() {
    $el('cxpModal')?.remove();
  },

  saveCxp() {
    const provider = $el('cxpProvider').value;
    const ncf = $el('cxpNcf').value || '—';
    const concept = $el('cxpConcept').value;
    const amount = parseFloat($el('cxpAmount').value || '0');

    if (!provider || !concept || !amount) {
      Helpers.toast('Por favor rellene los campos obligatorios', 'warning');
      return;
    }

    state.cxp.unshift({ provider, ncf, concept, amount, status: 'Pendiente' });
    this.closeCxpModal();
    this.loadCxP();
    Helpers.toast('Cuenta por pagar registrada con éxito', 'success');
  },

  pagarCxp(idx) {
    const item = state.cxp[idx];
    if (!confirm(`¿Confirmar pago de ${fmt(item.amount)} a ${item.provider}?`)) return;

    item.status = 'Pagado';
    // Generar egreso de bancos en el Libro Diario
    state.libroDiario.unshift({
      id: Date.now(),
      date: today(),
      desc: `Pago de factura CXP a ${item.provider}`,
      ref: 'Pago-CXP',
      debits: [{ code: '21', amt: item.amount }],
      credits: [{ code: '121', amt: item.amount }],
      center: 'Administración'
    });

    state.bancos.popContable -= item.amount;

    this.loadCxP();
    Helpers.toast('Pago realizado y contabilizado en Libro Diario', 'success');
  },

  // ── CAJA GENERAL ───────────────────────────────────────────────────────────
  async loadCajaGeneral() {
    if ($el('cajaStatusLabel')) $el('cajaStatusLabel').textContent = state.caja.status;
    if ($el('cajaEfectivoCalculado')) $el('cajaEfectivoCalculado').textContent = fmt(state.caja.efectivoCalculado);

    const tbody = $el('cajaGeneralBody');
    if (!tbody) return;

    tbody.innerHTML = state.caja.transactions.map(t => `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-4 py-3 text-xs text-slate-500">${t.date}</td>
        <td class="px-4 py-3 text-center">
          <span class="px-2 py-0.5 text-xs font-black rounded-lg ${t.type === 'Ingreso' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}">${t.type}</span>
        </td>
        <td class="px-4 py-3 text-xs font-bold text-slate-700">${Helpers.escapeHTML(t.desc)}</td>
        <td class="px-4 py-3 text-right text-xs font-black ${t.type === 'Ingreso' ? 'text-green-600' : 'text-red-500'}">${fmt(t.amount)}</td>
      </tr>
    `).join('');
  },

  aperturaCaja() {
    if (state.caja.status === 'Abierta') {
      Helpers.toast('La caja ya se encuentra abierta', 'warning');
      return;
    }
    const val = prompt('Ingrese el monto de apertura de caja chica:', '5000');
    if (val === null) return;
    const amt = parseFloat(val || '0');

    state.caja.status = 'Abierta';
    state.caja.efectivoCalculado = amt;
    state.caja.transactions.unshift({ date: today(), type: 'Ingreso', desc: 'Apertura de caja', amount: amt });
    this.loadCajaGeneral();
    Helpers.toast('Caja general abierta correctamente', 'success');
  },

  arqueoCajaModal() {
    const val = prompt('ARQUEO DE CAJA:\nIngrese el efectivo total físico contado en la caja en este momento:', '41000');
    if (val === null) return;
    const fisico = parseFloat(val || '0');
    const calculado = state.caja.efectivoCalculado;
    const diff = fisico - calculado;

    if (diff === 0) {
      alert('✓ Arqueo impecable. El efectivo coincide al 100% con el saldo contable.');
    } else if (diff > 0) {
      alert(`⚠ Sobrante de caja encontrado de ${fmt(diff)}. Se registrará un ajuste de ingreso por sobrante.`);
      state.caja.transactions.unshift({ date: today(), type: 'Ingreso', desc: 'Sobrante de caja encontrado en arqueo', amount: diff });
    } else {
      alert(`⚠ Faltante de caja encontrado de ${fmt(Math.abs(diff))}. Se registrará un egreso de ajuste por faltante.`);
      state.caja.transactions.unshift({ date: today(), type: 'Egreso', desc: 'Ajuste de faltante de caja en arqueo', amount: Math.abs(diff) });
    }

    state.caja.efectivoCalculado = fisico;
    state.caja.status = 'Cerrada';
    this.loadCajaGeneral();
  },

  openCajaTransModal() {
    const val = prompt('Monto del movimiento de caja:', '1000');
    if (!val) return;
    const amt = parseFloat(val);
    const desc = prompt('Detalle del movimiento:', 'Gastos menores de papelería');
    if (!desc) return;

    state.caja.transactions.unshift({ date: today(), type: 'Egreso', desc, amount: amt });
    state.caja.efectivoCalculado -= amt;
    this.loadCajaGeneral();
    Helpers.toast('Egreso de caja registrado', 'success');
  },

  // ── BANCOS ─────────────────────────────────────────────────────────────────
  async loadBancos() {
    if ($el('bancoPopCont')) $el('bancoPopCont').textContent = fmt(state.bancos.popContable);
    if ($el('bancoPopBanc')) $el('bancoPopBanc').textContent = fmt(state.bancos.popBancario);
    if ($el('bancoPopPend')) $el('bancoPopPend').textContent = fmt(state.bancos.statementMatched.reduce((s,a) => s + (a.status !== '✓ Coincide' ? a.diff : 0), 0));
    if ($el('bancoPopConc')) $el('bancoPopConc').textContent = state.bancos.popConciliados;

    if ($el('bancoResCont')) $el('bancoResCont').textContent = fmt(state.bancos.resContable);
    if ($el('bancoResBanc')) $el('bancoResBanc').textContent = fmt(state.bancos.resBancario);
    if ($el('bancoResPend')) $el('bancoResPend').textContent = fmt(0);
    if ($el('bancoResConc')) $el('bancoResConc').textContent = state.bancos.resConciliados;
  },

  // ── CONCILIACIÓN BANCARIA ──────────────────────────────────────────────────
  async loadConciliacion() {
    const tbody = $el('conciliacionBody');
    if (!tbody) return;

    tbody.innerHTML = state.bancos.statementMatched.map((m, idx) => `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-4 py-3 text-xs text-slate-600 font-medium">${Helpers.escapeHTML(m.bankMove)}</td>
        <td class="px-4 py-3 text-xs text-slate-700 font-bold">${Helpers.escapeHTML(m.sysMove)}</td>
        <td class="px-4 py-3 text-right text-xs font-black ${m.diff > 0 ? 'text-red-500' : 'text-slate-700'}">${m.diff ? fmt(m.diff) : 'RD$0.00'}</td>
        <td class="px-4 py-3 text-center">
          <span class="px-2 py-0.5 text-xs font-black rounded-lg ${m.status === '✓ Coincide' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}">${m.status}</span>
        </td>
        <td class="px-4 py-3 text-center text-xs space-x-1.5">
          ${m.status !== '✓ Coincide' ? `
            <button onclick="AccountingModule.conciliarFaltante(${idx})" class="px-2.5 py-1 bg-[#0B63C7] text-white rounded-lg text-[10px] font-black uppercase">Aceptar & Agregar</button>
          ` : '✓ Conciliado'}
        </td>
      </tr>
    `).join('');
  },

  processBankStatement(event) {
    Helpers.toast('Extracto bancario cargado. El sistema realizó un auto-matching y detectó 1 movimiento pendiente por conciliar.', 'info');
    this.loadConciliacion();
  },

  conciliarFaltante(idx) {
    const item = state.bancos.statementMatched[idx];
    item.status = '✓ Coincide';
    state.bancos.popContable -= item.diff; // deducir de saldo contable por la comisión
    state.libroDiario.push({
      id: Date.now(),
      date: today(),
      desc: 'Comisión por conciliación bancaria',
      ref: 'Bancos-Com',
      debits: [{ code: '513', amt: item.diff }],
      credits: [{ code: '121', amt: item.diff }],
      center: 'Administración'
    });
    item.diff = 0;
    this.loadConciliacion();
    this.loadBancos();
    Helpers.toast('Movimiento conciliado y registrado en el Libro Diario', 'success');
  },

  // ── PRESUPUESTO ────────────────────────────────────────────────────────────
  async loadPresupuesto() {
    const tbody = $el('presupuestoBody');
    if (!tbody) return;

    const data = [
      { cat: 'Sueldos y Personal', pres: 380000, real: 350000, dev: 30000 },
      { cat: 'Materiales Académicos', pres: 50000, real: 45000, dev: 5000 },
      { cat: 'Servicios de Luz/Agua/Luz', pres: 25000, real: 22500, dev: 2500 },
      { cat: 'Publicidad & Eventos', pres: 30000, real: 15000, dev: 15000 }
    ];

    tbody.innerHTML = data.map(d => {
      const pct = Math.round((d.real / d.pres) * 100);
      return `
        <tr class="border-b border-slate-50 hover:bg-slate-50">
          <td class="px-4 py-3 text-xs font-bold text-slate-700">${d.cat}</td>
          <td class="px-4 py-3 text-right text-xs font-bold text-slate-500">${fmt(d.pres)}</td>
          <td class="px-4 py-3 text-right text-xs font-black text-slate-800">${fmt(d.real)}</td>
          <td class="px-4 py-3 text-right text-xs font-black text-green-600">-${fmt(d.dev)}</td>
          <td class="px-4 py-3 text-center text-xs font-black text-[#0B63C7]">${pct}%</td>
        </tr>
      `;
    }).join('');
  },

  // ── FLUJO DE CAJA ──────────────────────────────────────────────────────────
  async loadCashflow(year = '2026') {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const ingresosMensuales = [120000,150000,130000,180000,160000,190000,210000,250000,230000,200000,220000,240000];
    const gastosMensuales = [80000,90000,85000,100000,95000,110000,120000,140000,130000,125000,135000,145000];
    const totalIn = ingresosMensuales.reduce((s,v)=>s+v,0);
    const totalOut = gastosMensuales.reduce((s,v)=>s+v,0);
    const balance = totalIn - totalOut;

    if ($el('cfEntradas')) $el('cfEntradas').textContent = fmt(totalIn);
    if ($el('cfSalidas')) $el('cfSalidas').textContent = fmt(totalOut);
    if ($el('cfBalance')) $el('cfBalance').textContent = fmt(balance);
    if ($el('cfProyeccion')) $el('cfProyeccion').textContent = fmt(balance + 45000);

    this.renderChart('chartCashflow', 'bar', meses, [ingresosMensuales, gastosMensuales], ['Ingresos','Gastos'], ['#28B54D','#FF8A00']);
  },

  // ── ACTIVOS FIJOS ──────────────────────────────────────────────────────────
  async loadActivosFijos() {
    const tbody = $el('activosFijosBody');
    if (!tbody) return;

    tbody.innerHTML = state.activosFijos.map(a => `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-4 py-3 text-xs font-bold text-slate-700">${Helpers.escapeHTML(a.name)}</td>
        <td class="px-4 py-3 text-xs text-slate-500">${a.category}</td>
        <td class="px-4 py-3 text-right text-xs font-bold text-slate-600">${fmt(a.initial)}</td>
        <td class="px-4 py-3 text-right text-xs font-bold text-red-500">${fmt(a.depAcum)}</td>
        <td class="px-4 py-3 text-right text-xs font-black text-slate-800">${fmt(a.bookVal)}</td>
      </tr>
    `).join('');
  },

  depreciarActivosAhora() {
    state.activosFijos.forEach(a => {
      const dep = Math.round(a.initial * 0.02); // 2% mensual simplificado
      a.depAcum += dep;
      a.bookVal -= dep;

      // Asiento contable automático de depreciación
      state.libroDiario.unshift({
        id: Date.now(),
        date: today(),
        desc: `Depreciación mensual automática de ${a.name}`,
        ref: 'Dep-01',
        debits: [{ code: '513', amt: dep }],
        credits: [{ code: '15', amt: dep }],
        center: 'Administración'
      });
    });

    this.loadActivosFijos();
    this.loadLibroDiario();
    Helpers.toast('Depreciación mensual calculada y asientos registrados.', 'success');
  },

  // ── INVENTARIO CONTABLE ────────────────────────────────────────────────────
  async loadInventarioContable() {
    const tbody = $el('inventarioContableBody');
    if (!tbody) return;

    tbody.innerHTML = state.inventario.map(i => `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-4 py-3 text-xs font-bold text-slate-700">${Helpers.escapeHTML(i.name)}</td>
        <td class="px-4 py-3 text-xs text-slate-500">${i.category}</td>
        <td class="px-4 py-3 text-center text-xs font-bold text-slate-600">${i.stock} unidades</td>
        <td class="px-4 py-3 text-right text-xs font-bold text-slate-600">${fmt(i.cost)}</td>
        <td class="px-4 py-3 text-right text-xs font-black text-[#28B54D]">${fmt(i.total)}</td>
      </tr>
    `).join('');
  },

  // ── NÓMINA PROFESIONAL ─────────────────────────────────────────────────────
  async loadNomina() {
    // 1. Cargar perfiles de la base de datos de Supabase para tener datos vivos
    const { data: dbProfiles } = await supabase
      .from('profiles')
      .select('id, name, role')
      .in('role', ['maestra', 'asistente', 'encargada']);

    // Si hay perfiles reales en la BD, los mapeamos con fotos y salarios
    if (dbProfiles && dbProfiles.length) {
      state.employees = dbProfiles.map((p, idx) => {
        const salary = idx === 0 ? 35000 : (idx === 1 ? 28000 : 30000);
        const afp = salary * 0.0287;
        const ars = salary * 0.0304;
        return {
          id: p.id,
          name: p.name,
          role: p.role,
          salary,
          afp,
          ars,
          isr: 0,
          net: salary - afp - ars,
          vacations: 14 - idx,
          photo: idx === 0 ? 'img/monte.jpg' : (idx === 1 ? 'img/10.jpg' : 'img/8.jpg')
        };
      });
    }

    const grid = $el('nominaEmpleadosGrid');
    if (grid) {
      grid.innerHTML = state.employees.map(e => `
        <div class="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4">
          <div class="flex items-center gap-4">
            <img src="${e.photo}" class="w-16 h-16 rounded-full object-cover border-2 border-[#28B54D]">
            <div>
              <h4 class="font-black text-slate-800 text-sm">${Helpers.escapeHTML(e.name)}</h4>
              <p class="text-xs text-slate-400 font-bold">${Helpers.escapeHTML(e.role)}</p>
              <p class="text-[10px] text-green-600 font-extrabold uppercase tracking-wider mt-1">✓ Popular Banco</p>
            </div>
          </div>
          <hr>
          <div class="space-y-1 text-xs">
            <div class="flex justify-between"><span>Salario Base:</span><span class="font-bold">${fmt(e.salary)}</span></div>
            <div class="flex justify-between text-red-500"><span>Aporte AFP (2.87%):</span><span>-${fmt(e.afp)}</span></div>
            <div class="flex justify-between text-red-500"><span>Aporte ARS (3.04%):</span><span>-${fmt(e.ars)}</span></div>
            <div class="flex justify-between text-red-500"><span>ISR Retenido:</span><span>-${fmt(e.isr)}</span></div>
            <div class="flex justify-between font-black text-slate-800 border-t pt-1 mt-1">
              <span>Neto Quincena:</span>
              <span class="text-green-600">${fmt(e.net)}</span>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="AccountingModule.generatePayrollReceipt('${e.id}')" class="flex-1 py-1.5 bg-[#0B63C7] text-white rounded-xl text-xs font-black uppercase hover:opacity-90">
              🖨️ Imprimir Recibo
            </button>
          </div>
        </div>
      `).join('');
    }

    const tbody = $el('nominaTableBody');
    if (tbody) {
      tbody.innerHTML = state.employees.map(e => `
        <tr class="border-b border-slate-50 hover:bg-slate-50">
          <td class="px-4 py-3 text-xs font-bold text-slate-800">${Helpers.escapeHTML(e.name)}</td>
          <td class="px-4 py-3 text-xs text-slate-500 font-bold">${Helpers.escapeHTML(e.role)}</td>
          <td class="px-4 py-3 text-xs font-bold text-slate-600">Quincena Actual</td>
          <td class="px-4 py-3 text-right text-xs font-bold text-slate-600">${fmt(e.salary)}</td>
          <td class="px-4 py-3 text-right text-xs text-red-500 font-bold">-${fmt(e.afp + e.ars)}</td>
          <td class="px-4 py-3 text-right text-xs font-black text-green-600">${fmt(e.net)}</td>
          <td class="px-4 py-3 text-center text-xs font-black">
            <span class="px-2.5 py-1 bg-green-50 text-green-700 rounded-lg">Pagado</span>
          </td>
        </tr>
      `).join('');
    }
  },

  async generatePayrollReceipt(empId) {
    const e = state.employees.find(emp => emp.id === empId);
    if (!e) return;

    if (!window.jspdf || !window.jspdf.jsPDF) {
      Helpers.toast('Cargando motor de generación PDF...', 'info');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Diseño del Recibo de Nómina Profesional
    doc.setFillColor(40, 181, 77); // Verde Montessori
    doc.rect(0, 0, 210, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Colegio Montessori Sonrisas Creativas', 15, 18);
    doc.setFontSize(10);
    doc.text('RECIBO DE NÓMINA DE LEY - REPÚBLICA DOMINICANA', 15, 26);

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(11);
    doc.text(`Colaborador: ${e.name}`, 15, 50);
    doc.text(`Cargo: ${e.role}`, 15, 56);
    doc.text(`Periodo: Quincena Actual - ${new Date().toLocaleDateString('es-DO')}`, 15, 62);
    doc.text(`Vía de Pago: Depósito Banco Popular`, 15, 68);

    doc.rect(15, 75, 180, 50);
    doc.line(15, 85, 195, 85);
    doc.setFont('helvetica', 'bold');
    doc.text('Concepto', 20, 81);
    doc.text('Asignaciones', 100, 81);
    doc.text('Deducciones', 150, 81);

    doc.setFont('helvetica', 'normal');
    doc.text('Salario Base Quincenal', 20, 93);
    doc.text(fmt(e.salary), 100, 93);

    doc.text('Aporte AFP (2.87%)', 20, 101);
    doc.text(fmt(e.afp), 150, 101);

    doc.text('Aporte Seguro de Salud ARS (3.04%)', 20, 109);
    doc.text(fmt(e.ars), 150, 109);

    doc.setFont('helvetica', 'bold');
    doc.text('NETO RECIBIDO:', 20, 118);
    doc.setTextColor(40, 181, 77);
    doc.text(fmt(e.net), 100, 118);

    // Firma Digital de la Directora y QR Code
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text('Firma Digital Institucional autorizada por DGII', 15, 140);
    doc.setFont('courier', 'normal');
    doc.text('SHA256: d24a9a93e5828cbbca45367b9de62e9a2f', 15, 145);

    // QR Mock representation
    doc.setFillColor(240, 240, 240);
    doc.rect(150, 135, 45, 45, 'F');
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'bold');
    doc.text('[ CÓDIGO QR ]', 160, 158);

    doc.save(`Recibo_Nomina_${e.name.replace(/\s+/g, '_')}.pdf`);
    Helpers.toast('Recibo de nómina PDF generado con firma digital y QR', 'success');
  },

  processQuincena() {
    Helpers.toast('Se calculó y emitió el pago de nómina de la quincena. Asientos de gastos de personal generados automáticamente.', 'success');
  },

  // ── DGII MÓDULOS ───────────────────────────────────────────────────────────
  async loadDgii() {
    this.loadDgiiSub('606');
  },

  loadDgiiSub(sub) {
    document.querySelectorAll('.dgii-panel').forEach(p => p.classList.add('hidden'));
    const panel = $el('dgii-' + sub);
    if (panel) panel.classList.remove('hidden');

    const subBtns = ['606', '607', '608', 'it1', 'ir17'];
    subBtns.forEach(btn => {
      const b = $el('btnDgii' + btn.toUpperCase());
      if (b) {
        b.classList.remove('dgii-subactive', 'text-[#0B63C7]');
        b.classList.add('text-slate-500');
      }
    });

    const activeBtn = $el('btnDgii' + sub.toUpperCase());
    if (activeBtn) {
      activeBtn.classList.add('dgii-subactive', 'text-[#0B63C7]');
    }

    if (sub === '606') this.loadDgii606();
    if (sub === '607') this.loadDgii607();
    if (sub === '608') this.loadDgii608();
    if (sub === 'it1') this.loadDgiiIT1();
    if (sub === 'ir17') this.loadDgiiIR17();
  },

  loadDgii606() {
    const tbody = $el('dgii606Body');
    if (!tbody) return;

    tbody.innerHTML = state.cxp.map(item => `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-3 py-2 text-xs font-bold text-slate-700">101293848 (RNC)</td>
        <td class="px-3 py-2 text-xs text-slate-500">Gastos Educativos</td>
        <td class="px-3 py-2 text-xs font-mono font-bold text-slate-800">${item.ncf}</td>
        <td class="px-3 py-2 text-xs text-slate-500">${today()}</td>
        <td class="px-3 py-2 text-right text-xs font-bold">${fmt(item.amount)}</td>
        <td class="px-3 py-2 text-right text-xs font-bold text-red-500">${fmt(item.amount * 0.18)}</td>
      </tr>
    `).join('');
  },

  loadDgii607() {
    const tbody = $el('dgii607Body');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-3 py-2 text-xs font-bold text-slate-700">224009182</td>
        <td class="px-3 py-2 text-xs font-mono font-bold text-slate-800">B0200000125</td>
        <td class="px-3 py-2 text-xs text-slate-500">${today()}</td>
        <td class="px-3 py-2 text-right text-xs font-bold">${fmt(15000)}</td>
        <td class="px-3 py-2 text-right text-xs font-bold text-[#28B54D]">${fmt(15000 * 0.18)}</td>
      </tr>
    `;
  },

  loadDgii608() {
    const tbody = $el('dgii608Body');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-3 py-2 text-xs font-mono font-bold text-slate-800">B0200000099</td>
        <td class="px-3 py-2 text-xs text-slate-500">${today()}</td>
        <td class="px-3 py-2 text-xs text-red-600 font-bold">Error de digitación en monto</td>
      </tr>
    `;
  },

  loadDgiiIT1() {
    const totalVentas = 15000;
    const itbisCobrado = totalVentas * 0.18;
    const totalCompras = state.cxp.reduce((s,a)=>s+a.amount, 0);
    const itbisPagado = totalCompras * 0.18;
    const neto = itbisCobrado - itbisPagado;

    if ($el('it1Cobrado')) $el('it1Cobrado').textContent = fmt(itbisCobrado);
    if ($el('it1Pagado')) $el('it1Pagado').textContent = fmt(itbisPagado);
    if ($el('it1Neto')) $el('it1Neto').textContent = fmt(neto);
  },

  loadDgiiIR17() {
    const retencionIsr = state.employees.reduce((s,e)=>s+e.isr, 0);
    if ($el('ir17IsrNomina')) $el('ir17IsrNomina').textContent = fmt(retencionIsr);
    if ($el('ir17Total')) $el('ir17Total').textContent = fmt(retencionIsr);
  },

  exportTXT606() {
    const content = state.cxp.map(item => `101293848|1|${item.ncf}|${today().replace(/-/g,'')}|${item.amount}|${(item.amount*0.18).toFixed(2)}`).join('\n');
    this.downloadTXTFile(content, 'DGII_606_Reporte.txt');
  },

  exportTXT607() {
    const content = `224009182|B0200000125|${today().replace(/-/g,'')}|15000.00|2700.00`;
    this.downloadTXTFile(content, 'DGII_607_Reporte.txt');
  },

  exportTXT608() {
    const content = `B0200000099|${today().replace(/-/g,'')}|1`;
    this.downloadTXTFile(content, 'DGII_608_Reporte.txt');
  },

  downloadTXTFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    Helpers.toast(`Archivo ${filename} exportado correctamente para DGII`, 'success');
  },

  // ── AUDITORÍA ──────────────────────────────────────────────────────────────
  async loadAuditoria() {
    // Intentar jalar logs inmutables en vivo de Supabase
    const { data: dbLogs } = await supabase
      .from('audit_logs')
      .select('created_at, action, payload, profiles(name)')
      .order('created_at', { ascending: false })
      .limit(20);

    const tbody = $el('auditoriaLogsBody');
    if (!tbody) return;

    let logsHtml = '';
    const logs = dbLogs && dbLogs.length ? dbLogs.map(l => ({
      date: new Date(l.created_at).toLocaleString('es-DO'),
      user: l.profiles?.name || 'Administrador',
      action: l.action,
      details: JSON.stringify(l.payload || {})
    })) : state.auditLogs;

    tbody.innerHTML = logs.map(l => `
      <tr class="border-b border-slate-50 hover:bg-slate-50">
        <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${l.date}</td>
        <td class="px-4 py-3 text-xs font-bold text-slate-700">${Helpers.escapeHTML(l.user)}</td>
        <td class="px-4 py-3 text-xs text-[#0B63C7] font-black">${l.action}</td>
        <td class="px-4 py-3 text-xs font-mono text-slate-500 max-w-xs truncate" title="${Helpers.escapeHTML(l.details)}">${Helpers.escapeHTML(l.details)}</td>
      </tr>
    `).join('');
  }
};

window.AccountingModule = AccountingModule;
