/**
 * Caja Cobro v2 — Panel Directora y Asistente
 * Flujo: Lista de pendientes → Clic Cobrar → Modal grande → Carrito → Pago → Factura
 */
import { supabase } from './supabase.js';
import { Helpers } from '../directora/helpers.js';
import { InvoiceModule } from './invoice.js';

const fmt  = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const today = () => new Date().toISOString().split('T')[0];

function calcMoraClient(dueDate) {
  if (!dueDate) return 0;
  const due = new Date(dueDate + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  const days = Math.floor((now - due) / 86400000);
  if (days <= 0) return 0;
  return (Math.floor(days / 7) * 500) + ((days % 7) * 50);
}

// ── CONCEPTOS ADICIONALES (catálogo) ─────────────────────────────────────────
const EXTRA_CONCEPTS = [
  { id:'uniforme',    label:'Uniforme',     amount:3200  },
  { id:'transporte',  label:'Transporte',   amount:2500  },
  { id:'libros',      label:'Libros',       amount:1500  },
  { id:'materiales',  label:'Materiales',   amount:800   },
  { id:'actividades', label:'Actividades',  amount:500   },
  { id:'excursiones', label:'Excursiones',  amount:1000  },
  { id:'comedor',     label:'Comedor',      amount:1800  },
  { id:'tutorias',    label:'Tutorías',     amount:1200  },
  { id:'certificados',label:'Certificados', amount:300   },
  { id:'otro',        label:'Otro',         amount:0     },
];

const MONTHS = ['Ago','Sep','Oct','Nov','Dic','Ene','Feb','Mar','Abr','May','Jun'];

// Estado del módulo
let _cart      = [];
let _mora      = 0;
let _student   = null;
let _charges   = [];
let _containerId = 'cajaContainer';

export function initCajaCobro(containerId = 'cajaContainer') {
  _containerId = containerId;
  renderCajaMain();
}

// ── PANTALLA PRINCIPAL ────────────────────────────────────────────────────────
async function renderCajaMain() {
  const el = document.getElementById(_containerId);
  if (!el) return;

  el.innerHTML = `
  <style>
    .caja-row { display:grid; grid-template-columns:40px 1fr 120px 120px 90px 100px; gap:0; align-items:center; }
    .caja-row:hover { background:#f8fafc; }
    .status-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
    .caja-badge { padding:3px 10px; border-radius:50px; font-size:.68rem; font-weight:900; text-transform:uppercase; letter-spacing:.06em; }
    .caja-search { display:flex; align-items:center; gap:10px; padding:14px 18px; background:white; border-radius:16px; border:1px solid #f1f5f9; box-shadow:0 2px 8px rgba(0,0,0,.04); margin-bottom:16px; }
    .caja-search input { flex:1; border:none; outline:none; font-size:.9rem; font-weight:600; color:#1a2340; background:transparent; }
    .caja-filter-bar { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
    .caja-filter-btn { padding:6px 14px; border-radius:10px; border:2px solid #f1f5f9; background:white; font-size:.7rem; font-weight:900; cursor:pointer; transition:all .15s; text-transform:uppercase; letter-spacing:.06em; color:#64748b; }
    .caja-filter-btn.on { border-color:#0D9488; background:#f0fdfa; color:#0D9488; }
  </style>

  <!-- KPIs del día -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px" id="cajaKPIs">
    <div style="background:white;border-radius:16px;padding:14px 16px;border:1px solid #f1f5f9;box-shadow:0 2px 8px rgba(0,0,0,.04)">
      <div style="font-size:.68rem;font-weight:900;color:#28B54D;text-transform:uppercase;letter-spacing:.1em">Cobrado Hoy</div>
      <div style="font-size:1.4rem;font-weight:900;color:#1a2340;margin-top:4px" id="kpiCajaCobrado">RD$0.00</div>
    </div>
    <div style="background:white;border-radius:16px;padding:14px 16px;border:1px solid #f1f5f9;box-shadow:0 2px 8px rgba(0,0,0,.04)">
      <div style="font-size:.68rem;font-weight:900;color:#FF8A00;text-transform:uppercase;letter-spacing:.1em">Pendientes</div>
      <div style="font-size:1.4rem;font-weight:900;color:#1a2340;margin-top:4px" id="kpiCajaPendientes">0</div>
    </div>
    <div style="background:white;border-radius:16px;padding:14px 16px;border:1px solid #f1f5f9;box-shadow:0 2px 8px rgba(0,0,0,.04)">
      <div style="font-size:.68rem;font-weight:900;color:#EF4444;text-transform:uppercase;letter-spacing:.1em">Vencidos</div>
      <div style="font-size:1.4rem;font-weight:900;color:#1a2340;margin-top:4px" id="kpiCajaVencidos">0</div>
    </div>
    <div style="background:white;border-radius:16px;padding:14px 16px;border:1px solid #f1f5f9;box-shadow:0 2px 8px rgba(0,0,0,.04)">
      <div style="font-size:.68rem;font-weight:900;color:#8B5CF6;text-transform:uppercase;letter-spacing:.1em">Transferencias pend.</div>
      <div style="font-size:1.4rem;font-weight:900;color:#1a2340;margin-top:4px" id="kpiCajaTransfer">0</div>
    </div>
  </div>

  <!-- Buscador -->
  <div class="caja-search">
    <i data-lucide="search" style="width:18px;height:18px;color:#94a3b8;flex-shrink:0"></i>
    <input id="cajaMainSearch" placeholder="Buscar estudiante por nombre, matrícula o teléfono..."
      oninput="CajaCobroV2.filterTable(this.value)">
    <button onclick="CajaCobroV2.reload()" style="padding:6px 14px;border-radius:10px;border:none;background:#f1f5f9;color:#64748b;font-size:.75rem;font-weight:900;cursor:pointer">↻ Actualizar</button>
  </div>

  <!-- Filtros rápidos -->
  <div class="caja-filter-bar">
    <button class="caja-filter-btn on" data-filter="all" onclick="CajaCobroV2.setFilter('all',this)">Todos</button>
    <button class="caja-filter-btn" data-filter="overdue" onclick="CajaCobroV2.setFilter('overdue',this)">🔴 Vencidos</button>
    <button class="caja-filter-btn" data-filter="pending" onclick="CajaCobroV2.setFilter('pending',this)">🟡 Pendientes</button>
    <button class="caja-filter-btn" data-filter="review" onclick="CajaCobroV2.setFilter('review',this)">🔵 En revisión</button>
    <button class="caja-filter-btn" data-filter="paid" onclick="CajaCobroV2.setFilter('paid',this)">🟢 Al día</button>
  </div>

  <!-- Tabla de estudiantes -->
  <div style="background:white;border-radius:16px;border:1px solid #f1f5f9;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.04)">
    <div style="padding:12px 18px;border-bottom:1px solid #f8fafc;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:.8rem;font-weight:900;color:#64748b;text-transform:uppercase;letter-spacing:.08em">
        Estudiantes — <span id="cajaStudentCount" style="color:#0D9488">Cargando...</span>
      </span>
      <button onclick="CajaCobroV2.openPendingTransfers()"
        style="padding:6px 14px;border-radius:10px;border:2px solid #8B5CF6;background:#F3E8FF;color:#7C3AED;font-size:.7rem;font-weight:900;cursor:pointer;display:flex;align-items:center;gap:6px">
        <i data-lucide="clock" style="width:14px;height:14px"></i> Transferencias pendientes
      </button>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;min-width:700px;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:10px 16px;text-align:left;font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;width:36px"></th>
            <th style="padding:10px 16px;text-align:left;font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Estudiante</th>
            <th style="padding:10px 16px;text-align:left;font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Curso</th>
            <th style="padding:10px 16px;text-align:right;font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Debe</th>
            <th style="padding:10px 16px;text-align:center;font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Vence</th>
            <th style="padding:10px 16px;text-align:center;font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Acción</th>
          </tr>
        </thead>
        <tbody id="cajaStudentTable">
          <tr><td colspan="6" style="text-align:center;padding:32px;color:#94a3b8;font-size:.875rem">Cargando...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  `;

  if (window.lucide) lucide.createIcons();
  await CajaCobroV2.loadStudents();
}

// ── MÓDULO EXPORTADO ──────────────────────────────────────────────────────────
export const CajaCobroV2 = {
  _allStudents: [],
  _filter: 'all',

  async loadStudents() {
    const tbody = document.getElementById('cajaStudentTable');
    const countEl = document.getElementById('cajaStudentCount');
    if (!tbody) return;

    // KPIs del día
    const todayStr = today();
    const { data: todayPays } = await supabase.from('payments')
      .select('amount,method,status').eq('status','paid')
      .gte('paid_date', todayStr+'T00:00:00').lte('paid_date', todayStr+'T23:59:59').limit(500);

    const cobrado = (todayPays||[]).reduce((s,p)=>s+Number(p.amount||0),0);
    const setKpi = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    setKpi('kpiCajaCobrado', fmt(cobrado));

    // Cargar estudiantes con deudas
    const { data: students } = await supabase.from('students')
      .select('id,name,matricula,classroom_id,classrooms:classroom_id(name,level),monthly_fee,p1_name,p1_phone')
      .eq('is_active',true).is('deleted_at',null).order('name').limit(500);

    // Cargar pagos pendientes/vencidos
    const { data: pendingPays } = await supabase.from('payments')
      .select('student_id,amount,status,due_date,month_paid')
      .in('status',['pending','overdue','review']).limit(2000);

    // Cargar transferencias pendientes de aprobación (en revisión)
    const transferCount = (pendingPays||[]).filter(p=>p.status==='review').length;
    setKpi('kpiCajaTransfer', String(transferCount));

    const byStudent = {};
    (pendingPays||[]).forEach(p => {
      if (!byStudent[p.student_id]) byStudent[p.student_id] = { balance:0, overdue:0, pending:0, review:0, nextDue:null };
      byStudent[p.student_id].balance += Number(p.amount||0);
      if (p.status==='overdue') byStudent[p.student_id].overdue++;
      if (p.status==='pending') byStudent[p.student_id].pending++;
      if (p.status==='review')  byStudent[p.student_id].review++;
      const due = p.due_date;
      if (due && (!byStudent[p.student_id].nextDue || due < byStudent[p.student_id].nextDue)) {
        byStudent[p.student_id].nextDue = due;
      }
    });

    const allStudents = (students||[]).map(s => ({
      ...s, ...byStudent[s.id],
      balance: byStudent[s.id]?.balance || 0,
      status: byStudent[s.id]?.overdue > 0 ? 'overdue' : byStudent[s.id]?.review > 0 ? 'review' : byStudent[s.id]?.pending > 0 ? 'pending' : 'paid'
    }));

    this._allStudents = allStudents;

    const vencidosCount = allStudents.filter(s=>s.status==='overdue').length;
    const pendientesCount = allStudents.filter(s=>['pending','review'].includes(s.status)).length;
    setKpi('kpiCajaPendientes', String(pendientesCount));
    setKpi('kpiCajaVencidos', String(vencidosCount));

    this.renderTable(allStudents);
    if (countEl) countEl.textContent = allStudents.length + ' estudiantes';
    if (window.lucide) lucide.createIcons();
  },

  renderTable(list) {
    const tbody = document.getElementById('cajaStudentTable');
    if (!tbody) return;

    const filtered = this._filter === 'all' ? list : list.filter(s => s.status === this._filter);

    const countEl = document.getElementById('cajaStudentCount');
    if (countEl) countEl.textContent = filtered.length + ' estudiantes';

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:#94a3b8;font-size:.875rem">Sin resultados para este filtro</td></tr>`;
      return;
    }

    const today = new Date(); today.setHours(0,0,0,0);

    tbody.innerHTML = filtered.map(s => {
      const dotColor = s.status==='overdue'?'#EF4444':s.status==='review'?'#8B5CF6':s.status==='pending'?'#F59E0B':'#28B54D';
      const badgeCls = s.status==='overdue'?'background:#FEF2F2;color:#EF4444':s.status==='review'?'background:#F3E8FF;color:#7C3AED':s.status==='pending'?'background:#FFFBEB;color:#D97706':'background:#F0FDF4;color:#16A34A';
      const badgeLabel = s.status==='overdue'?'Vencido':s.status==='review'?'En revisión':s.status==='pending'?'Pendiente':'Al día';
      const dueLabel = s.nextDue ? new Date(s.nextDue+'T00:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short'}) : '—';
      const isToday = s.nextDue === today.toISOString().split('T')[0];
      const isSoon  = s.nextDue && (new Date(s.nextDue+'T00:00:00')-today)/86400000 <= 3;

      return `<tr style="border-bottom:1px solid #f8fafc;transition:background .12s;cursor:pointer" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
        <td style="padding:12px 16px;text-align:center">
          <span class="status-dot" style="background:${dotColor}"></span>
        </td>
        <td style="padding:12px 16px">
          <div style="font-weight:800;color:#1a2340;font-size:.875rem">${Helpers.escapeHTML(s.name)}</div>
          <div style="font-size:.7rem;color:#94a3b8;margin-top:1px">${s.matricula||''} · ${s.p1_name||''}</div>
        </td>
        <td style="padding:12px 16px;font-size:.8rem;color:#64748b;font-weight:600">${s.classrooms?.name||'—'}</td>
        <td style="padding:12px 16px;text-align:right">
          ${s.balance>0 ? `<span style="font-weight:900;font-size:.9rem;color:${dotColor}">${fmt(s.balance)}</span>` : `<span style="color:#94a3b8;font-size:.8rem">Sin deuda</span>`}
        </td>
        <td style="padding:12px 16px;text-align:center">
          ${s.nextDue ? `<span style="font-size:.75rem;font-weight:800;color:${isToday?'#EF4444':isSoon?'#D97706':'#64748b'}">${isToday?'Hoy':dueLabel}</span>` : '—'}
        </td>
        <td style="padding:12px 16px;text-align:center">
          ${s.status !== 'paid'
            ? `<button onclick="CajaCobroV2.openCobrarModal(${s.id})" style="padding:7px 18px;border-radius:10px;border:none;background:#0D9488;color:white;font-size:.72rem;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.06em;transition:all .15s" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
                Cobrar
              </button>`
            : `<button onclick="CajaCobroV2.openCobrarModal(${s.id})" style="padding:7px 18px;border-radius:10px;border:2px solid #e2e8f0;background:white;color:#64748b;font-size:.72rem;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.06em">
                Ver
              </button>`}
        </td>
      </tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  },

  filterTable(q) {
    if (!q) { this.renderTable(this._allStudents); return; }
    const s = q.toLowerCase();
    this.renderTable(this._allStudents.filter(st =>
      (st.name||'').toLowerCase().includes(s) ||
      (st.matricula||'').toLowerCase().includes(s) ||
      (st.p1_phone||'').includes(s) ||
      (st.p1_name||'').toLowerCase().includes(s)
    ));
  },

  setFilter(filter, btn) {
    this._filter = filter;
    document.querySelectorAll('.caja-filter-btn').forEach(b => b.classList.remove('on'));
    btn?.classList.add('on');
    this.renderTable(this._allStudents);
  },

  reload() { this.loadStudents(); },
};

            <div style="display:flex;justify-content:space-between;font-size:.8rem;color:#EF4444;margin-bottom:6px" id="cartMoraRow" class="hidden">
              <span>⚠ Mora</span><span id="cartMora" style="font-weight:800">+RD$0.00</span>
            </div>
            <div style="border-top:2px solid #f1f5f9;margin:8px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:900;color:#0D9488">
              <span>TOTAL</span><span id="cartTotal">RD$0.00</span>
            </div>
          </div>
        </div>

        <!-- COL 3: Método de pago -->
        <div style="padding:20px;background:white;display:flex;flex-direction:column;gap:12px">
          <div style="font-size:.7rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em">Método de pago</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="methodGrid">
            ${[['efectivo','💵 Efectivo'],['tarjeta','💳 Tarjeta'],['transferencia','🏦 Transferencia'],['cheque','📝 Cheque'],['mixto','🔀 Mixto']].map(([v,l])=>`
            <button onclick="CajaCobroV2.selectMethod('${v}',this)"
              style="padding:12px 8px;border-radius:12px;border:2px solid #f1f5f9;background:#f8fafc;font-size:.75rem;font-weight:800;cursor:pointer;transition:all .15s;text-align:center"
              data-method="${v}">${l}</button>`).join('')}
          </div>

          <!-- Detalle del método -->
          <div id="methodDetail" style="display:none;flex-direction:column;gap:8px"></div>

          <!-- NCF opcional -->
          <details style="border:1px solid #f1f5f9;border-radius:12px;overflow:hidden">
            <summary style="padding:10px 14px;font-size:.72rem;font-weight:900;color:#64748b;text-transform:uppercase;cursor:pointer;background:#f8fafc">¿Requiere NCF/Comprobante fiscal?</summary>
            <div style="padding:12px 14px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div>
                <label style="font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:4px">Razón social</label>
                <input id="ncfName" type="text" style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.8rem;font-weight:600;outline:none" placeholder="Nombre / empresa">
              </div>
              <div>
                <label style="font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:4px">RNC / Cédula</label>
                <input id="ncfRNC" type="text" style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.8rem;font-weight:600;outline:none" placeholder="1-01-00001-6">
              </div>
            </div>
          </details>

          <!-- Historial reciente -->
          ${(history||[]).length ? `
          <div style="margin-top:4px">
            <div style="font-size:.65rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Último historial</div>
            ${(history||[]).map(h=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f8fafc;font-size:.75rem">
              <span style="color:#64748b;font-weight:600">${h.paid_date?new Date(h.paid_date).toLocaleDateString('es-ES',{day:'2-digit',month:'short'}):'—'}</span>
              <span style="font-weight:700;color:#0D9488">${fmt(h.amount)}</span>
              <span style="color:#94a3b8;text-transform:capitalize">${h.method||'—'}</span>
            </div>`).join('')}
          </div>` : ''}

          <!-- Botón confirmar -->
          <button id="btnConfirmarCobro" onclick="CajaCobroV2.confirmCobro()"
            style="margin-top:auto;width:100%;padding:16px;border-radius:14px;border:none;background:linear-gradient(135deg,#0D9488,#0F766E);color:white;font-size:.9rem;font-weight:900;cursor:pointer;box-shadow:0 4px 16px rgba(13,148,136,.3);transition:all .18s;letter-spacing:.02em;opacity:.5;pointer-events:none"
            disabled>
            ✓ Cobrar y Emitir Factura
          </button>
        </div>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
};
