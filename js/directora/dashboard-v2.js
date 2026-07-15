/**
 * Dashboard v2 — Centro de Control Estratégico
 * Indicadores en tiempo real, gráficos, alertas, cumpleaños, eventos
 */
import { supabase } from '../shared/supabase.js';
import { AppState } from './state.js';

const fmt = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const today = () => new Date().toISOString().split('T')[0];

let _charts = {};

export async function renderDashboardV2(data) {
  const container = document.getElementById('dashboardContainer');
  if (!container) return;

  // Gather all data in parallel
  const now = new Date();
  const todayStr = today();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const [
    studentsRes, teachersRes, attendanceRes,
    paymentsRes, pendingRes, messagesRes,
    cycleRes
  ] = await Promise.allSettled([
    supabase.from('students').select('id,is_active,name').limit(2000),
    supabase.from('profiles').select('id,role').in('role',['maestra','asistente','admin']).limit(200),
    supabase.from('attendance').select('status').eq('date',todayStr).limit(1000),
    supabase.from('payments').select('amount,method').eq('status','paid').gte('paid_date',todayStr+'T00:00:00').lte('paid_date',todayStr+'T23:59:59').limit(500),
    supabase.from('payments').select('amount').in('status',['pending','overdue']).limit(2000),
    supabase.from('messages').select('id',{count:'exact',head:true}).eq('is_read',false),
    supabase.from('school_years').select('name,is_current').order('start_date',{ascending:false}).limit(5),
  ]);

  const safe = r => r.status==='fulfilled' ? r.value : {data:[],count:0};
  const students   = safe(studentsRes).data||[];
  const teachers   = safe(teachersRes).data||[];
  const attendance = safe(attendanceRes).data||[];
  const todayPay   = safe(paymentsRes).data||[];
  const pending    = safe(pendingRes).data||[];
  const unread     = safe(messagesRes).count||0;
  
  // Filtrar cumpleaños del día (ahora usando solo la tabla students y campos que existan)
  const currentMonth = String(now.getMonth()+1).padStart(2,'0');
  const currentDay = String(now.getDate()).padStart(2,'0');
  const birthdays = []; // Por ahora, si no hay campo birth_date en students, dejamos vacío
  
  const cycles     = safe(cycleRes).data||[];

  const totalStu   = students.length;
  const activeStu  = students.filter(s=>s.is_active).length;
  const present    = attendance.filter(a=>['present','late'].includes(a.status?.toLowerCase())).length;
  const absent     = attendance.filter(a=>a.status?.toLowerCase()==='absent').length;
  const todayIncome= todayPay.reduce((s,p)=>s+Number(p.amount||0),0);
  const pendingAmt = pending.reduce((s,p)=>s+Number(p.amount||0),0);
  const currentCycle = cycles.find(c=>c.is_current)?.name || cycles[0]?.name || '—';

  // Monthly income chart data
  const yr = String(now.getFullYear());
  const { data: monthlyPays } = await supabase.from('payments')
    .select('amount,paid_date').eq('status','paid')
    .gte('paid_date',yr+'-01-01T00:00:00').lte('paid_date',yr+'-12-31T23:59:59').limit(3000);
  const monthly = new Array(12).fill(0);
  (monthlyPays||[]).forEach(p=>{ const m=new Date(p.paid_date).getMonth(); monthly[m]+=Number(p.amount||0); });

  container.innerHTML = `
  <style>
    .kpi2{background:white;border-radius:20px;padding:16px 20px;border:1px solid #f1f5f9;box-shadow:0 2px 12px rgba(0,0,0,.04);position:relative;overflow:hidden;transition:transform .2s,box-shadow .2s}
    .kpi2:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.08)}
    .kpi2 .kpi-val{font-size:1.6rem;font-weight:900;line-height:1.1;color:#1a2340}
    .kpi2 .kpi-lbl{font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-top:2px}
    .kpi2 .kpi-icon{position:absolute;right:12px;top:12px;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center}
    .kpi2 .kpi-sub{font-size:.72rem;font-weight:700;color:#64748b;margin-top:6px}
    .kpi2 .kpi-bar{height:3px;border-radius:2px;margin-top:10px;background:#f1f5f9}
    .kpi2 .kpi-bar-fill{height:100%;border-radius:2px;transition:width .5s}
    .dash-section-title{font-size:.7rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.15em;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .dash-section-title::after{content:'';flex:1;height:1px;background:#f1f5f9}
    .alert-chip{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;font-size:.8rem;font-weight:700}
    .bday-chip{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#FFF3E0;border:1px solid #FFE0B2;border-radius:12px;font-size:.8rem;font-weight:700;color:#E65100}
  </style>

  <!-- ENCABEZADO DEL CICLO ACTIVO -->
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h2 class="text-2xl font-black text-slate-800">Centro de Control</h2>
      <p class="text-sm text-slate-400 font-bold">Ciclo activo: <span class="text-emerald-600">${currentCycle}</span> · ${now.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}</p>
    </div>
    <div class="flex gap-2 flex-wrap">
      <button onclick="App.navigation?.goTo?.('caja')" class="px-4 py-2 text-white text-xs font-black uppercase rounded-xl shadow-md transition-all hover:opacity-90 active:scale-95" style="background:#0B63C7">+ Registrar Cobro</button>
      <button onclick="App.navigation?.goTo?.('ciclo-escolar')" class="px-4 py-2 text-white text-xs font-black uppercase rounded-xl shadow-md transition-all hover:opacity-90 active:scale-95" style="background:#0850A0">Ciclo Escolar</button>
    </div>
  </div>

  <!-- ALERTAS / CUMPLEAÑOS -->
  ${birthdays.length ? `
  <div class="flex flex-wrap gap-2">
    <span class="text-xs font-black text-amber-600 uppercase tracking-wider self-center">🎂 Hoy:</span>
    ${birthdays.map(b=>`<span class="bday-chip">🎂 ${b.name.split(' ')[0]}</span>`).join('')}
  </div>` : ''}

  <!-- KPIs FILA 1: Estudiantes y Personal -->
  <div>
    <div class="dash-section-title"><i data-lucide="users" class="w-3.5 h-3.5"></i> Estudiantes y Personal</div>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <div class="kpi2">
        <div class="kpi-icon" style="background:#ecfdf5"><i data-lucide="users" class="w-4 h-4" style="color:#047857"></i></div>
        <div class="kpi-val">${totalStu}</div>
        <div class="kpi-lbl">Total Alumnos</div>
        <div class="kpi-bar"><div class="kpi-bar-fill" style="width:100%;background:#047857"></div></div>
      </div>
      <div class="kpi2">
        <div class="kpi-icon" style="background:#ecfdf5"><i data-lucide="user-check" class="w-4 h-4" style="color:#047857"></i></div>
        <div class="kpi-val">${activeStu}</div>
        <div class="kpi-lbl">Activos</div>
        <div class="kpi-sub">${totalStu>0?Math.round(activeStu/totalStu*100):0}% del total</div>
      </div>
      <div class="kpi2">
        <div class="kpi-icon" style="background:#ecfdf5"><i data-lucide="graduation-cap" class="w-4 h-4" style="color:#047857"></i></div>
        <div class="kpi-val">${teachers.filter(t=>t.role==='maestra').length}</div>
        <div class="kpi-lbl">Docentes</div>
      </div>
      <div class="kpi2">
        <div class="kpi-icon" style="background:#FFF3E0"><i data-lucide="clipboard-list" class="w-4 h-4" style="color:#d97706"></i></div>
        <div class="kpi-val">${teachers.filter(t=>t.role==='asistente').length}</div>
        <div class="kpi-lbl">Asistentes</div>
      </div>
      <div class="kpi2">
        <div class="kpi-icon" style="background:#ecfdf5"><i data-lucide="calendar-check" class="w-4 h-4" style="color:#047857"></i></div>
        <div class="kpi-val">${present}</div>
        <div class="kpi-lbl">Presentes Hoy</div>
        <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${activeStu>0?Math.round(present/activeStu*100):0}%;background:#047857"></div></div>
      </div>
      <div class="kpi2">
        <div class="kpi-icon" style="background:#FEE2E2"><i data-lucide="user-x" class="w-4 h-4" style="color:#EF4444"></i></div>
        <div class="kpi-val">${absent}</div>
        <div class="kpi-lbl">Ausentes Hoy</div>
      </div>
    </div>
  </div>

  <!-- KPIs FILA 2: Finanzas -->
  <div>
    <div class="dash-section-title"><i data-lucide="banknote" class="w-3.5 h-3.5"></i> Finanzas del Día</div>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div class="kpi2" style="border-left:3px solid #047857">
        <div class="kpi-icon" style="background:#ecfdf5"><i data-lucide="trending-up" class="w-4 h-4" style="color:#047857"></i></div>
        <div class="kpi-val" style="color:#047857">${fmt(todayIncome)}</div>
        <div class="kpi-lbl">Cobrado Hoy</div>
        <div class="kpi-sub">${todayPay.length} transacciones</div>
      </div>
      <div class="kpi2" style="border-left:3px solid #d97706">
        <div class="kpi-icon" style="background:#FFF3E0"><i data-lucide="clock" class="w-4 h-4" style="color:#d97706"></i></div>
        <div class="kpi-val" style="color:#d97706">${fmt(pendingAmt)}</div>
        <div class="kpi-lbl">Por Cobrar</div>
        <div class="kpi-sub">${pending.length} cuotas</div>
      </div>
      <div class="kpi2">
        <div class="kpi-icon" style="background:#ecfdf5"><i data-lucide="wallet" class="w-4 h-4" style="color:#047857"></i></div>
        <div class="kpi-val">${fmt(monthly[now.getMonth()])}</div>
        <div class="kpi-lbl">Ingresos del Mes</div>
      </div>
      <div class="kpi2" style="border-left:3px solid #8B5CF6;cursor:pointer" onclick="App.navigation?.goTo?.('comunicacion')">
        <div class="kpi-icon" style="background:#F3E8FF"><i data-lucide="message-circle" class="w-4 h-4" style="color:#8B5CF6"></i></div>
        <div class="kpi-val" style="color:#8B5CF6">${unread}</div>
        <div class="kpi-lbl">Mensajes Sin Leer</div>
      </div>
      <div class="kpi2">
        <div class="kpi-icon" style="background:#ecfdf5"><i data-lucide="receipt" class="w-4 h-4" style="color:#047857"></i></div>
        <div class="kpi-val">${todayPay.length}</div>
        <div class="kpi-lbl">Facturas Hoy</div>
      </div>
    </div>
  </div>

  <!-- GRÁFICOS -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-black text-slate-700 text-sm">Ingresos Mensuales ${yr}</h3>
        <span class="text-xs text-slate-400 font-bold uppercase">RD$</span>
      </div>
      <div style="height:200px"><canvas id="dashIncomeChart"></canvas></div>
    </div>
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-black text-slate-700 text-sm">Asistencia Esta Semana</h3>
      </div>
      <div style="height:200px"><canvas id="dashAttendanceChart"></canvas></div>
    </div>
  </div>

  `;

  if (window.lucide) lucide.createIcons();

  // Render income chart
  _renderChart('dashIncomeChart', {
    type:'bar',
    labels:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
    data: monthly,
    color: '#28B54D',
    label: 'Ingresos RD$'
  });

  // Render attendance chart (last 7 days)
  await _renderAttendanceChart();
}

