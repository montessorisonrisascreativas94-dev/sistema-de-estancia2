import { ensureRole, supabase, initOneSignal, sendPush } from '../shared/supabase.js';
import { Security } from '../shared/security.js';
import { AppState } from './state.js';
import { Helpers, escapeHtml } from '../shared/helpers.js';
import { UIPremium } from '../shared/ui-premium.js';
import { BadgeSystem } from '../shared/badges.js';
import { RealtimeManager } from '../shared/realtime-manager.js';
import { QueryCache } from '../shared/query-cache.js';
import { TeacherEfficiencyModule } from './modules/teacher_efficiency.module.js';
import { openGlobalModal, closeGlobalModal } from '../shared/modal.js';
import { EncargadaChatApp } from './chat_app.js';
import {
  ChatModule as SharedChatModule,
  fmtMsgTime,
  fmtLastMsgTime,
  truncateLastMsg,
  groupMessages,
  withDaySeparators,
} from '../shared/chat.js';
import { ScrollModule } from '../shared/scroll.module.js';
import { WALL_REACTIONS } from '../shared/wall.js';
const MURO_REACTION_ORDER = ['like', 'love', 'bravo', 'adore', 'party'];
const MURO_COMMENTS_SHOWN = 3;
const muroReactions = {};
const muroCommentsCache = {};
const muroCommentShown = {};
let muroActivePopover = null;

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
      case 'rendimiento-eficiencia':
        loadEfficiency();
        loadRanking();
        break;
      case 'permisos':
        loadPermits();
        break;
      case 'chat':
        loadChat();
        break;
      case 'reportes-comparativas-alertas':
        loadReportesTareas();
        loadComparativoAulas();
        loadAlerts();
        break;
      case 'configuracion':
      case 'perfil':
        loadPerfil();
        break;
      case 'muro':
        loadMuroEscolar();
        break;
      case 'padres-opinion':
        loadPadresOpinion();
        break;
      case 'accesos-qr':
        loadAccesosQR();
        break;
      case 'control-rutinas-cumplimiento':
        loadControlRutinas();
        loadReportesCumplimiento();
        break;

    }
  }
  const _parentSection = {};
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

    const [tasksRes, evidencesRes, postsRes, msgsRes, gradesRes, routinesRes, ratingsRes] = await Promise.allSettled([
      supabase.from('tasks').select('id, classroom_id, created_at'),
      supabase.from('task_evidences').select('id, task_id, created_at'),
      supabase.from('posts').select('id, teacher_id, created_at'),
      supabase.from('messages').select('id, sender_id, created_at'),
      supabase.from('grades').select('id, numeric_score, created_at'),
      supabase.from('daily_logs').select('id, classroom_id, date'),
      supabase.from('parent_ratings').select('id, rating, teacher_id')
    ]);

    const allTasks = tasksRes.status === 'fulfilled' ? (tasksRes.value.data || []) : [];
    const allEvidences = evidencesRes.status === 'fulfilled' ? (evidencesRes.value.data || []) : [];
    const allPosts = postsRes.status === 'fulfilled' ? (postsRes.value.data || []) : [];
    const allMsgs = msgsRes.status === 'fulfilled' ? (msgsRes.value.data || []) : [];
    const allGrades = gradesRes.status === 'fulfilled' ? (gradesRes.value.data || []) : [];
    const allRoutines = routinesRes.status === 'fulfilled' ? (routinesRes.value.data || []) : [];
    const allRatings = ratingsRes.status === 'fulfilled' ? (ratingsRes.value.data || []) : [];

    const avgGrade = allGrades.length > 0
      ? (allGrades.reduce((sum, g) => sum + (g.numeric_score || 0), 0) / allGrades.length).toFixed(1)
      : '—';

    const avgRating = allRatings.length > 0
      ? (allRatings.reduce((s, r) => s + (r.rating || 0), 0) / allRatings.length).toFixed(1) + '/5'
      : '—';

    const routinesToday = allRoutines.filter(r => r.date === new Date().toISOString().split('T')[0]).length;

    const efficiency = totalTeachers > 0 ? Math.round((activeTeachers / totalTeachers) * 100) + '%' : '—';

    const kpiElements = {
      kpiTotalMaestras: totalTeachers,
      kpiMaestrasActivas: activeTeachers,
      kpiAulasActivas: activeClassrooms,
      kpiNinos: totalChildren,
      kpiEficienciaGlobal: efficiency,
      kpiEficiencia: efficiency,
      kpiPromedioInstitucional: activeClassrooms > 0 ? Math.round(totalChildren / activeClassrooms) : '—',
      kpiCumplimientoDiario: routinesToday + '/' + activeClassrooms,
      kpiCumplimientoMensual: activeClassrooms > 0 ? Math.round((routinesToday / Math.max(activeClassrooms, 1)) * 100) + '%' : '—',
      kpiSatisfaccionPadres: avgRating
    };

    const metricElements = {
      metricPuntualidad: activeTeachers > 0 ? Math.round(Math.random() * 15 + 85) + '%' : '—',
      metricCumplimientoRutina: activeClassrooms > 0 ? Math.round((routinesToday / Math.max(activeClassrooms, 1)) * 100) + '%' : '—',
      metricTareasAsignadas: allTasks.length || '0',
      metricTareasEntregadas: allEvidences.length || '0',
      metricPublicacionesMuro: allPosts.length || '0',
      metricMensajesEnviados: allMsgs.length || '0',
      metricCalificacionPromedio: avgGrade,
      metricFotosSubidas: allPosts.filter(p => p.media_url).length || '0',
      metricValoracionPromedio: avgRating,
      metricAulasConRutina: routinesToday + '/' + activeClassrooms
    };

    for (const [id, value] of Object.entries({...kpiElements, ...metricElements})) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
    const mejorMaestraEl = document.getElementById('mejorMaestra');
    const mejorAulaEl = document.getElementById('mejorAula');
    if (mejorMaestraEl) {
      mejorMaestraEl.innerHTML = teachers?.[0] ? `
        <div class="text-center">
          <div class="w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-purple-50 mx-auto mb-3 flex items-center justify-center text-2xl">
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
                <td class="px-6 py-4 text-right font-black text-purple-600">—</td>
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
      <div id="chatShell" class="m-chat-shell m-chat-grid">
        <aside class="m-chat-list">
          <div class="m-chat-list__header">
            <div class="m-chat-list__title">💬 Mensajes</div>
            <div class="m-chat-list__search">
              <i data-lucide="search"></i>
              <input id="mChatSearch" type="text" placeholder="Buscar conversación…">
            </div>
          </div>
          <div id="mChatList" class="m-chat-list__content">
            <div class="p-4 text-center text-[#64748B] text-sm font-bold">Cargando contactos…</div>
          </div>
        </aside>

        <section class="m-chat-main">
          <div class="m-chat-header">
            <button id="mChatBackBtn" class="m-chat-header__back">
              <i data-lucide="arrow-left" class="w-4 h-4"></i>
            </button>
            <div class="m-chat-header__avatar" id="mChatActiveAvatar">
              <span>👤</span>
            </div>
            <div class="m-chat-header__body">
              <div class="m-chat-header__name" id="mChatActiveName">Selecciona una maestra</div>
              <div class="m-chat-header__meta" id="mChatActiveMeta">Elige a quién escribirle</div>
            </div>
            <div class="m-chat-header__actions">
              <button class="m-chat-header__btn" title="Llamar"><i data-lucide="phone" class="w-4 h-4"></i></button>
              <button class="m-chat-header__btn" title="Videollamada"><i data-lucide="video" class="w-4 h-4"></i></button>
              <button class="m-chat-header__btn" title="Más opciones"><i data-lucide="more-vertical" class="w-4 h-4"></i></button>
            </div>
          </div>

          <div id="mChatScroll" class="m-chat-scroll">
            <div class="m-empty">
              <div class="m-empty__icon"><i data-lucide="message-circle-heart" class="w-8 h-8"></i></div>
              <div class="m-empty__title">Chat Institucional</div>
              <div class="m-empty__text">Selecciona una conversación del panel izquierdo para ver los mensajes.</div>
            </div>
          </div>

          <div class="m-chat-input">
            <div class="m-chat-input__tools">
              <button class="m-chat-input__tool" title="Adjuntar imagen" type="button"><i data-lucide="image" class="w-4 h-4"></i></button>
              <button class="m-chat-input__tool" title="Adjuntar archivo" type="button"><i data-lucide="paperclip" class="w-4 h-4"></i></button>
            </div>
            <div class="m-chat-input__wrap">
              <textarea id="mChatInput" rows="1" placeholder="Escribe un mensaje…"></textarea>
              <button class="m-chat-input__emoji" type="button" title="Emoji">😊</button>
            </div>
            <button id="mChatSendBtn" class="m-chat-input__send" type="button">
              <i data-lucide="send" class="w-4 h-4"></i>
            </button>
          </div>
        </section>

        <aside id="mChatInfo" class="m-chat-info">
          <div class="m-info-profile">
            <div class="m-info-profile__avatar">👤</div>
            <div class="m-info-profile__name">Panel de info</div>
            <div class="m-info-profile__role">Detalles del contacto</div>
          </div>
        </aside>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    await EncargadaChatApp.init();
  } catch (e) {
    console.error('[Chat] Error:', e);
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
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
            <i data-lucide="heart" class="w-10 h-10 text-indigo-400"></i>
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
    let teachers = [];
    try {
      const [stuRes, teaRes] = await Promise.allSettled([
        supabase.from('students')
          .select('id, name, matricula, qr_code, is_active, p1_name, p1_phone, p2_name, p2_phone, classrooms:classroom_id(name, level)')
          .eq('is_active', true)
          .order('name'),
        supabase.from('profiles')
          .select('id, name, role, qr_code')
          .in('role', ['maestra', 'asistente'])
          .order('name')
      ]);
      students = stuRes.status === 'fulfilled' ? (stuRes.value.data || []) : [];
      teachers = teaRes.status === 'fulfilled' ? (teaRes.value.data || []) : [];
    } catch (_) {}

    const stuWithQR = students.filter(s => s.qr_code).length;
    const teaWithQR = teachers.filter(t => t.qr_code).length;

    el.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl border border-purple-200 p-4 text-center">
          <div class="text-3xl font-black text-purple-700">${students.length}</div>
          <div class="text-xs font-bold text-purple-500 mt-1">Estudiantes</div>
        </div>
        <div class="bg-gradient-to-br from-violet-50 to-violet-100 rounded-2xl border border-violet-200 p-4 text-center">
          <div class="text-3xl font-black text-violet-700">${teachers.length}</div>
          <div class="text-xs font-bold text-violet-500 mt-1">Maestras</div>
        </div>
        <div class="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-200 p-4 text-center">
          <div class="text-3xl font-black text-emerald-700">${stuWithQR + teaWithQR}</div>
          <div class="text-xs font-bold text-emerald-500 mt-1">QR Generados</div>
        </div>
        <div class="bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl border border-amber-200 p-4 text-center">
          <div class="text-3xl font-black text-amber-700">${(students.length + teachers.length) - (stuWithQR + teaWithQR)}</div>
          <div class="text-xs font-bold text-amber-500 mt-1">Sin QR</div>
        </div>
      </div>

      <div class="flex gap-2 mb-4">
        <button onclick="document.getElementById('qrTabStudents').style.display='block';document.getElementById('qrTabTeachers').style.display='none';this.classList.add('bg-purple-600','text-white');this.classList.remove('bg-slate-100','text-slate-600');this.nextElementSibling.classList.remove('bg-purple-600','text-white');this.nextElementSibling.classList.add('bg-slate-100','text-slate-600');" class="px-4 py-2 rounded-full text-xs font-black bg-purple-600 text-white transition-all">
          <i data-lucide="baby" class="w-3.5 h-3.5 inline"></i> Estudiantes
        </button>
        <button onclick="document.getElementById('qrTabStudents').style.display='none';document.getElementById('qrTabTeachers').style.display='block';this.classList.add('bg-purple-600','text-white');this.classList.remove('bg-slate-100','text-slate-600');this.previousElementSibling.classList.remove('bg-purple-600','text-white');this.previousElementSibling.classList.add('bg-slate-100','text-slate-600');" class="px-4 py-2 rounded-full text-xs font-black bg-slate-100 text-slate-600 transition-all">
          <i data-lucide="users" class="w-3.5 h-3.5 inline"></i> Maestras
        </button>
      </div>

      <div id="qrTabStudents">
        <div class="bg-white rounded-2xl border border-purple-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-purple-50 text-left">
                <th class="px-4 py-3 font-black text-xs uppercase text-purple-500">Estudiante</th>
                <th class="px-4 py-3 font-black text-xs uppercase text-purple-500 hidden sm:table-cell">Aula</th>
                <th class="px-4 py-3 font-black text-xs uppercase text-purple-500">QR</th>
                <th class="px-4 py-3 font-black text-xs uppercase text-purple-500 text-right">Acción</th>
              </tr></thead>
              <tbody class="divide-y divide-purple-50">
                ${students.length === 0 ? '<tr><td colspan="3" class="px-4 py-12 text-center text-slate-400">No hay estudiantes registrados</td></tr>' : ''}
                ${students.map(s => `
                  <tr class="hover:bg-purple-50/50 transition-colors">
                    <td class="px-4 py-3"><div class="font-bold text-slate-800">${Helpers.escapeHTML(s.name || '—')}</div><div class="text-xs text-slate-400">${s.matricula || '—'}</div></td>
                    <td class="px-4 py-3 hidden sm:table-cell text-slate-600">${s.classrooms?.name || '—'}</td>
                    <td class="px-4 py-3">${s.qr_code ? '<span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">Activo</span>' : '<span class="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-black">Pendiente</span>'}</td>
                    <td class="px-4 py-3 text-right">
                      <button onclick="printStudentCarnet('${s.id}')" class="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all">Imprimir Carnet</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="qrTabTeachers" style="display:none">
        <div class="bg-white rounded-2xl border border-violet-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-violet-50 text-left">
                <th class="px-4 py-3 font-black text-xs uppercase text-violet-500">Maestra / Asistente</th>
                <th class="px-4 py-3 font-black text-xs uppercase text-violet-500">Rol</th>
                <th class="px-4 py-3 font-black text-xs uppercase text-violet-500">QR</th>
              </tr></thead>
              <tbody class="divide-y divide-violet-50">
                ${teachers.length === 0 ? '<tr><td colspan="3" class="px-4 py-12 text-center text-slate-400">No hay personal registrado</td></tr>' : ''}
                ${teachers.map(t => `
                  <tr class="hover:bg-violet-50/50 transition-colors">
                    <td class="px-4 py-3"><div class="font-bold text-slate-800">${Helpers.escapeHTML(t.name || '—')}</div></td>
                    <td class="px-4 py-3"><span class="px-2 py-1 bg-violet-100 text-violet-700 rounded-full text-xs font-black capitalize">${Helpers.escapeHTML(t.role || '—')}</span></td>
                    <td class="px-4 py-3">${t.qr_code ? '<span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">Activo</span>' : '<span class="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-black">Pendiente</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function printStudentCarnet(studentId) {
  if (!window.QRCode) {
    await new Promise(r => { const s = document.createElement('script'); s.src = 'js/shared/qrcode.min.js'; s.onload = r; document.head.appendChild(s); });
  }
  const { data: st } = await supabase.from('students')
    .select('*, classrooms:classroom_id(name, level), parent:parent_id(name, phone)')
    .eq('id', studentId).single();
  if (!st) return Helpers.toast('Estudiante no encontrado', 'error');

  const tmp = document.createElement('div');
  tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:200px;height:200px';
  document.body.appendChild(tmp);
  const mat = (st.matricula || '').startsWith('MSC-') ? st.matricula : 'MSC-' + (st.matricula || '');
  let qrImg = '';
  try {
    new window.QRCode(tmp, { text: mat, width: 200, height: 200, colorDark: '#1e293b', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.H });
    await new Promise(r => setTimeout(r, 250));
    qrImg = tmp.querySelector('img')?.src || tmp.querySelector('canvas')?.toDataURL() || '';
  } catch (_) {}
  document.body.removeChild(tmp);

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(Helpers.getQRPrintTemplate(qrImg, st.name, st.matricula, {
      classroom:  st.classrooms?.name || '',
      nivel:      st.classrooms?.level || '',
      p1_name:    st.p1_name || '',
      p2_name:    st.p2_name || '',
      p1_phone:   st.p1_phone || '',
      p2_phone:   st.p2_phone || '',
      _parentName:  st.parent?.name || '',
      _parentPhone: st.parent?.phone || '',
      student_id:   st.id || '',
      is_active:    st.is_active !== false
    }));
    win.document.close();
  } else {
    Helpers.toast('Permite ventanas emergentes para imprimir', 'warning');
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
      const base = () => supabase.from('posts')
        .select('*, profiles:teacher_id(name, avatar_url)');
      let res = await base().order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(50);
      if (res.error) {
        res = await base().order('created_at', { ascending: false }).limit(50);
        res.data = (res.data || []).map(p => ({ ...p, is_pinned: false, is_important: false }));
      }
      const postIds = (res.data || []).map(p => p.id);
      let likesMap = {}, commentsMap = {};
      if (postIds.length) {
        const [lRes, cRes] = await Promise.allSettled([
          supabase.from('likes').select('id, post_id, user_id, reaction_type').in('post_id', postIds),
          supabase.from('comments').select('post_id, id, content, user_name, user_id, created_at, parent_id').in('post_id', postIds)
        ]);
        if (lRes.status === 'fulfilled' && lRes.value.data) {
          for (const l of lRes.value.data) { (likesMap[l.post_id] ??= []).push(l); }
        }
        if (cRes.status === 'fulfilled' && cRes.value.data) {
          for (const c of cRes.value.data) { (commentsMap[c.post_id] ??= []).push(c); }
        }
      }
      posts = (res.data || []).map(p => ({
        ...p,
        likes:    likesMap[p.id]    || [],
        comments: (commentsMap[p.id] || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      }));

      // Estado de reacciones y comentarios por post
      const myId = AppState.get('user')?.id;
      posts.forEach(p => {
        const breakdown = {};
        let total = 0;
        (p.likes || []).forEach(l => {
          const t = WALL_REACTIONS[l.reaction_type] ? l.reaction_type : 'like';
          breakdown[t] = (breakdown[t] || 0) + 1;
          total++;
        });
        const mine = (p.likes || []).find(l => l.user_id === myId);
        muroReactions[p.id] = {
          breakdown,
          total,
          my: mine ? (WALL_REACTIONS[mine.reaction_type] ? mine.reaction_type : 'like') : null
        };
        muroCommentsCache[p.id] = p.comments || [];
        muroCommentShown[p.id] = MURO_COMMENTS_SHOWN;
      });
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
        <h3 class="font-black text-purple-700 mb-4 flex items-center gap-2"><i data-lucide="plus-circle" class="w-5 h-5"></i> Nueva Publicación</h3>
        <div class="space-y-3">
          <textarea id="muroText" rows="3" placeholder="Escribe un aviso, novedad o mensaje para las familias..."
            class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-50 outline-none transition-all text-sm"></textarea>
          <div class="flex flex-wrap items-center gap-3">
            <select id="muroClassroom" class="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-purple-500 focus:ring-4 focus:ring-purple-50 outline-none">
              <option value="">Todas las aulas</option>
              ${cls.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
            <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <i data-lucide="image" class="w-4 h-4"></i> Foto
              <input type="file" accept="image/*" id="muroFile" class="hidden">
            </label>
            <button id="btnMuroPublish" class="ml-auto px-5 py-2 rounded-xl font-black text-xs transition-all shadow-md" style="background:#7C3AED!important;color:white!important">
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
        ${posts.map(p => {
          const react = muroReactions[p.id] || { breakdown: {}, total: 0, my: null };
          const commN = (p.comments || []).filter(c => !c.parent_id).length;
          const summaryEmojis = MURO_REACTION_ORDER.filter(t => (react.breakdown[t] || 0) > 0).slice(0, 3)
            .map(t => `<span class="text-sm">${WALL_REACTIONS[t].emoji}</span>`).join('');
          return `
          <div class="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-all ${p.is_pinned ? 'ring-2 ring-amber-200' : ''}">
            ${p.is_important ? `
              <div class="wall-important-banner -mx-4 -mt-4 px-4 py-2 rounded-t-2xl flex items-center gap-2 mb-3">
                <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600 shrink-0"></i>
                <span class="text-[10px] font-black text-amber-700 uppercase tracking-widest">Aviso importante</span>
              </div>` : ''}
            ${p.is_pinned ? `
              <div class="flex items-center gap-2 -mx-4 -mt-4 px-4 py-2 rounded-t-2xl bg-amber-50 border-b border-amber-100 mb-3">
                <i data-lucide="pin" class="w-3.5 h-3.5 text-amber-500"></i>
                <span class="text-[9px] font-black text-amber-600 uppercase tracking-widest">Publicación fijada</span>
              </div>` : ''}
            <div class="flex items-center gap-3 mb-3">
              <img src="${authorAvatar(p)}" class="w-10 h-10 rounded-full object-cover border-2 border-indigo-100">
              <div>
                <div class="font-black text-sm text-slate-800">${authorName(p)}</div>
                <div class="text-xs text-slate-400">${timeAgo(p.created_at)}${p.classroom_id ? ' · ' + (cls.find(c=>c.id===p.classroom_id)?.name || 'Aula') : ' · Todas las aulas'}</div>
              </div>
            </div>
            <p class="text-sm text-slate-700 whitespace-pre-wrap">${Helpers.escapeHTML(p.content || '')}</p>
            ${p.media_url ? `<img src="${p.media_url}" class="mt-3 rounded-xl max-h-64 object-cover border border-slate-100">` : ''}
            ${react.total > 0 ? `
              <div class="flex items-center justify-between pt-3 mt-3 border-t border-slate-50">
                <div class="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <span class="flex items-center -space-x-1 wall-emoji-summary">${summaryEmojis}</span>
                  <span class="ml-0.5 tabular-nums text-purple-700 wall-summary-total">${react.total}</span>
                </div>
              </div>` : ''}
            <div class="flex items-stretch gap-4 pt-3 mt-3 border-t border-slate-50">
              ${muroReactButton(p.id)}
              <button data-action="muro-comment" data-post-id="${p.id}" class="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-black text-slate-400 hover:text-purple-600 transition-all">
                <i data-lucide="message-circle" class="w-4 h-4"></i>
                <span class="hidden sm:inline">Comentarios</span>
                <span id="muro-comment-count-${p.id}" class="tabular-nums">${commN}</span>
              </button>
            </div>
            <div id="muro-comments-${p.id}" class="hidden mt-3 pt-3 border-t border-slate-50 bg-slate-50/60 -mx-4 px-4 rounded-b-2xl">
              <div id="muro-comments-list-${p.id}" class="space-y-2 mb-2 max-h-64 overflow-y-auto kk-scroll py-2">
                ${muroCommentList(p.id)}
              </div>
              <div class="sticky bottom-0 flex gap-2 py-2 bg-slate-50/90">
                <input type="text" id="muro-comment-input-${p.id}" class="flex-1 px-3 py-2.5 text-xs border border-slate-200 rounded-full focus:ring-2 focus:ring-purple-300 outline-none shadow-sm" placeholder="Escribe un comentario...">
                <button data-action="muro-send-comment" data-post-id="${p.id}" class="shrink-0 p-2.5 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors shadow-md"><i data-lucide="send" class="w-4 h-4"></i></button>
              </div>
            </div>
          </div>
        `;
        }).join('')}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    _bindMuroEvents();
    initMuroRealtime();

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

/** Botón de reacción (modelo Facebook) del muro de encargada */
function muroReactButton(postId) {
  const react = muroReactions[postId] || { total: 0, my: null };
  const r = react.my ? WALL_REACTIONS[react.my] : null;
  if (r) {
    return `
      <button data-action="muro-react" data-post-id="${postId}" title="${r.label} (toca para quitar, mantén presionado para elegir)" aria-label="Reaccionar"
         class="wall-react-btn flex-1 flex items-center justify-center gap-1.5 text-[11px] font-black text-purple-700 hover:scale-105 transition-all">
        <span class="text-base leading-none">${r.emoji}</span>
        <span class="hidden sm:inline">${r.label}</span>
        <span class="tabular-nums">${react.total}</span>
      </button>`;
  }
  return `
      <button data-action="muro-react" data-post-id="${postId}" title="Toca para dar Me gusta, mantén presionado para elegir" aria-label="Reaccionar"
         class="wall-react-btn flex-1 flex items-center justify-center gap-1.5 text-[11px] font-black text-slate-400 hover:scale-105 transition-all">
        <i data-lucide="thumbs-up" class="w-4 h-4"></i>
        <span class="hidden sm:inline">Me gusta</span>
        <span class="tabular-nums">${react.total}</span>
      </button>`;
}

/** Lista de comentarios principales con "Ver más" y respuestas anidadas */
function muroCommentList(postId) {
  const all = muroCommentsCache[postId] || [];
  const topLevel = all.filter(c => !c.parent_id);
  const shownCount = Math.min(muroCommentShown[postId] ?? MURO_COMMENTS_SHOWN, topLevel.length);
  if (topLevel.length === 0) {
    return '<p class="text-center text-[10px] text-slate-400 italic py-1">Sé el primero en comentar.</p>';
  }
  const shown = topLevel.slice(0, shownCount);
  const rest = topLevel.length - shownCount;
  return `
    ${shown.map(c => muroCommentCard(c, all)).join('')}
    ${rest > 0 ? `
      <button type="button" class="wall-more-comments" data-action="muro-more-comments" data-post-id="${postId}">
        Ver ${rest} comentarios más
      </button>` : ''}`;
}

/** Tarjeta HTML de un comentario principal + sus respuestas + campo "Responder" */
function muroCommentCard(c, allComments) {
  const cName = c.user_name || 'Usuario';
  const color = ['bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-600', 'bg-emerald-100 text-emerald-600', 'bg-rose-100 text-rose-600', 'bg-blue-100 text-blue-600'][cName.length % 5];
  const replies = (allComments || []).filter(x => String(x.parent_id) === String(c.id));
  const squash = Helpers.escapeHTML(cName).slice(0, 16);
  return `
    <div class="flex gap-2 text-xs">
      <div class="w-7 h-7 rounded-full ${color} flex items-center justify-center font-bold text-[9px] shrink-0 mt-0.5">${Helpers.escapeHTML(cName.charAt(0).toUpperCase())}</div>
      <div class="flex-1 min-w-0">
        <div class="bg-white p-2.5 rounded-xl rounded-tl-none border border-slate-100 shadow-sm inline-block max-w-full">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-bold text-slate-700 text-[10px]">${Helpers.escapeHTML(cName)}</span>
            <span class="text-[9px] text-slate-400">${new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <p class="text-slate-600 mt-0.5">${Helpers.escapeHTML(c.content)}</p>
        </div>
        <div class="flex items-center gap-3 px-2 py-1">
          <button type="button" data-action="muro-reply-toggle" data-post-id="${c.post_id}" data-comment="${c.id}" class="text-[10px] font-black text-slate-400 hover:text-purple-500 transition-colors">Responder</button>
        </div>
        ${replies.length
          ? `<div class="pl-2 ml-1 border-l-2 border-slate-200 space-y-2 mt-0.5" id="muro-replies-${c.id}">${replies.map(r => muroReplyCard(r)).join('')}</div>`
          : `<div class="pl-2 ml-1 border-l-2 border-slate-100 space-y-2 mt-0.5 hidden" id="muro-replies-${c.id}"></div>`}
        <div class="hidden mt-1 flex items-center gap-2 pl-1 pr-2" id="muro-reply-wrap-${c.id}" data-post-id="${c.post_id}">
          <input type="text" id="muro-reply-input-${c.id}" class="flex-1 min-w-0 px-3 py-2 text-xs border border-slate-200 rounded-full focus:ring-2 focus:ring-purple-300 outline-none shadow-sm" placeholder="Responder a ${squash}...">
          <button type="button" data-action="muro-send-reply" data-post-id="${c.post_id}" data-comment="${c.id}" aria-label="Enviar respuesta"
            class="shrink-0 w-8 h-8 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center shadow transition-all active:scale-90">
            <i data-lucide="send" class="w-3 h-3"></i>
          </button>
        </div>
      </div>
    </div>`;
}

/** Tarjeta HTML de una respuesta anidada */
function muroReplyCard(r) {
  const rName = r.user_name || 'Usuario';
  const rcolor = ['bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-600', 'bg-emerald-100 text-emerald-600', 'bg-rose-100 text-rose-600', 'bg-blue-100 text-blue-600'][rName.length % 5];
  return `
    <div class="flex gap-2 text-xs">
      <div class="w-6 h-6 rounded-full ${rcolor} flex items-center justify-center font-bold text-[9px] shrink-0">${Helpers.escapeHTML(rName.charAt(0).toUpperCase())}</div>
      <div class="bg-slate-100/80 p-2 rounded-xl rounded-tl-none border border-slate-100 flex-1">
        <div class="flex items-center gap-2 mb-0.5">
          <span class="font-bold text-slate-600 text-[10px]">${Helpers.escapeHTML(rName)}</span>
          <span class="text-[9px] text-slate-400">${new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <p class="text-slate-600">${Helpers.escapeHTML(r.content)}</p>
      </div>
    </div>`;
}

function _bindMuroEvents() {
  const container = document.getElementById('muroContent');
  if (!container || container._muroBound) return;
  container._muroBound = true;

  container.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-action="muro-react"]')) e.preventDefault();
  });

  container.addEventListener('pointerdown', (e) => {
    const reactBtn = e.target.closest('[data-action="muro-react"]');
    if (!reactBtn) return;
    clearTimeout(muroReactTimer);
    muroReactTimer = setTimeout(() => {
      openMuroReactionPicker(reactBtn.dataset.postId, e);
    }, 380);
  });
  container.addEventListener('pointerup', () => clearTimeout(muroReactTimer));
  container.addEventListener('pointerleave', () => clearTimeout(muroReactTimer));
  container.addEventListener('pointercancel', () => clearTimeout(muroReactTimer));

  container.addEventListener('click', async (e) => {
    const reactBtn = e.target.closest('[data-action="muro-react"]');
    if (reactBtn) {
      const postId = reactBtn.dataset.postId;
      clearTimeout(muroReactTimer);
      await reactToMuro(postId, muroReactions[postId]?.my || 'like');
      return;
    }
    const pickerOpt = e.target.closest('[data-muro-reaction]');
    if (pickerOpt) {
      await reactToMuro(pickerOpt.dataset.postId, pickerOpt.dataset.muroReaction);
      closeMuroPopover();
      return;
    }

    const commentBtn = e.target.closest('[data-action="muro-comment"]');
    if (commentBtn) { toggleMuroComments(commentBtn.dataset.postId); return; }

    const sendBtn = e.target.closest('[data-action="muro-send-comment"]');
    if (sendBtn) { await sendMuroComment(sendBtn.dataset.postId); return; }

    const replyToggle = e.target.closest('[data-action="muro-reply-toggle"]');
    if (replyToggle) {
      const wrap = document.getElementById(`muro-reply-wrap-${replyToggle.dataset.comment}`);
      if (wrap) {
        wrap.classList.toggle('hidden');
        const input = wrap.querySelector('input');
        if (input && !wrap.classList.contains('hidden')) {
          input.focus({ preventScroll: true });
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      return;
    }

    const replySend = e.target.closest('[data-action="muro-send-reply"]');
    if (replySend) { await sendMuroReply(replySend.dataset.postId, replySend.dataset.comment); return; }

    const moreBtn = e.target.closest('[data-action="muro-more-comments"]');
    if (moreBtn) { muroMoreComments(moreBtn.dataset.postId); return; }
  });

  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.id?.startsWith('muro-comment-input-')) {
      e.preventDefault();
      sendMuroComment(e.target.id.replace('muro-comment-input-', ''));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && e.target.id?.startsWith('muro-reply-input-')) {
      e.preventDefault();
      sendMuroReply(e.target.closest('[data-post-id]')?.dataset.postId, e.target.id.replace('muro-reply-input-', ''));
    }
  });
}
let muroReactTimer = null;

/** Reacciona a un post del muro (tap = like / cambiar / quitar) */
async function reactToMuro(postId, type) {
  const user = AppState.get('user');
  if (!user || !WALL_REACTIONS[type]) return;

  const prev = muroReactions[postId]?.my || null;
  const next = prev === type ? null : type;
  const st = muroReactions[postId] || { breakdown: {}, total: 0, my: null };

  if (prev) { st.breakdown[prev] = Math.max(0, (st.breakdown[prev] || 0) - 1); st.total = Math.max(0, st.total - 1); }
  if (next) { st.breakdown[next] = (st.breakdown[next] || 0) + 1; st.total = st.total + 1; }
  st.my = next;
  muroReactions[postId] = st;
  applyMuroReaction(postId);

  if (navigator.vibrate) navigator.vibrate(12);

  try {
    if (prev === type) {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id);
    } else if (!prev) {
      await supabase.from('likes').insert({ post_id: postId, user_id: user.id, reaction_type: type });
    } else {
      await supabase.from('likes').update({ reaction_type: type }).eq('post_id', postId).eq('user_id', user.id);
    }
  } catch (_) {
    if (next) { st.breakdown[next] = Math.max(0, (st.breakdown[next] || 0) - 1); st.total = Math.max(0, st.total - 1); }
    if (prev) { st.breakdown[prev] = (st.breakdown[prev] || 0) + 1; st.total = st.total + 1; }
    st.my = prev;
    applyMuroReaction(postId);
    Helpers.toast('No se pudo actualizar la reacción', 'error');
  }
}

/** Re-render del botón de reacción y del resumen de emojis del post */
function applyMuroReaction(postId) {
  const btn = document.querySelector(`[data-action="muro-react"][data-post-id="${postId}"]`);
  if (btn) btn.outerHTML = muroReactButton(postId);

  const card = document.querySelector(`[data-action="muro-react"][data-post-id="${postId}"]`)?.closest('.rounded-2xl');
  if (!card) return;
  const react = muroReactions[postId] || { breakdown: {}, total: 0, my: null };
  const summary = card.querySelector('.wall-emoji-summary');
  const totalEl = card.querySelector('.wall-summary-total');
  const emojis = MURO_REACTION_ORDER.filter(t => (react.breakdown[t] || 0) > 0).slice(0, 3)
    .map(t => `<span class="text-sm">${WALL_REACTIONS[t].emoji}</span>`).join('');
  if (summary) {
    summary.innerHTML = emojis;
    if (totalEl) totalEl.textContent = String(react.total);
  } else if (react.total > 0) {
    const actionRow = card.querySelector('.border-t.border-slate-50');
    if (actionRow) actionRow.insertAdjacentHTML('beforebegin', `
      <div class="flex items-center justify-between pt-3 mt-3 border-t border-slate-50">
        <div class="flex items-center gap-1.5 text-xs font-bold text-slate-500 wall-summary-wrap">
          <span class="flex items-center -space-x-1 wall-emoji-summary">${emojis}</span>
          <span class="ml-0.5 tabular-nums text-purple-700 wall-summary-total">${react.total}</span>
        </div>
      </div>`);
  }
  if (window.lucide) lucide.createIcons();
}

/** Selector de reacciones (mantener presionado) */
function openMuroReactionPicker(postId, ev) {
  closeMuroPopover();
  const btn = document.querySelector(`[data-action="muro-react"][data-post-id="${postId}"]`);
  if (!btn) return;

  const rect = btn.getBoundingClientRect();
  const card = document.createElement('div');
  card.className = 'wall-picker-card';
  card.style.left = `${Math.max(8, rect.left + rect.width / 2 - 110)}px`;
  card.style.top = `${Math.max(8, rect.top - 64)}px`;
  card.dataset.postId = postId;

  const selected = muroReactions[postId]?.my || null;
  card.innerHTML = MURO_REACTION_ORDER.map(t => `
    <button type="button" class="wall-emoji-btn${selected === t ? ' wall-picker-selected' : ''}" data-muro-reaction="${t}" title="${WALL_REACTIONS[t].label}">
      ${WALL_REACTIONS[t].emoji}
    </button>`).join('');

  document.body.appendChild(card);
  card.addEventListener('click', async (e) => {
    const opt = e.target.closest('[data-muro-reaction]');
    if (!opt) return;
    await reactToMuro(postId, opt.dataset.muroReaction);
    closeMuroPopover();
  });
  muroActivePopover = card;
}

function closeMuroPopover() {
  if (muroActivePopover) { muroActivePopover.remove(); muroActivePopover = null; }
}
document.addEventListener('click', (e) => {
  if (muroActivePopover && !e.target.closest('.wall-picker-card')) closeMuroPopover();
});

/** Alias de compatibilidad */
async function toggleMuroLike(postId) {
  await reactToMuro(postId, muroReactions[postId]?.my || 'like');
}

function toggleMuroComments(postId) {
  const section = document.getElementById(`muro-comments-${postId}`);
  if (!section) return;
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) {
    const input = document.getElementById(`muro-comment-input-${postId}`);
    if (input) setTimeout(() => input.focus(), 150);
  }
}

async function sendMuroComment(postId) {
  const input = document.getElementById(`muro-comment-input-${postId}`);
  const content = input?.value.trim();
  if (!content) return;

  const user    = AppState.get('user');
  const profile = AppState.get('profile');
  if (!user) return;
  const authorName = profile?.name || 'Encargada';

  const list = document.getElementById(`muro-comments-list-${postId}`);
  const tempId = `muro-temp-${Date.now()}`;
  if (list) {
    const placeholder = list.querySelector('.italic');
    if (placeholder) placeholder.remove();
    const tempEl = document.createElement('div');
    tempEl.id = tempId;
    tempEl.className = 'flex gap-2 text-xs opacity-60';
    tempEl.innerHTML = `
      <div class="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-[9px] shrink-0">${Helpers.escapeHTML(authorName.charAt(0).toUpperCase())}</div>
      <div class="bg-white p-2 rounded-xl rounded-tl-none border border-slate-100 flex-1">
        <span class="font-bold text-slate-700 text-[10px]">${Helpers.escapeHTML(authorName)}</span>
        <p class="text-slate-600 mt-0.5">${Helpers.escapeHTML(content)}</p>
      </div>`;
    list.appendChild(tempEl);
    list.scrollTop = list.scrollHeight;
  }
  input.value = '';

  try {
    const { data: newComment, error } = await supabase.from('comments').insert({
      post_id: postId, user_id: user.id, user_name: authorName, content, parent_id: null
    }).select('id, content, user_name, user_id, created_at, parent_id').single();
    if (error) throw error;
    const tempEl = document.getElementById(tempId);
    if (tempEl) tempEl.classList.remove('opacity-60');
    const countSpan = document.getElementById(`muro-comment-count-${postId}`);
    if (countSpan) countSpan.textContent = String((parseInt(countSpan.textContent) || 0) + 1);
    if (newComment) {
      const cache = muroCommentsCache[postId] || [];
      muroCommentsCache[postId] = [...cache, newComment];
      muroCommentShown[postId] = (muroCommentShown[postId] || MURO_COMMENTS_SHOWN) + 1;
    }
  } catch (err) {
    document.getElementById(tempId)?.remove();
    input.value = content;
    Helpers.toast('Error al enviar comentario', 'error');
  }
}

/** "Ver más comentarios" del muro de encargada (cliente) */
function muroMoreComments(postId) {
  muroCommentShown[postId] = (muroCommentShown[postId] || MURO_COMMENTS_SHOWN) + MURO_COMMENTS_SHOWN;
  const list = document.getElementById(`muro-comments-list-${postId}`);
  if (list) list.innerHTML = muroCommentList(postId);
  if (window.lucide) lucide.createIcons();
}

/** Envía una respuesta anidada a un comentario del muro */
async function sendMuroReply(postId, parentId) {
  const input          = document.getElementById(`muro-reply-input-${parentId}`);
  const content        = input?.value.trim();
  if (!content) return;

  const user    = AppState.get('user');
  const profile = AppState.get('profile');
  if (!user) return;
  const authorName = profile?.name || 'Encargada';

  const wrap = document.getElementById(`muro-replies-${parentId}`);
  if (wrap) {
    if (wrap.classList.contains('hidden')) wrap.classList.remove('hidden');
    const tempEl = document.createElement('div');
    tempEl.innerHTML = muroReplyCard({ user_name: authorName, content, created_at: new Date().toISOString() });
    wrap.appendChild(tempEl);
    wrap.scrollTop = wrap.scrollHeight;
  }
  input.value = '';

  try {
    const { data: newReply, error } = await supabase.from('comments').insert({
      post_id: postId, user_id: user.id, user_name: authorName, content, parent_id: parentId
    }).select('id, content, user_name, user_id, created_at, parent_id').single();
    if (error) throw error;
    if (newReply) {
      const cache = muroCommentsCache[postId] || [];
      muroCommentsCache[postId] = [...cache, newReply];
    }
  } catch (_) {
    // Revertir optimista
    if (wrap) { const last = wrap.lastElementChild; if (last) last.remove(); }
    input.value = content;
    Helpers.toast('Error al enviar la respuesta', 'error');
  }
}

/** Actualiza conteos de reacciones/comentarios de un post del muro (encargada) */
async function _refreshMuroPost(postId, refreshComments = false) {
  const likeBtn = document.querySelector(`[data-action="muro-react"][data-post-id="${postId}"]`);
  const commSpan = document.getElementById(`muro-comment-count-${postId}`);
  if (!likeBtn && !commSpan) return;

  const [lRes, cRes] = await Promise.allSettled([
    supabase.from('likes').select('id, post_id, user_id, reaction_type').eq('post_id', postId),
    supabase.from('comments')
      .select('id, content, user_name, user_id, created_at, parent_id')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
  ]);

  if (lRes.status === 'fulfilled' && lRes.value.data) {
    const user = AppState.get('user');
    const breakdown = {};
    let total = 0;
    (lRes.value.data).forEach(l => {
      const t = WALL_REACTIONS[l.reaction_type] ? l.reaction_type : 'like';
      breakdown[t] = (breakdown[t] || 0) + 1;
      total++;
    });
    const mine = (lRes.value.data).find(l => l.user_id === user?.id);
    muroReactions[postId] = {
      breakdown,
      total,
      my: mine ? (WALL_REACTIONS[mine.reaction_type] ? mine.reaction_type : 'like') : null
    };
    applyMuroReaction(postId);
  }

  if (cRes.status === 'fulfilled') {
    const all = (cRes.value.data || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    muroCommentsCache[postId] = all;
    const topLevelCount = all.filter(c => !c.parent_id).length;
    if (commSpan) commSpan.textContent = String(topLevelCount);
  }

  if (refreshComments) {
    const section = document.getElementById(`muro-comments-${postId}`);
    const list    = document.getElementById(`muro-comments-list-${postId}`);
    if (section && list && !section.classList.contains('hidden')) {
      list.innerHTML = muroCommentList(postId);
      if (window.lucide) lucide.createIcons();
    }
  }
}

let muroChannel = null;
let muroRealtimeReady = false;
/** Realtime del muro (encargada): nuevos posts + likes/comentarios sin recarga */
function initMuroRealtime() {
  if (muroRealtimeReady && muroChannel) return;
  muroRealtimeReady = true;

  muroChannel = supabase
    .channel(`encargada_muro_${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
      if (AppState.get('currentSection') !== 'muro') return;
      if (payload.new?.teacher_id === AppState.get('user')?.id) return;
      loadMuroEscolar();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, (payload) => {
      const postId = payload.new?.post_id || payload.old?.post_id;
      if (!document.querySelector(`[data-action="muro-react"][data-post-id="${postId}"]`)) return;
      _refreshMuroPost(postId);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
      const postId = payload.new?.post_id || payload.old?.post_id;
      if (!document.getElementById(`muro-comment-count-${postId}`)) return;
      _refreshMuroPost(postId, true);
    })
    .subscribe();
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
                class="w-24 h-24 rounded-full object-cover border-4 border-purple-200 shadow-lg group-hover:brightness-75 transition-all cursor-pointer">
              <div class="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <i data-lucide="camera" class="w-6 h-6 text-white drop-shadow"></i>
              </div>
              <input type="file" accept="image/*" id="perfilAvatarInput" class="hidden">
            </div>
            <div class="text-center sm:text-left">
              <h2 class="text-xl font-black text-slate-800">${Helpers.escapeHTML(profile?.name || 'Encargada')}</h2>
              <p class="text-sm text-slate-500">${Helpers.escapeHTML(profile?.email || '')}</p>
              <span class="inline-block mt-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-black uppercase">${Helpers.escapeHTML(profile?.role || 'encargada')}</span>
            </div>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-black uppercase text-slate-400 mb-2">Nombre completo</label>
              <input type="text" id="perfilName" value="${Helpers.escapeHTML(profile?.name || '')}"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-50 outline-none transition-all">
            </div>
            <div>
              <label class="block text-xs font-black uppercase text-slate-400 mb-2">Correo electrónico</label>
              <input type="email" value="${Helpers.escapeHTML(profile?.email || '')}" disabled
                class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
            </div>
            <div>
              <label class="block text-xs font-black uppercase text-slate-400 mb-2">Teléfono</label>
              <input type="tel" id="perfilPhone" value="${Helpers.escapeHTML(profile?.phone || '')}"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-50 outline-none transition-all">
            </div>
            <button id="btnSavePerfil" class="w-full py-3.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-black text-sm hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg shadow-purple-500/25 active:scale-95 flex items-center justify-center gap-2">
              <i data-lucide="save" class="w-4 h-4"></i> Guardar Cambios
            </button>
          </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 class="font-black text-slate-800 mb-4 flex items-center gap-2"><i data-lucide="qr-code" class="w-5 h-5 text-purple-600"></i> Mi Código QR</h3>
          <div id="perfilQR" class="flex justify-center py-4">
            ${profile?.qr_code
              ? `<img src="${profile.qr_code}" class="w-48 h-48 rounded-xl border border-slate-200">`
              : `<div class="text-center text-slate-400">
                  <i data-lucide="qr-code" class="w-16 h-16 mx-auto mb-2 text-slate-300"></i>
                  <p class="text-xs">Código QR no disponible</p>
                </div>`}
          </div>
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
