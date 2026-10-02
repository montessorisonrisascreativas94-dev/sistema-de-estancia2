import { Helpers } from '../shared/helpers.js';
import { UIPremium } from '../shared/ui-premium.js';
import { findCanonicalClassroom, findSpecialClassroom, formatClassroomFullName, formatClassroomLevel, classroomColorFor } from '../shared/constants.js';

const UIHelpers = {
  setLoading(isLoading, containerSelector = '#globalModalContainer', btnSelector = null) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    if (isLoading) {
      const loader = document.createElement('div');
      loader.id = 'ui-loading-overlay';
      loader.className = 'absolute inset-0 bg-white/60 backdrop-blur-[2px] z-[100] flex items-center justify-center rounded-3xl';
      loader.innerHTML = '<div class="flex flex-col items-center gap-3"><div class="w-12 h-12 border-4 border-blue-100 border-t-[#0B63C7] rounded-full animate-spin"></div><span class="text-[10px] font-black text-[#0B63C7] uppercase tracking-widest animate-pulse">Procesando...</span></div>';
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      container.appendChild(loader);
      if (btnSelector) {
        const btn = document.querySelector(btnSelector);
        if (btn) { btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed'); }
      }
    } else {
      document.getElementById('ui-loading-overlay')?.remove();
      if (btnSelector) {
        const btn = document.querySelector(btnSelector);
        if (btn) { btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed'); }
      }
    }
  },

  closeModal(modalSelector = '#globalModalContainer') {
    if (modalSelector === '#globalModalContainer') {
      const c = document.getElementById('globalModalContainer');
      if (c) { c.style.display = 'none'; c.innerHTML = ''; }
    } else {
      const m = document.querySelector(modalSelector);
      if (m) { m.classList.add('hidden'); m.classList.remove('active'); }
    }
  }
};

const DirectorUI = {
  /**
   * Renderiza los KPI cards del dashboard
   */
  renderDashboard(data) {
    if (!data) return; // guard � no renderizar si no hay datos

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? '0';
    };

    const kpis = data?.stats || data?.kpis || {};

    // Estudiantes activos
    const studentCount = (kpis.active > 0 ? kpis.active : null) ?? kpis.students ?? kpis.total ?? 0;
    set('kpiStudents', studentCount);

    // Docentes
    set('kpiTeachers', kpis.teachers > 0 ? kpis.teachers : (data?.teacherCount ?? 0));

    // Aulas activas
    set('kpiClassrooms', kpis.classrooms > 0 ? kpis.classrooms : (data?.classrooms?.length ?? 0));

    // Ni�os presentes hoy
    const presentToday = data?.attendance?.today?.present ?? kpis.present ?? kpis.attendance_today ?? 0;
    const totalToday   = data?.attendance?.today?.total ?? studentCount;
    set('kpiAttendance', presentToday);

    // Tasa de asistencia como subtexto
    if (totalToday > 0) {
      const rate = Math.round((presentToday / totalToday) * 100);
      const rateEl = document.getElementById('kpiAttendanceRate');
      if (rateEl) rateEl.textContent = rate + '% del total';
    }

    // Por cobrar
    const pending = data?.payments?.summary?.total_pending ?? kpis.pending_amount ?? kpis.pending_payments ?? 0;
    set('kpiPendingMoney', 'RD$' + Number(pending).toLocaleString('es-DO', { minimumFractionDigits: 2 }));

    // Incidencias
    set('kpiIncidents', data?.inquiries?.count ?? kpis.pendingInquiries ?? kpis.inquiries ?? 0);

    // ? Hacer KPIs interactivos
    this._initInteractiveKPIs();

    // ? Inicializar Pull-to-Refresh
    UIPremium.initPullToRefresh('dashboard', async () => {
      const { DashboardService } = await import('./dashboard.service.js');
      const refreshed = await DashboardService.getFullData(true);
      this.renderDashboard(refreshed);
    });

    // Lanzar widgets inteligentes en background (no bloquea el render)
    // Smart widgets � carga lazy si el m�dulo existe
    import('./automation.js').then(({ AutomationModule }) => {
      AutomationModule.renderSmartWidgets('smartAlertsContainer');
    }).catch(() => {});

    if (window.lucide) lucide.createIcons();
  },

  _initInteractiveKPIs() {
    const mappings = {
      'card-kpi-students': 'estudiantes',
      'card-kpi-teachers': 'maestros',
      'card-kpi-attendance': 'asistencia',
      'card-kpi-money': 'pagos',
      'card-kpi-incidents': 'reportes'
    };

    Object.entries(mappings).forEach(([id, section]) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.cursor = 'pointer';
        el.onclick = () => {
          if (window.App?.navigation?.goTo) window.App.navigation.goTo(section);
        };
      }
    });
  },

  /**
   * Datos de presentación de un aula, resolviendo el caso canónico
   * (Párvulos, Pre-Kínder… 6°) y el caso especial (Inglés, Cuido, Ballet…).
   * El "nivel" se muestra SIEMPRE como ordinal legible ("1° Primero"),
   * nunca como el crudo de BD ("1ro - Línea Roja").
   */
  _classroomMeta(r) {
    const canon  = findCanonicalClassroom(r.level || r.name);
    const special = canon ? null : findSpecialClassroom(r.name) || findSpecialClassroom(r.level);
    const display = canon?.displayLevel
      || special?.displayName
      || formatClassroomFullName(r.name, r.level)
      || 'Sin nivel';
    return {
      canon,
      special,
      display,
      color: canon?.color || special?.color || classroomColorFor(r.name, r.level),
      emoji: special?.emoji || '',
      labelRange: canon?.labelRange || '',
    };
  },

  /**
   * Tarjeta-contendor de aula.
   * Muestra la franja vertical con el color oficial del aula y la
   * línea de capacidad (barra + ocupación) usando ese mismo color.
   */
  renderClassroomCard(r) {
    const m         = this._classroomMeta(r);
    const color     = m.color;
    const occupancy = Number(r.student_count || 0);
    const capacity  = Number(r.capacity || 20);
    const percent   = capacity > 0 ? Math.round((occupancy / capacity) * 100) : 0;
    const free      = Math.max(0, capacity - occupancy);
    const full      = free === 0;
    const teacher   = r.profiles?.name || '';
    const initial   = (teacher.trim()[0] || '?').toUpperCase();
    const labelRange = m.labelRange || (m.special ? 'Clase especial' : 'Sin rango de edad');

    const freeCls = full ? 'dc-cap-free--full' : free <= 3 ? 'dc-cap-free--tight' : 'dc-cap-free';

    // Las clases especiales se inyectan como filas virtuales (id === null):
    // no se pueden editar ni borrar, así que no se les da acción.
    const isVirtual = m.special && !r.id;
    const openAttrs  = isVirtual ? '' :
      ' onclick="App.rooms.openModal(\'' + r.id + '\')"' +
      ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();App.rooms.openModal(\'' + r.id + '\')}"' +
      ' tabindex="0" role="button" aria-label="Abrir aula ' + Helpers.escapeHTML(r.name || '') + '"';
    const actions   = isVirtual ?
      '<span class="dc-badge dc-badge--room" style="--room:' + color + '"><i></i><span>Especial</span></span>' :
      '<div class="dc-room-actions">' +
        '<button class="dc-icon-btn" onclick="event.stopPropagation();App.rooms.openModal(\'' + r.id + '\')" title="Editar aula">' +
          '<i data-lucide="pencil"></i>' +
        '</button>' +
        '<button class="dc-icon-btn dc-icon-btn--danger" onclick="event.stopPropagation();App.rooms.deleteRoom(\'' + r.id + '\',\'' + Helpers.escapeHTML(r.name || '') + '\')" title="Eliminar aula">' +
          '<i data-lucide="trash-2"></i>' +
        '</button>' +
      '</div>';

    return (
      '<article class="dc-room' + (full ? ' dc-room--inactive' : '') + (m.special ? ' dc-room--special' : '') + '" style="--room:' + color + '"' +
        openAttrs + '>' +

        '<div class="dc-room-top">' +
          '<div style="min-width:0">' +
            '<h3 class="dc-room-name">' + Helpers.escapeHTML(r.name || 'Aula') + '</h3>' +
            '<p class="dc-room-level">' + (m.emoji ? m.emoji + ' ' : '') + Helpers.escapeHTML(m.display) + '</p>' +
          '</div>' +
          actions +
        '</div>' +

        // Indicador del aula: punto + nivel, en el color oficial del aula
        '<span class="dc-line-chip"><i></i>' + Helpers.escapeHTML(m.display) + '</span>' +

        // Línea de capacidad
        '<div class="dc-cap">' +
          '<div class="dc-cap-head">' +
            '<span class="dc-cap-title">Capacidad</span>' +
            '<span class="dc-cap-num"><b>' + occupancy + '</b><span> / ' + capacity + '</span></span>' +
          '</div>' +
          '<div class="dc-cap-track"><div class="dc-cap-fill' + (full ? ' dc-cap-fill--full' : '') + '" style="width:' + Math.min(100, percent) + '%"></div></div>' +
          '<div class="dc-cap-foot">' +
            '<span>' + percent + '% ocupado</span>' +
            '<span class="' + freeCls + '">' + (full ? 'Sin cupos' : free + ' cupos libres') + '</span>' +
          '</div>' +
        '</div>' +

        // Maestra asignada
        '<div class="dc-room-teacher' + (teacher ? '' : ' dc-room-teacher--empty') + '">' +
          '<div class="dc-room-teacher-av">' + (teacher ? initial : '–') + '</div>' +
          '<div class="dc-room-teacher-txt">' +
            '<span class="dc-room-teacher-name">' + (teacher ? Helpers.escapeHTML(teacher) : 'Sin maestra asignada') + '</span>' +
            '<span class="dc-room-teacher-role">' + (teacher ? 'Docente a cargo' : 'Pendiente') + '</span>' +
          '</div>' +
        '</div>' +

        '<div class="dc-room-tags">' +
          '<span class="dc-tag"><i data-lucide="users"></i>' + occupancy + ' de ' + capacity + '</span>' +
          '<span class="dc-tag"><i data-lucide="cake"></i>' + Helpers.escapeHTML(labelRange) + '</span>' +
          (r.is_live ? '<span class="dc-tag dc-tag--live"><i data-lucide="check"></i>Activa</span>' : '') +
        '</div>' +

      '</article>'
    );
  },

  renderClassroomRow(r) {
    const m         = this._classroomMeta(r);
    const color     = m.color;
    const occupancy = Number(r.student_count || 0);
    const capacity  = Number(r.capacity || 20);
    const percent   = capacity > 0 ? Math.round((occupancy / capacity) * 100) : 0;
    const free      = Math.max(0, capacity - occupancy);
    const full      = free === 0;

    const isVirtual = m.special && !r.id;
    const rowOpen   = isVirtual ? '' : ' ondblclick="App.rooms.openModal(\'' + r.id + '\')"';
    const rowActions = isVirtual
      ? '<span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Clase especial</span>'
      : '<div class="flex items-center justify-center gap-1">' +
          '<button onclick="App.rooms.openModal(\'' + r.id + '\')" class="dc-icon-btn" title="Editar">' +
            '<i data-lucide="pencil"></i>' +
          '</button>' +
          '<button onclick="App.rooms.deleteRoom(\'' + r.id + '\',\'' + Helpers.escapeHTML(r.name) + '\')" class="dc-icon-btn dc-icon-btn--danger" title="Eliminar">' +
            '<i data-lucide="trash-2"></i>' +
          '</button>' +
        '</div>';

    return (
      '<tr class="hover:bg-slate-50 transition-colors' + (isVirtual ? '' : ' cursor-pointer') + '"' + rowOpen + '>' +
        '<td class="py-4 px-6" style="border-left:6px solid ' + color + '">' +
          '<div class="font-bold text-slate-800">' + Helpers.escapeHTML(r.name) + '</div>' +
          '<div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">' +
            Helpers.escapeHTML(m.labelRange || (m.special ? 'Clase especial' : 'General')) +
          '</div>' +
        '</td>' +
        '<td class="py-4 px-6">' +
          '<span class="dc-line-chip" style="--room:' + color + ';display:inline-flex"><i></i>' + Helpers.escapeHTML(m.display) + '</span>' +
        '</td>' +
        '<td class="py-4 px-6">' +
          '<div class="flex items-center gap-4">' +
            '<div class="dc-cap-track" style="--room:' + color + ';max-width:120px;flex:1">' +
              '<div class="dc-cap-fill' + (full ? ' dc-cap-fill--full' : '') + '" style="width:' + Math.min(100, percent) + '%"></div>' +
            '</div>' +
            '<span class="text-xs font-bold text-slate-500">' + occupancy + '/' + capacity + '</span>' +
          '</div>' +
          '<div class="text-[10px] text-slate-400 font-bold mt-1">' + percent + '% · ' + (full ? 'sin cupos' : free + ' libres') + '</div>' +
        '</td>' +
        '<td class="py-4 px-6">' +
          '<div class="flex items-center gap-3">' +
            '<div class="w-8 h-8 rounded-lg text-white flex items-center justify-center text-xs font-bold" style="background:' + color + '">' + (r.profiles?.name || '?').charAt(0) + '</div>' +
            '<div class="text-sm font-medium text-slate-600">' + Helpers.escapeHTML(r.profiles?.name || 'Sin asignar') + '</div>' +
          '</div>' +
        '</td>' +
        '<td class="py-4 px-6 text-center">' +
          rowActions +
        '</td>' +
      '</tr>'
    );
  },

  renderInquiryCard(item) {
    const statusCls = {
      pending:     'bg-amber-100 text-amber-700 border-amber-200',
      in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
      resolved:    'bg-emerald-100 text-emerald-700 border-emerald-200',
      closed:      'bg-slate-100 text-slate-700 border-slate-200'
    }[item.status] || 'bg-slate-100 text-slate-700';

    return (
      '<div class="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-all">' +
        '<div class="flex justify-between items-start mb-4">' +
          '<span class="text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ' + statusCls + '">' + (item.status || '-') + '</span>' +
          '<span class="text-[10px] font-bold text-slate-400">' + new Date(item.created_at).toLocaleDateString() + '</span>' +
        '</div>' +
        '<h3 class="font-bold text-slate-800 mb-1 truncate">' + Helpers.escapeHTML(item.subject || '') + '</h3>' +
        '<p class="text-xs text-slate-500 mb-4 line-clamp-2">' + Helpers.escapeHTML(item.message || '') + '</p>' +
        '<div class="flex items-center justify-between pt-4 border-t border-slate-50">' +
          '<div class="flex items-center gap-2">' +
            '<div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">' + (item.parent?.name || '?').charAt(0) + '</div>' +
            '<div class="text-[10px] font-bold text-slate-600">' + Helpers.escapeHTML(item.parent?.name || 'Padre') + '</div>' +
          '</div>' +
          '<button data-id="' + item.id + '" class="btn-inquiry-detail text-[#0B63C7] hover:text-[#0850A0] font-bold text-xs">Ver Detalle</button>' +
        '</div>' +
      '</div>'
    );
  }
};

export const UI = { ...UIHelpers, ...DirectorUI };
export { UIHelpers, DirectorUI };

