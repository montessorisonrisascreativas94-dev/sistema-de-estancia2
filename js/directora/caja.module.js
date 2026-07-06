/**
 * Caja Module — Directora
 * Cobro de mensualidades/inscripciones, emisión de factura con RNC
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { InvoiceModule } from '../shared/invoice.js';

const $el = id => document.getElementById(id);
const fmtCurrency = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const fmtTime = d => new Date(d).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit',hour12:true});
const today = () => new Date().toISOString().split('T')[0];

export const CajaModule = {
  async init() {
    // Set date picker to today
    const dp = $el('cajaDateFilter');
    if (dp) dp.value = today();
    await this.loadByDate(today());
    this._setupListeners();
  },

  _setupListeners() {
    $el('btnCajaNewCobro')?.addEventListener('click', () => this.openCobroModal());
    $el('btnCajaReport')?.addEventListener('click', () => this.printDailyReport());
  },

  // ── Cargar cobros por fecha ──────────────────────────────────────────
  async loadByDate(dateStr) {
    const tbody = $el('cajaTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400">Cargando...</td></tr>';

    const start = dateStr + 'T00:00:00';
    const end   = dateStr + 'T23:59:59';

    const { data: payments } = await supabase.from('payments')
      .select('id,amount,concept,method,paid_date,created_at,month_paid,students:student_id(name)')
      .eq('status','paid')
      .gte('paid_date', start)
      .lte('paid_date', end)
      .order('paid_date',{ascending:false})
      .limit(200);

    const list = payments || [];
    this._updateKPIs(list);

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400 text-sm">Sin cobros para esta fecha</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(p => {
      const methodCls = p.method==='efectivo'  ? 'bg-green-50 text-green-700'
                      : p.method==='tarjeta'   ? 'bg-purple-50 text-purple-700'
                      : 'bg-blue-50 text-blue-700';
      return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3 font-bold text-slate-800">${Helpers.escapeHTML(p.students?.name||'—')}</td>
        <td class="px-4 py-3 text-xs text-slate-600">${Helpers.escapeHTML(p.concept||p.month_paid||'—')}</td>
        <td class="px-4 py-3 text-right font-black text-slate-800">${fmtCurrency(p.amount)}</td>
        <td class="px-4 py-3 text-center"><span class="text-[10px] font-black px-2 py-1 rounded-full ${methodCls} uppercase">${p.method||'—'}</span></td>
        <td class="px-4 py-3 text-center">
          <button onclick="App.caja.downloadReceipt('${p.id}')" class="p-1.5 rounded-lg hover:bg-violet-50 hover:text-violet-600 transition-colors text-slate-400" title="Descargar recibo">
            <i data-lucide="receipt" class="w-4 h-4"></i>
          </button>
        </td>
        <td class="px-4 py-3 text-xs text-slate-500">${p.paid_date?fmtTime(p.paid_date):'—'}</td>
        <td class="px-4 py-3 text-center">
          <button onclick="App.caja.downloadReceipt('${p.id}')" class="px-3 py-1 text-[10px] font-black uppercase rounded-lg text-white transition-all active:scale-95" style="background:#0B63C7">Factura</button>
        </td>
      </tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  },

  _updateKPIs(list) {
    const total     = list.reduce((s,p)=>s+Number(p.amount||0),0);
    const transfer  = list.filter(p=>p.method==='transferencia').reduce((s,p)=>s+Number(p.amount||0),0);
    const cash      = list.filter(p=>p.method==='efectivo').reduce((s,p)=>s+Number(p.amount||0),0);
    const setEl = (id,v) => { const e=$el(id); if(e) e.textContent=v; };
    setEl('cajaTodayIncome', fmtCurrency(total));
    setEl('cajaTodayInvoices', String(list.length));
    setEl('cajaTodayTransfer', fmtCurrency(transfer));
    setEl('cajaTodayCash', fmtCurrency(cash));
  },

  // ── Modal de cobro ──────────────────────────────────────────────────
  async openCobroModal(prefillStudentId = null) {
    const { data: students } = await supabase.from('students')
      .select('id,name,monthly_fee,classroom_id,classrooms:classroom_id(name)')
      .eq('is_active',true).is('deleted_at',null).order('name').limit(300);

    const { data: charges } = prefillStudentId
      ? await supabase.from('student_charges').select('id,concept,amount,type,due_date,plan_installments:plan_installment_id(month_name)').eq('student_enrollment_id',prefillStudentId).eq('status','pending').order('due_date').limit(20)
      : { data: [] };

    const studOpts = (students||[]).map(s =>
      `<option value="${s.id}" data-fee="${s.monthly_fee||0}" data-name="${Helpers.escapeHTML(s.name)}"${prefillStudentId===s.id?' selected':''}>${Helpers.escapeHTML(s.name)} (${s.classrooms?.name||'Sin aula'})</option>`
    ).join('');

    const ic = 'w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-green-400 bg-white';
    const lc = 'block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5';

    window.openGlobalModal(`
      <div class="p-0 rounded-3xl overflow-hidden">
        <div class="p-6 text-white" style="background:linear-gradient(135deg,#28B54D,#239943)">
          <h3 class="text-xl font-black">Registrar Cobro</h3>
          <p class="text-xs text-green-100 font-bold uppercase tracking-wider mt-1">Motor Financiero — Caja</p>
        </div>
        <div class="p-6 space-y-4 bg-slate-50/40" id="cajaModalBody">
          <div><label class="${lc}">Estudiante *</label>
            <select id="cajaStudent" class="${ic}" onchange="App.caja._onStudentChange(this)">
              <option value="">-- Seleccionar --</option>${studOpts}
            </select></div>

          <!-- Cuotas pendientes del plan (si existen) -->
          <div id="cajaChargesBlock" class="${charges?.length?'':'hidden'}">
            <label class="${lc}">Cuotas pendientes del plan</label>
            <div id="cajaChargesList" class="space-y-2 max-h-40 overflow-y-auto"></div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div><label class="${lc}">Concepto *</label>
              <input id="cajaConcept" type="text" class="${ic}" value="Mensualidad" placeholder="Ej: Mensualidad Agosto"></div>
            <div><label class="${lc}">Monto (RD$) *</label>
              <input id="cajaAmount" type="number" step="0.01" min="0" class="${ic}" placeholder="0.00"></div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div><label class="${lc}">Método de pago *</label>
              <select id="cajaMethod" class="${ic}">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
              </select></div>
            <div><label class="${lc}">Mes que aplica</label>
              <input id="cajaMonthPaid" type="month" class="${ic}" value="${new Date().toISOString().slice(0,7)}"></div>
          </div>

          <!-- Datos fiscales (opcionales) -->
          <details class="border border-slate-200 rounded-xl overflow-hidden">
            <summary class="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-50">
              Datos Fiscales (NCF/RNC) — opcional
            </summary>
            <div class="p-4 grid grid-cols-2 gap-3 bg-white">
              <div><label class="${lc}">Nombre empresa / razón social</label>
                <input id="cajaFiscalName" type="text" class="${ic}" placeholder="Ej: Empresa ABC"></div>
              <div><label class="${lc}">RNC</label>
                <input id="cajaFiscalRNC" type="text" class="${ic}" placeholder="1-01-00001-6"></div>
            </div>
          </details>

          <div class="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-bold">
            <i data-lucide="info" class="w-4 h-4 flex-shrink-0"></i>
            Al guardar se marcará el pago como aprobado y se generará la factura automáticamente.
          </div>
        </div>
        <div class="p-5 bg-white border-t border-slate-100 flex justify-end gap-3">
          <button onclick="App.ui.closeModal()" class="px-5 py-2.5 text-slate-500 font-black text-xs uppercase border border-slate-200 rounded-2xl">Cancelar</button>
          <button id="btnCajaGuardar" onclick="App.caja.saveCobro()" class="px-6 py-2.5 text-white font-black text-xs uppercase rounded-2xl active:scale-95" style="background:#28B54D;box-shadow:0 4px 12px rgba(40,181,77,.3)">
            <i data-lucide="check-circle" class="w-4 h-4 inline mr-1"></i> Cobrar y Emitir Factura
          </button>
        </div>
      </div>`, false);

    if (window.lucide) lucide.createIcons();
  },

  async _onStudentChange(sel) {
    const sid = sel.value;
    if (!sid) return;
    const opt = sel.options[sel.selectedIndex];
    const fee = parseFloat(opt?.dataset?.fee||0);
    const amtEl = $el('cajaAmount');
    if (amtEl && fee > 0) amtEl.value = fee.toFixed(2);

    // Cargar cuotas pendientes
    const { data: enrollments } = await supabase.from('student_enrollments')
      .select('id').eq('student_id',parseInt(sid))
      .order('created_at',{ascending:false}).limit(1);
    const enrollId = enrollments?.[0]?.id;
    if (!enrollId) return;

    const { data: charges } = await supabase.from('student_charges')
      .select('id,concept,amount,type,due_date')
      .eq('student_enrollment_id',enrollId)
      .in('status',['pending','overdue'])
      .order('due_date').limit(15);

    const block = $el('cajaChargesBlock');
    const list  = $el('cajaChargesList');
    if (!block || !list) return;

    if (charges?.length) {
      block.classList.remove('hidden');
      list.innerHTML = charges.map(c => `
        <label class="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl cursor-pointer hover:border-green-300 transition-all">
          <input type="checkbox" class="caja-charge-check w-4 h-4 accent-green-500"
            data-id="${c.id}" data-amount="${c.amount}" data-concept="${Helpers.escapeHTML(c.concept||c.type)}"
            onchange="App.caja._onChargeToggle()">
          <div class="flex-1">
            <span class="text-xs font-bold text-slate-700">${Helpers.escapeHTML(c.concept||c.type)}</span>
            <span class="text-[10px] text-slate-400 ml-2">${c.due_date||''}</span>
          </div>
          <span class="text-sm font-black text-slate-800">${fmtCurrency(c.amount)}</span>
        </label>`).join('');
    } else {
      block.classList.add('hidden');
    }
    if (window.lucide) lucide.createIcons();
  },

  _onChargeToggle() {
    const checks = [...document.querySelectorAll('.caja-charge-check:checked')];
    const total  = checks.reduce((s,c)=>s+parseFloat(c.dataset.amount||0),0);
    const names  = checks.map(c=>c.dataset.concept).join(', ');
    const amtEl  = $el('cajaAmount');
    const conEl  = $el('cajaConcept');
    if (amtEl && total>0) amtEl.value = total.toFixed(2);
    if (conEl && names)   conEl.value = names;
  },

  async saveCobro() {
    const sid     = $el('cajaStudent')?.value;
    const amount  = parseFloat($el('cajaAmount')?.value||0);
    const concept = $el('cajaConcept')?.value?.trim()||'Mensualidad';
    const method  = $el('cajaMethod')?.value||'efectivo';
    const month   = $el('cajaMonthPaid')?.value||new Date().toISOString().slice(0,7);
    const fiscalName = $el('cajaFiscalName')?.value?.trim()||null;
    const fiscalRNC  = $el('cajaFiscalRNC')?.value?.trim()||null;

    if (!sid)           return Helpers.toast('Selecciona un estudiante','warning');
    if (!amount||amount<=0) return Helpers.toast('Ingresa un monto válido','warning');

    const btn = $el('btnCajaGuardar');
    if (btn) { btn.disabled=true; btn.textContent='Procesando...'; }

    try {
      const { data: stu } = await supabase.from('students')
        .select('name,p1_name,p1_email,monthly_fee').eq('id',parseInt(sid)).single();

      // Registrar el pago
      const { data: pay, error } = await supabase.from('payments').insert({
        student_id: parseInt(sid),
        amount, concept, method,
        status: 'paid',
        month_paid: month,
        paid_date: new Date().toISOString(),
        notes: fiscalRNC ? `RNC: ${fiscalRNC} | ${fiscalName||''}` : null,
        created_at: new Date().toISOString()
      }).select().single();

      if (error) throw error;

      // Actualizar student_charges si se seleccionaron cuotas
      const checks = [...document.querySelectorAll('.caja-charge-check:checked')];
      if (checks.length) {
        const ids = checks.map(c=>parseInt(c.dataset.id));
        await supabase.from('student_charges')
          .update({status:'paid',paid_date:new Date().toISOString()})
          .in('id',ids);
      }

      // Generar factura PDF inmediatamente
      InvoiceModule.downloadSingle({
        ...pay,
        students: { name: stu?.name, classrooms: {name:''}, p1_name: stu?.p1_name||'', fiscal_name: fiscalName, fiscal_rnc: fiscalRNC },
      });

      App.ui.closeModal();
      Helpers.toast(`Cobro registrado — Factura generada para ${stu?.name||''}`, 'success');
      await this.loadByDate(today());
    } catch(e) {
      Helpers.toast('Error: '+(e.message||e),'error');
    } finally {
      if (btn) { btn.disabled=false; btn.innerHTML='<i data-lucide="check-circle" class="w-4 h-4 inline mr-1"></i> Cobrar y Emitir Factura'; if(window.lucide)lucide.createIcons(); }
    }
  },

  async downloadReceipt(paymentId) {
    const { data: p } = await supabase.from('payments')
      .select('*,students:student_id(name,p1_name,classrooms:classroom_id(name))')
      .eq('id',paymentId).single();
    if (p) InvoiceModule.downloadSingle(p);
  },

  async printDailyReport() {
    const dateEl = $el('cajaDateFilter');
    const dateStr = dateEl?.value || today();
    const { data: payments } = await supabase.from('payments')
      .select('*,students:student_id(name)')
      .eq('status','paid')
      .gte('paid_date', dateStr+'T00:00:00')
      .lte('paid_date', dateStr+'T23:59:59')
      .order('paid_date',{ascending:true})
      .limit(500);

    const total = (payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);
    const byMethod = {};
    (payments||[]).forEach(p=>{ byMethod[p.method||'otro']=(byMethod[p.method||'otro']||0)+Number(p.amount||0); });

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Reporte Diario Caja — ${dateStr}</title>
<style>body{font-family:Arial,sans-serif;max-width:700px;margin:20px auto;color:#1a2340}
h1{color:#28B54D;font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}
th{background:#28B54D;color:white;padding:10px;text-align:left;font-size:11px;text-transform:uppercase}
td{padding:9px 10px;border-bottom:1px solid #f1f5f9;font-size:13px}
.total{font-weight:900;font-size:16px;color:#28B54D}.header{border-bottom:2px solid #28B54D;padding-bottom:12px;margin-bottom:16px}
</style></head><body>
<div class="header"><h1>Reporte Diario de Caja</h1>
<p style="color:#64748b;font-size:13px">${new Date(dateStr+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p></div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
  <div style="background:#E6F7EB;border-radius:10px;padding:14px;text-align:center">
    <div style="font-size:11px;font-weight:900;color:#28B54D;text-transform:uppercase">Total Cobrado</div>
    <div style="font-size:22px;font-weight:900;color:#1a2340">RD$${total.toLocaleString('es-DO',{minimumFractionDigits:2})}</div>
  </div>
  <div style="background:#E8F2FF;border-radius:10px;padding:14px;text-align:center">
    <div style="font-size:11px;font-weight:900;color:#0B63C7;text-transform:uppercase">Transacciones</div>
    <div style="font-size:22px;font-weight:900;color:#1a2340">${(payments||[]).length}</div>
  </div>
  <div style="background:#FFF0E0;border-radius:10px;padding:14px;text-align:center">
    <div style="font-size:11px;font-weight:900;color:#D96500;text-transform:uppercase">Métodos</div>
    <div style="font-size:13px;font-weight:700;color:#1a2340">${Object.entries(byMethod).map(([m,v])=>`${m}: RD$${Number(v).toLocaleString('es-DO',{minimumFractionDigits:2})}`).join('<br>')}</div>
  </div>
</div>
<table><thead><tr><th>Estudiante</th><th>Concepto</th><th>Método</th><th>Hora</th><th style="text-align:right">Monto</th></tr></thead>
<tbody>${(payments||[]).map(p=>`<tr>
  <td>${Helpers.escapeHTML(p.students?.name||'—')}</td>
  <td>${Helpers.escapeHTML(p.concept||'—')}</td>
  <td>${p.method||'—'}</td>
  <td>${p.paid_date?fmtTime(p.paid_date):'—'}</td>
  <td style="text-align:right;font-weight:700">RD$${Number(p.amount).toLocaleString('es-DO',{minimumFractionDigits:2})}</td>
</tr>`).join('')}
<tr><td colspan="4" style="font-weight:900;text-transform:uppercase;background:#f8fafc">Total</td>
<td style="text-align:right;font-weight:900;color:#28B54D;background:#f8fafc">RD$${total.toLocaleString('es-DO',{minimumFractionDigits:2})}</td></tr>
</tbody></table>
<p style="text-align:center;margin-top:24px;font-size:11px;color:#94a3b8">Generado: ${new Date().toLocaleString('es-DO')} — Colegio Montessori Sonrisas Creativas</p>
<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
</body></html>`;

    const win=window.open('','_blank','width=800,height=900');
    if(!win){alert('Permite ventanas emergentes');return;}
    win.document.write(html);win.document.close();
  },
};
