
# Script para actualizar la sección de Contabilidad en panel_directora.html

# Ruta del archivo HTML
$htmlPath = "panel_directora.html"

# Leer el contenido completo del archivo
$content = Get-Content -Path $htmlPath -Raw -Encoding UTF8

# Contenido de la nueva sección de Contabilidad
$newContabilidadSection = @'
      &lt;!-- CONTABILIDAD --&gt;
      &lt;section id="contabilidad" class="section"&gt;
        &lt;div class="flex items-center justify-between mb-6 flex-wrap gap-3"&gt;
          &lt;div&gt;
            &lt;div class="flex items-center gap-3 mb-1"&gt;
              &lt;div class="w-1 h-8 rounded-full" style="background:#0B63C7"&gt;&lt;/div&gt;
              &lt;h1 class="text-2xl font-black text-slate-800"&gt;Contabilidad&lt;/h1&gt;
            &lt;/div&gt;
            &lt;p class="text-slate-500 font-medium ml-4"&gt;Resumen ejecutivo, análisis financiero y reportes para la dirección&lt;/p&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tabs --&gt;
        &lt;div class="flex gap-2 flex-wrap border-b border-slate-200 pb-3 mb-6 overflow-x-auto" id="contTabs"&gt;
          &lt;button data-cont-tab="resumen"     class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-blue-500 bg-blue-50 text-blue-700"&gt;Resumen Ejecutivo&lt;/button&gt;
          &lt;button data-cont-tab="ingresos"    class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Ingresos&lt;/button&gt;
          &lt;button data-cont-tab="gastos"      class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Gastos&lt;/button&gt;
          &lt;button data-cont-tab="cashflow"    class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Flujo de Caja&lt;/button&gt;
          &lt;button data-cont-tab="facturacion" class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Facturación&lt;/button&gt;
          &lt;button data-cont-tab="cxc"         class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Cuentas por Cobrar&lt;/button&gt;
          &lt;button data-cont-tab="bancos"      class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Bancos&lt;/button&gt;
          &lt;button data-cont-tab="conciliacion"class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Conciliación&lt;/button&gt;
          &lt;button data-cont-tab="reportes"    class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Reportes&lt;/button&gt;
          &lt;button data-cont-tab="indicadores" class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Indicadores&lt;/button&gt;
          &lt;button data-cont-tab="auditoria"   class="cont-tab px-4 py-2 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50"&gt;Auditoría&lt;/button&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Resumen Ejecutivo --&gt;
        &lt;div id="cont-resumen" class="cont-panel space-y-6"&gt;
          &lt;!-- KPIs --&gt;
          &lt;div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4"&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-green-50"&gt;&lt;i data-lucide="coins" class="w-4 h-4 text-green-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Ingresos Hoy&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-slate-800" id="resIngresosHoy"&gt;RD$0&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-emerald-50"&gt;&lt;i data-lucide="wallet" class="w-4 h-4 text-emerald-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Ingresos Mes&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-slate-800" id="resIngresosMes"&gt;RD$0&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-blue-50"&gt;&lt;i data-lucide="file-text" class="w-4 h-4 text-blue-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Facturas Emitidas&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-slate-800" id="resFacturas"&gt;0&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-indigo-50"&gt;&lt;i data-lucide="receipt" class="w-4 h-4 text-indigo-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;e-CF Enviados&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-slate-800" id="resECF"&gt;0&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-amber-50"&gt;&lt;i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Pendiente Cobrar&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-slate-800" id="resPendiente"&gt;RD$0&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-red-50"&gt;&lt;i data-lucide="clock-alert" class="w-4 h-4 text-red-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Mora Acumulada&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-slate-800" id="resMora"&gt;RD$0&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-green-50"&gt;&lt;i data-lucide="building-2" class="w-4 h-4 text-green-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Balance Caja&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-slate-800" id="resBalanceCaja"&gt;RD$0&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-blue-50"&gt;&lt;i data-lucide="building" class="w-4 h-4 text-blue-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Balance Bancos&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-slate-800" id="resBalanceBancos"&gt;RD$0&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;

          &lt;!-- Gráficos --&gt;
          &lt;div class="grid grid-cols-1 lg:grid-cols-2 gap-6"&gt;
            &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
              &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Ingresos Mensuales&lt;/h3&gt;
              &lt;div class="h-64"&gt;&lt;canvas id="chartIngresosMensuales"&gt;&lt;/canvas&gt;&lt;/div&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
              &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Ingresos vs Gastos&lt;/h3&gt;
              &lt;div class="h-64"&gt;&lt;canvas id="chartIngresosGastos"&gt;&lt;/canvas&gt;&lt;/div&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
              &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Cobros por Concepto&lt;/h3&gt;
              &lt;div class="h-64"&gt;&lt;canvas id="chartCobrosConcepto"&gt;&lt;/canvas&gt;&lt;/div&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
              &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Métodos de Pago&lt;/h3&gt;
              &lt;div class="h-64"&gt;&lt;canvas id="chartMetodosPago"&gt;&lt;/canvas&gt;&lt;/div&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
              &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Morosidad&lt;/h3&gt;
              &lt;div class="h-64"&gt;&lt;canvas id="chartMorosidad"&gt;&lt;/canvas&gt;&lt;/div&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
              &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Ingresos por Nivel&lt;/h3&gt;
              &lt;div class="h-64"&gt;&lt;canvas id="chartIngresosNivel"&gt;&lt;/canvas&gt;&lt;/div&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Ingresos --&gt;
        &lt;div id="cont-ingresos" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
            &lt;div class="flex items-center justify-between mb-4 flex-wrap gap-3"&gt;
              &lt;h3 class="font-black text-slate-700 text-sm"&gt;Ingresos&lt;/h3&gt;
              &lt;div class="flex gap-2"&gt;
                &lt;select id="ingresosPeriodo" class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black outline-none"&gt;
                  &lt;option value="day"&gt;Hoy&lt;/option&gt;
                  &lt;option value="week"&gt;Esta Semana&lt;/option&gt;
                  &lt;option value="month"&gt;Este Mes&lt;/option&gt;
                  &lt;option value="year"&gt;Este Año&lt;/option&gt;
                  &lt;option value="custom"&gt;Personalizado&lt;/option&gt;
                &lt;/select&gt;
                &lt;input type="date" id="ingresosFechaInicio" class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black outline-none hidden"&gt;
                &lt;input type="date" id="ingresosFechaFin" class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black outline-none hidden"&gt;
              &lt;/div&gt;
            &lt;/div&gt;
            &lt;div class="overflow-x-auto"&gt;
              &lt;table class="w-full text-sm" style="min-width:700px"&gt;
                &lt;thead class="bg-slate-50 border-b border-slate-100"&gt;
                  &lt;tr&gt;
                    &lt;th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase"&gt;Fecha&lt;/th&gt;
                    &lt;th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase"&gt;Concepto&lt;/th&gt;
                    &lt;th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase"&gt;Estudiante&lt;/th&gt;
                    &lt;th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase"&gt;Método&lt;/th&gt;
                    &lt;th class="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase"&gt;Monto&lt;/th&gt;
                  &lt;/tr&gt;
                &lt;/thead&gt;
                &lt;tbody id="ingresosTableBody" class="divide-y divide-slate-50"&gt;
                  &lt;tr&gt;&lt;td colspan="5" class="text-center py-8 text-slate-400 text-sm"&gt;Cargando...&lt;/td&gt;&lt;/tr&gt;
                &lt;/tbody&gt;
              &lt;/table&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Gastos --&gt;
        &lt;div id="cont-gastos" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
            &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Gastos&lt;/h3&gt;
            &lt;div class="text-center py-8 text-slate-400 text-sm"&gt;Módulo de gastos en desarrollo&lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Flujo de Caja --&gt;
        &lt;div id="cont-cashflow" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="grid grid-cols-1 sm:grid-cols-3 gap-4"&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-green-100 shadow-sm text-center"&gt;
              &lt;div class="flex items-center justify-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-green-50"&gt;&lt;i data-lucide="arrow-down-left" class="w-4 h-4 text-green-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Entradas&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-green-600" id="cfEntradas"&gt;RD$0&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-red-100 shadow-sm text-center"&gt;
              &lt;div class="flex items-center justify-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-red-50"&gt;&lt;i data-lucide="arrow-up-right" class="w-4 h-4 text-red-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Salidas&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-red-600" id="cfSalidas"&gt;RD$0&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-blue-100 shadow-sm text-center"&gt;
              &lt;div class="flex items-center justify-center gap-2 mb-2"&gt;
                &lt;div class="p-2 rounded-lg bg-blue-50"&gt;&lt;i data-lucide="balance-scale" class="w-4 h-4 text-blue-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;span class="text-[10px] font-black uppercase tracking-wider text-slate-400"&gt;Balance&lt;/span&gt;
              &lt;/div&gt;
              &lt;p class="text-xl font-black text-blue-600" id="cfBalance"&gt;RD$0&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;
          &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
            &lt;div class="flex items-center justify-between mb-4 flex-wrap gap-3"&gt;
              &lt;h3 class="font-black text-slate-700 text-sm"&gt;Flujo de Caja&lt;/h3&gt;
              &lt;select id="cashflowPeriodo" class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black outline-none"&gt;
                &lt;option value="day"&gt;Por Día&lt;/option&gt;
                &lt;option value="week"&gt;Por Semana&lt;/option&gt;
                &lt;option value="month"&gt;Por Mes&lt;/option&gt;
                &lt;option value="year"&gt;Por Año&lt;/option&gt;
              &lt;/select&gt;
            &lt;/div&gt;
            &lt;div class="h-64"&gt;&lt;canvas id="cashflowChart"&gt;&lt;/canvas&gt;&lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Facturación --&gt;
        &lt;div id="cont-facturacion" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="grid grid-cols-1 sm:grid-cols-4 gap-4"&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-xl font-black text-blue-600" id="factEmitidas"&gt;0&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;Emitidas&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-xl font-black text-red-600" id="factAnuladas"&gt;0&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;Anuladas&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-xl font-black text-amber-600" id="factPendientes"&gt;0&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;Pendientes&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-xl font-black text-green-600" id="factECFAceptados"&gt;0&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;e-CF Aceptados&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;
          &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
            &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Detalle de Facturas&lt;/h3&gt;
            &lt;div class="text-center py-8 text-slate-400 text-sm"&gt;Cargando...&lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Cuentas por Cobrar --&gt;
        &lt;div id="cont-cxc" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="grid grid-cols-1 sm:grid-cols-3 gap-4"&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-xl font-black text-amber-600" id="cxcTotal"&gt;RD$0&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;Total Pendiente&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-xl font-black text-red-600" id="cxcVencido"&gt;RD$0&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;Vencido&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-xl font-black text-blue-600" id="cxcCorriente"&gt;RD$0&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;Corriente&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;
          &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
            &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Ranking de Deudores&lt;/h3&gt;
            &lt;div id="cxcRanking" class="space-y-3"&gt;
              &lt;div class="text-center py-4 text-slate-400 text-sm"&gt;Cargando...&lt;/div&gt;
            &lt;/div&gt;
          &lt;/div&gt;
          &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
            &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Por Aula&lt;/h3&gt;
            &lt;div id="cxcPorAula" class="space-y-3"&gt;
              &lt;div class="text-center py-4 text-slate-400 text-sm"&gt;Cargando...&lt;/div&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Bancos --&gt;
        &lt;div id="cont-bancos" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="grid grid-cols-1 sm:grid-cols-2 gap-4"&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center justify-between"&gt;
                &lt;h4 class="font-black text-slate-700"&gt;Banco Popular&lt;/h4&gt;
                &lt;p class="text-xl font-black text-green-600"&gt;RD$0&lt;/p&gt;
              &lt;/div&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"&gt;
              &lt;div class="flex items-center justify-between"&gt;
                &lt;h4 class="font-black text-slate-700"&gt;Banreservas&lt;/h4&gt;
                &lt;p class="text-xl font-black text-green-600"&gt;RD$0&lt;/p&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Conciliación --&gt;
        &lt;div id="cont-conciliacion" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
            &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Conciliación Bancaria&lt;/h3&gt;
            &lt;div class="text-center py-8 text-slate-400 text-sm"&gt;Módulo de conciliación en desarrollo&lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Reportes --&gt;
        &lt;div id="cont-reportes" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"&gt;
            &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm cursor-pointer hover:shadow-lg transition-shadow"&gt;
              &lt;div class="flex items-center gap-3 mb-3"&gt;
                &lt;div class="p-2 rounded-lg bg-blue-50"&gt;&lt;i data-lucide="file-text" class="w-4 h-4 text-blue-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;h4 class="font-black text-slate-700"&gt;Reporte Diario&lt;/h4&gt;
              &lt;/div&gt;
              &lt;p class="text-xs text-slate-500 mb-3"&gt;Resumen de operaciones del día&lt;/p&gt;
              &lt;div class="flex gap-2"&gt;
                &lt;button class="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-black"&gt;PDF&lt;/button&gt;
                &lt;button class="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-black"&gt;Excel&lt;/button&gt;
                &lt;button class="px-3 py-1 bg-slate-50 text-slate-700 rounded-lg text-xs font-black"&gt;CSV&lt;/button&gt;
              &lt;/div&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm cursor-pointer hover:shadow-lg transition-shadow"&gt;
              &lt;div class="flex items-center gap-3 mb-3"&gt;
                &lt;div class="p-2 rounded-lg bg-green-50"&gt;&lt;i data-lucide="calendar" class="w-4 h-4 text-green-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;h4 class="font-black text-slate-700"&gt;Reporte Mensual&lt;/h4&gt;
              &lt;/div&gt;
              &lt;p class="text-xs text-slate-500 mb-3"&gt;Resumen de operaciones del mes&lt;/p&gt;
              &lt;div class="flex gap-2"&gt;
                &lt;button class="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-black"&gt;PDF&lt;/button&gt;
                &lt;button class="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-black"&gt;Excel&lt;/button&gt;
                &lt;button class="px-3 py-1 bg-slate-50 text-slate-700 rounded-lg text-xs font-black"&gt;CSV&lt;/button&gt;
              &lt;/div&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm cursor-pointer hover:shadow-lg transition-shadow"&gt;
              &lt;div class="flex items-center gap-3 mb-3"&gt;
                &lt;div class="p-2 rounded-lg bg-purple-50"&gt;&lt;i data-lucide="users" class="w-4 h-4 text-purple-600"&gt;&lt;/i&gt;&lt;/div&gt;
                &lt;h4 class="font-black text-slate-700"&gt;Por Estudiante&lt;/h4&gt;
              &lt;/div&gt;
              &lt;p class="text-xs text-slate-500 mb-3"&gt;Estado de cuenta por estudiante&lt;/p&gt;
              &lt;div class="flex gap-2"&gt;
                &lt;button class="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-black"&gt;PDF&lt;/button&gt;
                &lt;button class="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-black"&gt;Excel&lt;/button&gt;
                &lt;button class="px-3 py-1 bg-slate-50 text-slate-700 rounded-lg text-xs font-black"&gt;CSV&lt;/button&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Indicadores --&gt;
        &lt;div id="cont-indicadores" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-2xl font-black text-green-600" id="indCobranza"&gt;0%&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;% Cobranza&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-2xl font-black text-red-600" id="indMorosidad"&gt;0%&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;% Morosidad&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-2xl font-black text-blue-600" id="indPromPago"&gt;RD$0&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;Promedio Pago&lt;/p&gt;
            &lt;/div&gt;
            &lt;div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center"&gt;
              &lt;p class="text-2xl font-black text-purple-600" id="indIngresoEst"&gt;RD$0&lt;/p&gt;
              &lt;p class="text-[10px] font-black text-slate-400 uppercase mt-1"&gt;Ingreso/Estudiante&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;!-- Tab: Auditoría --&gt;
        &lt;div id="cont-auditoria" class="cont-panel hidden space-y-5"&gt;
          &lt;div class="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"&gt;
            &lt;h3 class="font-black text-slate-700 mb-4 text-sm"&gt;Auditoría&lt;/h3&gt;
            &lt;div class="text-center py-8 text-slate-400 text-sm"&gt;Módulo de auditoría en desarrollo&lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;style&gt;
          .cont-tab.active-cont { border-color:#0B63C7!important; background:#E8F2FF!important; color:#0B63C7!important; }
        &lt;/style&gt;
        &lt;script&gt;
          document.getElementById('contTabs')?.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-cont-tab]');
            if (!btn) return;
            const tab = btn.dataset.contTab;
            document.querySelectorAll('.cont-tab').forEach(b =&gt; b.classList.remove('active-cont','border-blue-500','bg-blue-50','text-blue-700'));
            btn.classList.add('active-cont');
            document.querySelectorAll('.cont-panel').forEach(p =&gt; p.classList.add('hidden'));
            const panel = document.getElementById('cont-'+tab);
            if (panel) panel.classList.remove('hidden');
            import('./js/directora/accounting.module.js').then(m =&gt; m.AccountingModule?.loadTab?.(tab)).catch(() =&gt; {});
          });
        &lt;/script&gt;
      &lt;/section&gt;
'@

# Patrón para encontrar la sección de Contabilidad existente (incluyendo cualquier contenido entre la etiqueta de apertura y cierre)
# Nota: Este patrón busca la etiqueta de apertura <section id="contabilidad" ...> y la etiqueta de cierre </section>
$pattern = [regex]::new('&lt;section\s+id="contabilidad".*?&lt;/section&gt;', [System.Text.RegularExpressions.RegexOptions]::Singleline)

# Reemplazar la sección antigua con la nueva
$newContent = $pattern.Replace($content, $newContabilidadSection)

# Escribir el nuevo contenido al archivo
[System.IO.File]::WriteAllText($htmlPath, $newContent, [System.Text.Encoding]::UTF8)

Write-Host "✅ Sección de Contabilidad actualizada exitosamente en $htmlPath" -ForegroundColor Green
