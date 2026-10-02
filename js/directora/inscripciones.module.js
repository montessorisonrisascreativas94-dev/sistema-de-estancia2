/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  MÓDULO INSCRIPCIONES — Panel Directora / Asistente      ║
 * ║  Lee: student_preregistrations (status=pending/admitted) ║
 * ║  Controles de edad (pre.md) + Autorizaciones Directora     ║
 * ║  Admite: students → profiles → payment_plans →               ║
 * ║          monthly_payments → status=admitted                ║
 * ╚══════════════════════════════════════════════════════════╝
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { SCHOOL_SETTINGS_ID } from '../shared/constants.js';

let _AppState = null;
async function _getAppState() {
  if (_AppState) return _AppState;
  try {
    const mod = await import('./state.js');
    _AppState = mod.AppState;
    if (!_AppState?.get('user')) {
      const amod = await import('../asistente/state.js');
      _AppState = amod.AppState;
    }
  } catch (_) {
    try { const amod = await import('../asistente/state.js'); _AppState = amod.AppState; } catch (__) {}
  }
  return _AppState;
}

async function _currentRole() {
  const s = await _getAppState();
  const u = s?.get?.('user') || {};
  const profile = s?.get?.('profile') || {};
  return profile.role || u.role || '';
}

const MONTHS_IN_YEAR = 12;

const esc = (s = '') => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const fmt = (d) => d
  ? new Date(d).toLocaleDateString('es-DO', { day:'2-digit', month:'short', year:'numeric' })
  : '—';

const fmtDT = (d) => d
  ? new Date(d).toLocaleString('es-DO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  : '—';

const statusBadge = (s) => ({
  pending:  '<span class="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-black rounded-full uppercase">Pendiente</span>',
  admitted: '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-black rounded-full uppercase">Admitido</span>',
  rejected: '<span class="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase">Rechazado</span>',
})[s] || `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full uppercase">${esc(s)}</span>`;

function ageBadge(r) {
  if (r.age_match !== false) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-black rounded-full" title="Edad en rango oficial">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Edad OK
    </span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-full" title="Edad fuera de rango oficial">
    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
    Edad Fuera
  </span>`;
}

function dirAuthBadge(r) {
  if (r.age_match !== false) return '';
  if (r.director_authorization_requested && r.director_authorization_approved === true) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Autoriz. Aprobada
    </span>`;
  }
  if (r.director_authorization_approved === false) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded-full">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
      Autoriz. Rechazada
    </span>`;
  }
  if (r.director_authorization_requested) {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full" title="Pendiente de revisión por Directora">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Pend. Autoriz.
    </span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-black rounded-full">
    Sin Solicitud
  </span>`;
}

let _channel = null;
function _subscribeRealtime() {
  if (_channel) { supabase.removeChannel(_channel); _channel = null; }
  _channel = supabase
    .channel('preregistrations_watcher')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student_preregistrations' }, () => {
      loadInscripciones();
    })
    .subscribe();
}
export function destroyInscripciones() {
  if (_channel) { supabase.removeChannel(_channel); _channel = null; }
}

