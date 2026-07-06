/**
 * Cuentas por Cobrar — Directora
 * Deudores, antigüedad de saldos, recordatorios automáticos
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { InvoiceModule } from '../shared/invoice.js';

const $el = id => document.getElementById(id);
const fmt = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});

export const CuentasCobrarModule = {
  _data: [],

  async init() {
    await this.load();
    $el('btnCCExport')?.addEventListener('click', () => this.exportDeudores());
    $el('btnCCRemind')?.addEventListener('click', () => this.sendReminders());
  },

  async load() {
    const tbody = $el('ccTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">Cargando...</td></tr>';

    // Obtener pagos pendientes/vencidos agrupados por estudiante
    const { data: pending } = await supabase
      .from('v_payments_with_mora')
      .select('student_id,student_name,classroom_name,mora_amount,total_due,amount,due_date,status,month_paid')
      .in('status',['pending','overdue'])
      .is('deleted_at',null)
      .order('due_date',{ascending:true})
      .limit(500);

    // Agrupar por estudiante
    const map = new Map();
    (pending||[]).forEach(p => {
      if (!map.has(p.student_id)) {
        map.set(p.student_id, {
          student_id: p.student_id,
          name: p.student_name||'—',
          aula: p.classroom_name||'—',
          balance: 0,
          mora: 0,
          oldest_due: p.due_date,
          count: 0,
        });
      }
      const e = map.get(p.student_id);
      e.balance += Number(p.amount||0);
      e.mora    += Number(p.mora_amount||0);
      e.count   += 1;
      if (p.due_date && p.due_date < e.oldest_due) e.oldest_due = p.due_date;
    });

    this._data = Array.from(map.values()).sort((a,b) => b.balance - a.balance);
    this._renderKPIs();
    this.renderTable(this._data);
  },

  _renderKPIs() {
    const totalDeuda  = this._data.reduce((s,d)=>s+d.balance,0);
    const totalMora   = this._data.reduce((s,d)=>s+d.mora,0);
    const today       = new Date(); today.setHours(0,0,0,0);
    const vencido30   = this._data.filter(d => {
      const dt = d.oldest_due ? new Date(d.oldest_due+'T00:00:00') : null;
      return dt && (today-dt)/86400000 > 30;
    }).reduce((s,d)=>s+d.balance,0);

    const set = (id,v) => { const e=$el(id); if(e) e.textContent=v; };
    set('ccTotalDeuda', fmt(totalDeuda));
    set('ccDeudores',   String(this._data.length));
    set('ccVencido30',  fmt(vencido30));
    set('ccMoraTotal',  fmt(totalMora));
  },

  renderTable(list) {
    const tbody = $el('ccTableBody');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-green-600 font-bold text-sm">✅ Sin deudores pendientes</td></tr>';
      return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    tbody.innerHTML = list.map(d => {
      const daysOverdue = d.oldest_due ? Math.max(0,Math.floor((today-new Date(d.oldest_due+'T00:00:00'))/86400000)) : 0;
      const ageCls = daysOverdue > 60 ? 'text-red-700 bg-red-50'
                   : daysOverdue > 30 ? 'text-orange-700 bg-orange-50'
                   : daysOverdue > 0  ? 'text-amber-700 bg-amber-50'
                   : 'text-slate-600 bg-slate-50';
      return `<tr class="hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3">
          <div class="font-bold text-slate-800">${Helpers.escapeHTML(d.name)}</div>
          <div class="text-[10px] text-slate-400 uppercase">${d.aula} · ${d.count} cuota(s)</div>
        </td>
        <td class="px-4 py-3 text-xs text-slate-600">${d.oldest_due||'—'}</td>
        <td class="px-4 py-3 text-right font-black text-red-700">${fmt(d.balance)}</td>
        <td class="px-4 py-3 text-right font-bold text-orange-600">${d.mora>0?fmt(d.mora):'—'}</td>
        <td class="px-4 py-3 text-center">
          <span class="text-[10px] font-black px-2 py-1 rounded-full ${ageCls}">${daysOverdue>0?daysOverdue+' días':'Al día'}</span>
        </td>
        <td class="px-4 py-3 text-center">
          <div class="flex justify-center gap-1.5">
            <button onclick="App.payments?.filterBy?.('overdue');App.navigation?.goTo?.('pagos')"
              class="px-3 py-1 text-[10px] font-black uppercase rounded-lg text-white" style="background:#0B63C7" title="Ver pagos">
              Ver
            </button>
            <button onclick="App.cuentasCobrar.remindStudent('${d.student_id}')"
              class="p-1.5 rounded-lg hover:bg-amber-50 hover:text-amber-600 transition-colors text-slate-400" title="Enviar recordatorio">
              <i data-lucide="bell" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  },

  applyFilter(val) {
    const today = new Date(); today.setHours(0,0,0,0);
    let filtered = this._data;
    if (val === 'overdue') {
      filtered = this._data.filter(d => {
        const dt = d.oldest_due ? new Date(d.oldest_due+'T00:00:00') : null;
        return dt && today > dt;
      });
    } else if (val === 'current') {
      filtered = this._data.filter(d => {
        const dt = d.oldest_due ? new Date(d.oldest_due+'T00:00:00') : null;
        return !dt || today <= dt;
      });
    } else if (val === 'mora') {
      filtered = this._data.filter(d => d.mora > 0);
    }
    this.renderTable(filtered);
  },

  async remindStudent(studentId) {
    const { data: stu } = await supabase.from('students')
      .select('name,p1_email,p1_phone,parent_id').eq('id',studentId).single();
    if (!stu) return;
    Helpers.toast(`Recordatorio enviado a ${stu.name}`,'info');
    // Notificación push si tiene parent_id
    if (stu.parent_id) {
      const { sendPush } = await import('../shared/supabase.js').catch(()=>({}));
      sendPush?.({
        user_id: stu.parent_id,
        title: 'Recordatorio de pago',
        message: `Tienes un saldo pendiente para ${stu.name}. Por favor regulariza tu cuenta.`,
        link: 'panel_padres.html'
      }).catch(()=>{});
    }
  },

  async sendReminders() {
    const pending = this._data.filter(d => d.balance > 0);
    if (!pending.length) { Helpers.toast('Sin deudores activos','info'); return; }
    let sent = 0;
    await Promise.allSettled(pending.map(async d => {
      await this.remindStudent(d.student_id);
      sent++;
    }));
    Helpers.toast(`${sent} recordatorios enviados`,'success');
  },

  exportDeudores() {
    if (!this._data.length) { Helpers.toast('Sin datos para exportar','info'); return; }
    const headers = ['Alumno','Aula','Saldo Pendiente','Mora','Días Vencido','Cuotas'];
    const today = new Date(); today.setHours(0,0,0,0);
    const rows = this._data.map(d => {
      const days = d.oldest_due ? Math.max(0,Math.floor((today-new Date(d.oldest_due+'T00:00:00'))/86400000)) : 0;
      return [d.name, d.aula, d.balance.toFixed(2), d.mora.toFixed(2), days, d.count];
    });
    const csv = [headers,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`deudores_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    Helpers.toast(`${this._data.length} deudores exportados`,'success');
  },
};

window.CuentasCobrarModule = CuentasCobrarModule;
