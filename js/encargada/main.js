import { ensureRole, supabase, initOneSignal } from '../shared/supabase.js';
import { AppState } from './state.js';
import { Helpers } from '../shared/helpers.js';
import { UIPremium } from '../shared/ui-premium.js';
import { BadgeSystem } from '../shared/badges.js';
import { RealtimeManager } from '../shared/realtime-manager.js';
import { QueryCache } from '../shared/query-cache.js';

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

window.openGlobalModal = function(html, wide = false) {
  const container = document.getElementById('globalModalContainer');
  if (!container) return;
  const maxW = wide ? 'max-w-4xl' : 'max-w-2xl';
  container.innerHTML = `
    <div id="globalModalInner" class="bg-white rounded-3xl shadow-2xl w-full ${maxW} max-h-[92vh] overflow-y-auto mx-3 my-4 relative animate-scaleIn">
      <button onclick="App.ui.closeModal()" class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all z-[110]">
        <i data-lucide="x" class="w-6 h-6"></i>
      </button>
      ${html}
    </div>`;
  container.style.cssText = 'display:flex;align-items:flex-start;justify-content:center;padding-top:4vh;position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:var(--z-modal,100);overflow-y:auto;';
  if (window.lucide) lucide.createIcons();
};

window.App.ui = {
  closeModal: () => {
    const container = document.getElementById('globalModalContainer');
    if (container) container.innerHTML = '';
    container.style.display = 'none';
  }
};

