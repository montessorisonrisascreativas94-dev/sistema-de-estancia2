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
import { SCHOOL_SETTINGS_ID } from '../shared/constants.js';

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
      .select('id, student_name, section, schedule, p1_name, p1_phone, p1_email, status, created_at')
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

  const { StudentRecordModal } = await import('../shared/student-record-modal.js');
  StudentRecordModal.open('admit', null, reg);
}


// ── Flag to prevent double execution ───────────────────────
let _admittingStudent = false;
// ── Admit Student — full flow ─────────────────────────────────
export async function admitStudent(preregId) {
  if (_admittingStudent) return; // Prevent double execution
  
  _admittingStudent = true;
  const btn = document.getElementById('btnConfirmAdmit');
  if (btn) {
    btn.style.opacity = '0.75';
    btn.style.cursor = 'not-allowed';
    btn.style.pointerEvents = 'none';
    btn.textContent = '⏳ Procesando...';
  }

  try {
    // 1. Load pre-registration and check status
    const { data: reg, error: regErr } = await supabase
      .from('student_preregistrations')
      .select('*')
      .eq('id', preregId)
      .single();
    if (regErr || !reg) throw new Error('Registro no encontrado');
    if (reg.status === 'admitted') throw new Error('El estudiante ya fue admitido');

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

    if (!password || password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
    if (!emailUser)    throw new Error('El registro no tiene email del tutor');

    // Build student payload from form
    const studentPayload = {
      name:                  v('stName') || reg.student_name,
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

    // 3. Handle parent user (sibling shares parent, otherwise create via signUp)
    let parentUserId = null;

    if (siblingId) {
      // Inherit parent from sibling — no new auth user needed
      const sibSel = document.getElementById('stSiblingId');
      const sibOpt = sibSel?.options[sibSel?.selectedIndex];
      parentUserId  = sibOpt?.dataset?.parentId || null;
    }

    if (!parentUserId) {
      // Note: supabase.auth.admin is NOT available client-side (requires service_role key).
      // Use signUp instead — it works for new accounts. If email already exists,
      // we look up the existing profile by email.
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
        // Email already exists — look up existing profile
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', emailUser)
          .maybeSingle();
        if (existingProfile?.id) parentUserId = existingProfile.id;
      }
      // If signup returns identities=[] it means email exists but is unconfirmed — still has an id
      if (!parentUserId && signupData?.user?.identities?.length === 0 && signupData?.user?.id) {
        parentUserId = signupData.user.id;
      }
    }

    // Upsert parent profile (only if we have a userId)
    if (parentUserId) {
      const profileData = {
        id:    parentUserId,
        name:  studentPayload.p1_name || '',
        email: emailUser,
        phone: studentPayload.p1_phone || '',
        role:  'padre',
      };
      // Try upsert; if it fails, try plain update; ignore all profile errors (non-fatal)
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id', ignoreDuplicates: false });

      if (profileErr) {
        // Fallback: try update only (profile may already exist)
        await supabase.from('profiles').update({
          name:  profileData.name,
          email: profileData.email,
          phone: profileData.phone,
          role:  'padre',
        }).eq('id', parentUserId).catch(() => {});
        console.warn('[Inscripciones] profile upsert fell back to update:', profileErr.message);
      }
      studentPayload.parent_id = parentUserId;
    }

    // Check if student with same matricula already exists
    const { data: existingStudent } = await supabase
      .from('students')
      .select('id')
      .eq('matricula', matricula)
      .maybeSingle();
    if (existingStudent) throw new Error(`Ya existe un estudiante con la matrícula: ${matricula}`);

    // 4. Create student record
    const { data: student, error: stuErr } = await supabase
      .from('students')
      .insert(studentPayload)
      .select('id')
      .single();
    if (stuErr) throw new Error('Error creando estudiante: ' + stuErr.message);

    const studentId = student.id;

    // 5. Create payment plan
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
    if (btn) {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.pointerEvents = 'auto';
      btn.innerHTML = '✅ Confirmar Admisión';
    }
  } finally {
    _admittingStudent = false; // Reset flag
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
