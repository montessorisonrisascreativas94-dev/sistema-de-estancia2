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
        loadConfig();
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
      kpiEficiencia: '92',
      kpiPromedioInstitucional: '88',
      kpiCumplimientoDiario: '95',
      kpiCumplimientoMensual: '90'
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
          <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 mx-auto mb-3 flex items-center justify-center text-2xl">
            ${(teachers[0].name || 'M')[0].toUpperCase()}
          </div>
          <p class="font-bold text-slate-800">${teachers[0].name || 'Maestra 1'}</p>
          <p class="text-xs text-slate-400">${teachers[0].classroom?.name || 'Aula 1'}</p>
        </div>
      ` : '<p class="text-slate-400">No hay maestras</p>';
    }
    if (mejorAulaEl) {
      mejorAulaEl.innerHTML = classrooms?.[0] ? `
        <div class="text-center">
          <div class="w-16 h-16 rounded-full bg-gradient-to-br from-green-100 to-green-50 mx-auto mb-3 flex items-center justify-center text-2xl">
            🏫
          </div>
          <p class="font-bold text-slate-800">${classrooms[0].name || 'Aula 1'}</p>
          <p class="text-xs text-slate-400">${classrooms[0].capacity || 20} niños</p>
        </div>
      ` : '<p class="text-slate-400">No hay aulas</p>';
    }
    if (alertasPendientesEl) {
      alertasPendientesEl.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-2xl p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center">
                <i data-lucide="trophy" class="w-5 h-5 text-amber-700"></i>
              </div>
              <div>
                <p class="text-xs font-black uppercase text-amber-700">Mejor Maestra</p>
                <p class="font-bold text-amber-900">${teachers?.[0]?.name || 'Maestra 1'}</p>
              </div>
            </div>
          </div>
          <div class="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-green-200 flex items-center justify-center">
                <i data-lucide="school" class="w-5 h-5 text-green-700"></i>
              </div>
              <div>
                <p class="text-xs font-black uppercase text-green-700">Mejor Aula</p>
                <p class="font-bold text-green-900">${classrooms?.[0]?.name || 'Aula 1'}</p>
              </div>
            </div>
          </div>
          <div class="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-2xl p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-200 flex items-center justify-center">
                <i data-lucide="star" class="w-5 h-5 text-purple-700"></i>
              </div>
              <div>
                <p class="text-xs font-black uppercase text-purple-700">Mayor Satisfacción</p>
                <p class="font-bold text-purple-900">${teachers?.[1]?.name || 'Maestra 2'}</p>
              </div>
            </div>
          </div>
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-200 flex items-center justify-center">
                <i data-lucide="clock" class="w-5 h-5 text-blue-700"></i>
              </div>
              <div>
                <p class="text-xs font-black uppercase text-blue-700">Mejor Puntualidad</p>
                <p class="font-bold text-blue-900">${teachers?.[2]?.name || 'Maestra 3'}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-6">
            <h4 class="font-black text-emerald-900 mb-4 flex items-center gap-2">
              <i data-lucide="check-circle" class="w-5 h-5"></i>
              Logros del Día
            </h4>
            <ul class="space-y-2 text-sm text-emerald-800">
              <li class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4"></i>
                100% de rutinas completadas
              </li>
              <li class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4"></i>
                95% de asistencia docente
              </li>
              <li class="flex items-center gap-2">
                <i data-lucide="check" class="w-4 h-4"></i>
                Todas las tareas entregadas a tiempo
              </li>
            </ul>
          </div>
          
          <div class="bg-gradient-to-br from-sky-50 to-sky-100 border border-sky-200 rounded-2xl p-6">
            <h4 class="font-black text-sky-900 mb-4 flex items-center gap-2">
              <i data-lucide="lightbulb" class="w-5 h-5"></i>
              Recomendaciones
            </h4>
            <ul class="space-y-2 text-sm text-sky-800">
              <li class="flex items-start gap-2">
                <i data-lucide="arrow-right" class="w-4 h-4 mt-0.5"></i>
                Programar reunión con Maestra 2 para revisar estrategias
              </li>
              <li class="flex items-start gap-2">
                <i data-lucide="arrow-right" class="w-4 h-4 mt-0.5"></i>
                Compartir buenas prácticas de Aula 1 con otras aulas
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
                <td class="px-6 py-4 text-right font-black text-blue-600">${92 - i}%</td>
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
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  
  try {
    const alerts = [
      { type: 'warning', message: 'Maestra 1 tiene bajo rendimiento esta semana', time: 'Hace 2 horas' },
      { type: 'info', message: 'Rutina de desayuno no reportada en Aula 3', time: 'Hace 4 horas' },
      { type: 'error', message: '3 tardanzas esta semana en Aula 2', time: 'Ayer' },
    ];
    
    el.innerHTML = `
      <div class="space-y-4">
        ${alerts.map(a => `
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                a.type === 'warning' ? 'bg-amber-100 text-amber-600' : 
                a.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
              }">
                <i data-lucide="${a.type === 'warning' ? 'alert-triangle' : a.type === 'error' ? 'x-circle' : 'info'}" class="w-6 h-6"></i>
              </div>
              <div class="flex-1">
                <p class="font-bold text-slate-800">${a.message}</p>
                <p class="text-sm text-slate-400 mt-1">${a.time}</p>
              </div>
              <button class="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200">
                Revisar
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadPadresOpinion() {
  const el = document.getElementById('opinionesContent');
  if (!el) return;
  el.innerHTML = `
    <div class="text-center py-12">
      <i data-lucide="message-square-heart" class="w-16 h-16 text-slate-300 mx-auto mb-4"></i>
      <h3 class="text-xl font-bold text-slate-700 mb-2">Próximamente</h3>
      <p class="text-slate-500">Esta sección estará disponible muy pronto.</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function loadAccesosQR() {
  const el = document.getElementById('qrContent');
  if (!el) return;
  el.innerHTML = `
    <div class="text-center py-12">
      <i data-lucide="qrcode" class="w-16 h-16 text-slate-300 mx-auto mb-4"></i>
      <h3 class="text-xl font-bold text-slate-700 mb-2">Próximamente</h3>
      <p class="text-slate-500">Esta sección estará disponible muy pronto.</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function loadReportesCumplimiento() {
  const el = document.getElementById('cumplimientoContent');
  if (!el) return;
  el.innerHTML = `
    <div class="text-center py-12">
      <i data-lucide="clipboard-check" class="w-16 h-16 text-slate-300 mx-auto mb-4"></i>
      <h3 class="text-xl font-bold text-slate-700 mb-2">Próximamente</h3>
      <p class="text-slate-500">Esta sección estará disponible muy pronto.</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function loadControlRutinas() {
  const el = document.getElementById('rutinasContent');
  if (!el) return;
  el.innerHTML = `
    <div class="text-center py-12">
      <i data-lucide="clock" class="w-16 h-16 text-slate-300 mx-auto mb-4"></i>
      <h3 class="text-xl font-bold text-slate-700 mb-2">Próximamente</h3>
      <p class="text-slate-500">Esta sección estará disponible muy pronto.</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function loadReportesTareas() {
  const el = document.getElementById('tareasContent');
  if (!el) return;
  el.innerHTML = `
    <div class="text-center py-12">
      <i data-lucide="check-square" class="w-16 h-16 text-slate-300 mx-auto mb-4"></i>
      <h3 class="text-xl font-bold text-slate-700 mb-2">Próximamente</h3>
      <p class="text-slate-500">Esta sección estará disponible muy pronto.</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function loadComparativoAulas() {
  const el = document.getElementById('comparativoContent');
  if (!el) return;
  el.innerHTML = `
    <div class="text-center py-12">
      <i data-lucide="bar-chart-3" class="w-16 h-16 text-slate-300 mx-auto mb-4"></i>
      <h3 class="text-xl font-bold text-slate-700 mb-2">Próximamente</h3>
      <p class="text-slate-500">Esta sección estará disponible muy pronto.</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function loadCentroEstadisticas() {
  const el = document.getElementById('estadisticasContent');
  if (!el) return;
  el.innerHTML = `
    <div class="text-center py-12">
      <i data-lucide="bar-chart-2" class="w-16 h-16 text-slate-300 mx-auto mb-4"></i>
      <h3 class="text-xl font-bold text-slate-700 mb-2">Próximamente</h3>
      <p class="text-slate-500">Esta sección estará disponible muy pronto.</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function loadConfig() {
  const el = document.getElementById('configuracionContent');
  if (!el) return;
  try {
    const profile = AppState.get('profile');
    el.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 p-6">
        <div class="section-header mb-6">
          <h1 class="section-title">Configuración</h1>
          <p class="section-subtitle">Ajustes de tu perfil y del panel</p>
        </div>
        <div class="space-y-6">
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Nombre</label>
            <input type="text" id="configName" value="${Helpers.escapeHTML(profile?.name || '')}"
              class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all"
            />
          </div>
          <div>
            <label class="block text-xs font-black uppercase text-slate-400 mb-2">Correo electrónico</label>
            <input type="email" id="configEmail" value="${Helpers.escapeHTML(profile?.email || '')}"
              class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50" disabled
            />
          </div>
          <button id="btnSaveConfig" class="w-full py-3 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 transition-all shadow-lg">
            Guardar cambios
          </button>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    document.getElementById('btnSaveConfig')?.addEventListener('click', async () => {
      const name = document.getElementById('configName')?.value?.trim();
      const auth = AppState.get('user');
      if (!auth?.id || !name) return;
      try {
        const { error } = await supabase.from('profiles').update({ name }).eq('id', auth.id);
        if (error) throw error;
        Helpers.toast('Configuración guardada', 'success');
        AppState.set('profile', { ...profile, name });
        loadProfile();
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
