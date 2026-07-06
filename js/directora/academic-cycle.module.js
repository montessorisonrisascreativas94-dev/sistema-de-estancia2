/**
 * Academic Cycle Module — Directora
 * Pre-inscripciones, Inscripciones, Planes de Pago, Cargos, Reinscripciones
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

const $el = id => document.getElementById(id);
const fmtCurrency = n => 'RD$' + Number(n||0).toLocaleString('es-DO',{minimumFractionDigits:2});
const fmtDate = d => { if(!d) return '—'; return new Date((d+'').includes('T')?d:d+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}); };

const ST_COLOR = { preinscrito:'bg-slate-100 text-slate-600', admitido:'bg-blue-100 text-blue-700', inscrito:'bg-indigo-100 text-indigo-700', activo:'bg-green-100 text-green-700', retirado:'bg-red-100 text-red-600', reinscrito:'bg-teal-100 text-teal-700', graduado:'bg-purple-100 text-purple-700' };
const ST_LABEL = { preinscrito:'Pre-inscrito', admitido:'Admitido', inscrito:'Inscrito', activo:'Activo', retirado:'Retirado', reinscrito:'Reinscrito', graduado:'Graduado' };
const CH_COLOR = { pending:'bg-amber-100 text-amber-700', overdue:'bg-red-100 text-red-700', paid:'bg-green-100 text-green-700', cancelled:'bg-slate-100 text-slate-500', waived:'bg-purple-100 text-purple-600', partial_scholarship:'bg-blue-100 text-blue-600', full_scholarship:'bg-teal-100 text-teal-600' };
const CH_LABEL = { pending:'Pendiente', overdue:'Vencida', paid:'Pagada', cancelled:'Anulada', waived:'Exonerada', partial_scholarship:'Beca Parcial', full_scholarship:'Beca Total' };

export const AcademicCycleModule = {
  _currentYear: null,
  _years: [],
  _allPreinsc: [],

  async init() {
    await this._loadYears();
    this._renderShell();
    this.showTab('preregistrations');
  },

  async _loadYears() {
    const { data } = await supabase.from('school_years').select('*').order('start_date',{ascending:false}).limit(10);
    this._years = data || [];
    this._currentYear = this._years.find(y=>y.is_current) || this._years[0];
  },

  _renderShell() {
    const c = $el('academicCycleContainer');
    if (!c) return;
    const yr = this._currentYear;
    c.innerHTML = `<div class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-black text-slate-800">Ciclo Académico</h2>
          <p class="text-xs text-slate-400 font-bold uppercase tracking-wider">${yr?.name || 'Sin año activo'}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <select id="yearSelector" onchange="App.academic.switchYear(this.value)"
            class="border-2 border-slate-100 rounded-xl px-3 py-2 font-black text-sm text-slate-700 outline-none focus:border-blue-400">
            ${this._years.map(y=>`<option value="${y.id}"${y.id===yr?.id?' selected':''}>${y.name}${y.is_current?' ✓':''}</option>`).join('')}
          </select>
          <button onclick="App.academic.openNewYearModal()" class="px-3 py-2 text-white text-xs font-black uppercase rounded-xl hover:opacity-90" style="background:#28B54D">+ Año</button>
        </div>
      </div>
      <div class="flex gap-2 flex-wrap pb-3 border-b border-slate-100" id="academicTabs">
        ${[{id:'preregistrations',label:'Pre-inscripciones',icon:'📝'},{id:'enrollments',label:'Inscripciones',icon:'🎒'},{id:'plans',label:'Planes de Pago',icon:'💳'},{id:'charges',label:'Cargos',icon:'💰'},{id:'reenrollments',label:'Reinscripciones',icon:'🔄'}]
          .map(t=>`<button data-tab="${t.id}" onclick="App.academic.showTab('${t.id}')" class="acad-tab px-3 py-1.5 rounded-xl text-xs font-black uppercase border-2 border-transparent text-slate-500 hover:bg-slate-50">${t.icon} ${t.label}</button>`).join('')}
      </div>
      <div id="academicTabContent"></div>
    </div>`;
  },

  showTab(tab) {
    document.querySelectorAll('.acad-tab').forEach(b=>{
      const on = b.dataset.tab===tab;
      b.className=`acad-tab px-3 py-1.5 rounded-xl text-xs font-black uppercase border-2 ${on?'border-blue-500 bg-blue-50 text-blue-700':'border-transparent text-slate-500 hover:bg-slate-50'}`;
    });
    const c=$el('academicTabContent'); if(!c)return;
    c.innerHTML='<div class="animate-pulse h-32 bg-slate-100 rounded-2xl"></div>';
    ({preregistrations:()=>this.loadPreregistrations(), enrollments:()=>this.loadEnrollments(), plans:()=>this.loadPlans(), charges:()=>this.loadCharges(), reenrollments:()=>this.loadReenrollments()})[tab]?.();
  },

  async switchYear(id){ this._currentYear=this._years.find(y=>String(y.id)===String(id)); this.showTab('preregistrations'); },

  // ── PRE-INSCRIPCIONES ────────────────────────────────────────────────────
  async loadPreregistrations() {
    const {data} = await supabase.from('student_preregistrations').select('*').order('created_at',{ascending:false}).limit(200);
    const list = data||[]; this._allPreinsc=list;
    const cnt = s => list.filter(r=>r.status===s).length;
    const c=$el('academicTabContent'); if(!c)return;
    c.innerHTML=`<div class="space-y-4">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${[['Pendientes','pending','#FF8A00'],['Admitidos','admitted','#0B63C7'],['Rechazados','rejected','#EF4444'],['Convertidos','converted','#28B54D']]
          .map(([l,s,col])=>`<div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center cursor-pointer hover:shadow-md transition-all" onclick="App.academic._filterPreinsc('${s}')">
            <div class="text-2xl font-black" style="color:${col}">${cnt(s)}</div>
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">${l}</div>
          </div>`).join('')}
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <span class="text-sm font-black text-slate-700">Solicitudes</span>
          <div class="flex gap-2">
            <select id="preinscStatusFilter" onchange="App.academic._applyPreinscFilter()" class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-blue-400 bg-white">
              <option value="">Todos</option><option value="pending">Pendientes</option><option value="admitted">Admitidos</option><option value="converted">Convertidos</option><option value="rejected">Rechazados</option>
            </select>
            <input id="preinscSearch" type="text" placeholder="Buscar..." oninput="App.academic._applyPreinscFilter()"
              class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-blue-400 w-36">
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm" style="min-width:680px">
            <thead class="bg-slate-50 border-b border-slate-100">
              <tr>${['Alumno','Tutor','Nivel / Horario','Estado','Fecha','Acciones'].map(h=>`<th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">${h}</th>`).join('')}</tr>
            </thead>
            <tbody id="preinscTbody" class="divide-y divide-slate-50">
              ${list.length ? list.map(r=>this._preinscRow(r)).join('') : '<tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">Sin solicitudes</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
    if(window.lucide)lucide.createIcons();
  },

  _preinscRow(r){
    const sc={pending:'bg-amber-100 text-amber-700',admitted:'bg-blue-100 text-blue-700',rejected:'bg-red-100 text-red-600',converted:'bg-green-100 text-green-700'};
    const sl={pending:'Pendiente',admitted:'Admitido',rejected:'Rechazado',converted:'Convertido'};
    return `<tr class="hover:bg-slate-50 transition-colors preinsc-row" data-name="${(r.student_name||'').toLowerCase()}" data-status="${r.status}">
      <td class="px-4 py-3"><div class="font-bold text-slate-800">${Helpers.escapeHTML(r.student_name||'—')}</div><div class="text-[10px] text-slate-400">${r.section||''}</div></td>
      <td class="px-4 py-3"><div class="font-bold text-slate-700 text-xs">${Helpers.escapeHTML(r.p1_name||'—')}</div><div class="text-[10px] text-slate-400">${r.p1_phone||''}</div></td>
      <td class="px-4 py-3 text-xs font-bold text-slate-600">${r.section||'—'}<br><span class="text-slate-400 font-normal">${r.schedule||''}</span></td>
      <td class="px-4 py-3 text-center"><span class="px-2.5 py-1 rounded-full text-[10px] font-black ${sc[r.status]||'bg-slate-100 text-slate-500'}">${sl[r.status]||r.status}</span></td>
      <td class="px-4 py-3 text-xs text-slate-500">${fmtDate(r.created_at?.split('T')[0])}</td>
      <td class="px-4 py-3"><div class="flex justify-center gap-1.5">
        <button onclick="App.academic.viewPreinsc(${r.id})" class="p-1.5 bg-slate-50 text-slate-500 rounded-lg hover:bg-blue-50 hover:text-blue-600" title="Ver"><i data-lucide="eye" class="w-4 h-4"></i></button>
        ${r.status==='pending'?`<button onclick="App.academic.admitPreinsc(${r.id})" class="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100" title="Admitir"><i data-lucide="check" class="w-4 h-4"></i></button>`:''}
        ${r.status!=='converted'&&r.status!=='rejected'?`<button onclick="App.academic.convertPreinsc(${r.id})" class="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100" title="Inscribir"><i data-lucide="user-plus" class="w-4 h-4"></i></button>`:''}
      </div></td>
    </tr>`;
  },

  _filterPreinsc(status){ const s=$el('preinscStatusFilter'); if(s)s.value=status; this._applyPreinscFilter(); },
  _applyPreinscFilter(){
    const q=($el('preinscSearch')?.value||'').toLowerCase();
    const s=$el('preinscStatusFilter')?.value||'';
    document.querySelectorAll('.preinsc-row').forEach(r=>{
      const nm=r.dataset.name||''; const st=r.dataset.status||'';
      r.style.display=(!q||nm.includes(q))&&(!s||st===s)?'':'none';
    });
  },

  async admitPreinsc(id){
    await supabase.from('student_preregistrations').update({status:'admitted',reviewed_at:new Date().toISOString()}).eq('id',id);
    Helpers.toast('Admitido','success'); this.loadPreregistrations();
  },

  async viewPreinsc(id){
    const {data:r}=await supabase.from('student_preregistrations').select('*').eq('id',id).single();
    if(!r)return;
    window.openGlobalModal(`<div class="p-6 max-h-[80vh] overflow-y-auto">
      <h3 class="text-lg font-black text-slate-800 mb-4">Pre-inscripción: ${Helpers.escapeHTML(r.student_name)}</h3>
      <div class="grid grid-cols-2 gap-3 text-sm">
        ${[['Nivel',r.section],['Horario',r.schedule],['Fecha nac.',fmtDate(r.birth_date)],['Sangre',r.blood_type],['Alergias',r.allergies],
           ['Tutor 1',r.p1_name],['Tel.',r.p1_phone],['Email',r.p1_email],['Tutor 2',r.p2_name],['Tel. 2',r.p2_phone],
           ['Emergencia',r.emergency_name],['Tel. emerg.',r.emergency_phone]]
          .map(([l,v])=>v?`<div><span class="text-[9px] font-black text-slate-400 uppercase">${l}</span><p class="font-bold text-slate-700 text-xs">${Helpers.escapeHTML(String(v))}</p></div>`:'').join('')}
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="App.ui.closeModal()" class="px-4 py-2 text-slate-500 font-bold text-xs uppercase border border-slate-200 rounded-xl">Cerrar</button>
        ${r.status!=='converted'?`<button onclick="App.ui.closeModal();App.academic.convertPreinsc(${r.id})" class="px-4 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#28B54D">Inscribir</button>`:''}
      </div>
    </div>`);
  },

  async convertPreinsc(preinscId){
    await this._loadYears();
    const {data:plans}=await supabase.from('payment_plans').select('id,name,level,schedule').eq('school_year_id',this._currentYear?.id||0).eq('is_active',true).order('name');
    const {data:rooms}=await supabase.from('classrooms').select('id,name').order('name');
    const po=(plans||[]).map(p=>`<option value="${p.id}">${p.name} — ${p.level} ${p.schedule}</option>`).join('');
    const ro=(rooms||[]).map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
    window.openGlobalModal(`<div class="p-6">
      <h3 class="text-lg font-black text-slate-800 mb-5">Inscribir Alumno</h3>
      <div class="space-y-4">
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Aula</label>
          <select id="convClassroom" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-400">
            <option value="">Sin asignar</option>${ro}</select></div>
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Plan de pago</label>
          <select id="convPlan" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-400">
            <option value="">Sin plan</option>${po}</select></div>
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Matrícula</label>
          <input id="convMatricula" type="text" placeholder="Ej: SC-2026-001" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-400"></div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="App.ui.closeModal()" class="px-4 py-2 text-slate-500 font-bold text-xs uppercase border border-slate-200 rounded-xl">Cancelar</button>
        <button id="btnDoConvert" onclick="App.academic._doConvert(${preinscId})" class="px-5 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#0B63C7">Inscribir</button>
      </div>
    </div>`);
  },

  async _doConvert(preinscId){
    const classId=$el('convClassroom')?.value||null; const planId=$el('convPlan')?.value||null; const mat=$el('convMatricula')?.value?.trim()||null;
    const btn=$el('btnDoConvert'); if(btn){btn.disabled=true;btn.textContent='Procesando...';}
    const {data,error}=await supabase.rpc('convert_preregistration',{
      p_preinsc_id:preinscId, p_school_year_id:this._currentYear?.id,
      p_classroom_id:classId?parseInt(classId):null, p_payment_plan_id:planId?parseInt(planId):null, p_matricula:mat
    });
    if(error){Helpers.toast('Error: '+error.message,'error');if(btn){btn.disabled=false;btn.textContent='Inscribir';}return;}
    Helpers.toast('Alumno inscrito y cargos generados','success'); App.ui.closeModal(); this.loadPreregistrations();
  },

  // ── INSCRIPCIONES ────────────────────────────────────────────────────────
  async loadEnrollments() {
    const syId=this._currentYear?.id; if(!syId){$el('academicTabContent').innerHTML='<p class="text-slate-400 p-8 text-center">Selecciona un año escolar</p>';return;}
    const {data}=await supabase.from('student_enrollments')
      .select('id,status,created_at,students:student_id(id,name,matricula),payment_plans:payment_plan_id(name,level),classrooms:classroom_id(name)')
      .eq('school_year_id',syId).order('created_at',{ascending:false}).limit(300);
    const list=data||[];
    const c=$el('academicTabContent'); if(!c)return;
    c.innerHTML=`<div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div class="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <span class="text-sm font-black text-slate-700">${list.length} inscripciones — ${this._currentYear?.name}</span>
        <input type="text" placeholder="Buscar alumno..." oninput="App.academic._filterEnrollments(this.value)"
          class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-blue-400 w-40">
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm" style="min-width:620px">
          <thead class="bg-slate-50 border-b border-slate-100">
            <tr>${['Alumno','Plan','Aula','Estado','Fecha','Acciones'].map(h=>`<th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase">${h}</th>`).join('')}</tr>
          </thead>
          <tbody id="enrollTbody" class="divide-y divide-slate-50">
            ${list.map(e=>`<tr class="hover:bg-slate-50 enroll-row" data-name="${(e.students?.name||'').toLowerCase()}">
              <td class="px-4 py-3"><div class="font-bold text-slate-800">${Helpers.escapeHTML(e.students?.name||'—')}</div><div class="text-[10px] text-slate-400">${e.students?.matricula||''}</div></td>
              <td class="px-4 py-3 text-xs font-bold text-slate-600">${e.payment_plans?.name||'—'} <span class="text-slate-400">${e.payment_plans?.level||''}</span></td>
              <td class="px-4 py-3 text-xs text-slate-600">${e.classrooms?.name||'—'}</td>
              <td class="px-4 py-3"><span class="px-2.5 py-1 rounded-full text-[10px] font-black ${ST_COLOR[e.status]||'bg-slate-100 text-slate-500'}">${ST_LABEL[e.status]||e.status}</span></td>
              <td class="px-4 py-3 text-xs text-slate-400">${fmtDate(e.created_at?.split('T')[0])}</td>
              <td class="px-4 py-3"><div class="flex gap-1.5">
                <button onclick="App.academic.viewEnrollmentCharges(${e.id},${e.students?.id},'${Helpers.escapeHTML(e.students?.name||'')}')" class="p-1.5 bg-slate-50 text-slate-500 rounded-lg hover:bg-blue-50 hover:text-blue-600" title="Ver cargos"><i data-lucide="list" class="w-4 h-4"></i></button>
                <button onclick="App.academic.openChangePlanModal(${e.id})" class="p-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100" title="Cambiar plan"><i data-lucide="repeat" class="w-4 h-4"></i></button>
              </div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
    if(window.lucide)lucide.createIcons();
  },
  _filterEnrollments(q){document.querySelectorAll('.enroll-row').forEach(r=>{r.style.display=r.dataset.name.includes(q.toLowerCase())?'':'none';});},

  // ── PLANES DE PAGO ───────────────────────────────────────────────────────
  async loadPlans() {
    const syId=this._currentYear?.id;
    const {data:plans}=await supabase.from('payment_plans').select('id,name,level,schedule,registration_fee,is_active,plan_installments(id,month_name,amount,type,month_number)').eq('school_year_id',syId||0).order('level,name');
    const c=$el('academicTabContent'); if(!c)return;
    c.innerHTML=`<div class="space-y-5">
      <div class="flex justify-end">
        <button onclick="App.academic.openNewPlanModal()" class="px-4 py-2 text-white text-xs font-black uppercase rounded-xl hover:opacity-90" style="background:#0B63C7">+ Nuevo Plan</button>
      </div>
      ${(plans||[]).map(p=>`
        <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div class="p-4 flex items-center justify-between border-b border-slate-100">
            <div>
              <span class="font-black text-slate-800">${Helpers.escapeHTML(p.name)}</span>
              <span class="ml-2 text-xs text-slate-400">${p.level} · ${p.schedule}</span>
              ${!p.is_active?'<span class="ml-2 text-[9px] bg-red-50 text-red-500 font-black px-2 py-0.5 rounded-full uppercase">Inactivo</span>':''}
            </div>
            <span class="text-sm font-black text-slate-600">Inscripción: ${fmtCurrency(p.registration_fee)}</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs" style="min-width:500px">
              <thead class="bg-slate-50"><tr>
                <th class="px-3 py-2 text-left font-black text-slate-400 uppercase text-[9px]">Mes</th>
                <th class="px-3 py-2 text-left font-black text-slate-400 uppercase text-[9px]">Tipo</th>
                <th class="px-3 py-2 text-right font-black text-slate-400 uppercase text-[9px]">Monto</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                ${(p.plan_installments||[]).sort((a,b)=>a.month_number-b.month_number).map(i=>`<tr class="hover:bg-slate-50">
                  <td class="px-3 py-2 font-bold text-slate-700">${i.month_name}</td>
                  <td class="px-3 py-2 text-slate-500 capitalize">${i.type}</td>
                  <td class="px-3 py-2 text-right font-black text-slate-700">${fmtCurrency(i.amount)}</td>
                </tr>`).join('')}
                <tr class="bg-slate-50 font-black">
                  <td class="px-3 py-2 text-slate-500" colspan="2">TOTAL</td>
                  <td class="px-3 py-2 text-right text-slate-700">${fmtCurrency((p.plan_installments||[]).reduce((s,i)=>s+Number(i.amount),0)+Number(p.registration_fee))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>`).join('') || '<p class="text-slate-400 text-center py-8">Sin planes para este año escolar</p>'}
    </div>`;
  },

  // ── CARGOS ───────────────────────────────────────────────────────────────
  async loadCharges() {
    const syId=this._currentYear?.id;
    const {data}=await supabase.from('student_charges')
      .select('id,type,concept,amount,status,due_date,paid_date,student_enrollments!inner(school_year_id,students:student_id(name))')
      .eq('student_enrollments.school_year_id',syId||0).is('deleted_at',null)
      .order('due_date',{ascending:true}).limit(500);
    const list=data||[];
    const cnt=s=>list.filter(c=>c.status===s).length;
    const sum=s=>list.filter(c=>c.status===s).reduce((t,c)=>t+Number(c.amount),0);
    const c=$el('academicTabContent'); if(!c)return;
    c.innerHTML=`<div class="space-y-4">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${[['Pendientes','pending','#FF8A00'],['Vencidas','overdue','#EF4444'],['Pagadas','paid','#28B54D'],['Total año','_all','#0B63C7']]
          .map(([l,s,col])=>`<div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
            <div class="text-lg font-black" style="color:${col}">${s==='_all'?fmtCurrency(sum('paid')+sum('pending')+sum('overdue')):fmtCurrency(sum(s))}</div>
            <div class="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">${l}</div>
            <div class="text-xs text-slate-500 font-bold">${s==='_all'?list.length+' cargos':cnt(s)+' cargos'}</div>
          </div>`).join('')}
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex flex-wrap gap-2 items-center">
          <input type="text" placeholder="Buscar..." oninput="App.academic._filterCharges(this.value)"
            class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-blue-400 w-36">
          <select id="chargeStatusFilter" onchange="App.academic._filterCharges()" class="border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none bg-white">
            <option value="">Todos</option><option value="pending">Pendientes</option><option value="overdue">Vencidas</option><option value="paid">Pagadas</option>
          </select>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm" style="min-width:600px">
            <thead class="bg-slate-50 border-b border-slate-100">
              <tr>${['Alumno','Concepto','Monto','Estado','Vence','Pagó'].map(h=>`<th class="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase">${h}</th>`).join('')}</tr>
            </thead>
            <tbody id="chargeTbody" class="divide-y divide-slate-50">
              ${list.map(charge=>`<tr class="hover:bg-slate-50 charge-row" data-name="${((charge.student_enrollments?.students?.name)||'').toLowerCase()}" data-status="${charge.status}">
                <td class="px-4 py-3 font-bold text-slate-700">${Helpers.escapeHTML(charge.student_enrollments?.students?.name||'—')}</td>
                <td class="px-4 py-3 text-xs text-slate-600">${Helpers.escapeHTML(charge.concept||charge.type)}</td>
                <td class="px-4 py-3 font-black text-slate-800">${fmtCurrency(charge.amount)}</td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-[10px] font-black ${CH_COLOR[charge.status]||'bg-slate-100 text-slate-500'}">${CH_LABEL[charge.status]||charge.status}</span></td>
                <td class="px-4 py-3 text-xs text-slate-500">${fmtDate(charge.due_date)}</td>
                <td class="px-4 py-3 text-xs text-slate-500">${charge.paid_date?fmtDate(charge.paid_date?.split('T')[0]):'—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  },
  _filterCharges(q){
    const sq=(q||$el('chargeStatusFilter')?.value||'').toLowerCase();
    const sf=$el('chargeStatusFilter')?.value||'';
    document.querySelectorAll('.charge-row').forEach(r=>{
      const nm=r.dataset.name||''; const st=r.dataset.status||'';
      r.style.display=(!sq||nm.includes(sq))&&(!sf||st===sf)?'':'none';
    });
  },

  // ── NUEVO PLAN DE PAGO ───────────────────────────────────────────────────
  openNewPlanModal() {
    const months=['Agosto','Septiembre','Octubre','Noviembre','Diciembre','Enero','Febrero','Marzo','Abril','Mayo','Junio'];
    window.openGlobalModal(`<div class="p-6 max-h-[85vh] overflow-y-auto">
      <h3 class="text-lg font-black text-slate-800 mb-5">Nuevo Plan — ${this._currentYear?.name||''}</h3>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Nombre</label>
          <input id="np_name" type="text" placeholder="Plan A / B / C" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-400"></div>
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Nivel</label>
          <select id="np_level" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none bg-white"><option>Inicial</option><option>Primaria</option></select></div>
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Horario</label>
          <select id="np_schedule" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none bg-white"><option>8:00-12:00</option><option>8:00-13:30</option><option>8:00-15:00</option><option>8:00-17:00</option></select></div>
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Cuota inscripción (RD$)</label>
          <input id="np_reg" type="number" placeholder="0.00" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-400"></div>
      </div>
      <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Cuotas mensuales</p>
      <div class="space-y-2" id="np_months">
        ${months.map((m,i)=>`<div class="flex items-center gap-3">
          <span class="w-28 text-xs font-bold text-slate-600">${m}</span>
          <input type="number" id="np_m${i}" placeholder="0.00" class="flex-1 border border-slate-100 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-400 bg-slate-50">
          <label class="flex items-center gap-1 text-xs font-bold text-slate-500 cursor-pointer">
            <input type="checkbox" id="np_skip${i}" class="rounded"> Omitir
          </label>
        </div>`).join('')}
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="App.ui.closeModal()" class="px-4 py-2 text-slate-500 font-bold text-xs uppercase border border-slate-200 rounded-xl">Cancelar</button>
        <button id="btnSavePlan" onclick="App.academic._doSavePlan()" class="px-5 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#0B63C7">Guardar Plan</button>
      </div>
    </div>`,true);
  },

  async _doSavePlan() {
    const name=$el('np_name')?.value?.trim(); if(!name){Helpers.toast('Escribe el nombre','warning');return;}
    const level=$el('np_level')?.value;
    const schedule=$el('np_schedule')?.value;
    const regFee=parseFloat($el('np_reg')?.value||0);
    const months=['Agosto','Septiembre','Octubre','Noviembre','Diciembre','Enero','Febrero','Marzo','Abril','Mayo','Junio'];

    const btn=$el('btnSavePlan'); if(btn){btn.disabled=true;btn.textContent='Guardando...';}

    const {data:plan,error:pe}=await supabase.from('payment_plans')
      .insert({school_year_id:this._currentYear?.id,name,level,schedule,registration_fee:regFee}).select().single();
    if(pe){Helpers.toast('Error: '+pe.message,'error');if(btn){btn.disabled=false;btn.textContent='Guardar Plan';}return;}

    const installments=[];
    months.forEach((m,i)=>{
      const skip=$el(`np_skip${i}`)?.checked; if(skip)return;
      const amt=parseFloat($el(`np_m${i}`)?.value||0); if(!amt)return;
      installments.push({payment_plan_id:plan.id,type:'colegiatura',month_number:i+1,month_name:m,amount:amt,due_day:5,due_month_offset:i});
    });

    if(installments.length){
      const {error:ie}=await supabase.from('plan_installments').insert(installments);
      if(ie){Helpers.toast('Error en cuotas: '+ie.message,'error');return;}
    }

    Helpers.toast('Plan creado con '+installments.length+' cuotas','success');
    App.ui.closeModal(); this.loadPlans();
  },

  // ── NUEVO AÑO ESCOLAR ────────────────────────────────────────────────────
  openNewYearModal() {
    const now=new Date(); const nextY=now.getFullYear()+1;
    window.openGlobalModal(`<div class="p-6">
      <h3 class="text-lg font-black text-slate-800 mb-5">Nuevo Año Escolar</h3>
      <div class="space-y-4">
        <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Nombre</label>
          <input id="ny_name" type="text" placeholder="Ej: 2027-2028" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-400"></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Inicio</label>
            <input id="ny_start" type="date" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-400"></div>
          <div><label class="text-[10px] font-black text-slate-400 uppercase block mb-1">Fin</label>
            <input id="ny_end" type="date" class="w-full border-2 border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-400"></div>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="ny_current" class="rounded">
          <span class="text-sm font-bold text-slate-700">Marcar como año activo</span>
        </label>
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 font-bold">
          Al crear un nuevo año escolar, el historial del año anterior queda intacto.
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button onclick="App.ui.closeModal()" class="px-4 py-2 text-slate-500 font-bold text-xs uppercase border border-slate-200 rounded-xl">Cancelar</button>
        <button id="btnSaveYear" onclick="App.academic._doSaveYear()" class="px-5 py-2 text-white font-black text-xs uppercase rounded-xl" style="background:#28B54D">Crear Año</button>
      </div>
    </div>`);
  },

  async _doSaveYear() {
    const name=$el('ny_name')?.value?.trim(); if(!name){Helpers.toast('Escribe el nombre','warning');return;}
    const start=$el('ny_start')?.value; const end=$el('ny_end')?.value;
    if(!start||!end){Helpers.toast('Pon fechas de inicio y fin','warning');return;}
    const isCurrent=$el('ny_current')?.checked||false;
    const btn=$el('btnSaveYear'); if(btn){btn.disabled=true;btn.textContent='Creando...';}

    if(isCurrent){ await supabase.from('school_years').update({is_current:false}).neq('id',0); }

    const {error}=await supabase.from('school_years').insert({name,start_date:start,end_date:end,is_current:isCurrent,status:'upcoming'});
    if(error){Helpers.toast('Error: '+error.message,'error');if(btn){btn.disabled=false;btn.textContent='Crear Año';}return;}

    Helpers.toast('Año escolar creado','success');
    App.ui.closeModal();
    await this._loadYears();
    this._renderShell();
    this.showTab('preregistrations');
  },

  // ── REINSCRIPCIONES (placeholder) ────────────────────────────────────────
  loadReenrollments() {
    const c=$el('academicTabContent');
    if(!c)return;
    c.innerHTML=`<div class="p-8 text-center">
      <p class="text-slate-500">Reinscripciones coming soon</p>
    </div>`;
  }
};

window.AcademicCycleModule = AcademicCycleModule;