function _renderChart(canvasId, opts) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;
  if (_charts[canvasId]) _charts[canvasId].destroy();
  _charts[canvasId] = new Chart(canvas, {
    type: opts.type||'bar',
    data: {
      labels: opts.labels,
      datasets:[{
        label: opts.label||'',
        data: opts.data,
        backgroundColor: opts.color+'99',
        borderColor: opts.color,
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        y:{beginAtZero:true,grid:{color:'rgba(0,0,0,.04)'},ticks:{maxTicksLimit:5}},
        x:{grid:{display:false}}
      }
    }
  });
}

async function _renderAttendanceChart() {
  const days = [];
  const present = [];
  const absent  = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = d.toISOString().split('T')[0];
    days.push(d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric'}));
    const { data } = await supabase.from('attendance').select('status').eq('date',ds).limit(500);
    present.push((data||[]).filter(a=>['present','late'].includes(a.status?.toLowerCase())).length);
    absent.push((data||[]).filter(a=>a.status?.toLowerCase()==='absent').length);
  }
  const canvas = document.getElementById('dashAttendanceChart');
  if (!canvas || !window.Chart) return;
  if (_charts['dashAttendanceChart']) _charts['dashAttendanceChart'].destroy();
  _charts['dashAttendanceChart'] = new Chart(canvas, {
    type:'line',
    data:{
      labels:days,
      datasets:[
        {label:'Presentes',data:present,borderColor:'#28B54D',backgroundColor:'rgba(40,181,77,.1)',fill:true,borderWidth:2,tension:.4,pointRadius:4},
        {label:'Ausentes', data:absent, borderColor:'#EF4444',backgroundColor:'rgba(239,68,68,.1)',fill:true,borderWidth:2,tension:.4,pointRadius:4},
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'bottom',labels:{font:{size:11,weight:'bold'},usePointStyle:true}}},
      scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,.04)'}},x:{grid:{display:false}}}
    }
  });
}
