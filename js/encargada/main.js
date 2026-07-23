import { ensureRole, supabase, initOneSignal } from '../shared/supabase.js';
import { AppState } from './state.js';
import { Helpers } from '../shared/helpers.js';
import { UIPremium } from '../shared/ui-premium.js';
import { BadgeSystem } from '../shared/badges.js';
import { RealtimeManager } from '../shared/realtime-manager.js';
import { QueryCache } from '../shared/query-cache.js';
import { TeacherEfficiencyModule } from './modules/teacher_efficiency.module.js';
import { openGlobalModal, closeGlobalModal } from '../shared/modal.js';

const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

window.App = {
  navigation: { goTo: goToSection }
};

// Expose goToSection globally so HTML onclick= and common_ui can call it
window.goToSection = goToSection;

window.openGlobalModal = openGlobalModal;
window.closeGlobalModal = closeGlobalModal;

window.App.ui = {
  closeModal: closeGlobalModal
};

export function goToSection(sectionId) {
  if (!sectionId) return;
  Helpers.vibrate?.('light');
  RealtimeManager.unsubscribeAll(['notifications']);

  // Dismiss any open modal overlay
  closeGlobalModal();

  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.remove('active');
  });
  const target = document.getElementById(sectionId);
  if (target) {
    target.classList.add('active');
    AppState.set('currentSection', sectionId);
    UIPremium.applySectionTransition(sectionId);
    switch (sectionId) {
      case 'dashboard':
        loadDashboard();
        break;
      case 'eficiencia':
        loadEfficiency();
        break;
      case 'ranking':
        loadRanking();
        break;
      case 'permisos':
        loadPermits();
        break;
      case 'chat':
        loadChat();
        break;
      case 'alertas':
        loadAlerts();
        break;
      case 'configuracion':
      case 'perfil':
        loadPerfil();
        break;
      case 'muro':
        loadMuroEscolar();
        break;
      case 'inscripciones':
        loadInscripciones();
        break;
      case 'padres-opinion':
        loadPadresOpinion();
        break;
      case 'accesos-qr':
        loadAccesosQR();
        break;
      case 'reportes-cumplimiento':
        loadReportesCumplimiento();
        break;
      case 'control-rutinas':
        loadControlRutinas();
        break;
      case 'reportes-tareas':
        loadReportesTareas();
        break;
      case 'comparativo-aulas':
        loadComparativoAulas();
        break;
      case 'centro-estadisticas':
        loadCentroEstadisticas();
        break;
    }
  }
  const _parentSection = {
    'eficiencia': 'maestras',
    'ranking': 'maestras'
  };
  const activeSidebarId = _parentSection[sectionId] || sectionId;
  document.querySelectorAll('[data-section]').forEach(btn => {
    const match = btn.dataset.section === activeSidebarId || btn.dataset.section === sectionId;
    btn.classList.toggle('bg-white/20', match);
    btn.classList.toggle('active', match);
  });
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && window.innerWidth < 768) {
    sidebar.classList.remove('mobile-visible');
    if (overlay) overlay.style.display = 'none';
  }
  if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
}

async function loadDashboard() {
  try {
    const [
      { data: teachers },
      { data: classrooms },
      { data: students }
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'maestra'),
      supabase.from('classrooms').select('*'),
      supabase.from('students').select('*')
    ]);
    const totalTeachers = teachers?.length || 0;
    const activeTeachers = teachers?.filter(t => t.is_active !== false).length || 0;
    const activeClassrooms = classrooms?.filter(c => c.is_active !== false).length || 0;
    const totalChildren = students?.length || 0;
    const kpiElements = {
      kpiTotalMaestras: totalTeachers,
      kpiMaestrasActivas: activeTeachers,
      kpiAulasActivas: activeClassrooms,
      kpiNinos: totalChildren,
      kpiEficiencia: activeTeachers > 0 ? Math.round((activeTeachers / totalTeachers) * 100) + '%' : '—',
      kpiPromedioInstitucional: activeClassrooms > 0 ? Math.round(totalChildren / activeClassrooms) : '—',
      kpiCumplimientoDiario: '—',
      kpiCumplimientoMensual: '—'
    };
    for (const [id, value] of Object.entries(kpiElements)) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
    const mejorMaestraEl = document.getElementById('mejorMaestra');
    const mejorAulaEl = document.getElementById('mejorAula');
    const alertasPendientesEl = document.getElementById('alertasPendientes');
    if (mejorMaestraEl) {
      mejorMaestraEl.innerHTML = teachers?.[0] ? `
        <div class="text-center">
          <div class="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 mx-auto mb-3 flex items-center justify-center text-2xl">
            ${(teachers[0].name || 'M')[0].toUpperCase()}
          </div>
          <p class="font-bold text-slate-800">${teachers[0].name || 'Sin nombre'}</p>
        </div>
      ` : '<p class="text-slate-400">No hay maestras</p>';
    }
    if (mejorAulaEl) {
      mejorAulaEl.innerHTML = classrooms?.[0] ? `
        <div class="text-center">
          <div class="w-16 h-16 rounded-full bg-gradient-to-br from-green-100 to-green-50 mx-auto mb-3 flex items-center justify-center text-2xl">
            🏫
          </div>
          <p class="font-bold text-slate-800">${classrooms[0].name || 'Sin aula'}</p>
          <p class="text-xs text-slate-400">${classrooms[0].capacity || '—'} niños</p>
        </div>
      ` : '<p class="text-slate-400">No hay aulas</p>';
    }
    if (alertasPendientesEl) {
      alertasPendientesEl.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-6">
            <h4 class="font-black text-blue-900 mb-4 flex items-center gap-2">
              <i data-lucide="info" class="w-5 h-5"></i>
              Bienvenido al Panel de Encargada
            </h4>
            <ul class="space-y-2 text-sm text-blue-800">
              <li class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4"></i>
                Explora las secciones de Maestras, Permisos y Chat
              </li>
              <li class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4"></i>
                Monitorea el rendimiento docente en tiempo real
              </li>
            </ul>
          </div>
          <div class="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl p-6">
            <h4 class="font-black text-green-900 mb-4 flex items-center gap-2">
              <i data-lucide="settings" class="w-5 h-5"></i>
              Configuración Rápida
            </h4>
            <ul class="space-y-2 text-sm text-green-800">
              <li class="flex items-start gap-2">
                <i data-lucide="arrow-right" class="w-4 h-4 mt-0.5"></i>
                Ajusta tu perfil en la sección de Configuración
              </li>
            </ul>
          </div>
        </div>
      `;
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('[Dashboard] Error:', e);
  }
}

async function loadEfficiency() {
  // Delegado al módulo dedicado (importado arriba)
  await TeacherEfficiencyModule.load();
}

async function loadRanking() {
  const el = document.getElementById('rankingContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  try {
    const { data: teachers } = await supabase.from('profiles').select('*').eq('role', 'maestra');
    el.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table class="w-full text-left">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-6 py-4 text-xs font-black uppercase text-slate-400">Posición</th>
              <th class="px-6 py-4 text-xs font-black uppercase text-slate-400">Maestra</th>
              <th class="px-6 py-4 text-xs font-black uppercase text-slate-400">Aula</th>
              <th class="px-6 py-4 text-xs font-black uppercase text-slate-400 text-right">Eficiencia</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${(teachers || []).map((t, i) => `
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                  <span class="font-black text-xl ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-600' : 'text-slate-300'}">
                    ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                      ${(t.name || 'M')[0].toUpperCase()}
                    </div>
                    <p class="font-bold text-slate-800">${t.name || 'Maestra'}</p>
                  </div>
                </td>
                <td class="px-6 py-4 text-slate-500 font-medium">${t.classroom?.name || 'Sin aula'}</td>
                <td class="px-6 py-4 text-right font-black text-indigo-600">—</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}


