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

/** Mapa estado de fila → color del degradado del avatar. */
const AVATAR_TONE = {
  'is-pending':  'amber',
  'is-admitted': 'emerald',
  'is-rejected': 'rose',
  'is-vauth':    'violet',
  'is-vok':      'teal',
  'is-vno':      'red',
  'is-neutral':  'blue',
};

/** Foto real del estudiante si el padre la subió; si no, inicial sobre degradado. */
function avatarHtml(r, { size = 'md', tone = 'is-neutral' } = {}) {
  const initial = esc(((r.student_name || '?').charAt(0)).toUpperCase());
  const photo   = r.photo_url || r.student_photo_url || '';
  const cls     = `insc-avatar insc-avatar--${size} insc-avatar--${AVATAR_TONE[tone] || 'blue'}`;
  if (!photo) return `<div class="${cls} insc-avatar--empty" aria-hidden="true">${initial}</div>`;
  return `<div class="${cls}">
    <span class="insc-avatar__init" aria-hidden="true">${initial}</span>
    <img src="${esc(photo)}" alt="Foto de ${esc(fullNameSafe(r))}" loading="lazy" decoding="async"
         onerror="this.remove()">
  </div>`;
}

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
        gender,
        nationality,
        photo_url,
        student_photo_url,
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

      <!-- Filters: scroll horizontal en móvil, wrap en escritorio -->
      <div class="insc-filters" role="group" aria-label="Filtrar preinscripciones">
        <button type="button" onclick="InscripcionesModule.filterStatus('all')" class="insc-filter-btn active" data-filter="all">Todos <span class="insc-filter-btn__n">${data.length}</span></button>
        <button type="button" onclick="InscripcionesModule.filterStatus('pending')" class="insc-filter-btn" data-filter="pending">Pendientes <span class="insc-filter-btn__n">${pending.length}</span></button>
        <button type="button" onclick="InscripcionesModule.filterStatus('admitted')" class="insc-filter-btn" data-filter="admitted">Admitidos <span class="insc-filter-btn__n">${admitted.length}</span></button>
        <button type="button" onclick="InscripcionesModule.filterStatus('age-out')" class="insc-filter-btn" data-filter="age-out">Edad fuera <span class="insc-filter-btn__n">${ageOutOfRange.length}</span></button>
        <button type="button" onclick="InscripcionesModule.filterStatus('auth-pending')" class="insc-filter-btn" data-filter="auth-pending">Autoriz. pend. <span class="insc-filter-btn__n">${authPending.length}</span></button>
      </div>

      <!-- Tabla compacta: avatar del estudiante, celdas reducidas y scroll en móvil -->
      <div class="table-panel">
        <div class="insc-table-wrap">
          <table class="data-table insc-table" id="inscripcionesTable">
            <thead>
              <tr>
                <th class="insc-th insc-th--student">Estudiante</th>
                <th class="insc-th">Sección / Edad</th>
                <th class="insc-th hidden md:table-cell">Tutor</th>
                <th class="insc-th hidden lg:table-cell">Solicitado</th>
                <th class="insc-th insc-th--center">Estado</th>
                <th class="insc-th insc-th--center">Acciones</th>
              </tr>
            </thead>
            <tbody id="inscripcionesTbody">
              ${data.map(r => _renderRow(r)).join('')}
            </tbody>
          </table>
        </div>
        <p class="insc-table-hint">Desliza la tabla para ver todas las columnas →</p>
      </div>`;

    _attachStyles();
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
  const needsAuth = r.age_match === false && r.director_authorization_approved !== true;

  /* ── Acciones: cada estado tiene su diseño. Nada de guiones sueltos. ── */
  const detailBtn = `
    <button type="button" onclick="InscripcionesModule.openPreDetail(${r.id})"
      class="insc-btn insc-btn--ghost" title="Ver expediente completo" aria-label="Ver expediente de ${esc(fullNameSafe(r))}">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
      <span>Ver</span>
    </button>`;

  let actionCell;
  if (r.status === 'pending' && needsAuth) {
    actionCell = `
      <span class="insc-lock" title="Requiere aprobación de la Directora por edad fuera de rango">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Aprobar edad</span>
      </span>`;
  } else if (r.status === 'pending') {
    actionCell = `
      <button type="button" onclick="InscripcionesModule.openAdmitModal(${r.id})"
        class="insc-btn insc-btn--admit" title="Iniciar el proceso de admisión">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        <span>Admitir</span>
      </button>`;
  } else if (r.status === 'admitted') {
    actionCell = `
      <span class="insc-done insc-done--ok" title="Estudiante ya admitido">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Admitido</span>
      </span>`;
  } else if (r.status === 'rejected') {
    actionCell = `
      <span class="insc-done insc-done--no" title="Solicitud rechazada">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
        <span>Rechazado</span>
      </span>`;
  } else {
    actionCell = `<span class="insc-done insc-done--wait"><span class="insc-done__dot"></span><span>En revisión</span></span>`;
  }

  const fullName = [r.student_name, r.student_last_name].filter(Boolean).join(' ') || '—';
  const levelParts = [r.level_requested, r.school_year_requested].filter(Boolean);
  const nivelTag = levelParts.length ? `<span class="insc-chip insc-chip--level">${esc(levelParts.join(' · '))}</span>` : '';
  const scheduleTag = r.schedule ? `<span class="insc-chip">${esc(r.schedule)}</span>` : '';

  const age = _calcAgeFromBirth(r.birth_date);
  const ageStr = age ? _fmtHuman(age) : '';
  const ageTxtTag = ageStr ? `<span class="insc-chip insc-chip--age">${esc(ageStr)}</span>` : '';

  const dataAgeOut = r.age_match === false ? 'data-age-out="1"' : '';
  const dataAuthPending = (!r.age_match && r.director_authorization_requested && r.director_authorization_approved === null) ? 'data-auth-pending="1"' : '';

  const status = r.status || '';
  let rowTone = 'is-neutral';
  if (status === 'pending')  rowTone = 'is-pending';
  if (status === 'admitted') rowTone = 'is-admitted';
  if (status === 'rejected') rowTone = 'is-rejected';

  if (r.age_match === false && r.director_authorization_approved === null)      rowTone = 'is-vauth';
  else if (r.age_match === false && r.director_authorization_approved === true)  rowTone = 'is-vok';
  else if (r.age_match === false && r.director_authorization_approved === false) rowTone = 'is-vno';

  const p1Email = r.p1_email || '';
  return `
    <tr data-status="${esc(r.status)}" ${dataAgeOut} ${dataAuthPending} class="insc-row ${rowTone}">
      <td class="insc-td insc-td--student">
        <div class="insc-student">
          ${avatarHtml(r, { size: 'md', tone: rowTone })}
          <div class="insc-student__txt">
            <div class="insc-student__name" title="${esc(fullName)}">${esc(fullName)}</div>
            <div class="insc-student__badges">${ageBadge(r)}${dirAuthBadge(r)}</div>
          </div>
        </div>
      </td>
      <td class="insc-td">
        <div class="insc-stack">${ageTxtTag}${nivelTag}${scheduleTag}${(!nivelTag && !scheduleTag && !ageTxtTag) ? '<span class="insc-empty">—</span>' : ''}</div>
      </td>
      <td class="insc-td hidden md:table-cell">
        <div class="insc-tutor__name">${esc(r.p1_name || '—')}</div>
        ${r.p1_phone ? `<div class="insc-tutor__meta">${esc(r.p1_phone)}</div>` : ''}
        ${p1Email ? `<div class="insc-tutor__meta" title="${esc(p1Email)}">${esc(p1Email)}</div>` : ''}
      </td>
      <td class="insc-td hidden lg:table-cell insc-when">${fmt(r.created_at)}</td>
      <td class="insc-td insc-td--center">${statusBadge(r.status)}</td>
      <td class="insc-td insc-td--center">
        <div class="insc-actions">${detailBtn}${actionCell}</div>
      </td>
    </tr>`;
}

function fullNameSafe(r) {
  return [r.student_name, r.student_last_name].filter(Boolean).join(' ') || 'estudiante';
}

function _attachStyles() {
  const style = document.getElementById('_inscStyles');
  if (style) return;
  const s = document.createElement('style');
  s.id = '_inscStyles';
  s.textContent = `