export function goToSection(sectionId) {
  if (!sectionId) return;
  Helpers.vibrate?.('light');
  RealtimeManager.unsubscribeAll(['notifications']);
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
      case 'padres-opinion':
        loadParentReviews();
        break;
      case 'permisos':
        loadPermits();
        break;
      case 'accesos-qr':
        loadQRAccess();
        break;
      case 'chat':
        loadChat();
        break;
      case 'reportes-cumplimiento':
        loadComplianceReports();
        break;
      case 'control-rutinas':
        loadRoutineControl();
        break;
      case 'reportes-tareas':
        loadTaskReports();
        break;
      case 'comparativo-aulas':
        loadClassroomComparison();
        break;
      case 'alertas':
        loadAlerts();
        break;
      case 'centro-estadisticas':
        loadStatisticsCenter();
        break;
      case 'configuracion':
        loadConfig();
        break;
    }
  }
  const _parentSection = {
    'eficiencia': 'maestras',
    'ranking': 'maestras',
    'reportes-cumplimiento': 'reportes',
    'control-rutinas': 'reportes',
    'reportes-tareas': 'reportes',
    'comparativo-aulas': 'reportes'
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
      supabase.from('profiles').select('*').eq('role', 'teacher'),
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
  const el = document.getElementById('eficienciaContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  try {
    const { data: teachers } = await supabase.from('profiles').select('*').eq('role', 'teacher');
    el.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${(teachers || []).map(t => `
          <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-14 h-14 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center text-xl font-bold text-blue-600">
                ${(t.name || 'M')[0].toUpperCase()}
              </div>
              <div>
                <h3 class="font-bold text-slate-800">${t.name || 'Maestra'}</h3>
                <p class="text-xs text-slate-400">${t.classroom?.name || 'Sin aula'}</p>
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex justify-between items-center text-sm">
                <span class="text-slate-500 font-medium">Eficiencia</span>
                <span class="font-bold text-blue-600">92%</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-2">
                <div class="bg-blue-500 h-2 rounded-full" style="width: 92%"></div>
              </div>
              <div class="grid grid-cols-3 gap-2 text-xs">
                <div class="text-center p-2 bg-slate-50 rounded-xl">
                  <p class="text-slate-400">Puntualidad</p>
                  <p class="font-bold text-slate-700">98%</p>
                </div>
                <div class="text-center p-2 bg-slate-50 rounded-xl">
                  <p class="text-slate-400">Rutinas</p>
                  <p class="font-bold text-slate-700">95%</p>
                </div>
                <div class="text-center p-2 bg-slate-50 rounded-xl">
                  <p class="text-slate-400">Comunicación</p>
                  <p class="font-bold text-slate-700">88%</p>
                </div>
              </div>
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

async function loadRanking() {
  const el = document.getElementById('rankingContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  try {
    const { data: teachers } = await supabase.from('profiles').select('*').eq('role', 'teacher');
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

async function loadParentReviews() {
  const el = document.getElementById('opinionesContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  try {
    const { data: ratings, error } = await supabase
      .from('parent_ratings')
      .select('*, profiles!parent_ratings_parent_id_fkey(name), profiles!parent_ratings_teacher_id_fkey(name)');
    
    if (error) throw error;

    const totalRatings = ratings?.length || 0;
    const avgStars = totalRatings > 0 ? ratings.reduce((acc, r) => acc + (r.stars || 0), 0) / totalRatings : 0;
    
    el.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-100 to-pink-50 flex items-center justify-center">
              <i data-lucide="star" class="text-pink-500"></i>
            </div>
            <div>
              <p class="text-xs font-black uppercase text-slate-400 mb-1">Total Valoraciones</p>
              <p class="text-2xl font-black text-slate-800">${totalRatings}</p>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-100 to-yellow-50 flex items-center justify-center">
              <i data-lucide="award" class="text-yellow-500"></i>
            </div>
            <div>
              <p class="text-xs font-black uppercase text-slate-400 mb-1">Promedio</p>
              <p class="text-2xl font-black text-slate-800">${avgStars.toFixed(1)}★</p>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center">
              <i data-lucide="smile" class="text-green-500"></i>
            </div>
            <div>
              <p class="text-xs font-black uppercase text-slate-400 mb-1">Satisfacción</p>
              <p class="text-2xl font-black text-slate-800">${totalRatings > 0 ? Math.round(avgStars / 5 * 100) : 0}%</p>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
        <h3 class="text-lg font-bold text-slate-800 mb-4">Valoraciones Recientes</h3>
        ${totalRatings > 0 ? `
          <div class="space-y-4">
            ${ratings.slice(0, 10).map(r => `
              <div class="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">
                      ${(r['profiles!parent_ratings_parent_id_fkey']?.name || 'P')[0].toUpperCase()}
                    </div>
                    <div>
                      <p class="font-bold text-slate-800">
                        ${r['profiles!parent_ratings_parent_id_fkey']?.name || 'Padre'}
                      </p>
                      <p class="text-xs text-slate-400">
                        Para: ${r['profiles!parent_ratings_teacher_id_fkey']?.name || 'Maestra'}
                      </p>
                    </div>
                  </div>
                  <div class="text-yellow-500 font-black">
                    ${'★'.repeat(r.stars || 0)}${'☆'.repeat(5 - (r.stars || 0))}
                  </div>
                </div>
                ${r.comment ? `<p class="text-sm text-slate-600 mt-2">${Helpers.escapeHTML(r.comment)}</p>` : ''}
                ${r.recommendations ? `<p class="text-xs text-slate-400 mt-1"><i data-lucide="lightbulb" class="w-3 h-3 inline mr-1"></i>${Helpers.escapeHTML(r.recommendations)}</p>` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="text-center py-10">
            <div class="w-16 h-16 rounded-full bg-slate-100 mx-auto mb-4 flex items-center justify-center">
              <i data-lucide="message-square-heart" class="w-8 h-8 text-slate-300"></i>
            </div>
            <p class="text-slate-400">No hay valoraciones aún</p>
          </div>
        `}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('[ParentReviews] Error:', e);
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

async function loadQRAccess() {
  const el = document.getElementById('qrContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  
  try {
    // Load teachers and students
    const [teachersRes, studentsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'maestra'),
      supabase.from('students').select('*, classrooms(name)')
    ]);
    
    const teachers = teachersRes.data || [];
    const students = studentsRes.data || [];
    
    el.innerHTML = `
      <div class="space-y-6">
        <div class="flex gap-4 mb-6">
          <button id="qrTabTeachers" class="px-6 py-3 rounded-xl font-black text-sm bg-blue-600 text-white shadow-lg">
            <i data-lucide="users" class="w-4 h-4 inline mr-2"></i>Maestras
          </button>
          <button id="qrTabStudents" class="px-6 py-3 rounded-xl font-black text-sm bg-slate-100 text-slate-600">
            <i data-lucide="user-round" class="w-4 h-4 inline mr-2"></i>Niños
          </button>
        </div>
        
        <div id="qrTeachersSection">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${teachers.map(t => `
              <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all">
                <div class="flex items-center gap-4 mb-4">
                  <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center text-2xl font-bold text-blue-600">
                    ${(t.name || 'M').charAt(0).toUpperCase()}
                  </div>
                  <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(t.name || 'Maestra')}</h4>
                    <p class="text-sm text-slate-400">${t.role || 'maestra'}</p>
                  </div>
                </div>
                <div class="flex justify-center mb-4 bg-slate-50 rounded-xl p-4">
                  <div class="w-40 h-40 bg-white border border-slate-200 rounded-xl flex items-center justify-center">
                    <span class="text-slate-400 text-sm">QR Code</span>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button class="flex-1 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-100 transition-all">
                    <i data-lucide="download" class="w-4 h-4 inline mr-1"></i>Descargar
                  </button>
                  <button class="flex-1 px-4 py-2 bg-slate-50 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all">
                    <i data-lucide="printer" class="w-4 h-4 inline mr-1"></i>Imprimir
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div id="qrStudentsSection" class="hidden">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${students.map(s => `
              <div class="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all">
                <div class="flex items-center gap-4 mb-4">
                  <div class="w-16 h-16 rounded-full bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center text-2xl font-bold text-green-600">
                    ${(s.name || 'N').charAt(0).toUpperCase()}
                  </div>
                  <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-slate-800 truncate">${Helpers.escapeHTML(s.name || 'Niño')}</h4>
                    <p class="text-sm text-slate-400">${s.classrooms?.name || 'Sin aula'}</p>
                  </div>
                </div>
                <div class="flex justify-center mb-4 bg-slate-50 rounded-xl p-4">
                  <div class="w-40 h-40 bg-white border border-slate-200 rounded-xl flex items-center justify-center">
                    <span class="text-slate-400 text-sm">QR Code</span>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button class="flex-1 px-4 py-2 bg-green-50 text-green-600 rounded-xl font-bold text-sm hover:bg-green-100 transition-all">
                    <i data-lucide="download" class="w-4 h-4 inline mr-1"></i>Descargar
                  </button>
                  <button class="flex-1 px-4 py-2 bg-slate-50 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all">
                    <i data-lucide="printer" class="w-4 h-4 inline mr-1"></i>Imprimir
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    if (window.lucide) lucide.createIcons();
    
    // Tab switching
    document.getElementById('qrTabTeachers')?.addEventListener('click', () => {
      document.getElementById('qrTeachersSection')?.classList.remove('hidden');
      document.getElementById('qrStudentsSection')?.classList.add('hidden');
      document.getElementById('qrTabTeachers')?.classList.add('bg-blue-600', 'text-white', 'shadow-lg');
      document.getElementById('qrTabTeachers')?.classList.remove('bg-slate-100', 'text-slate-600');
      document.getElementById('qrTabStudents')?.classList.remove('bg-blue-600', 'text-white', 'shadow-lg');
      document.getElementById('qrTabStudents')?.classList.add('bg-slate-100', 'text-slate-600');
    });
    
    document.getElementById('qrTabStudents')?.addEventListener('click', () => {
      document.getElementById('qrStudentsSection')?.classList.remove('hidden');
      document.getElementById('qrTeachersSection')?.classList.add('hidden');
      document.getElementById('qrTabStudents')?.classList.add('bg-blue-600', 'text-white', 'shadow-lg');
      document.getElementById('qrTabStudents')?.classList.remove('bg-slate-100', 'text-slate-600');
      document.getElementById('qrTabTeachers')?.classList.remove('bg-blue-600', 'text-white', 'shadow-lg');
      document.getElementById('qrTabTeachers')?.classList.add('bg-slate-100', 'text-slate-600');
    });
  } catch (e) {
    console.error('[QR] Error:', e);
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

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
        .or(`sender_id.eq.${_chatState.currentUserId},receiver_id.eq.${_chatState.currentUserId}`)
        .or(`sender_id.eq.${_chatState.activeContactId},receiver_id.eq.${_chatState.activeContactId}`)
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

async function loadComplianceReports() {
  const el = document.getElementById('cumplimientoContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  
  try {
    el.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
                <i data-lucide="calendar-check" class="w-6 h-6 text-blue-600"></i>
              </div>
              <div>
                <p class="text-xs font-black uppercase text-slate-400 mb-1">Diario</p>
                <p class="text-2xl font-black text-slate-800">95%</p>
              </div>
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center">
                <i data-lucide="calendar" class="w-6 h-6 text-green-600"></i>
              </div>
              <div>
                <p class="text-xs font-black uppercase text-slate-400 mb-1">Semanal</p>
                <p class="text-2xl font-black text-slate-800">92%</p>
              </div>
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center">
                <i data-lucide="calendar-days" class="w-6 h-6 text-amber-600"></i>
              </div>
              <div>
                <p class="text-xs font-black uppercase text-slate-400 mb-1">Mensual</p>
                <p class="text-2xl font-black text-slate-800">88%</p>
              </div>
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center">
                <i data-lucide="trending-up" class="w-6 h-6 text-purple-600"></i>
              </div>
              <div>
                <p class="text-xs font-black uppercase text-slate-400 mb-1">Anual</p>
                <p class="text-2xl font-black text-slate-800">90%</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <h3 class="text-lg font-bold text-slate-800 mb-4">Gráfico de Cumplimiento</h3>
            <div class="h-64 bg-slate-50 rounded-xl flex items-center justify-center">
              <span class="text-slate-400">Gráfico (Chart.js)</span>
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <h3 class="text-lg font-bold text-slate-800 mb-4">Detalle por Maestra</h3>
            <div class="space-y-3">
              ${[1,2,3,4].map(i => `
                <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-sm">M${i}</div>
                    <span class="font-bold text-slate-800">Maestra ${i}</span>
                  </div>
                  <span class="font-black text-blue-600">${90 + i}%</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadRoutineControl() {
  const el = document.getElementById('rutinasContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  
  try {
    el.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <p class="text-xs font-black uppercase text-slate-400 mb-2">Primer Reporte</p>
            <p class="text-2xl font-black text-slate-800">08:00 AM</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <p class="text-xs font-black uppercase text-slate-400 mb-2">Último Reporte</p>
            <p class="text-2xl font-black text-slate-800">04:30 PM</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <p class="text-xs font-black uppercase text-slate-400 mb-2">Rutinas Completas</p>
            <p class="text-2xl font-black text-slate-800">24/24</p>
          </div>
        </div>
        
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Control de Rutinas</h3>
          <div class="space-y-4">
            ${['Llegada', 'Desayuno', 'Actividad 1', 'Almuerzo', 'Siesta', 'Actividad 2', 'Merienda', 'Salida'].map((r, i) => `
              <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <i data-lucide="check" class="w-5 h-5 text-green-600"></i>
                  </div>
                  <div>
                    <p class="font-bold text-slate-800">${r}</p>
                    <p class="text-sm text-slate-400">${8 + i}:${i % 2 === 0 ? '00' : '30'} AM</p>
                  </div>
                </div>
                <span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-black">Completada</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
}

async function loadTaskReports() {
  const el = document.getElementById('tareasContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  
  try {
    el.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <p class="text-xs font-black uppercase text-slate-400 mb-2">Asignadas</p>
            <p class="text-2xl font-black text-slate-800">124</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <p class="text-xs font-black uppercase text-slate-400 mb-2">Entregadas</p>
            <p class="text-2xl font-black text-green-600">118</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <p class="text-xs font-black uppercase text-slate-400 mb-2">Retrasadas</p>
            <p class="text-2xl font-black text-amber-600">4</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <p class="text-xs font-black uppercase text-slate-400 mb-2">% Completado</p>
            <p class="text-2xl font-black text-blue-600">95%</p>
          </div>
        </div>
        
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Tareas Recientes</h3>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-6 py-4 text-left text-xs font-black uppercase text-slate-400">Tarea</th>
                  <th class="px-6 py-4 text-left text-xs font-black uppercase text-slate-400">Maestra</th>
                  <th class="px-6 py-4 text-left text-xs font-black uppercase text-slate-400">Aula</th>
                  <th class="px-6 py-4 text-left text-xs font-black uppercase text-slate-400">Estado</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${['Actividad Manualidades', 'Informe Semanal', 'Plan de Clase', 'Registro de Asistencia'].map((t, i) => `
                  <tr class="hover:bg-slate-50">
                    <td class="px-6 py-4 font-bold text-slate-800">${t}</td>
                    <td class="px-6 py-4 text-slate-600">Maestra ${i + 1}</td>
                    <td class="px-6 py-4 text-slate-600">Aula ${i + 1}</td>
                    <td class="px-6 py-4">
                      <span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-black">Entregada</span>
                    </td>
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

async function loadClassroomComparison() {
  const el = document.getElementById('comparativoContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  
  try {
    el.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          ${['Rendimiento', 'Cumplimiento', 'Asistencia', 'Participación'].map((cat, i) => `
            <div class="bg-white rounded-2xl border border-slate-100 p-6">
              <p class="text-xs font-black uppercase text-slate-400 mb-2">Mejor Aula - ${cat}</p>
              <p class="text-xl font-black text-slate-800">Aula ${i + 1}</p>
              <p class="text-sm text-blue-600 font-bold mt-1">9${5 - i}%</p>
            </div>
          `).join('')}
        </div>
        
        <div class="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 class="text-lg font-bold text-slate-800 mb-4">Comparativo por Aulas</h3>
          <div class="h-80 bg-slate-50 rounded-xl flex items-center justify-center">
            <span class="text-slate-400">Gráfico Comparativo (Chart.js)</span>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
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

async function loadStatisticsCenter() {
  const el = document.getElementById('estadisticasContent');
  if (!el) return;
  el.innerHTML = '<div class="text-slate-400">Cargando...</div>';
  
  try {
    el.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <h3 class="text-lg font-bold text-slate-800 mb-4">Eficiencia Institucional</h3>
            <div class="h-64 bg-slate-50 rounded-xl flex items-center justify-center">
              <span class="text-slate-400">Gráfico de Líneas</span>
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <h3 class="text-lg font-bold text-slate-800 mb-4">Valoraciones de Padres</h3>
            <div class="h-64 bg-slate-50 rounded-xl flex items-center justify-center">
              <span class="text-slate-400">Gráfico de Barras</span>
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <h3 class="text-lg font-bold text-slate-800 mb-4">Asistencia Docente</h3>
            <div class="h-64 bg-slate-50 rounded-xl flex items-center justify-center">
              <span class="text-slate-400">Gráfico de Pastel</span>
            </div>
          </div>
          <div class="bg-white rounded-2xl border border-slate-100 p-6">
            <h3 class="text-lg font-bold text-slate-800 mb-4">Puntualidad</h3>
            <div class="h-64 bg-slate-50 rounded-xl flex items-center justify-center">
              <span class="text-slate-400">Heatmap</span>
            </div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    el.innerHTML = `<p class="text-rose-500">Error al cargar: ${e.message}</p>`;
  }
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

function initSidebarDropdowns() {
  document.querySelectorAll('.kk-nav-group-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = btn.closest('.kk-nav-group');
      const submenu = group?.querySelector('.kk-nav-sub');
      if (group && submenu) {
        btn.classList.toggle('open');
        group.classList.toggle('open');
        submenu.style.display = submenu.style.display === 'none' || submenu.style.display === '' ? 'block' : 'none';
      }
    });
  });
}

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message?.toLowerCase() ?? '';
  if (msg.includes('indexeddb') || msg.includes('network') || msg.includes('fetch')) return;
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const auth = await ensureRole('education_coordinator');
    if (!auth) return;

    AppState.set('user', auth.user);
    AppState.set('profile', auth.profile);

    const host = window.location.hostname;
    const isProd = host === 'montessorisonrisascreativas.com' || host === 'www.montessorisonrisascreativas.com' || host.endsWith('.montessorisonrisascreativas.com') || host === 'localhost';
    if (isProd) {
      try { initOneSignal(auth.user); } catch (_) {}
    }

    loadProfile();
    goToSection('dashboard');

    BadgeSystem.init(auth.user.id);

    document.getElementById('btnLogout')?.addEventListener('click', async () => {
      RealtimeManager.unsubscribeAll();
      QueryCache.clear();
      await supabase.auth.signOut();
      window.location.href = 'login.html';
    });

    import('../shared/sidebar-manager.js').then(({ initSidebar }) => {
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
      initSidebarDropdowns();
    });

    const loader = document.getElementById('initial-loading');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    const loader = document.getElementById('initial-loading');
    if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 300); }
    const msg = (err?.message || '').toLowerCase();
    const isAuthError = msg.includes('session') || msg.includes('auth') || msg.includes('jwt') || msg.includes('token');
    if (isAuthError) {
      window.location.href = 'login.html';
    }
  }
});