export async function loadInscripciones() {
  const container = document.getElementById('inscripcionesContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center gap-3 py-8 justify-center text-slate-400">
      <div class="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
      Cargando preinscripciones...
    </div>`;

  try {
    const { data, error } = await supabase
      .from('student_preregistrations')
      .select(`
        id,
        student_name,
        student_last_name,
        birth_date,
        level_requested,
        school_year_requested,
        schedule,
        p1_name,
        p1_phone,
        p1_email,
        status,
        created_at,
        suggested_level,
        age_match,
        director_authorization_requested,
        director_authorization_note,
        director_authorization_approved,
        reviewed_at,
        reviewed_by
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 text-slate-400">
          <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-9 h-9 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
          </div>
          <h3 class="font-black text-slate-500 mb-2">Sin preinscripciones</h3>
          <p class="text-sm">Cuando un padre llene el formulario aparecerá aquí.</p>
        </div>`;
      return;
    }

    const pending  = data.filter(r => r.status === 'pending');
    const admitted = data.filter(r => r.status === 'admitted');
    const rejected = data.filter(r => r.status === 'rejected');
    const authPending = data.filter(r => !r.age_match && r.director_authorization_requested && r.director_authorization_approved === null);
    const ageOutOfRange = data.filter(r => r.age_match === false);

    container.innerHTML = `
      <!-- KPIs compactos y elegantes -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-7">
        <div class="relative overflow-hidden bg-white border border-amber-200/80 rounded-2xl px-4 py-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(234,179,8,0.15)] transition-all cursor-pointer" onclick="InscripcionesModule.filterStatus('pending')">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-bold text-amber-700 uppercase tracking-widest leading-none">Pendientes</p>
              <p class="mt-2 text-[32px] leading-none font-black text-amber-600 tracking-tight">${pending.length}</p>
            </div>
            <div class="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-yellow-200 flex items-center justify-center border border-amber-200/70">
              <i data-lucide="clock" class="w-4.5 h-4.5 text-amber-700"></i>
            </div>
          </div>
          <div class="mt-3 h-1.5 w-full rounded-full bg-amber-100 overflow-hidden"><div class="h-full bg-gradient-to-r from-amber-400 to-yellow-500 w-2/3 rounded-r-full"></div></div>
        </div>
        <div class="relative overflow-hidden bg-white border border-emerald-200/80 rounded-2xl px-4 py-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(34,197,94,0.16)] transition-all cursor-pointer" onclick="InscripcionesModule.filterStatus('admitted')">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-bold text-emerald-700 uppercase tracking-widest leading-none">Admitidos</p>
              <p class="mt-2 text-[32px] leading-none font-black text-emerald-600 tracking-tight">${admitted.length}</p>
            </div>
            <div class="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-green-200 flex items-center justify-center border border-emerald-200/70">
              <i data-lucide="check-circle-2" class="w-4.5 h-4.5 text-emerald-700"></i>
            </div>
          </div>
          <div class="mt-3 h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden"><div class="h-full bg-gradient-to-r from-emerald-400 to-green-600 w-4/5 rounded-r-full"></div></div>
        </div>
        <div class="relative overflow-hidden bg-white border border-rose-200/80 rounded-2xl px-4 py-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(244,63,94,0.16)] transition-all cursor-pointer" onclick="InscripcionesModule.filterStatus('rejected')">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-bold text-rose-700 uppercase tracking-widest leading-none">Rechazados</p>
              <p class="mt-2 text-[32px] leading-none font-black text-rose-600 tracking-tight">${rejected.length}</p>
            </div>
            <div class="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center border border-rose-200/70">
              <i data-lucide="x-circle" class="w-4.5 h-4.5 text-rose-700"></i>
            </div>
          </div>
          <div class="mt-3 h-1.5 w-full rounded-full bg-rose-100 overflow-hidden"><div class="h-full bg-gradient-to-r from-rose-400 to-pink-600 w-1/4 rounded-r-full"></div></div>
        </div>
        <div class="relative overflow-hidden bg-white border border-violet-200/80 rounded-2xl px-4 py-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(139,92,246,0.18)] transition-all cursor-pointer" onclick="InscripcionesModule.filterStatus('auth-pending')">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-[11px] font-bold text-violet-700 uppercase tracking-widest leading-none">Pend. Autoriz.</p>
              <p class="mt-2 text-[32px] leading-none font-black text-violet-600 tracking-tight">${authPending.length}</p>
            </div>
            <div class="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-200 flex items-center justify-center border border-violet-200/70 relative">
              <i data-lucide="shield-alert" class="w-4.5 h-4.5 text-violet-700"></i>
              <span class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#8B5CF6] animate-pulse ring-2 ring-white"></span>
            </div>
          </div>
          <div class="mt-3 h-1.5 w-full rounded-full bg-violet-100 overflow-hidden"><div class="h-full bg-gradient-to-r from-violet-500 to-indigo-600 w-1/3 rounded-r-full"></div></div>
        </div>
      </div>

      <!-- Filters (más gruesos: +padding, +tamaño fuente) -->
      <div class="flex gap-3 mb-7 flex-wrap">
        <button onclick="InscripcionesModule.filterStatus('all')" class="insc-filter-btn active px-6 py-3.5 rounded-2xl text-[13px] font-black shadow-[0_4px_12px_rgba(15,23,42,0.05)]" data-filter="all">Todos (${data.length})</button>
        <button onclick="InscripcionesModule.filterStatus('pending')" class="insc-filter-btn px-6 py-3.5 rounded-2xl text-[13px] font-black shadow-[0_4px_12px_rgba(15,23,42,0.05)]" data-filter="pending">Pendientes (${pending.length})</button>
        <button onclick="InscripcionesModule.filterStatus('admitted')" class="insc-filter-btn px-6 py-3.5 rounded-2xl text-[13px] font-black shadow-[0_4px_12px_rgba(15,23,42,0.05)]" data-filter="admitted">Admitidos (${admitted.length})</button>
        <button onclick="InscripcionesModule.filterStatus('age-out')" class="insc-filter-btn px-6 py-3.5 rounded-2xl text-[13px] font-black shadow-[0_4px_12px_rgba(15,23,42,0.05)]" data-filter="age-out">Edad Fuera Rango (${ageOutOfRange.length})</button>
        <button onclick="InscripcionesModule.filterStatus('auth-pending')" class="insc-filter-btn px-6 py-3.5 rounded-2xl text-[13px] font-black shadow-[0_4px_12px_rgba(15,23,42,0.05)]" data-filter="auth-pending">Autoriz. Pendiente (${authPending.length})</button>
      </div>

      <!-- Table (más gruesa: +border, +radius, +padding celdas, +separadores) -->
      <div class="table-panel">
        <div class="table-scroll-wrap rounded-[32px] border-[3px] border-slate-200 overflow-hidden bg-white shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <table class="data-table w-full text-sm" id="inscripcionesTable" style="min-width:860px">
            <thead class="bg-[#0B63C7] text-white sticky top-0 z-10">
              <tr>
                <th class="px-8 py-5 text-left text-[12px] font-black uppercase tracking-widest">Estudiante</th>
                <th class="px-8 py-5 text-left text-[12px] font-black uppercase tracking-widest">Sección / Edad</th>
                <th class="px-8 py-5 text-left text-[12px] font-black uppercase tracking-widest hidden md:table-cell">Tutor Principal</th>
                <th class="px-8 py-5 text-left text-[12px] font-black uppercase tracking-widest hidden lg:table-cell">Solicitado</th>
                <th class="px-8 py-5 text-center text-[12px] font-black uppercase tracking-widest">Estado</th>
                <th class="px-8 py-5 text-center text-[12px] font-black uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y-4 divide-slate-100 bg-white" id="inscripcionesTbody">
              ${data.map(r => _renderRow(r)).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    _attachFilterStyles();
    _attachPreDetailStyles();
    _subscribeRealtime();

  } catch (err) {
    const msg = err.message || String(err);
    const rlsHint = /403|policy|permission|denied/i.test(msg)
      ? ' — Permiso denegado: contacta al administrador para revisar políticas RLS.'
      : '';
    container.innerHTML = `<div class="p-6 text-red-600 font-bold">Error al cargar: ${esc(msg)}${esc(rlsHint)}</div>`;
    console.error('[Inscripciones] load error:', err);
  }
}

function _renderRow(r) {
  const ageMatch = !(r.age_match === false);
  const needsAuth = r.age_match === false && r.director_authorization_approved !== true;
  const disabled = needsAuth ? 'disabled' : '';
  const disabledClass = needsAuth ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#0850A0]';
  const disabledTitle = needsAuth ? 'Requiere aprobación de Directora' : '';

  const admitBtn = r.status === 'pending'
    ? `<button onclick="InscripcionesModule.openAdmitModal(${r.id})"
         title="${esc(disabledTitle)}"
         ${disabled}
         class="px-5 py-2.5 bg-[#0B63C7] text-white rounded-2xl text-[12px] font-black uppercase ${disabledClass} transition-all shadow-[0_6px_18px_rgba(11,99,199,0.28)] hover:-translate-y-0.5 active:translate-y-0">
         Admitir
       </button>`
    : `<span class="text-[12px] text-slate-400 font-black">—</span>`;

  const detailBtn = `
    <button onclick="InscripcionesModule.openPreDetail(${r.id})"
      class="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-2xl text-[12px] font-black uppercase hover:bg-slate-200 hover:-translate-y-0.5 transition-all shadow-[0_4px_12px_rgba(15,23,42,0.06)] border-[2px] border-slate-200"
      title="Ver detalle completo">
      Ver
    </button>`;

  const fullName = [r.student_name, r.student_last_name].filter(Boolean).join(' ') || '—';
  const levelParts = [r.level_requested, r.school_year_requested].filter(Boolean);
  const nivelTag = levelParts.length ? `<span class="px-3 py-1 bg-[#E8F2FF] text-[#0B63C7] text-[11px] font-black rounded-2xl block mb-1.5 tracking-wide">${esc(levelParts.join(' · '))}</span>` : '';
  const scheduleTag = r.schedule
    ? `<span class="px-3 py-1 bg-slate-100 text-slate-700 text-[11px] font-black rounded-2xl block tracking-wide">${esc(r.schedule)}</span>`
    : '';

  const age = _calcAgeFromBirth(r.birth_date);
  const ageStr = age ? _fmtHuman(age) : '';
  const ageTxtTag = ageStr
    ? `<span class="px-3 py-1 bg-[#FFF7ED] text-orange-700 text-[11px] font-black rounded-2xl block mb-1.5 tracking-wide">${esc(ageStr)}</span>`
    : '';

  const dataAgeOut = r.age_match === false ? 'data-age-out="1"' : '';
  const dataAuthPending = (!r.age_match && r.director_authorization_requested && r.director_authorization_approved === null) ? 'data-auth-pending="1"' : '';

  const status = r.status || '';
  let rowBg = '';
  let borderL = '';
  if (status === 'pending') {
    rowBg = 'bg-gradient-to-r from-yellow-50/70 to-amber-50/30 hover:from-yellow-50 hover:to-amber-100/50';
    borderL = 'border-l-[6px] border-l-amber-400';
  } else if (status === 'admitted') {
    rowBg = 'bg-gradient-to-r from-emerald-50/70 to-green-50/30 hover:from-emerald-50 hover:to-green-100/50';
    borderL = 'border-l-[6px] border-l-emerald-500';
  } else if (status === 'rejected') {
    rowBg = 'bg-gradient-to-r from-rose-50/70 to-pink-50/30 hover:from-rose-50 hover:to-pink-100/50';
    borderL = 'border-l-[6px] border-l-rose-500';
  } else {
    rowBg = 'hover:bg-[#F8FAFC]';
    borderL = 'border-l-[6px] border-l-slate-200';
  }

  if (r.age_match === false && r.director_authorization_approved === null) {
    borderL = 'border-l-[6px] border-l-violet-500';
  } else if (r.age_match === false && r.director_authorization_approved === true) {
    borderL = 'border-l-[6px] border-l-teal-500';
  } else if (r.age_match === false && r.director_authorization_approved === false) {
    borderL = 'border-l-[6px] border-l-red-500';
  }

  return `
    <tr data-status="${esc(r.status)}" ${dataAgeOut} ${dataAuthPending} class="${rowBg} ${borderL} border-b-[3px] border-b-white transition-all duration-200">
      <td class="px-8 py-6">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-[20px] bg-gradient-to-br from-[#0B63C7] to-[#4F46E5] flex items-center justify-center text-white text-[17px] font-black shadow-[0_10px_24px_rgba(11,99,199,0.28)] border-[3px] border-white">
            ${esc(((r.student_name||'?').charAt(0)).toUpperCase())}
          </div>
          <div class="min-w-0">
            <div class="font-black text-slate-800 text-[16px] leading-tight truncate">${esc(fullName)}</div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              ${ageBadge(r)}
              ${dirAuthBadge(r)}
            </div>
          </div>
        </div>
      </td>
      <td class="px-8 py-6">
        ${ageTxtTag}${nivelTag}${scheduleTag}${(!nivelTag && !scheduleTag && !ageTxtTag) ? '<span class="text-slate-400 text-[12px] font-black">—</span>' : ''}
      </td>
      <td class="px-8 py-6 hidden md:table-cell">
        <div class="font-black text-slate-800 text-[14px]">${esc(r.p1_name || '—')}</div>
        <div class="text-[12px] text-slate-500 font-semibold mt-1.5">${esc(r.p1_phone || '')}</div>
        <div class="text-[12px] text-slate-500 font-medium mt-1 truncate max-w-[220px]" title="${esc(r.p1_email || '')}">${esc(r.p1_email || '')}</div>
      </td>
      <td class="px-8 py-6 hidden lg:table-cell text-[14px] text-slate-600 font-semibold">${fmt(r.created_at)}</td>
      <td class="px-8 py-6 text-center">${statusBadge(r.status)}</td>
      <td class="px-8 py-6">
        <div class="flex items-center justify-center gap-2.5">
          ${detailBtn}
          ${admitBtn}
        </div>
      </td>
    </tr>`;
}

function _attachFilterStyles() {
  const style = document.getElementById('_inscFilterStyle');
  if (style) return;
  const s = document.createElement('style');
  s.id = '_inscFilterStyle';
  s.textContent = `
    .insc-filter-btn { background:#F1F5F9; color:#64748B; border:none; cursor:pointer; transition:all .2s; }
    .insc-filter-btn:hover { background:#E8F2FF; color:#0B63C7; }
    .insc-filter-btn.active { background:#0B63C7; color:white; box-shadow:0 4px 12px rgba(11,99,199,.25); }
  `;
  document.head.appendChild(s);
}

export function filterStatus(filter) {
  document.querySelectorAll('.insc-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  document.querySelectorAll('#inscripcionesTbody tr').forEach(tr => {
    let show = false;
    if (filter === 'all') show = true;
    else if (filter === 'pending' || filter === 'admitted' || filter === 'rejected') show = (tr.dataset.status === filter);
    else if (filter === 'age-out') show = (tr.dataset.ageOut === '1');
    else if (filter === 'auth-pending') show = (tr.dataset.authPending === '1');
    tr.style.display = show ? '' : 'none';
  });
}