/* ═══════════ INSCRIPCIONES — filtros ═══════════ */
.insc-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 18px;
  padding-bottom: 4px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.insc-filters::-webkit-scrollbar { display: none; }
.insc-filter-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid #E2E8F0;
  border-radius: 999px;
  background: #F8FAFC;
  color: #475569;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
  transition: background .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease;
  -webkit-tap-highlight-color: transparent;
}
.insc-filter-btn:hover { background: #E8F2FF; color: #0B63C7; border-color: #BFDBFE; }
.insc-filter-btn.active {
  background: linear-gradient(135deg, #0B63C7, #2563EB);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 6px 14px -6px rgba(11,99,199,.55);
}
.insc-filter-btn:focus-visible { outline: 3px solid rgba(11,99,199,.3); outline-offset: 2px; }
.insc-filter-btn__n {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 5px;
  border-radius: 999px;
  background: #E2E8F0;
  color: #334155;
  font-size: 10.5px;
  font-weight: 900;
  line-height: 1;
}
.insc-filter-btn.active .insc-filter-btn__n { background: rgba(255,255,255,.24); color: #fff; }

/* ═══════════ INSCRIPCIONES — tabla compacta ═══════════ */
.insc-table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 18px;
  background: #fff;
  border: 1px solid #E2E8F0;
  box-shadow: 0 8px 22px -14px rgba(15,23,42,.28);
}
.insc-table-wrap .insc-table {
  width: 100%;
  min-width: 560px;
  border-collapse: separate;
  border-spacing: 0;
  border: 0;
  border-radius: 0;
  background: #fff;
  font-size: 13px;
}
.insc-table thead th {
  position: sticky;
  top: 0;
  z-index: 5;
  padding: 9px 12px;
  background: linear-gradient(135deg, #0B63C7 0%, #2563EB 100%);
  color: #fff;
  font-size: 10.5px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .08em;
  text-align: left;
  white-space: nowrap;
  border: 0;
}
.insc-th--center { text-align: center !important; }

.insc-table .insc-row td {
  padding: 9px 12px;
  border-bottom: 1px solid #F1F5F9;
  vertical-align: middle;
  color: #334155;
  font-size: 13px;
}
.insc-table .insc-row:last-child td { border-bottom: 0; }
.insc-td--center { text-align: center; }

/* Tonalidad por estado (sustituye los degradados inline) */
.insc-row.is-pending  { background: linear-gradient(90deg, #FFFBEB, #fff 55%); box-shadow: inset 3px 0 0 #FBBF24; }
.insc-row.is-admitted { background: linear-gradient(90deg, #ECFDF5, #fff 55%); box-shadow: inset 3px 0 0 #10B981; }
.insc-row.is-rejected { background: linear-gradient(90deg, #FFF1F2, #fff 55%); box-shadow: inset 3px 0 0 #F43F5E; }
.insc-row.is-vauth    { background: linear-gradient(90deg, #F5F3FF, #fff 55%); box-shadow: inset 3px 0 0 #8B5CF6; }
.insc-row.is-vok      { background: linear-gradient(90deg, #F0FDFA, #fff 55%); box-shadow: inset 3px 0 0 #14B8A6; }
.insc-row.is-vno      { background: linear-gradient(90deg, #FEF2F2, #fff 55%); box-shadow: inset 3px 0 0 #DC2626; }
.insc-row.is-neutral  { background: #fff; box-shadow: inset 3px 0 0 #E2E8F0; }
.insc-table .insc-row:hover td { background: rgba(224,242,254,.55); }

/* ── Estudiante + avatar ── */
.insc-student { display: flex; align-items: center; gap: 10px; min-width: 0; }
.insc-student__txt { min-width: 0; }
.insc-student__name {
  font-size: 13.5px;
  font-weight: 900;
  color: #0F172A;
  line-height: 1.25;
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.insc-student__badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.insc-student__badges > span {
  display: inline-flex !important;
  align-items: center;
  gap: 3px;
  padding: 2px 7px !important;
  border-radius: 999px !important;
  font-size: 9.5px !important;
  font-weight: 900 !important;
  line-height: 1.5;
  white-space: nowrap;
}

.insc-avatar {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #0B63C7, #4F46E5);
  color: #fff;
  font-weight: 900;
  font-size: 15px;
  line-height: 1;
  box-shadow: 0 4px 10px -5px rgba(11,99,199,.75);
}
.insc-avatar--sm { width: 30px; height: 30px; border-radius: 10px; font-size: 12px; }
.insc-avatar--lg { width: 48px; height: 48px; border-radius: 15px; font-size: 19px; }
.insc-avatar--amber  { background: linear-gradient(135deg, #F59E0B, #D97706); }
.insc-avatar--emerald{ background: linear-gradient(135deg, #10B981, #059669); }
.insc-avatar--rose   { background: linear-gradient(135deg, #FB7185, #E11D48); }
.insc-avatar--violet { background: linear-gradient(135deg, #A78BFA, #7C3AED); }
.insc-avatar--teal   { background: linear-gradient(135deg, #2DD4BF, #0D9488); }
.insc-avatar--red    { background: linear-gradient(135deg, #F87171, #DC2626); }
.insc-avatar--slate  { background: linear-gradient(135deg, #94A3B8, #64748B); }
.insc-avatar img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 1;
}
.insc-avatar__init { position: relative; z-index: 0; }
/* Si la foto falla, el <img> se quita y la inicial queda visible */
.insc-avatar.is-fallback { background: linear-gradient(135deg, #CBD5E1, #94A3B8); }

/* ── Chips de sección / edad ── */
.insc-stack { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.insc-chip {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  background: #F1F5F9;
  color: #475569;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.6;
  white-space: nowrap;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.insc-chip--level { background: #E8F2FF; color: #0B63C7; }
.insc-chip--age   { background: #FFF7ED; color: #C2410C; }
.insc-empty { color: #CBD5E1; font-weight: 900; font-size: 12px; }

/* ── Tutor / fecha ── */
.insc-tutor__name { font-size: 12.5px; font-weight: 800; color: #1E293B; line-height: 1.3; }
.insc-tutor__meta {
  font-size: 11px;
  font-weight: 600;
  color: #64748B;
  line-height: 1.4;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.insc-when { font-size: 12px; font-weight: 700; color: #64748B; white-space: nowrap; }

/* ── Acciones ── */
.insc-actions { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; }
.insc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 34px;
  padding: 6px 12px;
  border: 0;
  border-radius: 10px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
  -webkit-tap-highlight-color: transparent;
}
.insc-btn--ghost {
  background: #F1F5F9;
  color: #475569;
  box-shadow: inset 0 0 0 1px #E2E8F0;
}
.insc-btn--ghost:hover { background: #E2E8F0; color: #1E293B; }
.insc-btn--admit {
  background: linear-gradient(135deg, #0B63C7, #0850A0);
  color: #fff;
  box-shadow: 0 5px 12px -5px rgba(11,99,199,.85);
}
.insc-btn--admit:hover { filter: brightness(1.08); transform: translateY(-1px); }
.insc-btn:active { transform: translateY(0) scale(.97); }
.insc-btn:focus-visible { outline: 3px solid rgba(11,99,199,.3); outline-offset: 2px; }

/* Estados finales: pastilla, no un guion suelto */
.insc-done, .insc-lock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .06em;
  line-height: 1;
  white-space: nowrap;
}
.insc-done--ok   { background: #DCFCE7; color: #15803D; box-shadow: inset 0 0 0 1px #86EFAC; }
.insc-done--no   { background: #FFE4E6; color: #BE123C; box-shadow: inset 0 0 0 1px #FDA4AF; }
.insc-done--wait { background: #F1F5F9; color: #64748B; box-shadow: inset 0 0 0 1px #E2E8F0; }
.insc-done__dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor; opacity: .6;
}
.insc-lock {
  background: #F5F3FF;
  color: #6D28D9;
  box-shadow: inset 0 0 0 1px #DDD6FE;
  cursor: help;
}

.insc-table-hint {
  display: none;
  margin: 8px 2px 0;
  font-size: 11px;
  font-weight: 800;
  color: #94A3B8;
}
@media (max-width: 767px) {
  .insc-table-hint { display: block; }
  .insc-student__name { max-width: 130px; }
  .insc-chip { max-width: 130px; }
}
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
          ${avatarHtml(r, { size: 'lg', tone: r.status === 'admitted' ? 'is-admitted' : (r.status === 'rejected' ? 'is-rejected' : 'is-pending') })}
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
    try {
      if (typeof window.refreshPreBadge === 'function') {
        window.refreshPreBadge();
      } else {
        const ids = ['badge-ciclo-group', 'badge-inscripciones', 'badge-ciclo'];
        ids.forEach((bid) => {
          const b = document.getElementById(bid);
          if (!b) return;
          supabase.from('student_preregistrations').select('id', { count: 'exact', head: true }).eq('status', 'pending')
            .then(({ count = 0 }) => {
              if (count > 0) { b.textContent = count > 99 ? '99+' : String(count); b.classList.remove('hidden'); }
              else { b.classList.add('hidden'); }
            }).catch(() => {});
        });
      }
    } catch (_) {}

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