async function loadPermits() {
  const el = document.getElementById('permisosContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: todayPermits } = await supabase
      .from('staff_permits')
      .select('id', { count: 'exact' })
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today);

    const { data: pendingPermits } = await supabase
      .from('staff_permits')
      .select('id', { count: 'exact' })
      .eq('status', 'pending');

    el.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center">
              <i data-lucide="check-circle" class="text-emerald-500"></i>
            </div>
            <div>
              <p class="text-xs font-black uppercase text-slate-400 mb-1">Permisos Hoy</p>
              <p class="text-2xl font-black text-slate-800">${todayPermits?.length || 0}</p>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center">
              <i data-lucide="clock" class="text-amber-500"></i>
            </div>
            <div>
              <p class="text-xs font-black uppercase text-slate-400 mb-1">Pendientes</p>
              <p class="text-2xl font-black text-slate-800">${pendingPermits?.length || 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-100 p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-bold text-slate-800">Solicitudes de Permisos</h3>
          <select id="permitFilterStatus" class="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold">
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobados</option>
            <option value="rejected">Rechazados</option>
            <option value="all">Todos</option>
          </select>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-6 py-4 text-left text-xs font-black uppercase text-slate-400">Personal</th>
                <th class="px-6 py-4 text-left text-xs font-black uppercase text-slate-400">Tipo</th>
                <th class="px-6 py-4 text-left text-xs font-black uppercase text-slate-400">Fechas</th>
                <th class="px-6 py-4 text-left text-xs font-black uppercase text-slate-400">Estado</th>
                <th class="px-6 py-4 text-right text-xs font-black uppercase text-slate-400">Acciones</th>
              </tr>
            </thead>
            <tbody id="permits-table-body">
            </tbody>
          </table>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    // Bind filter
    document.getElementById('permitFilterStatus')?.addEventListener('change', async () => {
      await loadPermitsHistory();
    });

    // Load history
    await loadPermitsHistory();
  } catch (e) {
    console.error('[Permits] Error:', e);
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadPermitsHistory() {
  const tbody = document.getElementById('permits-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400">Cargando...</td></tr>';

  try {
    const status = document.getElementById('permitFilterStatus')?.value || 'pending';
    let query = supabase
      .from('staff_permits')
      .select('*, profiles:staff_id(name, role)');

    if (status !== 'all') query = query.eq('status', status);
    
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400 font-medium">No hay solicitudes encontradas.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(p => {
      const staffName = p.profiles?.name || 'Personal';
      const typeLabels = { permission: 'Permiso', medical: 'Médico', absence: 'Falta', other: 'Otro' };
      const statusCls = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700' };
      
      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-6 py-4">
            <div class="font-bold text-slate-800">${Helpers.escapeHTML(staffName)}</div>
            <div class="text-[10px] text-slate-400 font-black uppercase tracking-wider">${p.profiles?.role || 'Staff'}</div>
          </td>
          <td class="px-6 py-4">
            <span class="text-xs font-bold text-slate-600">${typeLabels[p.type] || p.type}</span>
          </td>
          <td class="px-6 py-4">
            <div class="text-xs font-bold text-slate-700">${new Date(p.start_date).toLocaleDateString()}</div>
            <div class="text-[10px] text-slate-400 font-medium">${p.start_date === p.end_date ? 'Un solo día' : 'Hasta ' + new Date(p.end_date).toLocaleDateString()}</div>
          </td>
          <td class="px-6 py-4">
            <span class="px-2 py-1 rounded-lg text-[10px] font-black uppercase ${statusCls[p.status] || ''}">${p.status}</span>
          </td>
          <td class="px-6 py-4 text-right">
            <div class="flex justify-end gap-2">
              ${p.status === 'pending' ? `
                <button onclick="updatePermitStatus('${p.id}', 'approved')" class="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" title="Aprobar"><i data-lucide="check" class="w-4 h-4"></i></button>
                <button onclick="updatePermitStatus('${p.id}', 'rejected')" class="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100" title="Rechazar"><i data-lucide="x" class="w-4 h-4"></i></button>
              ` : ''}
              <button onclick="viewPermitDetails('${p.id}')" class="p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100" title="Ver Detalles"><i data-lucide="eye" class="w-4 h-4"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-rose-500 font-bold">Error al cargar historial.</td></tr>';
  }
}

window.updatePermitStatus = async function(id, newStatus) {
  const confirm = await Helpers.confirm(`¿Seguro que desea marcar esta solicitud como ${newStatus}?`);
  if (!confirm) return;

  try {
    const { error } = await supabase
      .from('staff_permits')
      .update({ status: newStatus, approved_by: (await supabase.auth.getUser()).data.user.id })
      .eq('id', id);

    if (error) throw error;
    Helpers.toast('Estado actualizado correctamente', 'success');
    await loadPermitsHistory();
  } catch (e) {
    Helpers.toast('Error al actualizar estado', 'error');
  }
};

window.viewPermitDetails = async function(id) {
  try {
    const { data, error } = await supabase
      .from('staff_permits')
      .select('*, profiles:staff_id(name)')
      .eq('id', id)
      .single();
    
    if (error) throw error;

    const html = `
      <div class="p-8">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-black text-slate-800">Detalles de Solicitud</h2>
            <p class="text-sm text-slate-500 font-medium">Personal: ${Helpers.escapeHTML(data.profiles?.name)}</p>
          </div>
        </div>

        <div class="space-y-6">
          <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Motivo / Razón</p>
            <p class="text-slate-700 font-bold leading-relaxed">${Helpers.escapeHTML(data.reason)}</p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="bg-[#E8F2FF] p-4 rounded-2xl border border-blue-100 text-[#0850A0]">
              <p class="text-[10px] font-black uppercase opacity-70 mb-1">Fecha Inicio</p>
              <p class="text-lg font-black">${new Date(data.start_date).toLocaleDateString()}</p>
            </div>
            <div class="bg-[#E8F2FF] p-4 rounded-2xl border border-blue-100 text-[#0850A0]">
              <p class="text-[10px] font-black uppercase opacity-70 mb-1">Fecha Fin</p>
              <p class="text-lg font-black">${new Date(data.end_date).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    `;
    window.openGlobalModal(html);
  } catch (e) {
    Helpers.toast('Error al cargar detalles', 'error');
  }
};

async function loadChat() {
  const el = document.getElementById('chatContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  
  try {
    el.innerHTML = `
      <div id="chatAppContainer" class="chat-app">
        <div class="chat-list">
          <div class="p-4 border-b border-slate-100">
            <h3 class="text-lg font-black text-slate-800 mb-3">Chat con Maestras</h3>
            <input id="chatSearchInput" type="text" placeholder="Buscar maestra..." class="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold focus:border-blue-400 focus:ring-4 focus:ring-blue-50 outline-none">
          </div>
          <div id="chatContactsList" class="flex-1 overflow-y-auto p-4 space-y-2"></div>
        </div>
        <div class="chat-conversation flex flex-col">
          <div id="chatActiveHeader" class="p-4 border-b border-slate-100 flex items-center gap-3 hidden">
            <button id="chatBackBtn" class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 md:hidden">
              <i data-lucide="arrow-left" class="w-5 h-5 text-slate-600"></i>
            </button>
            <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500" id="chatActiveAvatar"></div>
            <div class="flex-1">
              <div id="chatActiveName" class="font-black text-slate-800"></div>
              <div id="chatActiveMeta" class="text-xs text-slate-400 font-bold"></div>
            </div>
          </div>
          <div id="chatMessagesContainer" class="flex-1 overflow-y-auto p-4"></div>
          <div id="chatInputArea" class="p-4 border-t border-slate-100 hidden">
            <div class="flex gap-2">
              <input id="chatMessageInput" type="text" placeholder="Escribe un mensaje..." class="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 outline-none font-bold">
              <button id="btnSendChatMessage" class="px-6 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-all">
                <i data-lucide="send" class="w-5 h-5"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    if (window.lucide) lucide.createIcons();
    
    // Initialize chat module
    await initEncargadaChat();
  } catch (e) {
    console.error('[Chat] Error:', e);
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

let _chatState = {
  currentUserId: null,
  activeContactId: null,
  conversationId: null,
  channel: null,
  allContacts: [],
  currentUserProfile: {}
};

async function initEncargadaChat() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  _chatState.currentUserId = user.id;

  // Get current user profile
  const { data: profile } = await supabase.from('profiles').select('name, avatar_url').eq('id', user.id).single();
  _chatState.currentUserProfile = profile || {};

  // Bind send button + enter key
  const sendBtn = document.getElementById('btnSendChatMessage');
  const input = document.getElementById('chatMessageInput');
  if (sendBtn && !sendBtn._bound) {
    sendBtn._bound = true;
    sendBtn.addEventListener('click', () => sendChatMessage());
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
  }

  // Bind search
  document.getElementById('chatSearchInput')?.addEventListener(
    'input',
    Helpers.debounce(() => renderChatContacts(), 250)
  );
  
  // Bind back button
  document.getElementById('chatBackBtn')?.addEventListener('click', () => {
    document.getElementById('chatAppContainer')?.classList.remove('show-chat');
  });

  // Load contacts (only teachers)
  await loadChatContacts();
}

async function loadChatContacts() {
  const list = document.getElementById('chatContactsList');
  if (!list) return;
  list.innerHTML = Helpers.skeleton(4);

  try {
    // Get all teachers
    const { data: users } = await supabase.from('profiles').select('*').eq('role', 'maestra');
    
    // Get unread counts (if available)
    let unreadData = {};
    try {
      const { data } = await supabase.rpc('get_unread_counts');
      unreadData = data || {};
    } catch (_) {}

    _chatState.allContacts = (users || []).map(u => ({
      id: u.id,
      name: u.name || 'Maestra',
      avatar: u.avatar_url,
      roleLabel: 'Maestra',
      meta: u.classroom?.name || 'Sin aula',
      unread: Number((unreadData && unreadData[u.id]) || 0)
    }));

    renderChatContacts();
  } catch (e) {
    console.error('Error loading chat contacts:', e);
    list.innerHTML = Helpers.emptyState('Error al cargar contactos');
  }
}

function renderChatContacts() {
  const list = document.getElementById('chatContactsList');
  if (!list) return;
  const q = (document.getElementById('chatSearchInput')?.value || '').toLowerCase();
  const filtered = _chatState.allContacts.filter(c =>
    (c.name || '').toLowerCase().includes(q) || (c.meta || '').toLowerCase().includes(q)
  );

  if (!filtered.length) { list.innerHTML = Helpers.emptyState('Sin contactos'); return; }

  list.innerHTML = filtered.map(c => `
    <div data-contact-id="${c.id}" class="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-100 cursor-pointer transition-all group relative">
      <div class="relative shrink-0">
        <div class="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500 overflow-hidden">
          ${c.avatar ? `<img src="${c.avatar}" class="w-full h-full object-cover">` : (c.name || '?').charAt(0)}
        </div>
        ${c.unread > 0 ? `<span class="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow animate-pulse">${c.unread > 9 ? '9+' : c.unread}</span>` : ''}
      </div>
      <div class="min-w-0 flex-1">
        <div class="font-bold text-slate-800 text-sm truncate ${c.unread > 0 ? 'text-slate-900' : ''}">${Helpers.escapeHTML(c.name || 'Sin nombre')}</div>
        <div class="text-[10px] text-slate-400 font-bold uppercase truncate">${c.roleLabel} - ${Helpers.escapeHTML(c.meta)}</div>
      </div>
      ${c.unread > 0 ? `<div class="w-2 h-2 bg-rose-500 rounded-full shrink-0"></div>` : ''}
    </div>`
  ).join('');

  if (!list._bound) {
    list._bound = true;
    list.addEventListener('click', e => {
      const el = e.target.closest('[data-contact-id]');
      if (el) selectChat(el.dataset.contactId);
    });
  }
}

async function selectChat(contactId) {
  const contact = _chatState.allContacts.find(c => c.id === contactId);
  if (!contact) return;

  _chatState.activeContactId = contactId;
  _chatState.conversationId = null;

  // Clear badge
  contact.unread = 0;
  renderChatContacts();

  // Mobile: show chat
  document.getElementById('chatAppContainer')?.classList.add('show-chat');

  // Update header
  const nameEl = document.getElementById('chatActiveName');
  const metaEl = document.getElementById('chatActiveMeta');
  const avatarEl = document.getElementById('chatActiveAvatar');
  const headerEl = document.getElementById('chatActiveHeader');
  const inputEl = document.getElementById('chatInputArea');

  if (nameEl) nameEl.textContent = contact.name;
  if (metaEl) metaEl.textContent = `${contact.roleLabel} - ${contact.meta}`;
  if (avatarEl) avatarEl.innerHTML = contact.avatar
    ? `<img src="${contact.avatar}" class="w-full h-full object-cover">`
    : (contact.name || '?').charAt(0);
  headerEl?.classList.remove('hidden');
  inputEl?.classList.remove('hidden');

  await loadChatMessages();
}

async function loadChatMessages() {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;
  container.innerHTML = '<div class="flex-1 flex items-center justify-center"><div class="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div></div>';

  try {
    // Try to use shared chat module if available
    let messages = [];
    let conversationId = null;
    
    try {
      // First, check if we have a messages table
      const { data: conv } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${_chatState.currentUserId},receiver_id.eq.${_chatState.activeContactId}),and(sender_id.eq.${_chatState.activeContactId},receiver_id.eq.${_chatState.currentUserId})`)
        .order('created_at', { ascending: true });
      
      messages = conv || [];
    } catch (_) {
      // If no messages table yet, show empty
      messages = [];
    }

    container.innerHTML = '';
    if (!messages.length) {
      container.innerHTML = '<div class="flex-1 flex flex-col items-center justify-center text-slate-400 opacity-60 gap-2"><i data-lucide="message-circle" class="w-10 h-10 text-blue-300"></i><p class="text-sm">Inicia la conversación</p></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    messages.forEach(m => appendChatMessage(m));
    scrollChatToBottom();
  } catch (e) {
    if (container) container.innerHTML = '<div class="p-4 text-center">' + Helpers.errorState('Error al cargar mensajes') + '</div>';
    if (window.lucide) lucide.createIcons();
  }
}

function buildChatBubble(msg) {
  const isMine = msg.sender_id === _chatState.currentUserId;
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const sender = isMine 
    ? _chatState.currentUserProfile 
    : _chatState.allContacts.find(c => c.id === msg.sender_id);
  
  const avatarUrl = isMine ? (sender?.avatar_url || null) : (sender?.avatar || null);
  const name = isMine ? (sender?.name || '') : (sender?.name || '');
  
  const avatarHtml = avatarUrl 
    ? `<img src="${avatarUrl}" class="w-full h-full object-cover">` 
    : `<span class="text-sm font-bold">${name.charAt(0) || ''}</span>`;
  
  return `<div class="flex ${isMine ? 'justify-end flex-row-reverse' : 'justify-start'} mb-3 gap-2">
    <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500 overflow-hidden shrink-0">
      ${avatarHtml}
    </div>
    <div class="msg-bubble ${isMine ? 'msg-me' : 'msg-them'} max-w-[80%]">
      <div class="whitespace-pre-wrap break-words">${Helpers.escapeHTML(msg.content || '')}</div>
      <div class="text-[9px] ${isMine ? 'text-blue-100' : 'text-slate-400'} mt-1 text-right opacity-80">${time}</div>
    </div>
  </div>`;
}

function appendChatMessage(msg) {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', buildChatBubble(msg));
}

async function sendChatMessage() {
  const input = document.getElementById('chatMessageInput');
  const text = input?.value.trim();
  if (!text || !_chatState.activeContactId || !_chatState.currentUserId) return;

  input.value = '';
  input.disabled = true;

  // Optimistic append
  appendChatMessage({ content: text, sender_id: _chatState.currentUserId, created_at: new Date().toISOString() });
  scrollChatToBottom();

  try {
    // Try to save message
    const { error } = await supabase.from('messages').insert({
      sender_id: _chatState.currentUserId,
      receiver_id: _chatState.activeContactId,
      content: text
    });
    
    if (error) throw error;
  } catch (e) {
    console.error('Error sending message:', e);
    Helpers.toast('Error al enviar mensaje', 'error');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function scrollChatToBottom() {
  const container = document.getElementById('chatMessagesContainer');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

async function loadAlerts() {
  const el = document.getElementById('alertasContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando alertas...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    const alerts = [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Check pending payments older than 7 days
    try {
      const { data: overdue } = await supabase.from('payments')
        .select('id, student_id, amount, concept, due_date, students(name)')
        .eq('status', 'pending')
        .lt('due_date', todayStr)
        .limit(20);
      if (overdue?.length) {
        overdue.forEach(p => {
          alerts.push({ type: 'warning', icon: 'alert-triangle', title: 'Pago vencido', message: `${p.concept || 'Cuota'} — RD$${p.amount || 0} — ${p.students?.name || 'Estudiante'} — venció ${p.due_date}`, time: p.due_date });
        });
      }
    } catch (_) {}

    // Check students without classroom assignment
    try {
      const { count } = await supabase.from('students')
        .select('*', { count: 'exact', head: true })
        .is('classroom_id', null)
        .eq('is_active', true);
      if (count > 0) {
        alerts.push({ type: 'info', icon: 'users', title: 'Estudiantes sin aula', message: `${count} estudiante(s) activo(s) no tienen aula asignada`, time: todayStr });
      }
    } catch (_) {}

    // Check today's daily logs for missing routines
    try {
      const { count: classroomsCount } = await supabase.from('classrooms').select('*', { count: 'exact', head: true });
      const { count: logsToday } = await supabase.from('daily_logs')
        .select('*', { count: 'exact', head: true })
        .eq('date', todayStr);
      if (classroomsCount && logsToday !== undefined && logsToday < classroomsCount) {
        alerts.push({ type: 'warning', icon: 'clipboard-list', title: 'Rutinas pendientes', message: `${classroomsCount - logsToday} aula(s) no han registrado rutinas de hoy`, time: todayStr });
      }
    } catch (_) {}

    if (alerts.length === 0) {
      el.innerHTML = `
        <div class="text-center py-16">
          <div class="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="check-circle" class="w-10 h-10 text-emerald-500"></i>
          </div>
          <h3 class="text-xl font-black text-slate-700 mb-2">Todo en orden</h3>
          <p class="text-slate-500">No hay alertas pendientes en este momento</p>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
            <div class="text-3xl font-black text-amber-600">${alerts.filter(a=>a.type==='warning').length}</div>
            <div class="text-xs font-bold text-slate-500 mt-1">Advertencias</div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
            <div class="text-3xl font-black text-blue-600">${alerts.filter(a=>a.type==='info').length}</div>
            <div class="text-xs font-bold text-slate-500 mt-1">Informativas</div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
            <div class="text-3xl font-black text-rose-600">${alerts.filter(a=>a.type==='critical').length}</div>
            <div class="text-xs font-bold text-slate-500 mt-1">Críticas</div>
          </div>
        </div>
        <div class="space-y-3">
          ${alerts.map(a => `
            <div class="flex items-start gap-3 p-4 bg-white rounded-2xl border border-slate-100 hover:shadow-md transition-all">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                a.type === 'critical' ? 'bg-red-100 text-red-600' :
                a.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                'bg-blue-100 text-blue-600'
              }">
                <i data-lucide="${a.icon}" class="w-5 h-5"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-black text-sm text-slate-800">${a.title}</div>
                <div class="text-xs text-slate-500 mt-0.5">${a.message}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadPadresOpinion() {
  const el = document.getElementById('opinionesContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando opiniones...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    let feedback = [];
    try {
      const { data } = await supabase.from('parent_feedback')
        .select('*, profiles:user_id(name, avatar_url), students:student_id(name)')
        .order('created_at', { ascending: false })
        .limit(20);
      feedback = data || [];
    } catch (_) {}

    if (feedback.length === 0) {
      el.innerHTML = `
        <div class="text-center py-16">
          <div class="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="message-square-heart" class="w-10 h-10 text-indigo-400"></i>
          </div>
          <h3 class="text-xl font-black text-slate-700 mb-2">Sin opiniones aún</h3>
          <p class="text-slate-500 text-sm">Las opiniones de los padres aparecerán aquí cuando las envíen</p>
        </div>`;
    } else {
      const avgRating = feedback.reduce((sum,f) => sum + (f.rating || 0), 0) / feedback.length;
      el.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-100 p-6 mb-6 text-center">
          <div class="text-4xl font-black text-indigo-600">${avgRating.toFixed(1)}</div>
          <div class="text-sm text-slate-500 mt-1">${feedback.length} opiniones · Promedio general</div>
          <div class="flex justify-center gap-0.5 mt-2">
            ${[1,2,3,4,5].map(s => `<span class="text-xl ${s <= Math.round(avgRating) ? 'text-amber-400' : 'text-slate-200'}">★</span>`).join('')}
          </div>
        </div>
        <div class="space-y-3">
          ${feedback.map(f => `
            <div class="bg-white rounded-2xl border border-slate-100 p-4">
              <div class="flex items-center gap-3 mb-2">
                <img src="${f.profiles?.avatar_url || 'img/monte.jpg'}" class="w-8 h-8 rounded-full object-cover">
                <div>
                  <div class="font-bold text-sm text-slate-800">${Helpers.escapeHTML(f.profiles?.name || 'Padre')}</div>
                  <div class="text-xs text-slate-400">${f.students?.name || ''} · ${new Date(f.created_at).toLocaleDateString('es-DO')}</div>
                </div>
                <div class="ml-auto flex gap-0.5">${[1,2,3,4,5].map(s => `<span class="text-sm ${s <= (f.rating||0) ? 'text-amber-400' : 'text-slate-200'}">★</span>`).join('')}</div>
              </div>
              <p class="text-sm text-slate-600">${Helpers.escapeHTML(f.comment || f.feedback || '')}</p>
            </div>
          `).join('')}
        </div>`;
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadAccesosQR() {
  const el = document.getElementById('qrContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando accesos QR...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    let students = [];
    try {
      const { data } = await supabase.from('students')
        .select('id, name, matricula, qr_code, is_active, classrooms:classroom_id(name)')
        .eq('is_active', true)
        .order('name');
      students = data || [];
    } catch (_) {}

    el.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-indigo-600">${students.length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Estudiantes con QR</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-emerald-600">${students.filter(s=>s.qr_code).length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Con código generado</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-amber-600">${students.filter(s=>!s.qr_code).length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Sin QR</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="bg-slate-50 text-left">
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400">Estudiante</th>
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400 hidden sm:table-cell">Aula</th>
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400">QR</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              ${students.length === 0 ? '<tr><td colspan="3" class="px-4 py-12 text-center text-slate-400">No hay estudiantes registrados</td></tr>' : ''}
              ${students.map(s => `
                <tr class="hover:bg-indigo-50/50 transition-colors">
                  <td class="px-4 py-3"><div class="font-bold text-slate-800">${Helpers.escapeHTML(s.name || '—')}</div><div class="text-xs text-slate-400">${s.matricula || '—'}</div></td>
                  <td class="px-4 py-3 hidden sm:table-cell text-slate-600">${s.classrooms?.name || '—'}</td>
                  <td class="px-4 py-3">${s.qr_code ? '<span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">Activo</span>' : '<span class="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-black">Pendiente</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadReportesCumplimiento() {
  const el = document.getElementById('cumplimientoContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando reportes...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    const { data: profiles } = await supabase.from('profiles')
      .select('id, name, role')
      .in('role', ['maestra']);
    const teachers = profiles || [];

    const { data: classrooms } = await supabase.from('classrooms')
      .select('id, name, teacher_id');
    const cls = classrooms || [];

    const last7 = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
    let logs = [];
    try {
      const { data } = await supabase.from('daily_logs')
        .select('teacher_id, classroom_id, date, id')
        .gte('date', last7);
      logs = data || [];
    } catch (_) {}

    let tasks = [];
    try {
      const { data } = await supabase.from('tasks')
        .select('teacher_id, id, created_at');
      tasks = data || [];
    } catch (_) {}

    const teacherStats = teachers.map(t => {
      const tLogs = logs.filter(l => l.teacher_id === t.id);
      const tTasks = tasks.filter(tk => tk.teacher_id === t.id);
      const uniqueDays = new Set(tLogs.map(l => l.date)).size;
      const coverage = Math.round((uniqueDays / 7) * 100);
      return { name: t.name, logs: tLogs.length, tasks: tTasks.length, coverage };
    }).sort((a,b) => b.coverage - a.coverage);

    el.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-indigo-600">${teachers.length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Maestras</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-emerald-600">${logs.length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Rutinas (7 días)</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-amber-600">${tasks.length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Tareas creadas</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-6">
        <h3 class="font-black text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="bar-chart-3" class="w-5 h-5 text-indigo-600"></i> Cobertura de Rutinas (7 días)</h3>
        ${teacherStats.length === 0 ? '<p class="text-slate-400 text-center py-8">No hay datos disponibles</p>' : ''}
        <div class="space-y-4">
          ${teacherStats.map((t,i) => `
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-bold text-slate-700">${i+1}. ${Helpers.escapeHTML(t.name || 'Sin nombre')}</span>
                <span class="text-xs font-black ${t.coverage >= 80 ? 'text-emerald-600' : t.coverage >= 50 ? 'text-amber-600' : 'text-red-600'}">${t.coverage}%</span>
              </div>
              <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500 ${
                  t.coverage >= 80 ? 'bg-emerald-500' : t.coverage >= 50 ? 'bg-amber-500' : 'bg-red-400'
                }" style="width:${t.coverage}%"></div>
              </div>
              <div class="flex gap-4 mt-1 text-xs text-slate-400">
                <span>${t.logs} rutinas</span>
                <span>${t.tasks} tareas</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadControlRutinas() {
  const el = document.getElementById('rutinasContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando rutinas...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: classrooms } = await supabase.from('classrooms').select('id, name').order('name');
    const cls = classrooms || [];

    let logs = [];
    try {
      const { data } = await supabase.from('daily_logs')
        .select('*, profiles:teacher_id(name), classrooms:classroom_id(name)')
        .eq('date', today)
        .order('created_at', { ascending: false });
      logs = data || [];
    } catch (_) {}

    const loggedClassrooms = new Set(logs.map(l => l.classroom_id));
    const missingCls = cls.filter(c => !loggedClassrooms.has(c.id));

    el.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-emerald-600">${logs.length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Rutinas hoy</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-amber-600">${missingCls.length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Pendientes</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-indigo-600">${cls.length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Total aulas</div>
        </div>
      </div>
      ${missingCls.length > 0 ? `
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <h4 class="font-black text-amber-700 text-sm mb-2 flex items-center gap-2"><i data-lucide="alert-triangle" class="w-4 h-4"></i> Sin rutina hoy</h4>
          <div class="flex flex-wrap gap-2">${missingCls.map(c => `<span class="px-3 py-1 bg-white border border-amber-200 rounded-full text-xs font-bold text-amber-700">${c.name}</span>`).join('')}</div>
        </div>
      ` : ''}
      <div class="space-y-3">
        ${logs.length === 0 ? '<div class="text-center py-12 text-slate-400"><i data-lucide="clipboard-list" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i><p class="font-bold">No hay rutinas registradas hoy</p></div>' : ''}
        ${logs.map(l => `
          <div class="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-all">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-black text-sm text-slate-800">${l.classrooms?.name || 'Aula'}</div>
                <div class="text-xs text-slate-500 mt-0.5">${l.profiles?.name || 'Maestra'} · ${l.routine_type || 'General'}</div>
              </div>
              <span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">Registrada</span>
            </div>
            ${l.notes ? `<p class="text-xs text-slate-500 mt-2 border-t border-slate-100 pt-2">${Helpers.escapeHTML(l.notes)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadReportesTareas() {
  const el = document.getElementById('tareasContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando tareas...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    let tasks = [];
    try {
      const { data } = await supabase.from('tasks')
        .select('id, title, due_date, created_at, classroom_id, teacher_id, profiles:teacher_id(name), classrooms:classroom_id(name)')
        .order('created_at', { ascending: false })
        .limit(30);
      tasks = data || [];
    } catch (_) {}

    let submissions = [];
    try {
      const { data } = await supabase.from('task_submissions')
        .select('task_id, id');
      submissions = data || [];
    } catch (_) {}

    el.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-indigo-600">${tasks.length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Tareas totales</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-emerald-600">${submissions.length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Entregas</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-amber-600">${tasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Vencidas</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="bg-slate-50 text-left">
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400">Tarea</th>
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400 hidden sm:table-cell">Aula</th>
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400 hidden sm:table-cell">Maestra</th>
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400">Fecha límite</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              ${tasks.length === 0 ? '<tr><td colspan="4" class="px-4 py-12 text-center text-slate-400">No hay tareas registradas</td></tr>' : ''}
              ${tasks.map(t => {
                const isOverdue = t.due_date && new Date(t.due_date) < new Date();
                return `
                <tr class="hover:bg-indigo-50/50 transition-colors">
                  <td class="px-4 py-3 font-bold text-slate-800">${Helpers.escapeHTML(t.title || 'Sin título')}</td>
                  <td class="px-4 py-3 hidden sm:table-cell text-slate-600">${t.classrooms?.name || '—'}</td>
                  <td class="px-4 py-3 hidden sm:table-cell text-slate-600">${t.profiles?.name || '—'}</td>
                  <td class="px-4 py-3"><span class="${isOverdue ? 'text-red-600 font-black' : 'text-slate-600'}">${t.due_date || '—'}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadComparativoAulas() {
  const el = document.getElementById('comparativoContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando comparativo...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    const { data: classrooms } = await supabase.from('classrooms')
      .select('id, name, teacher_id, profiles:teacher_id(name)');
    const cls = classrooms || [];

    const last7 = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
    let logs = [];
    try {
      const { data } = await supabase.from('daily_logs')
        .select('classroom_id, date, attendance_count, total_students, notes')
        .gte('date', last7);
      logs = data || [];
    } catch (_) {}

    let tasks = [];
    try {
      const { data } = await supabase.from('tasks')
        .select('classroom_id, id');
      tasks = data || [];
    } catch (_) {}

    let submissions = [];
    try {
      const { data } = await supabase.from('task_submissions')
        .select('task_id, student_id');
      submissions = data || [];
    } catch (_) {}

    el.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        ${cls.length === 0 ? '<div class="text-center py-16 text-slate-400"><i data-lucide="layout-grid" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i><p class="font-bold">No hay aulas registradas</p></div>' : ''}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
          ${cls.map(c => {
            const cLogs = logs.filter(l => l.classroom_id === c.id);
            const cTasks = tasks.filter(t => t.classroom_id === c.id);
            const cSubs = submissions.filter(s => cTasks.some(t => t.id === s.task_id));
            const uniqueDays = new Set(cLogs.map(l => l.date)).size;
            const coverage = Math.round((uniqueDays / 7) * 100);
            const avgAttendance = cLogs.length > 0 ? Math.round(cLogs.reduce((sum,l) => sum + (l.attendance_count || 0), 0) / cLogs.length) : 0;
            const avgTotal = cLogs.length > 0 ? Math.round(cLogs.reduce((sum,l) => sum + (l.total_students || 0), 0) / cLogs.length) : 0;
            const attendancePct = avgTotal > 0 ? Math.round((avgAttendance / avgTotal) * 100) : 0;
            const submissionRate = cTasks.length > 0 ? Math.round((cSubs.length / (cTasks.length * Math.max(avgTotal, 1))) * 100) : 0;
            return `
              <div class="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:shadow-md transition-all">
                <div class="font-black text-slate-800 mb-1">${c.name}</div>
                <div class="text-xs text-slate-500 mb-3">${c.profiles?.name || 'Sin asignar'}</div>
                <div class="space-y-2">
                  <div>
                    <div class="flex justify-between text-xs mb-0.5"><span class="text-slate-500">Rutinas</span><span class="font-black text-indigo-600">${coverage}%</span></div>
                    <div class="w-full h-1.5 bg-white rounded-full"><div class="h-full bg-indigo-500 rounded-full" style="width:${coverage}%"></div></div>
                  </div>
                  <div>
                    <div class="flex justify-between text-xs mb-0.5"><span class="text-slate-500">Asistencia</span><span class="font-black text-emerald-600">${attendancePct}%</span></div>
                    <div class="w-full h-1.5 bg-white rounded-full"><div class="h-full bg-emerald-500 rounded-full" style="width:${attendancePct}%"></div></div>
                  </div>
                  <div>
                    <div class="flex justify-between text-xs mb-0.5"><span class="text-slate-500">Entregas</span><span class="font-black text-amber-600">${submissionRate}%</span></div>
                    <div class="w-full h-1.5 bg-white rounded-full"><div class="h-full bg-amber-500 rounded-full" style="width:${submissionRate}%"></div></div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadCentroEstadisticas() {
  const el = document.getElementById('estadisticasContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando estadísticas...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    const stats = {};
    const tryQuery = async (table, label) => {
      try {
        const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
        stats[label] = count || 0;
      } catch (_) { stats[label] = 0; }
    };
    await Promise.all([
      tryQuery('students', 'Estudiantes'),
      tryQuery('classrooms', 'Aulas'),
      tryQuery('profiles', 'Usuarios'),
      tryQuery('tasks', 'Tareas'),
      tryQuery('daily_logs', 'Rutinas'),
      tryQuery('payments', 'Pagos'),
      tryQuery('posts', 'Publicaciones'),
      tryQuery('messages', 'Mensajes'),
    ]);

    el.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        ${Object.entries(stats).map(([label, count]) => `
          <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center hover:shadow-md transition-all">
            <div class="text-3xl font-black text-indigo-600">${count}</div>
            <div class="text-xs font-bold text-slate-500 mt-1">${label}</div>
          </div>
        `).join('')}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadConfig() {
  loadPerfil();
}

async function loadMuroEscolar() {
  const el = document.getElementById('muroContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando muro...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    const { data: classrooms } = await supabase.from('classrooms').select('id, name').order('name');
    const cls = classrooms || [];

    let posts = [];
    try {
      const { data } = await supabase.from('posts')
        .select('*, profiles:teacher_id(name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(50);
      posts = data || [];
    } catch (_) {}

    const authorName = (p) => p?.profiles?.name || 'Encargada';
    const authorAvatar = (p) => p?.profiles?.avatar_url || 'img/monte.jpg';
    const timeAgo = (d) => {
      const diff = (Date.now() - new Date(d).getTime()) / 1000;
      if (diff < 60) return 'ahora';
      if (diff < 3600) return Math.floor(diff/60) + ' min';
      if (diff < 86400) return Math.floor(diff/3600) + 'h';
      return Math.floor(diff/86400) + 'd';
    };

    el.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
        <h3 class="font-black text-indigo-700 mb-4 flex items-center gap-2"><i data-lucide="plus-circle" class="w-5 h-5"></i> Nueva Publicación</h3>
        <div class="space-y-3">
          <textarea id="muroText" rows="3" placeholder="Escribe un aviso, novedad o mensaje para las familias..."
            class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-sm"></textarea>
          <div class="flex flex-wrap items-center gap-3">
            <select id="muroClassroom" class="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none">
              <option value="">Todas las aulas</option>
              ${cls.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
            <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <i data-lucide="image" class="w-4 h-4"></i> Foto
              <input type="file" accept="image/*" id="muroFile" class="hidden">
            </label>
            <button id="btnMuroPublish" class="ml-auto px-5 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs hover:bg-indigo-700 transition-all shadow-md">
              Publicar
            </button>
          </div>
          <div id="muroFilePreview" class="hidden mt-2 relative inline-block">
            <img id="muroFileImg" class="h-24 rounded-xl object-cover border border-slate-200">
            <button onclick="document.getElementById('muroFile').value='';document.getElementById('muroFilePreview').classList.add('hidden')" class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow">&times;</button>
          </div>
        </div>
      </div>
      <div id="muroPostsList" class="space-y-4">
        ${posts.length === 0 ? '<div class="text-center py-12 text-slate-400"><i data-lucide="megaphone" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i><p class="font-bold">No hay publicaciones aún</p><p class="text-xs mt-1">Crea la primera publicación del muro escolar</p></div>' : ''}
        ${posts.map(p => `
          <div class="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-all">
            <div class="flex items-center gap-3 mb-3">
              <img src="${authorAvatar(p)}" class="w-10 h-10 rounded-full object-cover border-2 border-indigo-100">
              <div>
                <div class="font-black text-sm text-slate-800">${authorName(p)}</div>
                <div class="text-xs text-slate-400">${timeAgo(p.created_at)}${p.classroom_id ? ' · ' + (cls.find(c=>c.id===p.classroom_id)?.name || 'Aula') : ' · Todas las aulas'}</div>
              </div>
            </div>
            <p class="text-sm text-slate-700 whitespace-pre-wrap">${Helpers.escapeHTML(p.content || '')}</p>
            ${p.media_url ? `<img src="${p.media_url}" class="mt-3 rounded-xl max-h-64 object-cover border border-slate-100">` : ''}
          </div>
        `).join('')}
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    document.getElementById('muroFile')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const preview = document.getElementById('muroFilePreview');
      const img = document.getElementById('muroFileImg');
      if (preview && img) { img.src = URL.createObjectURL(file); preview.classList.remove('hidden'); }
    });

    document.getElementById('btnMuroPublish')?.addEventListener('click', async () => {
      const text = document.getElementById('muroText')?.value?.trim();
      if (!text) { Helpers.toast('Escribe algo para publicar', 'error'); return; }
      const btn = document.getElementById('btnMuroPublish');
      btn.disabled = true; btn.textContent = 'Publicando...';
      try {
        let mediaUrl = null;
        const file = document.getElementById('muroFile')?.files[0];
        if (file) {
          const ext = file.name.split('.').pop() || 'jpg';
          const path = `muro/${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage.from('student-documents').upload(path, file);
          if (!upErr) {
            const { data: urlData } = supabase.storage.from('student-documents').getPublicUrl(path);
            mediaUrl = urlData?.publicUrl || null;
          }
        }
        const clsId = document.getElementById('muroClassroom')?.value || null;
        const { error } = await supabase.from('posts').insert({
          teacher_id: AppState.get('user')?.id,
          classroom_id: clsId ? parseInt(clsId) : null,
          content: text,
          media_url: mediaUrl,
          media_type: file ? 'image' : null,
        });
        if (error) throw error;
        Helpers.toast('Publicación enviada', 'success');
        document.getElementById('muroText').value = '';
        document.getElementById('muroFile').value = '';
        document.getElementById('muroFilePreview').classList.add('hidden');
        loadMuroEscolar();
      } catch (e) {
        Helpers.toast('Error: ' + e.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Publicar'; }
      }
    });
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadInscripciones() {
  const el = document.getElementById('inscripcionesContent');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-8 text-slate-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Cargando preinscripciones...</div>';
  if (window.lucide) lucide.createIcons();
  try {
    const { data: preregs } = await supabase.from('student_preregistrations')
      .select('*')
      .order('created_at', { ascending: false });
    const list = preregs || [];

    const statusColors = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-emerald-100 text-emerald-700', admitted: 'bg-blue-100 text-blue-700', rejected: 'bg-red-100 text-red-700', waitlist: 'bg-slate-100 text-slate-600' };
    const statusLabels = { pending: 'Pendiente', approved: 'Aprobada', admitted: 'Admitido', rejected: 'Rechazada', waitlist: 'Lista de espera' };

    el.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-amber-600">${list.filter(p=>p.status==='pending').length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Pendientes</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-emerald-600">${list.filter(p=>p.status==='approved').length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Aprobadas</div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-4 text-center">
          <div class="text-3xl font-black text-blue-600">${list.filter(p=>p.status==='admitted').length}</div>
          <div class="text-xs font-bold text-slate-500 mt-1">Admitidos</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        ${list.length === 0 ? '<div class="text-center py-16 text-slate-400"><i data-lucide="file-text" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i><p class="font-bold">No hay preinscripciones registradas</p></div>' : ''}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="bg-slate-50 text-left">
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400">Estudiante</th>
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400 hidden sm:table-cell">Nivel</th>
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400 hidden md:table-cell">Tutor</th>
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400">Estado</th>
              <th class="px-4 py-3 font-black text-xs uppercase text-slate-400">Acción</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              ${list.map(p => `
                <tr class="hover:bg-indigo-50/50 transition-colors">
                  <td class="px-4 py-3">
                    <div class="font-bold text-slate-800">${Helpers.escapeHTML(p.student_name || 'Sin nombre')}</div>
                    <div class="text-xs text-slate-400">${p.level_requested || '—'}</div>
                  </td>
                  <td class="px-4 py-3 hidden sm:table-cell text-slate-600">${p.level_requested || '—'}</td>
                  <td class="px-4 py-3 hidden md:table-cell text-slate-600">${Helpers.escapeHTML(p.p1_name || '—')}</td>
                  <td class="px-4 py-3"><span class="px-2.5 py-1 rounded-full text-xs font-black ${statusColors[p.status] || 'bg-slate-100 text-slate-600'}">${statusLabels[p.status] || p.status}</span></td>
                  <td class="px-4 py-3">
                    <button onclick="window.goToSection && window.goToSection('inscripciones')" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-black hover:bg-indigo-700 transition-all"
                      data-prereg-id="${p.id}">
                      Ver Detalle
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadPerfil() {
  const el = document.getElementById('perfilContent');
  if (!el) return;
  try {
    const profile = AppState.get('profile');
    const user = AppState.get('user');
    el.innerHTML = `
      <div class="max-w-2xl mx-auto space-y-6">
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <div class="flex flex-col sm:flex-row items-center gap-6 mb-6">
            <div class="relative group">
              <img id="perfilAvatar" src="${profile?.avatar_url || 'img/monte.jpg'}"
                class="w-24 h-24 rounded-full object-cover border-4 border-indigo-200 shadow-lg group-hover:brightness-75 transition-all cursor-pointer">
              <div class="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <i data-lucide="camera" class="w-6 h-6 text-white drop-shadow"></i>
              </div>
              <input type="file" accept="image/*" id="perfilAvatarInput" class="hidden">
            </div>
            <div class="text-center sm:text-left">
              <h2 class="text-xl font-black text-slate-800">${Helpers.escapeHTML(profile?.name || 'Encargada')}</h2>
              <p class="text-sm text-slate-500">${Helpers.escapeHTML(profile?.email || '')}</p>
              <span class="inline-block mt-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-black uppercase">${Helpers.escapeHTML(profile?.role || 'encargada')}</span>
            </div>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-black uppercase text-slate-400 mb-2">Nombre completo</label>
              <input type="text" id="perfilName" value="${Helpers.escapeHTML(profile?.name || '')}"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all">
            </div>
            <div>
              <label class="block text-xs font-black uppercase text-slate-400 mb-2">Correo electrónico</label>
              <input type="email" value="${Helpers.escapeHTML(profile?.email || '')}" disabled
                class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
            </div>
            <div>
              <label class="block text-xs font-black uppercase text-slate-400 mb-2">Teléfono</label>
              <input type="tel" id="perfilPhone" value="${Helpers.escapeHTML(profile?.phone || '')}"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all">
            </div>
            <button id="btnSavePerfil" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg">
              Guardar cambios
            </button>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 class="font-black text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="qr-code" class="w-5 h-5 text-indigo-600"></i> Mi Código QR</h3>
          <div id="perfilQR" class="flex justify-center py-4">
            ${profile?.qr_code
              ? `<img src="${profile.qr_code}" class="w-48 h-48 rounded-xl border border-slate-200">`
              : `<div class="text-center text-slate-400">
                  <i data-lucide="qr-code" class="w-16 h-16 mx-auto mb-2 text-slate-300"></i>
                  <p class="text-xs">Código QR no disponible</p>
                </div>`}
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 class="font-black text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="shield" class="w-5 h-5 text-indigo-600"></i> Seguridad</h3>
          <button id="btnChangePassword" class="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-black text-sm hover:bg-slate-200 transition-all">
            Cambiar contraseña
          </button>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    document.getElementById('perfilAvatar')?.addEventListener('click', () => {
      document.getElementById('perfilAvatarInput')?.click();
    });

    document.getElementById('perfilAvatarInput')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const avatarImg = document.getElementById('perfilAvatar');
      if (avatarImg) avatarImg.style.opacity = '0.5';
      try {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `avatars/${user?.id || 'unknown'}.${ext}`;
        const { error: upErr } = await supabase.storage.from('student-documents').upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('student-documents').getPublicUrl(path);
        const avatarUrl = urlData?.publicUrl;
        if (avatarUrl) {
          await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
          AppState.set('profile', { ...profile, avatar_url: avatarUrl });
          if (avatarImg) { avatarImg.src = avatarUrl; avatarImg.style.opacity = '1'; }
          loadProfile();
          Helpers.toast('Foto de perfil actualizada', 'success');
        }
      } catch (err) {
        Helpers.toast('Error al subir foto: ' + err.message, 'error');
        if (avatarImg) avatarImg.style.opacity = '1';
      }
    });

    document.getElementById('btnSavePerfil')?.addEventListener('click', async () => {
      const name = document.getElementById('perfilName')?.value?.trim();
      const phone = document.getElementById('perfilPhone')?.value?.trim();
      if (!user?.id || !name) return;
      try {
        const { error } = await supabase.from('profiles').update({ name, phone }).eq('id', user.id);
        if (error) throw error;
        AppState.set('profile', { ...profile, name, phone });
        loadProfile();
        Helpers.toast('Perfil actualizado', 'success');
      } catch (e) {
        Helpers.toast('Error: ' + e.message, 'error');
      }
    });

    document.getElementById('btnChangePassword')?.addEventListener('click', async () => {
      const email = profile?.email;
      if (!email) { Helpers.toast('No se encontró el correo', 'error'); return; }
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/login.html' });
        if (error) throw error;
        Helpers.toast('Se envió un enlace de restablecimiento a tu correo', 'success');
      } catch (e) {
        Helpers.toast('Error: ' + e.message, 'error');
      }
    });
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadProfile() {
  try {
    const profile = AppState.get('profile');
    if (!profile) return;
    const nameEl = document.getElementById('sidebarName');
    if (nameEl) nameEl.textContent = profile.name || 'Encargada';
    const avatarImg = document.getElementById('sidebarProfileAvatar');
    if (avatarImg) avatarImg.src = profile.avatar_url || 'img/monte.jpg';
  } catch (_) {}
}

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message?.toLowerCase() ?? '';
  if (msg.includes('indexeddb') || msg.includes('network') || msg.includes('fetch')) return;
});

document.addEventListener('DOMContentLoaded', async () => {
  // ── Failsafe: clean up any stale overlays from previous session ──
  const staleModal = document.getElementById('globalModalContainer');
  if (staleModal) { staleModal.style.display = 'none'; staleModal.style.backdropFilter = 'none'; staleModal.classList.add('hidden'); staleModal.innerHTML = ''; }
  const staleOverlay = document.getElementById('sidebarOverlay');
  if (staleOverlay) staleOverlay.style.display = 'none';

  const initialLoadTimeout = setTimeout(() => {
    const loader = document.getElementById('initial-loading');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 300);
    }
  }, 12000);

  try {
    const auth = await ensureRole('encargada');
    if (!auth) {
      clearTimeout(initialLoadTimeout);
      const overlay = document.getElementById('sidebarOverlay');
      if (overlay) overlay.style.display = 'none';
      const loader = document.getElementById('initial-loading');
      if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 300); }
      return;
    }

    AppState.set('user', auth.user);
    AppState.set('profile', auth.profile);

    const host = window.location.hostname;
    const isProd = host === 'montessorisonrisascreativas.com' || host === 'www.montessorisonrisascreativas.com' || host.endsWith('.montessorisonrisascreativas.com') || host === 'localhost';
    if (isProd) {
      try { initOneSignal(auth.user); } catch (_) {}
    }

    loadProfile();
    goToSection('dashboard');

    // ── Wire ALL sidebar nav buttons → goToSection() ────────────────
    document.querySelectorAll('#sidebar [data-section]').forEach(btn => {
      // Skip group-toggle buttons (they open/close accordions, not sections)
      if (btn.classList.contains('kk-nav-group-toggle')) return;
      btn.addEventListener('click', () => {
        const sectionId = btn.dataset.section;
        if (sectionId) goToSection(sectionId);
      });
    });

    // ── Sidebar accordion dropdowns handled by sidebar-manager import below ──

    BadgeSystem.init(auth.user.id);

    document.getElementById('btnLogout')?.addEventListener('click', async () => {
      RealtimeManager.unsubscribeAll();
      QueryCache.clear();
      await supabase.auth.signOut();
      window.location.href = 'login.html';
    });

    import('../shared/sidebar-manager.js').then(({ initSidebar, initSidebarDropdowns }) => {
      initSidebar();
      initSidebarDropdowns();
    }).catch(() => {
      document.getElementById('menuBtn')?.addEventListener('click', () => {
        const sb = document.getElementById('sidebar');
        const ov = document.getElementById('sidebarOverlay');
        if (!sb) return;
        const open = sb.classList.toggle('mobile-visible');
        if (ov) ov.style.display = open ? 'block' : 'none';
      });
      document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.remove('mobile-visible');
        document.getElementById('sidebarOverlay').style.display = 'none';
      });
    });

    const loader = document.getElementById('initial-loading');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }
    clearTimeout(initialLoadTimeout);

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    clearTimeout(initialLoadTimeout);
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.style.display = 'none';
    const loader = document.getElementById('initial-loading');
    if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 300); }
    const msg = (err?.message || '').toLowerCase();
    const isAuthError = msg.includes('session') || msg.includes('auth') || msg.includes('jwt') || msg.includes('token');
    if (isAuthError) {
      window.location.href = 'login.html';
    }
  }
});