export async function openAdmitModal(preregId) {
  const { data: reg, error } = await supabase
    .from('student_preregistrations')
    .select('*')
    .eq('id', preregId)
    .single();

  if (error || !reg) { Helpers.toast('No se pudo cargar el registro', 'error'); return; }

  if (reg.age_match === false && reg.director_authorization_approved !== true) {
    Helpers.toast('Requiere aprobación de Directora: ver detalle y autorizar excepción', 'warning');
    openPreDetail(preregId);
    return;
  }

  const { StudentRecordModal } = await import('../shared/student-record-modal.js');
  StudentRecordModal.open('admit', null, reg);
}

export async function openPreDetail(preregId) {
  const gc = document.getElementById('globalModalContainer');
  if (!gc) return;

  try {
    const { data: r, error } = await supabase
      .from('student_preregistrations')
      .select('*')
      .eq('id', preregId)
      .single();

    if (error || !r) throw new Error('Registro no encontrado');

    const role = await _currentRole();
    const isDirector = role === 'directora' || role === 'admin';

    gc.style.display = 'block';
    gc.style.zIndex = '9999';
    gc.style.position = 'fixed';
    gc.innerHTML = _renderPreDetail(r, isDirector);
    _bindPreDetailEvents(r, isDirector);
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    Helpers.toast('Error: ' + e.message, 'error');
  }
}

