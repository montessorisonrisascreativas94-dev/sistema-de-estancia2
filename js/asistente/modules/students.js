import { supabase, createClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../shared/supabase.js';
import { Helpers } from '../../shared/helpers.js';
import { RealtimeManager } from '../../shared/realtime-manager.js';
import {
  findCanonicalClassroom,
  findSpecialClassroom,
  formatClassroomFullName,
  sanitizeClassroomDisplayName,
} from '../../shared/constants.js';

const IC = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-teal-100 focus:border-teal-400 bg-slate-50/50 transition-all text-sm font-medium';
const LC = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1';
const VIEW_KEY = 'asis_students_view';

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dateStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const STATUS_STYLE = {
  present:  { cls: 'bg-emerald-100 text-emerald-700', label: 'Presente' },
  absent:   { cls: 'bg-rose-100 text-rose-700',       label: 'Ausente' },
  late:     { cls: 'bg-amber-100 text-amber-700',     label: 'Tarde' },
  retirado: { cls: 'bg-slate-100 text-slate-700',     label: 'Retirado' },
};

export const StudentsModule = {
  _page: 1,
  _pageSize: 10,
  _allStudents: [],
  _realtimeSubscribed: false,
  _view: 'table',
  _attendanceMap: new Map(),
  _toggleBound: false,

  _loadView() {
    this._view = 'table';
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'grid' || v === 'table') this._view = v;
    } catch (_) {}
  },

  _saveView() {
    try { localStorage.setItem(VIEW_KEY, this._view); } catch (_) {}
  },

  _paintToggle() {
    const btn = document.getElementById('btnToggleStuView');
    if (!btn) return;
    const isGrid = this._view === 'grid';
    btn.innerHTML = `<i data-lucide="${isGrid ? 'table' : 'layout-grid'}" class="w-4 h-4"></i>` +
      `<span data-stu-view-label>${isGrid ? 'Ver tabla' : 'Ver tarjetas'}</span>`;
    btn.setAttribute('aria-pressed', String(isGrid));
  },

  _applyView() {
    const table = document.getElementById('studentsTableWrapper');
    const grid = document.getElementById('studentsGrid');
    if (this._view === 'grid') {
      table?.classList.add('hidden');
      grid?.classList.remove('hidden');
    } else {
      table?.classList.remove('hidden');
      grid?.classList.add('hidden');
    }
    this._paintToggle();
  },

  async init() {
    if (!this._realtimeSubscribed) {
      this._subscribeRealtime();
    }
    this._loadView();
    this._bindToggle();
    this._applyView();
    this._page = 1;
    await this.loadStudents();
    document.getElementById('btnAddStudent')?.addEventListener('click', () => this.openModal());
    this._bindSearch();
  },

  _bindToggle() {
    if (this._toggleBound) return;
    const btn = document.getElementById('btnToggleStuView');
    if (!btn) return;
    this._toggleBound = true;
    btn.addEventListener('click', () => {
      this._view = this._view === 'grid' ? 'table' : 'grid';
      this._saveView();
      this._applyView();
      this._renderPage(document.getElementById('searchStudentInput')?.value?.toLowerCase().trim() || '');
    });
  },

  _subscribeRealtime() {
    this._realtimeSubscribed = true;
    RealtimeManager.subscribe('asistente-students', (channel) => {
      channel
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'students' },
          () => {
            this.loadStudents();
          }
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'attendance' },
          async () => {
            if (!this._allStudents.length) return;
            await this._loadAttendance(this._allStudents);
            this._renderPage(document.getElementById('searchStudentInput')?.value?.toLowerCase().trim() || '');
          }
        );
    });
  },

  /** Carga hora de entrada / salida (último día con registro) de cada estudiante */
  async _loadAttendance(students) {
    const ids = (students || []).map(s => s.id).filter(Boolean);
    if (!ids.length) { this._attendanceMap = new Map(); return; }

    const since = dateStr(new Date(Date.now() - 7 * 864e5));
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('student_id, date, status, check_in, check_out')
        .in('student_id', ids)
        .gte('date', since)
        .order('date', { ascending: false });

      if (error) { this._attendanceMap = new Map(); return; }

      const map = new Map();
      (data || []).forEach(a => {
        const key = String(a.student_id);
        if (!map.has(key)) {
          map.set(key, { date: a.date, status: a.status, check_in: a.check_in, check_out: a.check_out });
        }
      });
      this._attendanceMap = map;
    } catch (_) {
      this._attendanceMap = new Map();
    }
  },

  _attendanceFor(id) {
    return this._attendanceMap?.get(String(id)) || null;
  },

  _bindSearch() {
    const input = document.getElementById('searchStudentInput');
    if (!input || input._bound) return;
    input._bound = true;
    input.addEventListener('input', (e) => {
      this._page = 1;
      this._renderPage(e.target.value.toLowerCase().trim());
    });
  },

  _renderPage(query = '') {
    const tbody = document.getElementById('studentsTableBody');
    const grid = document.getElementById('studentsGrid');
    if (!tbody && !grid) return;

    this._applyView();

    let filtered = this._allStudents;
    if (query) {
      filtered = this._allStudents.filter(s =>
        (s.name || '').toLowerCase().includes(query) ||
        (s.matricula || '').toLowerCase().includes(query) ||
        (s.p1_name || '').toLowerCase().includes(query)
      );
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / this._pageSize));
    if (this._page > totalPages) this._page = totalPages;
    const start = (this._page - 1) * this._pageSize;
    const page = filtered.slice(start, start + this._pageSize);

    if (!page.length) {
      const msg = query ? `Sin resultados para "${query}"` : 'No hay estudiantes registrados.';
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center">
        <div class="opacity-30 mb-2"><i data-lucide="search-x" class="w-12 h-12 mx-auto"></i></div>
        <p class="text-sm font-bold text-slate-400">${Helpers.escapeHTML(msg)}</p>
      </td></tr>`;
      if (grid) grid.innerHTML = `<div class="col-span-full py-12 text-center">
        <div class="opacity-30 mb-2"><i data-lucide="search-x" class="w-12 h-12 mx-auto"></i></div>
        <p class="text-sm font-bold text-slate-400">${Helpers.escapeHTML(msg)}</p>
      </div>`;
      if (window.lucide) lucide.createIcons();
      this._renderPagination(0, 0, 0);
      return;
    }

    const avatarHtml = (s, rounded = 'rounded-2xl') => s.avatar_url
      ? `<img src="${Helpers.escapeHTML(s.avatar_url)}" class="w-full h-full object-cover" alt="">`
      : `<span class="font-black text-teal-600">${(s.name || '?').charAt(0).toUpperCase()}</span>`;

    const timeChip = (value, hasValue, tone) =>
      `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${hasValue ? tone : 'bg-slate-100 text-slate-400'}">
         <i data-lucide="clock" class="w-3 h-3"></i>${hasValue ? Helpers.escapeHTML(value) : 'Sin registro'}
       </span>`;

    if (tbody) {
      tbody.innerHTML = page.map(s => {
        const att = this._attendanceFor(s.id);
        const st = STATUS_STYLE[att?.status] || null;
        return `
        <tr class="hover:bg-slate-50 transition-all group cursor-pointer" ondblclick="window.App._openStudentModal('${s.id}')">
          <td class="px-6 py-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 overflow-hidden shrink-0 flex items-center justify-center">
                ${avatarHtml(s)}
              </div>
              <div>
                <div class="font-black text-slate-700 text-sm group-hover:text-teal-600 transition-colors">${Helpers.escapeHTML(s.name)}</div>
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${Helpers.escapeHTML(s.matricula || 'SIN MATRÍCULA')}</div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="flex flex-col">
              <span class="text-sm font-bold text-slate-600">${Helpers.escapeHTML(s.classrooms?.name || '—')}</span>
              <span class="text-[9px] font-black text-slate-300 uppercase">Aula Asignada</span>
            </div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">${timeChip(fmtTime(att?.check_in), !!att?.check_in, 'bg-teal-50 text-teal-700')}</td>
          <td class="px-6 py-4 whitespace-nowrap">${timeChip(fmtTime(att?.check_out), !!att?.check_out, 'bg-indigo-50 text-indigo-700')}</td>
          <td class="px-6 py-4">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><i data-lucide="user" class="w-4 h-4"></i></div>
                <div class="text-xs font-bold text-slate-500">${Helpers.escapeHTML(s.p1_name || 'N/A')}</div>
              </div>
              ${st ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase w-fit ${st.cls}">${st.label}</span>` : ''}
            </div>
          </td>
          <td class="px-6 py-4">
            <div class="flex items-center gap-2 justify-end">
              <button onclick="window.App._openStudentModal('${s.id}')" class="p-2 bg-slate-100 text-slate-500 hover:bg-teal-500 hover:text-white rounded-xl transition-all" title="Editar">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="window.App._deleteStudent('${s.id}', '${Helpers.escapeHTML(s.name)}')" class="p-2 bg-slate-100 text-slate-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all" title="Eliminar">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    if (grid) {
      grid.innerHTML = page.map(s => {
        const att = this._attendanceFor(s.id);
        const st = STATUS_STYLE[att?.status] || null;
        const active = s.is_active !== false;
        return `
        <article class="bg-white rounded-3xl border-2 border-slate-100 shadow-sm hover:shadow-md hover:border-teal-200 transition-all overflow-hidden cursor-pointer group"
          onclick="window.App._openStudentModal('${s.id}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.App._openStudentModal('${s.id}')}"
          tabindex="0" role="button" aria-label="Abrir ficha de ${Helpers.escapeHTML(s.name || '')}">

          <div class="h-1.5 bg-gradient-to-r from-teal-500 to-emerald-400"></div>

          <div class="p-5 flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 overflow-hidden shrink-0 flex items-center justify-center">
              ${avatarHtml(s)}
            </div>
            <div class="min-w-0">
              <div class="font-black text-slate-700 text-sm truncate group-hover:text-teal-600 transition-colors">${Helpers.escapeHTML(s.name)}</div>
              <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">${Helpers.escapeHTML(s.matricula || 'SIN MATRÍCULA')}</div>
            </div>
          </div>

          <div class="px-5 pb-4 space-y-2">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-600">
              <i data-lucide="door-open" class="w-3.5 h-3.5 text-slate-400"></i>
              ${Helpers.escapeHTML(s.classrooms?.name || 'Sin aula')}
            </div>
            <div class="flex items-center gap-2 text-xs font-bold text-slate-600">
              <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i>
              ${Helpers.escapeHTML(s.p1_name || 'Sin tutor')}
            </div>
          </div>

          <div class="px-5 pb-4 grid grid-cols-2 gap-2">
            <div class="bg-teal-50 rounded-2xl p-3 border border-teal-100">
              <span class="block text-[9px] font-black text-teal-600 uppercase tracking-widest">Hora de entrada</span>
              <span class="block text-base font-black text-teal-700">${att?.check_in ? Helpers.escapeHTML(fmtTime(att.check_in)) : '—'}</span>
            </div>
            <div class="bg-indigo-50 rounded-2xl p-3 border border-indigo-100">
              <span class="block text-[9px] font-black text-indigo-600 uppercase tracking-widest">Hora de salida</span>
              <span class="block text-base font-black text-indigo-700">${att?.check_out ? Helpers.escapeHTML(fmtTime(att.check_out)) : '—'}</span>
            </div>
          </div>

          <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
            <div class="flex flex-wrap gap-1.5">
              ${st ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${st.cls}">${st.label}</span>` : ''}
              <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}">${active ? 'Activo' : 'Inactivo'}</span>
            </div>
            <div class="flex gap-1">
              <button onclick="event.stopPropagation();window.App._openStudentModal('${s.id}')" class="p-2 bg-white text-slate-500 hover:bg-teal-500 hover:text-white rounded-xl border border-slate-100 transition-all" title="Editar">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="event.stopPropagation();window.App._deleteStudent('${s.id}', '${Helpers.escapeHTML(s.name)}')" class="p-2 bg-white text-slate-500 hover:bg-rose-500 hover:text-white rounded-xl border border-slate-100 transition-all" title="Eliminar">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        </article>`;
      }).join('');
    }

    if (window.lucide) window.lucide.createIcons();
    this._renderPagination(this._page, totalPages, total);
  },

  _renderPagination(page, totalPages, total) {
    let container = document.getElementById('studentsPagination');
    if (!container) {
      // Se inserta FUERA de los contenedores de vista para que la paginación
      // siga visible tanto en tabla como en tarjetas.
      const tableWrapper = document.getElementById('studentsTableWrapper');
      const grid = document.getElementById('studentsGrid');
      const anchor = tableWrapper || grid;
      if (!anchor || !anchor.parentElement) return;
      container = document.createElement('div');
      container.id = 'studentsPagination';
      anchor.parentElement.insertBefore(container, anchor.nextSibling);
    }
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    const start = (page - 1) * this._pageSize + 1;
    const end = Math.min(page * this._pageSize, total);
    container.className = 'flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white rounded-b-3xl mt-0';
    container.innerHTML = `
      <span class="text-xs font-bold text-slate-400">${start}–${end} de ${total} estudiantes</span>
      <div class="flex gap-2">
        <button id="btnPrevPage" class="px-3 py-1.5 text-xs font-black rounded-xl border border-slate-200 text-slate-500 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed" ${page <= 1 ? 'disabled' : ''}>← Ant</button>
        <span class="px-3 py-1.5 text-xs font-black text-teal-600 bg-teal-50 rounded-xl">${page} / ${totalPages}</span>
        <button id="btnNextPage" class="px-3 py-1.5 text-xs font-black rounded-xl border border-slate-200 text-slate-500 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed" ${page >= totalPages ? 'disabled' : ''}>Sig →</button>
      </div>`;
    document.getElementById('btnPrevPage')?.addEventListener('click', () => {
      this._page--;
      this._renderPage(document.getElementById('searchStudentInput')?.value?.toLowerCase().trim() || '');
    });
    document.getElementById('btnNextPage')?.addEventListener('click', () => {
      this._page++;
      this._renderPage(document.getElementById('searchStudentInput')?.value?.toLowerCase().trim() || '');
    });
  },

  async loadStudents(query = '') {
    const tbody = document.getElementById('studentsTableBody');
    const grid = document.getElementById('studentsGrid');
    if (!tbody && !grid) return;

    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center">
      <div class="flex flex-col items-center gap-3">
        <div class="animate-spin w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full"></div>
        <p class="text-xs font-black text-slate-400 uppercase tracking-widest">Cargando Estudiantes...</p>
      </div></td></tr>`;
    if (grid) grid.innerHTML = `<div class="col-span-full py-10 text-center">
      <div class="animate-spin w-8 h-8 border-4 border-teal-500 border-transparent rounded-full mx-auto"></div>
      <p class="text-xs font-black text-slate-400 uppercase tracking-widest mt-3">Cargando Estudiantes...</p>
    </div>`;

    try {
      const { data: students, error } = await supabase
        .from('students')
        .select('id, name, is_active, p1_name, p1_phone, classroom_id, matricula, avatar_url')
        .order('name')
        .limit(500);
      if (error) throw error;

      // ✅ Resolver classrooms (igual que directora): filtrar activas, sanitizar, resolver canónica
      let enrichedStudents = students || [];
      const classroomIds = [...new Set(enrichedStudents.map(s => s.classroom_id).filter(Boolean))];
      if (classroomIds.length) {
        const [{ data: activeRooms }, { data: allActiveRooms }] = await Promise.all([
          supabase.from('classrooms').select('id, name, level').in('id', classroomIds).is('deleted_at', null),
          supabase.from('classrooms').select('id, name, level').is('deleted_at', null),
        ]);
        const classroomMap = {};
        (activeRooms || []).forEach(r => { classroomMap[r.id] = r; });
        const unresolved = classroomIds.filter(id => !classroomMap[id]);
        if (unresolved.length) {
          const { data: deletedRooms } = await supabase
            .from('classrooms')
            .select('id, name, level')
            .in('id', unresolved);
          const activeList = allActiveRooms || [];
          (deletedRooms || []).forEach(dr => {
            const sanitizedName = sanitizeClassroomDisplayName(dr.name);
            const sanitizedLevel = sanitizeClassroomDisplayName(dr.level);
            const canon = findCanonicalClassroom(sanitizedLevel || sanitizedName);
            let target = null;
            if (canon) {
              target = activeList.find(ar => {
                const ca = findCanonicalClassroom(ar.level || ar.name);
                return ca && ca.id === canon.id;
              });
            }
            if (!target) {
              const spec = findSpecialClassroom(sanitizedName) || findSpecialClassroom(sanitizedLevel);
              if (spec) {
                target = activeList.find(ar =>
                  !!findSpecialClassroom(ar.name) || !!findSpecialClassroom(ar.level) ||
                  String(ar.name) === spec.displayName || String(ar.level) === spec.key
                );
              }
            }
            if (target) {
              classroomMap[dr.id] = {
                id: target.id,
                name: formatClassroomFullName(target.name, target.level),
                level: target.level,
              };
            } else {
              classroomMap[dr.id] = {
                id: dr.id,
                name: formatClassroomFullName(sanitizedName, sanitizedLevel),
                level: sanitizedLevel || dr.level,
              };
            }
          });
        }
        enrichedStudents = enrichedStudents.map(s => {
          if (!s.classroom_id) return { ...s, classrooms: null };
          const mapped = classroomMap[s.classroom_id] || null;
          if (!mapped) return { ...s, classrooms: null };
          return {
            ...s,
            classrooms: {
              id: mapped.id,
              name: formatClassroomFullName(mapped.name, mapped.level),
              level: mapped.level,
            },
          };
        });
      }

      this._allStudents = enrichedStudents;
      this._page = 1;
      await this._loadAttendance(this._allStudents);
      this._renderPage(query);
    } catch (e) {
      console.error('Error loadStudents:', e);
      if (tbody) tbody.innerHTML = '<tr><td colspan="6">' + Helpers.errorState('Error al cargar datos') + '</td></tr>';
      if (grid) grid.innerHTML = `<div class="col-span-full">${Helpers.errorState('Error al cargar datos')}</div>`;
    }
  },

  async printAllCarnets() {
    const students = this._allStudents || [];
    const formattedStudents = students.map(s => ({
      name: s.name,
      matricula: s.matricula,
      classroom: s.classrooms?.name || '',
      nivel:     s.classrooms?.level || s.level || '',
      p1_name:   s.p1_name || '',
      p2_name:   s.p2_name || '',
      p1_phone:  s.p1_phone || '',
      p2_phone:  s.p2_phone || '',
      _parentName:  s._parentName || '',
      _parentPhone: s._parentPhone || '',
      student_id:   s.id || '',
      is_active:    s.is_active !== false
    }));
    await Helpers.printAllCarnets(formattedStudents);
  },

  async _deleteStudent(id, name) {
    const ok = confirm(`\u00bfEst\u00e1s seguro de eliminar al estudiante "${name}"?\n\nEsta acci\u00f3n no se puede deshacer.`);
    if (!ok) return;

    try {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      Helpers.toast('Estudiante eliminado correctamente', 'success');
      await this.loadStudents();
    } catch (e) {
      Helpers.toast('Error al eliminar: ' + e.message, 'error');
    }
  },

  async openModal(studentId = null) {
    const { StudentRecordModal } = await import('../../shared/student-record-modal.js');
    StudentRecordModal.open(studentId ? 'edit' : 'new', studentId ? String(studentId) : null);
  },

  async saveStudent() {
    const btn = document.getElementById('btnSaveStudentModal');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Guardando...'; if(window.lucide) window.lucide.createIcons(); }

    // Leer valores directamente del DOM \u2014 usar querySelector como fallback
    const gc = document.getElementById('globalModalContainer');
    const getVal = (id) => (gc?.querySelector('#' + id) || document.getElementById(id))?.value?.trim() || '';
    const getChecked = (id) => (gc?.querySelector('#' + id) || document.getElementById(id))?.checked ?? true;

    const id         = getVal('stId');
    const name       = getVal('stName');
    const emailUser  = getVal('stEmailUser');
    const password   = getVal('stPassword');
    const avatarFile = (gc?.querySelector('#stAvatarFile') || document.getElementById('stAvatarFile'))?.files?.[0];

    // Leer parent_id heredado del hermano seleccionado
    const sibSel = gc?.querySelector('#stSiblingId') || document.getElementById('stSiblingId');
    const sibOpt = sibSel?.options[sibSel?.selectedIndex];
    const inheritedParentId = (sibSel?.value && sibOpt?.dataset?.parentId) ? sibOpt.dataset.parentId : null;

    if (!name || name.length < 2) {
      Helpers.toast('El nombre del estudiante es obligatorio', 'warning');
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar Estudiante'; }
      return;
    }

    // Build payload with only columns that exist in the DB
    // Only include fields with actual values to avoid 42703 on missing columns
    const payload = {
      name,
      is_active:   getChecked('stActive'),
      start_date:  getVal('stJoinedDate') || new Date().toISOString().split('T')[0],
      monthly_fee: parseFloat(getVal('stMonthlyFee') || '0') || 0,
      due_day:     parseInt(getVal('stDueDay') || '5') || 5
    };

    // Optional columns \u2014 only add if non-empty
    const optionals = {
      matricula:         getVal('stMatricula') || null,
      classroom_id:      getVal('stClassroom') ? parseInt(getVal('stClassroom'), 10) : null,
      blood_type:        getVal('stBlood') || null,
      allergies:         getVal('stAllergies') || null,
      authorized_pickup: getVal('stPickup') || null,
      p1_name:           getVal('p1Name') || null,
      p1_phone:          getVal('p1Phone') || null,
      p1_email:          getVal('stEmailNotif') || null,
      p1_job:            getVal('p1Profession') || null,
      p1_address:        getVal('p1Address') || null,
      p1_emergency_contact: getVal('p1Emergency') || null,
      p2_name:           getVal('p2Name') || null,
      p2_phone:          getVal('p2Phone') || null,
      p2_job:            getVal('p2Profession') || null,
      p2_address:        getVal('p2Address') || null,
    };
    for (const [k, v] of Object.entries(optionals)) {
      if (v !== null && v !== '') payload[k] = v;
    }
    try {
      // 1. Subir avatar si existe
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop();
        const path = `students/${Date.now()}_${Math.random().toString(36).substr(2,9)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('karpus-uploads').upload(path, avatarFile);
        if (upErr) throw upErr;
        const { data } = supabase.storage.from('karpus-uploads').getPublicUrl(path);
        payload.avatar_url = data.publicUrl;
      }

      // 2. Manejar creaci\u00f3n/vinculaci\u00f3n de padre
      if (emailUser && (password || !id)) {
        let parentId = null;
        
        // Buscar si el perfil ya existe
        const { data: existingProf } = await supabase.from('profiles').select('id').eq('email', emailUser).maybeSingle();
        
        if (existingProf) {
          parentId = existingProf.id;
          Helpers.toast('Vinculando con usuario existente', 'info');
        } else if (password) {
          // Crear nuevo usuario con cliente temporal para no cerrar sesi\u00f3n actual
          const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
          });
          const { data: authData, error: authError } = await tempClient.auth.signUp({
            email: emailUser, password,
            options: {
              data: { name: payload.p1_name || 'Padre', role: 'padre' },
              emailRedirectTo: null
            }
          });

          if (authError) throw authError;
          if (authData?.user) {
            parentId = authData.user.id;
            // Crear perfil manualmente para asegurar rol y datos
            await supabase.from('profiles').upsert({ 
              id: parentId, 
              name: payload.p1_name || 'Padre de ' + payload.name, 
              email: emailUser, 
              phone: payload.p1_phone, 
              role: 'padre' 
            });
          }
        }

        if (parentId) payload.parent_id = parentId;
      }

      // Si se seleccionó hermano, heredar su parent_id (sobrescribe cualquier otro)
      if (inheritedParentId && !id) {
        payload.parent_id = inheritedParentId;
      }

      // 3. Guardar Estudiante
      if (id) {
        const numId = parseInt(id, 10);
        const { error } = await supabase.from('students').update(payload).eq('id', numId);
        if (error) throw error;
        Helpers.toast('Estudiante actualizado correctamente');
      } else {
        const { error } = await supabase.from('students').insert([payload]);
        if (error) throw error;
        Helpers.toast('Estudiante registrado correctamente');
      }

      window._closeAsistenteModal?.();
      await this.loadStudents();
    } catch (err) {
      Helpers.toast('Error: ' + (err.message || 'No se pudo guardar'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar Estudiante'; if(window.lucide) lucide.createIcons(); }
    }
  },

  async deleteStudent(id, name) {
    const ok = await (window._karpusConfirmDelete || ((t) => Promise.resolve(confirm(t))))(`\u00bfEliminar a ${name}?`, 'Esta acci\u00f3n no se puede deshacer.');
    if (!ok) return;
    try {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      Helpers.toast('Estudiante eliminado correctamente');
      await this.loadStudents();
    } catch (e) {
      Helpers.toast('Error al eliminar: ' + e.message, 'error');
    }
  }
};
