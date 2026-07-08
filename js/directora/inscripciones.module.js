/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  MÓDULO INSCRIPCIONES — Panel Directora / Asistente      ║
 * ║  Lee: student_preregistrations (status=pending/admitted) ║
 * ║  Admite: students → profiles → payment_plans →           ║
 * ║          monthly_payments → status=admitted              ║
 * ╚══════════════════════════════════════════════════════════╝
 */
import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

// AppState: works for both directora and asistente panels
// Uses a lazy import so the module can be shared across panels
let _AppState = null;
async function _getAppState() {
  if (_AppState) return _AppState;
  // Try directora state first, then asistente
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

// ── Constantes ──────────────────────────────────────────────
const SCHOOL_SETTINGS_ID = 1;
const MONTHS_IN_YEAR     = 12;

// ── Helpers locales ──────────────────────────────────────────
const esc = (s = '') => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const fmt = (d) => d
  ? new Date(d).toLocaleDateString('es-DO', { day:'2-digit', month:'short', year:'numeric' })
  : '—';

const statusBadge = (s) => ({
  pending:  '<span class="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-black rounded-full uppercase">Pendiente</span>',
  admitted: '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-black rounded-full uppercase">Admitido</span>',
  rejected: '<span class="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase">Rechazado</span>',
})[s] || `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black rounded-full uppercase">${esc(s)}</span>`;

// ── Realtime subscription ────────────────────────────────────
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

// ── Main render ──────────────────────────────────────────────
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
      .select('id, student_name, birth_date, gender, section, schedule, p1_name, p1_phone, p1_email, status, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 text-slate-400">
          <div class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">📋</div>
          <h3 class="font-black text-slate-500 mb-2">Sin preinscripciones</h3>
          <p class="text-sm">Cuando un padre llene el formulario aparecerá aquí.</p>
        </div>`;
      return;
    }

    const pending  = data.filter(r => r.status === 'pending');
    const admitted = data.filter(r => r.status === 'admitted');
    const rejected = data.filter(r => r.status === 'rejected');

    container.innerHTML = `
      <!-- KPIs -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
          <p class="text-2xl font-black text-yellow-700">${pending.length}</p>
          <p class="text-xs font-black text-yellow-600 uppercase tracking-wide">Pendientes</p>
        </div>
        <div class="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
          <p class="text-2xl font-black text-green-700">${admitted.length}</p>
          <p class="text-xs font-black text-green-600 uppercase tracking-wide">Admitidos</p>
        </div>
        <div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
          <p class="text-2xl font-black text-red-700">${rejected.length}</p>
          <p class="text-xs font-black text-red-600 uppercase tracking-wide">Rechazados</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex gap-2 mb-4 flex-wrap">
        <button onclick="InscripcionesModule.filterStatus('all')"      class="insc-filter-btn active px-4 py-2 rounded-xl text-xs font-black" data-status="all">Todos (${data.length})</button>
        <button onclick="InscripcionesModule.filterStatus('pending')"  class="insc-filter-btn px-4 py-2 rounded-xl text-xs font-black" data-status="pending">Pendientes (${pending.length})</button>
        <button onclick="InscripcionesModule.filterStatus('admitted')" class="insc-filter-btn px-4 py-2 rounded-xl text-xs font-black" data-status="admitted">Admitidos (${admitted.length})</button>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm" id="inscripcionesTable">
            <thead class="bg-[#E8F2FF]">
              <tr>
                <th class="px-4 py-3 text-left text-[10px] font-black text-[#0850A0] uppercase tracking-wider">Estudiante</th>
                <th class="px-4 py-3 text-left text-[10px] font-black text-[#0850A0] uppercase tracking-wider hidden md:table-cell">Sección</th>
                <th class="px-4 py-3 text-left text-[10px] font-black text-[#0850A0] uppercase tracking-wider hidden md:table-cell">Tutor</th>
                <th class="px-4 py-3 text-left text-[10px] font-black text-[#0850A0] uppercase tracking-wider hidden lg:table-cell">Fecha</th>
                <th class="px-4 py-3 text-center text-[10px] font-black text-[#0850A0] uppercase tracking-wider">Estado</th>
                <th class="px-4 py-3 text-center text-[10px] font-black text-[#0850A0] uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50" id="inscripcionesTbody">
              ${data.map(r => _renderRow(r)).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    _attachFilterStyles();
    _subscribeRealtime();

  } catch (err) {
    container.innerHTML = `<div class="p-6 text-red-600 font-bold">Error al cargar: ${esc(err.message)}</div>`;
    console.error('[Inscripciones] load error:', err);
  }
}

function _renderRow(r) {
  const age = r.birth_date
    ? Math.floor((Date.now() - new Date(r.birth_date)) / (365.25 * 24 * 3600 * 1000))
    : '?';

  const admitBtn = r.status === 'pending'
    ? `<button onclick="InscripcionesModule.openAdmitModal(${r.id})"
         class="px-3 py-1.5 bg-[#0B63C7] text-white rounded-xl text-[10px] font-black uppercase hover:bg-[#0850A0] transition-all shadow-sm">
         ✅ Admitir
       </button>`
    : `<span class="text-[10px] text-slate-400 font-bold">—</span>`;

  return `
    <tr data-status="${esc(r.status)}" class="hover:bg-slate-50 transition-colors">
      <td class="px-4 py-3">
        <div class="font-bold text-slate-800">${esc(r.student_name)}</div>
        <div class="text-[10px] text-slate-400 font-bold">${age} años · ${esc(r.gender || '')}</div>
      </td>
      <td class="px-4 py-3 hidden md:table-cell">
        <span class="px-2 py-0.5 bg-[#E8F2FF] text-[#0B63C7] text-[10px] font-black rounded-full">${esc(r.section || '—')}</span>
      </td>
      <td class="px-4 py-3 hidden md:table-cell">
        <div class="font-bold text-slate-700 text-xs">${esc(r.p1_name || '—')}</div>
        <div class="text-[10px] text-slate-400">${esc(r.p1_phone || '')}</div>
      </td>
      <td class="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">${fmt(r.created_at)}</td>
      <td class="px-4 py-3 text-center">${statusBadge(r.status)}</td>
      <td class="px-4 py-3 text-center">${admitBtn}</td>
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

// ── Filter ────────────────────────────────────────────────────
export function filterStatus(status) {
  document.querySelectorAll('.insc-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.status === status);
  });
  document.querySelectorAll('#inscripcionesTbody tr').forEach(tr => {
    tr.style.display = (status === 'all' || tr.dataset.status === status) ? '' : 'none';
  });
}

// ── Admit Modal — usa el mismo modal completo de Estudiantes ─────
export async function openAdmitModal(preregId) {
  const { data: reg, error } = await supabase
    .from('student_preregistrations')
    .select('*')
    .eq('id', preregId)
    .single();

  if (error || !reg) { Helpers.toast('No se pudo cargar el registro', 'error'); return; }

  // Get settings for monthly fee default
  const { data: settings } = await supabase
    .from('school_settings')
    .select('due_day')
    .eq('id', SCHOOL_SETTINGS_ID)
    .maybeSingle();

  const dueDay = settings?.due_day || 5;
  const today = new Date().toISOString().split('T')[0];
  const autoMatricula = 'KK-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);

  const inputClass = "w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#0B63C7] bg-slate-50/50 transition-all text-sm font-medium";
  const labelClass = "block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1";

  // ── Build full student modal (same as StudentsModule.openModal) ──
  const modalHTML = `
    <div class="modal-header bg-gradient-to-r from-[#0B63C7] to-[#0850A0] text-white p-6 rounded-t-3xl flex items-center">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner">
          <i data-lucide="user-plus" class="w-6 h-6 text-white"></i>
        </div>
        <div>
          <h3 class="text-xl font-black">Admitir Estudiante</h3>
          <p class="text-xs text-white/70 font-bold uppercase tracking-widest">Pre-inscripción: ${esc(reg.student_name)}</p>
        </div>
      </div>
    </div>
    <div class="modal-body p-8 bg-slate-50/30" id="admitStudentForm">
      <div class="grid grid-cols-1 gap-6">
        <input type="hidden" id="stId" value="" />

        <!-- PREINSCRIPCIÓN BANNER -->
        <div class="bg-[#E8F2FF] border-2 border-blue-200 rounded-2xl p-4 flex items-start gap-3">
          <span class="text-2xl">📋</span>
          <div>
            <p class="font-black text-[#0B63C7] text-sm">${esc(reg.student_name)}</p>
            <p class="text-xs text-[#0850A0] font-medium mt-0.5">
              Sección: ${esc(reg.section || '—')} · Horario: ${esc(reg.schedule || '—')} ·
              Tutor: ${esc(reg.p1_name || '—')} · Tel: ${esc(reg.p1_phone || '—')}
            </p>
          </div>
        </div>

        <!-- 📷 MATRÍCULA -->
        <div class="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm">
          <h4 class="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-[#E8F2FF] text-[#0B63C7] flex items-center justify-center"><i data-lucide="hash" class="w-4 h-4"></i></span>
            📷 MATRÍCULA
          </h4>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <i data-lucide="hash" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
              <input id="stMatricula" value="${autoMatricula}" placeholder="Número de matrícula" class="${inputClass} pl-10 bg-white">
            </div>
            <button type="button" onclick="window._genInscMatricula()"
              class="px-5 py-2 bg-[#0B63C7] text-white rounded-2xl font-black text-xs uppercase hover:bg-[#0850A0] shadow-md transition-all active:scale-95">
              Generar
            </button>
          </div>
          <div class="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label class="${labelClass}">Fecha inscripción</label>
              <input type="date" id="stJoinedDate" value="${today}" class="${inputClass}">
            </div>
            <div class="flex items-center pt-6">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="active" checked class="w-5 h-5 rounded text-emerald-600">
                <span class="text-sm font-black text-emerald-700 uppercase">Activo</span>
              </label>
            </div>
          </div>
        </div>

        <!-- 👤 INFORMACIÓN DEL ESTUDIANTE -->
        <div class="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm space-y-4">
          <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-[#E8F2FF] text-[#0B63C7] flex items-center justify-center"><i data-lucide="user" class="w-4 h-4"></i></span>
            INFORMACIÓN DEL ESTUDIANTE
          </h4>
          <div>
            <label class="${labelClass}">Nombre completo</label>
            <input id="stName" value="${esc(reg.student_name)}" class="${inputClass}">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="${labelClass}">Horario</label>
              <input id="stHorario" value="${esc(reg.schedule || '')}" placeholder="08:00-12:00" class="${inputClass}">
            </div>
            <div>
              <label class="${labelClass}">Aula *</label>
              <select id="stClassroom" class="${inputClass} appearance-none">
                <option value="">-- Seleccionar Aula --</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 👨‍👦 HERMANOS -->
        <div class="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm">
          <label class="${labelClass} flex items-center gap-1.5 mb-2">
            <i data-lucide="users" class="w-3.5 h-3.5 text-[#0B63C7]"></i>
            👨‍👦 ¿Tiene hermano(s) en la estancia?
          </label>
          <p class="text-[10px] text-slate-400 font-medium mb-3 ml-1">Al seleccionar un hermano, compartirá el acceso del padre.</p>
          <select id="stSiblingId" class="${inputClass} appearance-none">
            <option value="">-- Sin hermanos (nuevo padre) --</option>
          </select>
          <p id="stSiblingInfo" class="text-[10px] text-[#0B63C7] font-bold mt-2 ml-1 hidden"></p>
        </div>

        <!-- 🔐 ACCESO Y NOTIFICACIONES -->
        <div class="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm space-y-4">
          <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><i data-lucide="lock" class="w-4 h-4"></i></span>
            🔐 ACCESO Y NOTIFICACIONES
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="${labelClass}">Correo de Usuario (Login) *</label>
              <input id="stEmailUser" type="email" value="${esc(reg.p1_email || '')}" placeholder="correo@ejemplo.com" class="${inputClass}">
            </div>
            <div>
              <label class="${labelClass}">Correo de Notificaciones</label>
              <input id="stEmailNotif" type="email" value="${esc(reg.p1_email || '')}" placeholder="avisos@ejemplo.com" class="${inputClass}">
            </div>
            <div class="md:col-span-2">
              <label class="${labelClass}">Contraseña (Mín 6 caracteres)</label>
              <input id="stPassword" type="text" value="sonrisa123" class="${inputClass}">
              <p class="text-[10px] text-slate-400 mt-1 ml-1">Por defecto: <strong>sonrisa123</strong> — editable por el staff.</p>
            </div>
          </div>
        </div>

        <!-- 💳 INFORMACIÓN DE PAGO -->
        <div class="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm space-y-4">
          <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-[#E8F2FF] text-[#0B63C7] flex items-center justify-center"><i data-lucide="credit-card" class="w-4 h-4"></i></span>
            💳 INFORMACIÓN DE PAGO
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="${labelClass}">Plan de Pago</label>
              <select id="paymentPlan" class="${inputClass}">
                <option value="monthly">Mensual</option>
                <option value="two_installments">Dos Cuotas</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div>
              <label class="${labelClass}">Mensualidad ($)</label>
              <div class="relative">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B63C7] font-black text-sm">$</span>
                <input id="monthlyFee" type="number" step="0.01" value="3000" placeholder="0.00" class="${inputClass} pl-8">
              </div>
            </div>
            <div>
              <label class="${labelClass}">Descuento ($)</label>
              <div class="relative">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B63C7] font-black text-sm">$</span>
                <input id="prolongadoFee" type="number" step="0.01" value="0" placeholder="0.00" class="${inputClass} pl-8">
              </div>
            </div>
            <div>
              <label class="${labelClass}">Día Vencimiento</label>
              <input id="dueDay" type="number" min="1" max="31" value="${dueDay}" class="${inputClass}">
            </div>
            <div>
              <label class="${labelClass}">Mes de inicio del plan</label>
              <input id="admitStartMonth" type="month" value="${new Date().toISOString().slice(0,7)}" class="${inputClass}">
            </div>
            <div>
              <label class="${labelClass}">Observaciones</label>
              <input id="admitObservaciones" placeholder="Notas adicionales..." class="${inputClass}">
            </div>
          </div>
        </div>

        <!-- TUTORES -->
        <div class="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm space-y-4">
          <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><i data-lucide="user" class="w-4 h-4"></i></span>
            TUTOR PRINCIPAL
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="${labelClass}">Nombre</label><input id="p1Name" value="${esc(reg.p1_name || '')}" class="${inputClass}"></div>
            <div><label class="${labelClass}">Teléfono</label><input id="p1Phone" value="${esc(reg.p1_phone || '')}" class="${inputClass}"></div>
            <div><label class="${labelClass}">Profesión</label><input id="p1Profession" placeholder="Ej: Ingeniero" class="${inputClass}"></div>
            <div class="md:col-span-2"><label class="${labelClass}">Dirección</label><input id="p1Address" value="${esc(reg.p1_address || '')}" class="${inputClass}"></div>
            <div class="md:col-span-2"><label class="${labelClass}">Contacto de Emergencia</label>
              <input id="p1Emergency" value="${esc((reg.emergency_name || '') + (reg.emergency_phone ? ' · ' + reg.emergency_phone : ''))}" placeholder="Nombre y teléfono alternativo" class="${inputClass}"></div>
          </div>
        </div>
        <div class="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm space-y-4">
          <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center"><i data-lucide="user-plus" class="w-4 h-4"></i></span>
            TUTOR SECUNDARIO
          </h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="${labelClass}">Nombre</label><input id="p2Name" value="${esc(reg.p2_name || '')}" class="${inputClass}"></div>
            <div><label class="${labelClass}">Teléfono</label><input id="p2Phone" value="${esc(reg.p2_phone || '')}" class="${inputClass}"></div>
            <div><label class="${labelClass}">Profesión</label><input id="p2Profession" class="${inputClass}"></div>
            <div><label class="${labelClass}">Dirección</label><input id="p2Address" class="${inputClass}"></div>
          </div>
        </div>

        <!-- SALUD Y SEGURIDAD -->
        <div class="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm space-y-4">
          <h4 class="text-sm font-black text-slate-800 flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center"><i data-lucide="heart-pulse" class="w-4 h-4"></i></span>
            SALUD Y SEGURIDAD
          </h4>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="${labelClass}">Tipo Sangre</label>
              <select id="bloodType" class="${inputClass}">
                <option value="O+">O+</option><option value="O-">O-</option>
                <option value="A+">A+</option><option value="A-">A-</option>
                <option value="B+">B+</option><option value="B-">B-</option>
                <option value="AB+">AB+</option><option value="AB-">AB-</option>
              </select>
            </div>
            <div><label class="${labelClass}">Alergias</label>
              <input id="allergies" value="${esc(reg.allergies || '')}" placeholder="Ej: Maní, Polvo" class="${inputClass}">
            </div>
          </div>
          <div><label class="${labelClass}">Autorizados para recoger</label>
            <textarea id="authorized" rows="2" class="${inputClass} resize-none"></textarea></div>
          <div><label class="${labelClass}">Teléfono del contacto autorizado</label>
            <input id="authorizedPhone" placeholder="Ej: 829-000-0000" class="${inputClass}"></div>
        </div>

      </div>
    </div>
    <div class="modal-footer bg-white p-6 rounded-b-3xl border-t border-slate-100 flex justify-end gap-3">
      <button onclick="if(window.App?.ui?.closeModal){App.ui.closeModal();}else{const gc=document.getElementById('globalModalContainer');if(gc){gc.style.display='none';gc.innerHTML='';}document.getElementById('admitStudentOverlay')?.remove();}"
        class="px-8 py-3 text-slate-500 font-black text-xs uppercase hover:bg-slate-100 rounded-2xl transition-all">Cancelar</button>
      <button id="btnConfirmAdmit" onclick="InscripcionesModule.admitStudent(${preregId})"
        class="px-10 py-3 bg-gradient-to-r from-[#FF7A00] to-[#E06500] text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-orange-200 hover:shadow-orange-300 hover:-translate-y-0.5 transition-all active:scale-95">
        ✅ Confirmar Admisión
      </button>
    </div>`;

  // ── Abrir modal usando openGlobalModal (igual que StudentsModule) ──
  if (window.openGlobalModal) {
    window.openGlobalModal(modalHTML, true);
  } else {
    // Fallback para contextos sin openGlobalModal
    const overlay = document.createElement('div');
    overlay.id = 'admitStudentOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(8,80,160,.5);backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:3vh 16px;overflow-y:auto;';
    const inner = document.createElement('div');
    inner.className = 'bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto mx-3 my-4 relative';
    inner.innerHTML = modalHTML;
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }
  if (window.lucide) lucide.createIcons();

  // ── Post-render setup ─────────────────────────────────────────
  // Generar matrícula
  window._genInscMatricula = () => {
    const el = document.getElementById('stMatricula');
    if (el) el.value = 'KK-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
  };

  // Cargar aulas
  try {
    const { data: rooms } = await supabase.from('classrooms').select('id, name').order('name');
    const sel = document.getElementById('stClassroom');
    if (sel && rooms) {
      rooms.forEach(r => {
        const o = document.createElement('option');
        o.value = r.id; o.textContent = r.name;
        sel.appendChild(o);
      });
    }
  } catch (_) {}

  // Cargar hermanos
  try {
    const { data: siblings } = await supabase.from('students')
      .select('id, name, p1_name, parent_id, classrooms:classroom_id(name)')
      .eq('is_active', true).order('name').limit(200);
    const sibSel = document.getElementById('stSiblingId');
    if (sibSel && siblings?.length) {
      siblings.forEach(s => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.name + ' (' + (s.classrooms?.name || 'sin aula') + (s.p1_name ? ' · ' + s.p1_name : '') + ')';
        o.dataset.parentId = s.parent_id || '';
        sibSel.appendChild(o);
      });
      sibSel.addEventListener('change', function() {
        const infoEl = document.getElementById('stSiblingInfo');
        const opt    = sibSel.options[sibSel.selectedIndex];
        if (sibSel.value && opt?.dataset?.parentId) {
          if (infoEl) { infoEl.textContent = '✅ Compartirá el acceso del padre registrado'; infoEl.classList.remove('hidden'); }
          supabase.from('profiles').select('email, name, phone').eq('id', opt.dataset.parentId).maybeSingle().then(({ data: prof }) => {
            if (prof) {
              const setIfEmpty = (id, val) => { const el = document.getElementById(id); if (el && !el.value) el.value = val || ''; };
              setIfEmpty('stEmailUser', prof.email);
              setIfEmpty('p1Name', prof.name);
              setIfEmpty('p1Phone', prof.phone);
            }
          });
        } else {
          if (infoEl) infoEl.classList.add('hidden');
        }
      });
    }
  } catch (_) {}

  if (window.lucide) lucide.createIcons();
}

// ── Admit Student — full flow ─────────────────────────────────
export async function admitStudent(preregId) {
  const btn = document.getElementById('btnConfirmAdmit');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Procesando...'; }

  try {
    // 1. Load pre-registration
    const { data: reg, error: regErr } = await supabase
      .from('student_preregistrations')
      .select('*')
      .eq('id', preregId)
      .single();
    if (regErr || !reg) throw new Error('Registro no encontrado');

    // 2. Read all form fields (using getElementById — forms use id= not name=)
    const v = (id) => document.getElementById(id)?.value?.trim() || null;
    const n = (id, def = 0) => { const val = parseFloat(document.getElementById(id)?.value); return isNaN(val) ? def : val; };

    const classroomId   = v('stClassroom');
    const password      = v('stPassword') || 'sonrisa123';
    const monthlyFee    = n('monthlyFee', 3000);
    const dueDay        = parseInt(document.getElementById('dueDay')?.value) || 5;
    const startMonth    = v('admitStartMonth') || new Date().toISOString().slice(0,7);
    const matricula     = v('stMatricula') || ('KK-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*9000)+1000));
    const emailUser     = v('stEmailUser') || reg.p1_email;
    const siblingId     = v('stSiblingId');

    if (!classroomId) throw new Error('Selecciona un aula');
    if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
    if (!emailUser)    throw new Error('El registro no tiene email del tutor');

    // Build student payload from form
    const studentPayload = {
      name:                  v('stName') || reg.student_name,
      matricula,
      classroom_id:          parseInt(classroomId),
      schedule:              v('stHorario') || reg.schedule,
      start_date:            document.getElementById('stJoinedDate')?.value || new Date().toISOString().split('T')[0],
      is_active:             document.getElementById('active')?.checked ?? true,
      birth_date:            reg.birth_date,
      gender:                reg.gender,
      blood_type:            v('bloodType') || reg.blood_type,
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

    // 3. Handle parent user (sibling shares parent, otherwise create new)
    let parentUserId = null;

    if (siblingId) {
      // Inherit parent from sibling
      const sibSel   = document.getElementById('stSiblingId');
      const sibOpt   = sibSel?.options[sibSel.selectedIndex];
      parentUserId   = sibOpt?.dataset?.parentId || null;
    }

    if (!parentUserId) {
      // Try admin API first, fallback to signUp
      const { data: authData } = await supabase.auth.admin?.createUser?.({
        email: emailUser, password, email_confirm: true,
        user_metadata: { role: 'padre', full_name: studentPayload.p1_name }
      }) ?? { data: null };

      parentUserId = authData?.user?.id;

      if (!parentUserId) {
        const { data: signupData } = await supabase.auth.signUp({
          email: emailUser, password,
          options: { data: { role: 'padre', full_name: studentPayload.p1_name } }
        });
        parentUserId = signupData?.user?.id;
      }
    }

    // Upsert parent profile
    if (parentUserId) {
      await supabase.from('profiles').upsert({
        id:    parentUserId,
        name:  studentPayload.p1_name || '',
        email: emailUser,
        phone: studentPayload.p1_phone || '',
        role:  'padre',
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      studentPayload.parent_id = parentUserId;
    }

    // 4. Create student record
    const { data: student, error: stuErr } = await supabase
      .from('students')
      .insert(studentPayload)
      .select('id')
      .single();
    if (stuErr) throw new Error('Error creando estudiante: ' + stuErr.message);

    const studentId = student.id;

    // 5. Create payment plan
    const { data: plan } = await supabase
      .from('payment_plans')
      .insert({ student_id: studentId, monthly_fee: monthlyFee, due_day: dueDay, status: 'active', start_date: `${startMonth}-01` })
      .select('id')
      .single()
      .catch(() => ({ data: null }));

    // 6. Create 12 monthly payments
    if (plan?.id) {
      const payments = [];
      const [yr, mo] = startMonth.split('-').map(Number);
      for (let i = 0; i < MONTHS_IN_YEAR; i++) {
        const d  = new Date(yr, mo - 1 + i, dueDay);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        payments.push({ student_id: studentId, payment_plan: plan.id, amount: monthlyFee, month_paid: `${mm}/${yy}`, due_date: d.toISOString().split('T')[0], status: 'pending' });
      }
      await supabase.from('payments').insert(payments).catch(e => console.warn('[Inscripciones] payments insert:', e.message));
    }

    // 7. Mark pre-registration as admitted
    const appState = await _getAppState();
    await supabase.from('student_preregistrations').update({
      status: 'admitted', reviewed_at: new Date().toISOString(), reviewed_by: appState?.get('user')?.id || null
    }).eq('id', preregId);

    // 8. Close modal & notify
    if (window.App?.ui?.closeModal) {
      window.App.ui.closeModal();
    } else {
      const gc = document.getElementById('globalModalContainer');
      if (gc) { gc.style.display = 'none'; gc.innerHTML = ''; }
      document.getElementById('admitStudentOverlay')?.remove();
    }

    Helpers.toast(`✅ ${studentPayload.name} admitido — Matrícula: ${matricula}`, 'success');
    loadInscripciones();

    // Refresh students if visible
    if (typeof window.App?.students?.init === 'function') {
      const currentSection = document.querySelector('.section.active')?.id;
      if (currentSection === 'estudiantes') window.App.students.init();
    }

  } catch (err) {
    console.error('[Inscripciones] admitStudent error:', err);
    Helpers.toast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Admisión'; }
  }
}

// ── Export global ─────────────────────────────────────────────
export const InscripcionesModule = {
  load:        loadInscripciones,
  destroy:     destroyInscripciones,
  filterStatus,
  openAdmitModal,
  admitStudent
};