function _calcAgeFromBirth(birthDateStr) {
  if (!birthDateStr) return null;
  const b = new Date(birthDateStr);
  const ref = new Date();
  if (isNaN(b) || b > ref) return null;
  let years = ref.getFullYear() - b.getFullYear();
  let months = ref.getMonth() - b.getMonth();
  let days = ref.getDate() - b.getDate();
  if (days < 0) { const prevM = new Date(ref.getFullYear(), ref.getMonth(), 0); days += prevM.getDate(); months--; }
  if (months < 0) { months += 12; years--; }
  const totalDays = Math.max(0, Math.round((ref.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
  return { years, months, days, totalDays };
}

function _fmtHuman(a) {
  if (!a) return '—';
  if (a.years <= 0) {
    const tms = a.years * 12 + a.months;
    const parts = [];
    if (tms) parts.push(tms + ' mes' + (tms === 1 ? '' : 'es'));
    if (a.days) parts.push(a.days + ' día' + (a.days === 1 ? '' : 's'));
    return parts.length ? parts.join(', ') : a.totalDays + ' días';
  }
  const parts = [];
  if (a.years) parts.push(a.years + ' año' + (a.years === 1 ? '' : 's'));
  if (a.months) parts.push(a.months + ' mes' + (a.months === 1 ? '' : 'es'));
  return parts.join(', ');
}

function _renderPreDetail(r, isDirector) {
  const age = _calcAgeFromBirth(r.birth_date);
  const ageStr = _fmtHuman(age);
  const sName = esc([r.student_name, r.student_last_name].filter(Boolean).join(' ') || '—');
  const auths = Array.isArray(r.authorized_persons) ? r.authorized_persons : [];

  return `
  <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-6 px-2" id="pred-overlay">
    <div class="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl animate-[fadeIn_.25s_ease] my-auto">
      <div class="flex items-start justify-between p-6 border-b border-slate-100">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-black">${esc(((r.student_name||'?').charAt(0)))}</div>
          <div>
            <h2 class="text-xl font-black text-slate-800">${sName}</h2>
            <div class="flex flex-wrap gap-1.5 mt-2">
              ${statusBadge(r.status)}
              ${ageBadge(r)}
              ${dirAuthBadge(r)}
            </div>
          </div>
        </div>
        <button class="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700" id="pred-close" title="Cerrar">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
        </button>
      </div>

      <div class="p-6 space-y-5 max-h-[75vh] overflow-y-auto">

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50">
            <h3 class="text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
              <span class="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              Datos del Estudiante
            </h3>
            <div class="grid grid-cols-2 gap-3 text-xs">
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Nombres</span><span class="block font-bold text-slate-800">${esc(r.student_name||'—')}</span></div>
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Apellidos</span><span class="block font-bold text-slate-800">${esc(r.student_last_name||'—')}</span></div>
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Fecha Nac.</span><span class="block font-bold text-slate-800">${fmt(r.birth_date)}</span></div>
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Edad</span><span class="block font-bold text-slate-800">${esc(ageStr)}</span></div>
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Sexo</span><span class="block font-bold text-slate-800">${esc(r.gender||'—')}</span></div>
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Nacionalidad</span><span class="block font-bold text-slate-800">${esc(r.nationality||'—')}</span></div>
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Nivel Solicitado</span><span class="block font-bold text-slate-800">${esc(r.level_requested||'—')}</span></div>
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Año Escolar</span><span class="block font-bold text-slate-800">${esc(r.school_year_requested||'—')}</span></div>
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Horario</span><span class="block font-bold text-slate-800">${esc(r.schedule||'—')}</span></div>
              <div><span class="block text-[10px] font-black text-slate-400 uppercase">Ingreso Estimado</span><span class="block font-bold text-slate-800">${fmt(r.estimated_entry_date)}</span></div>
            </div>
          </div>

          <div class="p-4 rounded-2xl border ${r.age_match === false ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}">
            <h3 class="text-sm font-black ${r.age_match === false ? 'text-amber-800' : 'text-emerald-800'} mb-3 flex items-center gap-2">
              <span class="w-7 h-7 rounded-lg ${r.age_match === false ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
              </span>
              Control de Edad / Autorización
            </h3>
            <div class="grid grid-cols-1 gap-2 text-xs">
              <div class="p-3 rounded-xl bg-white/60 border border-white/80">
                <span class="block text-[10px] font-black text-slate-400 uppercase">Edad Real</span>
                <span class="block font-black text-slate-800 text-sm">${esc(ageStr)} ${age ? `(${age.totalDays} días)` : ''}</span>
              </div>
              <div class="p-3 rounded-xl bg-white/60 border border-white/80">
                <span class="block text-[10px] font-black text-slate-400 uppercase">Nivel Sugerido</span>
                <span class="block font-black text-blue-700 text-sm">${esc(r.suggested_level || '—')}</span>
              </div>
              <div class="p-3 rounded-xl bg-white/60 border border-white/80">
                <span class="block text-[10px] font-black text-slate-400 uppercase">Solicitud de Autorización</span>
                <span class="block font-black text-slate-800 text-sm">${r.director_authorization_requested ? 'SÍ solicitada' : 'No solicitada'}</span>
              </div>
              ${r.director_authorization_note ? `
              <div class="p-3 rounded-xl bg-white border-l-4 border-blue-400">
                <span class="block text-[10px] font-black text-slate-400 uppercase mb-1">Motivo del Padre/Madre</span>
                <p class="text-slate-700 font-medium" style="white-space:pre-wrap">${esc(r.director_authorization_note)}</p>
              </div>` : ''}
              ${isDirector && r.age_match === false ? `
              <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                <span class="block text-[10px] font-black text-slate-500 uppercase">Resolución de Directora (solo tu)</span>
                <textarea id="pred-revnote" rows="2" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-blue-500" placeholder="Motivo de la resolución (opcional)..."></textarea>
                <div class="flex gap-2">
                  <button id="pred-approve" class="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all">Aprobar Excepción</button>
                  <button id="pred-reject" class="flex-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all">Rechazar Excepción</button>
                </div>
              </div>` : r.age_match === false ? `
              <div class="p-3 rounded-xl bg-white/80 text-center text-[11px] font-bold text-slate-500">
                Solo Directora puede aprobar/rechazar esta excepción
              </div>` : ''}
            </div>
          </div>

          <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50 md:col-span-2">
            <h3 class="text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
              <span class="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </span>
              Familiares y Contactos
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div class="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <h4 class="text-[10px] font-black uppercase text-blue-700 mb-2">Tutor Principal</h4>
                <div class="space-y-1">
                  <div><span class="text-slate-400 font-bold">Nombre: </span><span class="font-bold text-slate-800">${esc(r.p1_name||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Parentesco: </span><span class="font-bold text-slate-800">${esc(r.p1_relationship||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Cédula: </span><span class="font-bold text-slate-800">${esc(r.p1_cedula||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Teléfono: </span><span class="font-bold text-slate-800">${esc(r.p1_phone||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Correo: </span><span class="font-bold text-slate-800">${esc(r.p1_email||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Dirección: </span><span class="font-bold text-slate-800">${esc(r.p1_address||'—')}</span></div>
                </div>
              </div>
              <div class="p-3 rounded-xl bg-orange-50 border border-orange-100">
                <h4 class="text-[10px] font-black uppercase text-orange-700 mb-2">Tutor Secundario</h4>
                <div class="space-y-1">
                  <div><span class="text-slate-400 font-bold">Nombre: </span><span class="font-bold text-slate-800">${esc(r.p2_name||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Parentesco: </span><span class="font-bold text-slate-800">${esc(r.p2_relationship||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Cédula: </span><span class="font-bold text-slate-800">${esc(r.p2_cedula||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Teléfono: </span><span class="font-bold text-slate-800">${esc(r.p2_phone||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Correo: </span><span class="font-bold text-slate-800">${esc(r.p2_email||'—')}</span></div>
                </div>
              </div>
              <div class="p-3 rounded-xl bg-rose-50 border border-rose-100">
                <h4 class="text-[10px] font-black uppercase text-rose-700 mb-2">Contacto de Emergencia</h4>
                <div class="space-y-1">
                  <div><span class="text-slate-400 font-bold">Nombre: </span><span class="font-bold text-slate-800">${esc(r.emergency_name||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Parentesco: </span><span class="font-bold text-slate-800">${esc(r.emergency_relationship||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Teléfono: </span><span class="font-bold text-slate-800">${esc(r.emergency_phone||'—')}</span></div>
                  <div><span class="text-slate-400 font-bold">Cédula: </span><span class="font-bold text-slate-800">${esc(r.emergency_cedula||'—')}</span></div>
                </div>
              </div>
              <div class="p-3 rounded-xl bg-amber-50 border border-amber-100">
                <h4 class="text-[10px] font-black uppercase text-amber-700 mb-2">Personas Autorizadas a Recoger</h4>
                ${auths.length ? `
                <div class="space-y-1">
                  ${auths.map(a => `
                    <div class="p-2 bg-white/70 rounded-lg">
                      <span class="block font-bold text-slate-800">${esc(a.name||'')}</span>
                      <span class="block text-[11px] text-slate-500">${esc(a.relationship||'')} • ${esc(a.phone||'')}</span>
                    </div>
                  `).join('')}
                </div>` : `<span class="text-slate-400 text-[11px] italic">No hay personas registradas</span>`}
              </div>
            </div>
          </div>

          <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50 md:col-span-2">
            <h3 class="text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
              <span class="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </span>
              Timeline
            </h3>
            <div class="relative pl-5 space-y-3 border-l-2 border-slate-100 ml-2">
              <div class="relative">
              <span class="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-blue-500"></span>
                <p class="text-xs font-bold text-slate-700">Preinscripción enviada</p>
                <p class="text-[11px] text-slate-400 font-bold">${fmtDT(r.created_at)}</p>
              </div>
              ${r.director_authorization_approved === true ? `<div class="relative"><span class="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-emerald-500"></span><p class="text-xs font-bold text-slate-700">Autorización de edad Aprobada por Directora</p><p class="text-[11px] text-slate-400 font-bold">${fmtDT(r.reviewed_at || r.created_at)}</p></div>` : ''}
              ${r.director_authorization_approved === false ? `<div class="relative"><span class="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-rose-500"></span><p class="text-xs font-bold text-slate-700">Autorización Rechazada</p><p class="text-[11px] text-slate-400 font-bold">${fmtDT(r.reviewed_at || r.created_at)}</p></div>` : ''}
              ${r.status === 'admitted' ? `<div class="relative"><span class="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-green-500"></span><p class="text-xs font-bold text-slate-700">Estudiante Admitido</p><p class="text-[11px] text-slate-400 font-bold">${fmtDT(r.reviewed_at)}</p></div>` : ''}
            </div>
          </div>

        </div>

      </div>

      <div class="flex justify-between items-center p-5 border-t border-slate-100 bg-slate-50/50 rounded-b-3xl">
        <button id="pred-close2" class="px-5 py-2.5 text-slate-500 font-black text-xs uppercase hover:bg-slate-100 rounded-xl transition-all">Cerrar</button>
        ${r.status === 'pending' ? `
          <button id="pred-admit" class="px-5 py-2.5 bg-gradient-to-r from-[#0B63C7] to-[#0850A0] text-white font-black text-xs uppercase rounded-xl shadow-md hover:shadow-lg transition-all ${r.age_match === false && r.director_authorization_approved !== true ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}">
            ${r.age_match === false && r.director_authorization_approved !== true ? '🔒 Requiere Autorización' : 'Ir a Admitir →'}
          </button>
        ` : ''}
      </div>
    </div>
  </div>`;
}

function _bindPreDetailEvents(r, isDirector) {
  const close = () => {
    const gc = document.getElementById('globalModalContainer');
    if (gc) { gc.style.display = 'none'; gc.innerHTML = ''; }
  };
  const bindId = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  const overlay = document.getElementById('pred-overlay');
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  bindId('pred-close', close);
  bindId('pred-close2', close);
  bindId('pred-admit', () => {
    close();
    openAdmitModal(r.id);
  });
  if (isDirector && r.age_match === false) {
    const doAuth = async (approved, verb) => {
      const noteEl = document.getElementById('pred-revnote');
      const note = noteEl?.value?.trim() || '';
      const appState = await _getAppState();
      const uid = appState?.get?.('user')?.id || null;
      const prevNote = r.director_authorization_note || '';
      const stamp = `\n\n[${new Date().toLocaleString('es-DO')} — Resolución ${approved ? 'APROBADA' : 'RECHAZADA'} por Directora]\n${note}`;
      const finalNote = (prevNote ? prevNote : '') + stamp;
      try {
        const { error } = await supabase
          .from('student_preregistrations')
          .update({
            director_authorization_approved: approved,
            director_authorization_note: finalNote,
            reviewed_at: new Date().toISOString(),
            reviewed_by: uid
          })
          .eq('id', r.id);
        if (error) throw error;
        Helpers.toast(verb + ' exitosa', 'success');
        close();
        loadInscripciones();
      } catch (e) {
        const msg = e.message || String(e);
        const rlsHint = /403|policy|permission|denied/i.test(msg) ? ' Permiso denegado (RLS): contacta al administrador para revisar políticas.' : '';
        Helpers.toast('Error: ' + msg + rlsHint, 'error');
      }
    };
    bindId('pred-approve', () => doAuth(true, 'Aprobación'));
    bindId('pred-reject', () => doAuth(false, 'Rechazo'));
  }
}

function _attachPreDetailStyles() {
  const style = document.getElementById('_inscPredStyle');
  if (style) return;
  const s = document.createElement('style');
  s.id = '_inscPredStyle';
  s.textContent = `@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`;
  document.head.appendChild(s);
}

let _admittingStudent = false;
export async function _legacyAdmitStudent(preregId) {
  if (_admittingStudent) return;

  _admittingStudent = true;
  const btn = document.getElementById('btnConfirmAdmit');
  if (btn) {
    btn.style.opacity = '0.75';
    btn.style.cursor = 'not-allowed';
    btn.style.pointerEvents = 'none';
    btn.textContent = '⏳ Procesando...';
  }

  try {
    const { data: reg, error: regErr } = await supabase
      .from('student_preregistrations')
      .select('*')
      .eq('id', preregId)
      .single();
    if (regErr || !reg) throw new Error('Registro no encontrado');
    if (reg.status === 'admitted') throw new Error('El estudiante ya fue admitido');

    const v = (id) => document.getElementById(id)?.value?.trim() || null;
    const n = (id, def = 0) => { const val = parseFloat(document.getElementById(id)?.value); return isNaN(val) ? def : val; };

    const classroomId   = v('stClassroom');
    const password      = v('stPassword') || 'sonrisa123';
    const monthlyFee    = n('monthlyFee', 3000);
    const dueDay        = parseInt(document.getElementById('dueDay')?.value) || 5;
    const startMonth    = v('admitStartMonth') || new Date().toISOString().slice(0,7);
    const matricula     = v('stMatricula') || ('MSC-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*9000)+1000));
    const emailUser     = v('stEmailUser') || reg.p1_email;
    const siblingId     = v('stSiblingId');

    if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
    if (!emailUser)    throw new Error('El registro no tiene email del tutor');

    const studentPayload = {
      name:                  v('stName') || reg.student_name,
      last_name:             v('stLastname') || reg.student_last_name,
      matricula,
      classroom_id:          classroomId ? parseInt(classroomId) : null,
      schedule:              v('stHorario') || reg.schedule,
      start_date:            document.getElementById('stJoinedDate')?.value || new Date().toISOString().split('T')[0],
      is_active:             document.getElementById('active')?.checked ?? true,
      allergies:             v('allergies') || reg.allergies,
      authorized_pickup:     v('authorized'),
      authorized_pickup_phone: v('authorizedPhone'),
      p1_name:               v('p1Name') || reg.p1_name,
      p1_phone:              v('p1Phone') || reg.p1_phone,
      p1_email:              v('stEmailNotif') || reg.p1_email,
      p1_job:                v('p1Profession'),
      p1_address:            v('p1Address') || reg.p1_address,
      p1_emergency_contact:  v('p1Emergency'),
      p2_name:               v('p2Name') || reg.p2_name,
      p2_phone:              v('p2Phone') || reg.p2_phone,
      monthly_fee:           monthlyFee,
      due_day:               dueDay,
      payment_plan:          v('paymentPlan') || 'monthly',
    };

    let parentUserId = null;

    if (siblingId) {
      const sibSel = document.getElementById('stSiblingId');
      const sibOpt = sibSel?.options[sibSel?.selectedIndex];
      parentUserId  = sibOpt?.dataset?.parentId || null;
    }

    if (!parentUserId) {
      const { data: signupData, error: signupErr } = await supabase.auth.signUp({
        email: emailUser,
        password,
        options: { data: { role: 'padre', full_name: studentPayload.p1_name } }
      });

      if (signupData?.user?.id) {
        parentUserId = signupData.user.id;
      } else if (signupErr?.message?.toLowerCase().includes('already registered') ||
                 signupErr?.status === 422 ||
                 signupErr?.message?.toLowerCase().includes('user already')) {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', emailUser)
          .maybeSingle();
        if (existingProfile?.id) parentUserId = existingProfile.id;
      }
      if (!parentUserId && signupData?.user?.identities?.length === 0 && signupData?.user?.id) {
        parentUserId = signupData.user.id;
      }
    }

    if (parentUserId) {
      const profileData = {
        id:    parentUserId,
        name:  studentPayload.p1_name || '',
        email: emailUser,
        phone: studentPayload.p1_phone || '',
        role:  'padre',
      };
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id', ignoreDuplicates: false });

      if (profileErr) {
        try {
          await supabase.from('profiles').update({
            name:  profileData.name,
            email: profileData.email,
            phone: profileData.phone,
            role:  'padre',
          }).eq('id', parentUserId);
        } catch (_) {}
        console.warn('[Inscripciones] profile upsert fell back to update:', profileErr.message);
      }
      studentPayload.parent_id = parentUserId;
    }

    const { data: existingStudent } = await supabase
      .from('students')
      .select('id')
      .eq('matricula', matricula)
      .maybeSingle();
    if (existingStudent) throw new Error(`Ya existe un estudiante con la matrícula: ${matricula}`);

    const { data: student, error: stuErr } = await supabase
      .from('students')
      .insert(studentPayload)
      .select('id')
      .single();
    if (stuErr) throw new Error('Error creando estudiante: ' + stuErr.message);

    const studentId = student.id;

    let plan = null;
    try {
      const { data } = await supabase
        .from('payment_plans')
        .insert({ student_id: studentId, monthly_fee: monthlyFee, due_day: dueDay, status: 'active', start_date: `${startMonth}-01` })
        .select('id')
        .single();
      plan = data;
    } catch (e) {
      console.warn('[Inscripciones] payment plan insert:', e.message);
      plan = null;
    }

    if (plan?.id) {
      const payments = [];
      const [yr, mo] = startMonth.split('-').map(Number);
      for (let i = 0; i < MONTHS_IN_YEAR; i++) {
        const d  = new Date(yr, mo - 1 + i, dueDay);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        payments.push({ student_id: studentId, payment_plan: plan.id, amount: monthlyFee, month_paid: `${mm}/${yy}`, due_date: d.toISOString().split('T')[0], status: 'pending' });
      }
      try {
        await supabase.from('payments').insert(payments);
      } catch (e) {
        console.warn('[Inscripciones] payments insert:', e.message);
      }
    }

    const appState = await _getAppState();
    await supabase.from('student_preregistrations').update({
      status: 'admitted', reviewed_at: new Date().toISOString(), reviewed_by: appState?.get('user')?.id || null
    }).eq('id', preregId);

    if (window.App?.ui?.closeModal) {
      window.App.ui.closeModal();
    } else {
      const gc = document.getElementById('globalModalContainer');
      if (gc) { gc.style.display = 'none'; gc.innerHTML = ''; }
      document.getElementById('admitStudentOverlay')?.remove();
    }

    Helpers.toast(`✅ ${studentPayload.name} admitido — Matrícula: ${matricula}`, 'success');
    loadInscripciones();

    if (typeof window.App?.students?.init === 'function') {
      const currentSection = document.querySelector('.section.active')?.id;
      if (currentSection === 'estudiantes') window.App.students.init();
    }

  } catch (err) {
    console.error('[Inscripciones] admitStudent error:', err);
    Helpers.toast('Error: ' + err.message, 'error');
    if (btn) {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.pointerEvents = 'auto';
      btn.innerHTML = '✅ Confirmar Admisión';
    }
  } finally {
    _admittingStudent = false;
  }
}

export async function admitStudent(preregId) {
  try {
    const { StudentRecordModal } = await import('../shared/student-record-modal.js');
    const { data: reg } = await supabase.from('student_preregistrations').select('*').eq('id', preregId).single();
    if (reg) StudentRecordModal.open('admit', null, reg);
  } catch (_) {
    return _legacyAdmitStudent(preregId);
  }
}

export const InscripcionesModule = {
  load:        loadInscripciones,
  destroy:     destroyInscripciones,
  filterStatus,
  openAdmitModal,
  openPreDetail,
  admitStudent
};
