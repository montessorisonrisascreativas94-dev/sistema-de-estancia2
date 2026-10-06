import { supabase } from './supabase.js';
import { Helpers } from './helpers.js';
import { CANONICAL_CLASSROOMS, findCanonicalClassroom } from './constants.js';

export const ClassroomOrganigramModule = {
  _containerId: null,
  _role: 'directora', // 'directora' | 'encargada'
  _activeTab: 'organigram', // 'organigram' | 'calendar' | 'flow'
  _selectedClassroom: 'all',
  _data: {
    classrooms: [],
    teachers: [],
    students: [],
    events: [],
    posts: [],
    messages: [],
    dailyLogs: []
  },

  async init(containerId, options = {}) {
    this._containerId = containerId;
    this._role = options.role || 'directora';
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="flex flex-col gap-6">
        <!-- Encabezado Principal y Navigation Tabs -->
        <div class="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl ${this._role === 'encargada' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-[#0B63C7]'} flex items-center justify-center font-black text-xl shadow-inner">
              <i data-lucide="sitemap" class="w-6 h-6"></i>
            </div>
            <div>
              <h2 class="text-xl font-black text-slate-800 tracking-tight">Organigrama & Flujo de la Estancia Infantil</h2>
              <p class="text-xs text-slate-500 font-bold mt-0.5">Control unificado en tiempo real de Aulas, Docentes, Estudiantes, Actividades y Publicaciones</p>
            </div>
          </div>

          <!-- Selector de Pestañas -->
          <div class="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
            <button onclick="window.ClassroomOrganigramModule.switchTab('organigram')" id="orgTabBtn-organigram"
              class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 bg-white text-slate-800 shadow-sm">
              <i data-lucide="git-fork" class="w-4 h-4"></i> Organigrama
            </button>
            <button onclick="window.ClassroomOrganigramModule.switchTab('calendar')" id="orgTabBtn-calendar"
              class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 text-slate-500 hover:text-slate-800">
              <i data-lucide="calendar-days" class="w-4 h-4"></i> Calendario Escolar
            </button>
            <button onclick="window.ClassroomOrganigramModule.switchTab('flow')" id="orgTabBtn-flow"
              class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 text-slate-500 hover:text-slate-800">
              <i data-lucide="activity" class="w-4 h-4"></i> Flujo & Supervisión
            </button>
          </div>
        </div>

        <!-- Contenido dinámico principal -->
        <div id="organigramMainContent" class="min-h-[500px]">
          <div class="flex items-center justify-center py-20">
            <div class="animate-spin w-8 h-8 border-4 border-[#0B63C7] border-t-transparent rounded-full"></div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    window.ClassroomOrganigramModule = this;

    await this.loadData();
    this.render();
  },

  async loadData() {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const [clsRes, teaRes, stuRes, postsRes, logsRes, evRes, msgRes] = await Promise.allSettled([
        supabase.from('classrooms').select('*, teacher:teacher_id(id, name, email, avatar_url, role)').is('deleted_at', null).order('name'),
        supabase.from('profiles').select('*').in('role', ['maestra', 'asistente', 'encargada']).order('name'),
        supabase.from('students').select('id, name, classroom_id, birth_date, is_active, p1_name, p1_phone').eq('is_active', true).order('name'),
        supabase.from('posts').select('id, classroom_id, teacher_id, created_at, content, media_url').order('created_at', { ascending: false }).limit(100),
        supabase.from('daily_logs').select('id, classroom_id, teacher_id, date, created_at, infant_data, notes').eq('date', todayStr),
        supabase.from('academic_events').select('*').order('start_date', { ascending: true }),
        supabase.from('messages').select('id, sender_id, recipient_id, created_at, is_read, read').eq('is_read', false).limit(200)
      ]);

      this._data.classrooms = clsRes.status === 'fulfilled' ? (clsRes.value.data || []) : [];
      this._data.teachers = teaRes.status === 'fulfilled' ? (teaRes.value.data || []) : [];
      this._data.students = stuRes.status === 'fulfilled' ? (stuRes.value.data || []) : [];
      this._data.posts = postsRes.status === 'fulfilled' ? (postsRes.value.data || []) : [];
      this._data.dailyLogs = logsRes.status === 'fulfilled' ? (logsRes.value.data || []) : [];
      this._data.events = evRes.status === 'fulfilled' ? (evRes.value.data || []) : [];
      this._data.messages = msgRes.status === 'fulfilled' ? (msgRes.value.data || []) : [];

    } catch (e) {
      console.error('[Organigram] Error loading data:', e);
    }
  },

  switchTab(tab) {
    this._activeTab = tab;
    ['organigram', 'calendar', 'flow'].forEach(t => {
      const btn = document.getElementById(`orgTabBtn-${t}`);
      if (!btn) return;
      if (t === tab) {
        btn.className = 'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 bg-white text-slate-800 shadow-sm';
      } else {
        btn.className = 'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 text-slate-500 hover:text-slate-800';
      }
    });
    this.render();
  },

  render() {
    const main = document.getElementById('organigramMainContent');
    if (!main) return;

    if (this._activeTab === 'organigram') {
      this.renderOrganigram(main);
    } else if (this._activeTab === 'calendar') {
      this.renderCalendar(main);
    } else if (this._activeTab === 'flow') {
      this.renderFlowSupervision(main);
    }

    if (window.lucide) lucide.createIcons();
  },

  renderOrganigram(container) {
    const primaryColor = this._role === 'encargada' ? '#7C3AED' : '#0B63C7';

    // Agrupar aulas por nivel canónico o línea
    const grouped = {};
    CANONICAL_CLASSROOMS.forEach(canon => {
      grouped[canon.displayLevel] = {
        meta: canon,
        rooms: []
      };
    });
    grouped['Otras Aulas / Clases Especiales'] = {
      meta: { displayLevel: 'Otras Aulas', color: '#64748B' },
      rooms: []
    };

    this._data.classrooms.forEach(r => {
      const canon = findCanonicalClassroom(r.level || r.name);
      const groupKey = canon?.displayLevel || 'Otras Aulas / Clases Especiales';
      if (!grouped[groupKey]) {
        grouped[groupKey] = { meta: { displayLevel: groupKey, color: '#0B63C7' }, rooms: [] };
      }
      grouped[groupKey].rooms.push(r);
    });

    const unassignedStudents = this._data.students.filter(s => !s.classroom_id);

    container.innerHTML = `
      <div class="space-y-8">
        <!-- Barra de resumen rápido / KPIs -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Aulas Registradas</p>
            <p class="text-2xl font-black text-slate-800">${this._data.classrooms.length}</p>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Docentes Asignados</p>
            <p class="text-2xl font-black text-emerald-600">${this._data.classrooms.filter(r => r.teacher_id).length}</p>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Estudiantes</p>
            <p class="text-2xl font-black text-blue-600">${this._data.students.length}</p>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sin Aula Asignada</p>
            <p class="text-2xl font-black ${unassignedStudents.length ? 'text-amber-500' : 'text-slate-400'}">${unassignedStudents.length}</p>
          </div>
        </div>

        <!-- Arbol Organigrama Jerárquico -->
        <div class="space-y-6">
          ${Object.entries(grouped).map(([groupName, groupData]) => {
            if (!groupData.rooms.length) return '';
            const canonColor = groupData.meta?.color || '#0B63C7';

            return `
              <div class="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                <!-- Encabezado del Nivel / Línea -->
                <div class="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
                  <div class="flex items-center gap-3">
                    <span class="w-4 h-4 rounded-full" style="background:${canonColor}"></span>
                    <h3 class="text-lg font-black text-slate-800">${Helpers.escapeHTML(groupName)}</h3>
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-600">
                      ${groupData.rooms.length} aula${groupData.rooms.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <!-- Grid de Aulas dentro de este nivel -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  ${groupData.rooms.map(room => {
                    const roomStudents = this._data.students.filter(s => s.classroom_id === room.id);
                    const teacher = room.teacher || this._data.teachers.find(t => t.id === room.teacher_id);
                    const cap = room.capacity || 20;
                    const occPct = Math.min(100, Math.round((roomStudents.length / cap) * 100));

                    return `
                      <div class="bg-slate-50/70 hover:bg-white rounded-2xl p-5 border-2 border-slate-100 hover:border-blue-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                        <!-- Cabecera del Aula -->
                        <div>
                          <div class="flex items-center justify-between mb-2">
                            <span class="font-black text-slate-800 text-base flex items-center gap-2">
                              <i data-lucide="door-open" class="w-4 h-4 text-blue-600"></i> ${Helpers.escapeHTML(room.name)}
                            </span>
                            <span class="text-[11px] font-black px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700">
                              ${roomStudents.length}/${cap}
                            </span>
                          </div>
                          <!-- Barra de capacidad -->
                          <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
                            <div class="h-full rounded-full transition-all ${occPct > 90 ? 'bg-amber-500' : 'bg-emerald-500'}" style="width:${occPct}%"></div>
                          </div>
                        </div>

                        <!-- Nodo Docente Asignado -->
                        <div class="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                          <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-full bg-blue-100 text-[#0B63C7] flex items-center justify-center font-black text-sm shrink-0">
                              ${teacher?.name ? teacher.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div class="min-w-0">
                              <p class="text-xs font-black text-slate-800 truncate">${teacher?.name ? Helpers.escapeHTML(teacher.name) : 'Sin maestra asignada'}</p>
                              <p class="text-[10px] text-slate-400 font-bold uppercase">Maestra Titular</p>
                            </div>
                          </div>
                        </div>

                        <!-- Lista resumida de estudiantes -->
                        <div class="space-y-1">
                          <p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Estudiantes (${roomStudents.length}):</p>
                          <div class="max-h-32 overflow-y-auto space-y-1 pr-1">
                            ${roomStudents.length === 0 ? '<p class="text-xs text-slate-400 italic">No hay alumnos asignados</p>' : ''}
                            ${roomStudents.map(s => `
                              <div class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white border border-slate-100 text-xs">
                                <span class="font-bold text-slate-700 truncate">${Helpers.escapeHTML(s.name)}</span>
                                <span class="text-[9px] text-slate-400 font-bold shrink-0">${s.p1_name ? 'tutor: ' + Helpers.escapeHTML(s.p1_name.split(' ')[0]) : ''}</span>
                              </div>
                            `).join('')}
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  renderCalendar(container) {
    const events = this._data.events || [];
    container.innerHTML = `
      <div class="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-6">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 class="text-lg font-black text-slate-800">Calendario Escolar & Actividades del Periodo</h3>
            <p class="text-xs text-slate-500 font-bold mt-0.5">Planificación académica, reuniones, evaluaciones y eventos festivos de la estancia</p>
          </div>
          <button onclick="window.ClassroomOrganigramModule.openNewEventModal()" class="px-4 py-2.5 bg-[#0B63C7] text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md hover:bg-[#0850A0] transition-all flex items-center gap-2">
            <i data-lucide="plus" class="w-4 h-4"></i> Nuevo Evento Escolar
          </button>
        </div>

        <!-- Vista de Eventos Registrados -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${events.length === 0 ? `
            <div class="col-span-full text-center py-16 text-slate-400">
              <i data-lucide="calendar-off" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i>
              <p class="font-black text-sm text-slate-600">No hay actividades o eventos programados para este periodo</p>
              <p class="text-xs text-slate-400 mt-1">Haz clic en "Nuevo Evento Escolar" para agendar actividades.</p>
            </div>
          ` : ''}

          ${events.map(ev => `
            <div class="p-5 rounded-2xl border-2 border-slate-100 bg-slate-50/50 hover:bg-white transition-all space-y-3">
              <div class="flex items-center justify-between">
                <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-blue-100 text-[#0B63C7]">
                  ${Helpers.escapeHTML(ev.type || 'Evento')}
                </span>
                <span class="text-xs font-black text-slate-500">${ev.start_date || 'Sin fecha'}</span>
              </div>
              <h4 class="font-black text-slate-800 text-sm">${Helpers.escapeHTML(ev.title)}</h4>
              <p class="text-xs text-slate-500 font-medium">${Helpers.escapeHTML(ev.description || 'Sin descripción')}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  renderFlowSupervision(container) {
    const teachers = this._data.teachers.filter(t => t.role === 'maestra');

    container.innerHTML = `
      <div class="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-6">
        <div>
          <h3 class="text-lg font-black text-slate-800">Supervisión de Flujo Escolar por Maestra</h3>
          <p class="text-xs text-slate-500 font-bold mt-0.5">Auditoría en tiempo real de publicaciones, mensajes pendientes de padres y reporte de rutinas infantiles</p>
        </div>

        <div class="overflow-x-auto rounded-2xl border border-slate-100">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-100 text-slate-500 font-black uppercase tracking-wider">
                <th class="p-4">Docente / Maestra</th>
                <th class="p-4">Aula Asignada</th>
                <th class="p-4 text-center">Mensajes Pendientes</th>
                <th class="p-4 text-center">Publicaciones Muro</th>
                <th class="p-4 text-center">Rutina Hoy</th>
                <th class="p-4 text-right">Estado Flujo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium">
              ${teachers.length === 0 ? '<tr><td colspan="6" class="p-8 text-center text-slate-400">No hay maestras registradas.</td></tr>' : ''}
              ${teachers.map(t => {
                const room = this._data.classrooms.find(r => r.teacher_id === t.id);
                const unreadMsgs = this._data.messages.filter(m => m.recipient_id === t.id).length;
                const teacherPosts = this._data.posts.filter(p => p.teacher_id === t.id).length;
                const todayLog = this._data.dailyLogs.find(l => l.teacher_id === t.id || (room && l.classroom_id === room.id));

                return `
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-4 font-black text-slate-800 flex items-center gap-3">
                      <div class="w-8 h-8 rounded-full bg-blue-100 text-[#0B63C7] flex items-center justify-center font-black text-xs">
                        ${t.name ? t.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      ${Helpers.escapeHTML(t.name)}
                    </td>
                    <td class="p-4 font-bold text-slate-600">${room ? Helpers.escapeHTML(room.name) : 'Sin aula'}</td>
                    <td class="p-4 text-center">
                      <span class="px-2.5 py-1 rounded-full text-xs font-black ${unreadMsgs > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}">
                        ${unreadMsgs} pendiente${unreadMsgs !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td class="p-4 text-center font-black text-slate-700">${teacherPosts} post${teacherPosts !== 1 ? 's' : ''}</td>
                    <td class="p-4 text-center">
                      <span class="px-2.5 py-1 rounded-full text-xs font-black ${todayLog ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
                        ${todayLog ? '✓ Registrada' : '❌ Pendiente'}
                      </span>
                    </td>
                    <td class="p-4 text-right">
                      <span class="px-3 py-1 rounded-xl text-[10px] font-black uppercase ${todayLog && unreadMsgs === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                        ${todayLog && unreadMsgs === 0 ? 'Óptimo' : 'Atención Requerida'}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  openNewEventModal() {
    const html = `
      <div class="p-6 space-y-4">
        <h3 class="text-lg font-black text-slate-800">Agendar Nuevo Evento Escolar</h3>
        <div>
          <label class="block text-xs font-black text-slate-500 uppercase mb-1">Título del Evento</label>
          <input id="newEventTitle" placeholder="Ej: Reunión de Padres de Familia" class="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs font-black text-slate-500 uppercase mb-1">Fecha</label>
          <input type="date" id="newEventDate" class="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500">
        </div>
        <div>
          <label class="block text-xs font-black text-slate-500 uppercase mb-1">Descripción</label>
          <textarea id="newEventDesc" rows="3" placeholder="Detalles de la actividad..." class="w-full px-4 py-2.5 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500"></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-4">
          <button onclick="window.closeGlobalModal?.()" class="px-4 py-2 text-xs font-black text-slate-500 hover:bg-slate-100 rounded-xl uppercase">Cancelar</button>
          <button onclick="window.ClassroomOrganigramModule.saveNewEvent()" class="px-6 py-2 bg-[#0B63C7] text-white text-xs font-black rounded-xl uppercase shadow-md hover:bg-[#0850A0]">Guardar</button>
        </div>
      </div>
    `;
    if (window.openGlobalModal) window.openGlobalModal(html);
  },

  async saveNewEvent() {
    const title = document.getElementById('newEventTitle')?.value?.trim();
    const date = document.getElementById('newEventDate')?.value;
    const desc = document.getElementById('newEventDesc')?.value?.trim();

    if (!title || !date) return Helpers.toast('Título y fecha son requeridos', 'warning');

    try {
      const { error } = await supabase.from('academic_events').insert({
        title,
        start_date: date,
        description: desc,
        type: 'General'
      });

      if (error) throw error;

      Helpers.toast('Evento guardado correctamente', 'success');
      if (window.closeGlobalModal) window.closeGlobalModal();
      await this.loadData();
      this.render();
    } catch (e) {
      Helpers.toast('Error al guardar evento: ' + e.message, 'error');
    }
  }
};
