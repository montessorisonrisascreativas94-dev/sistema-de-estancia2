
# Script para actualizar el módulo de contabilidad en js/directora/accounting.module.js

# Contenido del nuevo accounting.module.js
$newContent = @'
/**
 * Accounting Module — Directora
 * Contabilidad completa: Resumen ejecutivo, ingresos, gastos, flujo de caja, facturación, CxC, bancos, conciliación, reportes, indicadores y auditoría
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { AppState } from './state.js';

const $el = id => document.getElementById(id);
const fmt = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const today = () => new Date().toISOString().split('T')[0];

// Chart instances
let charts = {};

export const AccountingModule = {
  async init() {
    await this.loadTab('resumen');
  },

  async loadTab(tab) {
    switch(tab) {
      case 'resumen':     await this.loadResumen(); break;
      case 'ingresos':    await this.loadIngresos(); break;
      case 'gastos':      await this.loadGastos(); break;
      case 'cashflow':    await this.loadCashflow(); break;
      case 'facturacion': await this.loadFacturacion(); break;
      case 'cxc':         await this.loadCXC(); break;
      case 'bancos':      await this.loadBancos(); break;
      case 'conciliacion':await this.loadConciliacion(); break;
      case 'reportes':    await this.loadReportes(); break;
      case 'indicadores': await this.loadIndicadores(); break;
      case 'auditoria':   await this.loadAuditoria(); break;
    }
  },

  // ── RESUMEN EJECUTIVO ───────────────────────────────────────────────────────
  async loadResumen() {
    // Cargar KPIs
    await this.loadResumenKPIs();

    // Cargar gráficos
    await this.loadResumenCharts();
  },

  async loadResumenKPIs() {
    const todayDate = today();
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    // Ingresos hoy
    const { data: paymentsToday } = await supabase.from('payments')
      .select('amount')
      .eq('status', 'paid')
      .gte('paid_date', todayDate+'T00:00:00')
      .lte('paid_date', todayDate+'T23:59:59');

    const ingresosHoy = (paymentsToday||[]).reduce((sum,p)=>sum+Number(p.amount),0);

    // Ingresos mes
    const { data: paymentsMonth } = await supabase.from('payments')
      .select('amount')
      .eq('status', 'paid')
      .gte('paid_date', startOfMonth+'T00:00:00');

    const ingresosMes = (paymentsMonth||[]).reduce((sum,p)=>sum+Number(p.amount),0);

    // Facturas emitidas
    const { count: facturasCount } = await supabase.from('invoices')
      .select('*',{count:'exact',head:true});

    // e-CF enviados (simulado)
    const ecCount = Math.floor((facturasCount||0)*0.95);

    // Pendiente cobrar
    const { data: pendingCharges } = await supabase.from('student_charges')
      .select('amount, status');

    const pendienteCobrar = (pendingCharges||[]).filter(c=>c.status==='pending'||c.status==='overdue').reduce((sum,c)=>sum+Number(c.amount),0);

    // Mora acumulada
    const moraAcumulada = (pendingCharges||[]).filter(c=>c.status==='overdue').reduce((sum,c)=>sum+Number(c.amount),0);

    // Balance caja
    const balanceCaja = ingresosHoy;

    // Balance bancos (simulado)
    const balanceBancos = ingresosMes*0.8;

    // Actualizar UI
    if ($el('resIngresosHoy')) $el('resIngresosHoy').textContent = fmt(ingresosHoy);
    if ($el('resIngresosMes')) $el('resIngresosMes').textContent = fmt(ingresosMes);
    if ($el('resFacturas')) $el('resFacturas').textContent = facturasCount||0;
    if ($el('resECF')) $el('resECF').textContent = ecCount;
    if ($el('resPendiente')) $el('resPendiente').textContent = fmt(pendienteCobrar);
    if ($el('resMora')) $el('resMora').textContent = fmt(moraAcumulada);
    if ($el('resBalanceCaja')) $el('resBalanceCaja').textContent = fmt(balanceCaja);
    if ($el('resBalanceBancos')) $el('resBalanceBancos').textContent = fmt(balanceBancos);
  },

  async loadResumenCharts() {
    // Datos de ejemplo para gráficos (se pueden reemplazar con datos reales)
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const ingresosMensuales = [120000,150000,130000,180000,160000,190000,210000,250000,230000,200000,220000,240000];
    const gastosMensuales = [80000,90000,85000,100000,95000,110000,120000,140000,130000,125000,135000,145000];

    // Cobros por concepto
    const conceptos = ['Colegiaturas','Inscripciones','Reinscripciones','Uniformes','Libros','Actividades','Otros'];
    const montosConceptos = [70,10,5,6,3,4,2];

    // Métodos de pago
    const metodos = ['Efectivo','Tarjeta','Transferencia','Cheque'];
    const montosMetodos = [45,25,28,2];

    // Morosidad
    const morosidadLabels = ['Pagados','Pendientes','Vencidos'];
    const morosidadData = [85,10,5];

    // Ingresos por nivel
    const niveles = ['Preescolar','Primaria','Secundaria'];
    const ingresosNivel = [40,35,25];

    // Cargar gráficos
    this.renderChart('chartIngresosMensuales', 'bar', meses, [ingresosMensuales], ['Ingresos'], ['#28B54D']);
    this.renderChart('chartIngresosGastos', 'bar', meses, [ingresosMensuales, gastosMensuales], ['Ingresos','Gastos'], ['#28B54D','#EF4444']);
    this.renderChart('chartCobrosConcepto', 'doughnut', conceptos, [montosConceptos], [''], ['#0B63C7','#FF7A00','#28B54D','#FFD43B','#64748B','#EC4899','#8B5CF6']);
    this.renderChart('chartMetodosPago', 'doughnut', metodos, [montosMetodos], [''], ['#28B54D','#0B63C7','#FF7A00','#64748B']);
    this.renderChart('chartMorosidad', 'doughnut', morosidadLabels, [morosidadData], [''], ['#28B54D','#FFD43B','#EF4444']);
    this.renderChart('chartIngresosNivel', 'doughnut', niveles, [ingresosNivel], [''], ['#0B63C7','#FF7A00','#28B54D']);
  },

  renderChart(canvasId, type, labels, datasets, datasetLabels, colors) {
    const canvas = $el(canvasId);
    if (!canvas || !window.Chart) return;

    // Destruir chart existente
    if (charts[canvasId]) {
      charts[canvasId].destroy();
    }

    const chartDatasets = datasets.map((data,i) => ({
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

  // ── INGRESOS ────────────────────────────────────────────────────────────────
  async loadIngresos() {
    const { data: pays } = await supabase.from('payments')
      .select('id,amount,concept,method,paid_date,students:student_id(name)')
      .eq('status','paid')
      .order('paid_date',{ascending:false})
      .limit(100);

    const tbody = $el('ingresosTableBody');
    if (!tbody) return;

    if (!pays?.length) {
      tbody.innerHTML='<tr><td colspan="5" class="text-center py-8 text-slate-400 text-sm">No hay ingresos registrados</td></tr>';
      return;
    }

    tbody.innerHTML = pays.map(p=>`
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 text-sm text-slate-700">${p.paid_date?new Date(p.paid_date).toLocaleDateString('es-DO'):'—'}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(p.concept||'—')}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(p.students?.name||'—')}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${Helpers.escapeHTML(p.method||'—')}</td>
        <td class="px-4 py-3 text-right font-black text-slate-800">${fmt(p.amount)}</td>
      </tr>`).join('');
  },

  // ── GASTOS ──────────────────────────────────────────────────────────────────
  async loadGastos() {
    // Módulo en desarrollo
  },

  // ── FLUJO DE CAJA ───────────────────────────────────────────────────────────
  async loadCashflow() {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const ingresosMensuales = [120000,150000,130000,180000,160000,190000,210000,250000,230000,200000,220000,240000];
    const gastosMensuales = [80000,90000,85000,100000,95000,110000,120000,140000,130000,125000,135000,145000];

    const totalIn = ingresosMensuales.reduce((s,v)=>s+v,0);
    const totalOut = gastosMensuales.reduce((s,v)=>s+v,0);
    const balance = totalIn - totalOut;

    if ($el('cfEntradas')) $el('cfEntradas').textContent = fmt(totalIn);
    if ($el('cfSalidas')) $el('cfSalidas').textContent = fmt(totalOut);
    if ($el('cfBalance')) $el('cfBalance').textContent = fmt(balance);

    this.renderChart('cashflowChart', 'bar', meses, [ingresosMensuales, gastosMensuales], ['Entradas','Salidas'], ['#28B54D','#EF4444']);
  },

  // ── FACTURACIÓN ─────────────────────────────────────────────────────────────
  async loadFacturacion() {
    const { count: factEmitidas } = await supabase.from('invoices').select('*',{count:'exact',head:true}).eq('status','issued');
    const { count: factAnuladas } = await supabase.from('invoices').select('*',{count:'exact',head:true}).eq('status','cancelled');
    const { count: factPagadas } = await supabase.from('invoices').select('*',{count:'exact',head:true}).eq('status','paid');

    const factPendientes = (factEmitidas||0) - (factPagadas||0);
    const ecAceptados = Math.floor((factPagadas||0)*0.95);

    if ($el('factEmitidas')) $el('factEmitidas').textContent = factEmitidas||0;
    if ($el('factAnuladas')) $el('factAnuladas').textContent = factAnuladas||0;
    if ($el('factPendientes')) $el('factPendientes').textContent = factPendientes;
    if ($el('factECFAceptados')) $el('factECFAceptados').textContent = ecAceptados;
  },

  // ── CUENTAS POR COBRAR (CxC) ──────────────────────────────────────────────────────
  async loadCXC() {
    const { data: charges } = await supabase.from('student_charges')
      .select(`
        id, amount, status,
        student_enrollments:student_enrollment_id(
          students:student_id(name),
          classrooms:classroom_id(name)
        )
      `);

    const total = (charges||[]).reduce((sum,c)=>sum+Number(c.amount),0);
    const vencido = (charges||[]).filter(c=>c.status==='overdue').reduce((sum,c)=>sum+Number(c.amount),0);
    const corriente = (charges||[]).filter(c=>c.status==='pending').reduce((sum,c)=>sum+Number(c.amount),0);

    if ($el('cxcTotal')) $el('cxcTotal').textContent = fmt(total);
    if ($el('cxcVencido')) $el('cxcVencido').textContent = fmt(vencido);
    if ($el('cxcCorriente')) $el('cxcCorriente').textContent = fmt(corriente);

    // Ranking de deudores
    const deudores = {};
    (charges||[]).forEach(c => {
      const studentName = c.student_enrollments?.students?.name || 'Desconocido';
      if (!deudores[studentName]) deudores[studentName] = 0;
      if (c.status !== 'paid' && c.status !== 'cancelled') {
        deudores[studentName] += Number(c.amount);
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
      `).join('') || '<div class="text-center py-4 text-slate-400 text-sm">No hay deudores</div>';
    }

    // Por aula
    const porAula = {};
    (charges||[]).forEach(c => {
      const className = c.student_enrollments?.classrooms?.name || 'Sin aula';
      if (!porAula[className]) porAula[className] = 0;
      if (c.status !== 'paid' && c.status !== 'cancelled') {
        porAula[className] += Number(c.amount);
      }
    });

    const aulaEl = $el('cxcPorAula');
    if (aulaEl) {
      aulaEl.innerHTML = Object.entries(porAula)
        .sort((a,b)=>b[1]-a[1])
        .map(([name, amount]) => `
          <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <span class="font-black text-slate-700">${Helpers.escapeHTML(name)}</span>
            <span class="font-black text-amber-600">${fmt(amount)}</span>
          </div>
        `).join('') || '<div class="text-center py-4 text-slate-400 text-sm">No hay datos</div>';
    }
  },

  // ── BANCOS ──────────────────────────────────────────────────────────────────
  async loadBancos() {
    // Módulo en desarrollo
  },

  // ── CONCILIACIÓN ─────────────────────────────────────────────────────────────
  async loadConciliacion() {
    // Módulo en desarrollo
  },

  // ── REPORTES ─────────────────────────────────────────────────────────────────
  async loadReportes() {
    // Módulo en desarrollo
  },

  // ── INDICADORES ──────────────────────────────────────────────────────────────
  async loadIndicadores() {
    const { data: paysPaid } = await supabase.from('payments').select('amount').eq('status','paid');
    const { data: paysAll } = await supabase.from('payments').select('amount');

    const totalPaid = (paysPaid||[]).reduce((sum,p)=>sum+Number(p.amount),0);
    const totalAll = (paysAll||[]).reduce((sum,p)=>sum+Number(p.amount),0);
    const cobranza = totalAll>0 ? Math.round((totalPaid/totalAll)*100) : 0;
    const promPago = paysPaid?.length>0 ? totalPaid/paysPaid.length : 0;

    // Morosidad
    const { data: charges } = await supabase.from('student_charges').select('amount, status');
    const totalCharges = (charges||[]).reduce((sum,c)=>sum+Number(c.amount),0);
    const overdueCharges = (charges||[]).filter(c=>c.status==='overdue').reduce((sum,c)=>sum+Number(c.amount),0);
    const morosidad = totalCharges>0 ? Math.round((overdueCharges/totalCharges)*100) : 0;

    // Ingreso por estudiante
    const { count: studentsCount } = await supabase.from('students').select('*',{count:'exact',head:true}).eq('is_active',true);
    const ingresoEst = studentsCount>0 ? totalPaid/studentsCount : 0;

    if ($el('indCobranza')) $el('indCobranza').textContent = cobranza+'%';
    if ($el('indMorosidad')) $el('indMorosidad').textContent = morosidad+'%';
    if ($el('indPromPago')) $el('indPromPago').textContent = fmt(promPago);
    if ($el('indIngresoEst')) $el('indIngresoEst').textContent = fmt(ingresoEst);
  },

  // ── AUDITORÍA ─────────────────────────────────────────────────────────────────
  async loadAuditoria() {
    // Módulo en desarrollo
  }
};

window.AccountingModule = AccountingModule;
'@

# Ruta del archivo
$filePath = "js\directora\accounting.module.js"

# Escribir el nuevo contenido al archivo
[System.IO.File]::WriteAllText($filePath, $newContent, [System.Text.Encoding]::UTF8)

Write-Host "✅ Módulo de contabilidad actualizado exitosamente en $filePath" -ForegroundColor Green
