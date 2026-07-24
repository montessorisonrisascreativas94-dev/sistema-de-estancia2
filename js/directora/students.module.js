import { DirectorApi } from './api.js';
import { Helpers } from '../shared/helpers.js';
import { UI } from './ui.module.js';
import { AppState } from './state.js';
import { supabase, createClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../shared/supabase.js';
import { auditLog } from '../shared/db-utils.js';
import { QueryCache } from '../shared/query-cache.js';
import { RealtimeManager } from '../shared/realtime-manager.js';

// Vista activa: 'table' | 'grid'
let _view = 'table';

function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  if (!valid.length) return '-';
  return (valid.reduce((a, b) => a + Number(b), 0) / valid.length).toFixed(1);
}

export const StudentsModule = {
  _realtimeSubscribed: false,

  async init() {
    // ✅ Suscribirse a cambios en tiempo real
    if (!this._realtimeSubscribed) {
      this._subscribeRealtime();
    }
    try {
      if (!this._dirPage) this._dirPage = 1;
      const pageSize = 10;
      const range = { 
        from: (this._dirPage - 1) * pageSize, 
        to: this._dirPage * pageSize - 1 
      };

      // 1. Obtener datos de estudiantes paginados desde el servidor
      const { data: students, error, count } = await DirectorApi.getStudents({}, range);
      if (error) throw error;

      AppState.set('students', students || []);
      this._totalStudentsCount = count || 0;

      // 2. Obtener datos globales del dashboard para KPIs complementarios
      let dashboardData = AppState.get('dashboardData');
      if (!dashboardData) {
        const { DashboardService } = await import('./dashboard.service.js');
        dashboardData = await DashboardService.getFullData();
      }
      
      const kpis = dashboardData?.stats || {}; // DashboardService usa 'stats'

      // 3. Actualizar tarjetas KPI
      const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
      
      setTxt('totalStudents', count || 0);
      setTxt('activeStudents', kpis.active || 0);
      setTxt('incidents', kpis.pendingInquiries || 0);
      setTxt('classroomsCount', kpis.classrooms || 0);
      setTxt('avgAttendance', (kpis.attendance || 0) + '%');

      // 4. Renderizar vista actual
      const tableWrapper = document.getElementById('studentsTableWrapper');
      const gridWrapper = document.getElementById('studentsGrid');
      
      if (_view === 'grid') {
        tableWrapper?.classList.add('hidden');
        gridWrapper?.classList.remove('hidden');
      } else {
        tableWrapper?.classList.remove('hidden');
        gridWrapper?.classList.add('hidden');
      }
      this.render(students);

      // Renderizar paginación
      this._renderDirPagination(this._dirPage, Math.ceil((count || 0) / pageSize), count || 0, students);
      const searchInput = document.getElementById('searchStudent');
      if (searchInput && !searchInput._bound) {
        searchInput._bound = true;
        // FIX debounce: prevent re-render on every keystroke
        searchInput.addEventListener('input', Helpers.debounce(() => this.applyFilters(), 300));
      }

      const filterClassroom = document.getElementById('filterClassroom');
      if (filterClassroom && !filterClassroom._bound) {
        filterClassroom._bound = true;
        // Poblar opciones de aulas
        const { data: rooms } = await DirectorApi.getClassrooms();
        if (rooms) {
          // Limpiar antes de poblar (excepto la opción "Todas")
          filterClassroom.innerHTML = '<option value="all">Todas las aulas</option>';
          rooms.forEach(r => {
            const o = document.createElement('option');
            o.value = r.id; o.textContent = r.name;
            filterClassroom.appendChild(o);
          });
        }
        filterClassroom.addEventListener('change', () => this.applyFilters());
      }

      const filterStatus = document.getElementById('filterStStatus');
      if (filterStatus && !filterStatus._bound) {
        filterStatus._bound = true;
        filterStatus.addEventListener('change', () => this.applyFilters());
      }

      const filterLevel = document.getElementById('filterLevel');
      if (filterLevel && !filterLevel._bound) {
        filterLevel._bound = true;
        // Poblar niveles únicos de los estudiantes
        const levels = [...new Set(students.map(s => s.level).filter(Boolean))];
        if (levels.length) {
          filterLevel.innerHTML = '<option value="all">Todos los niveles</option>';
          levels.forEach(l => {
            const o = document.createElement('option');
            o.value = l; o.textContent = l;
            filterLevel.appendChild(o);
          });
        }
        filterLevel.addEventListener('change', () => this.applyFilters());
      }

      const btnToggleView = document.getElementById('btnToggleStuView');
      if (btnToggleView && !btnToggleView._bound) {
        btnToggleView._bound = true;
        btnToggleView.onclick = () => {
          _view = _view === 'grid' ? 'table' : 'grid';
          btnToggleView.textContent = _view === 'grid' ? 'Tabla' : 'Grid';
          
          const tableWrapper = document.getElementById('studentsTableWrapper');
          const gridWrapper = document.getElementById('studentsGrid');
          
          if (_view === 'grid') {
            tableWrapper?.classList.add('hidden');
            gridWrapper?.classList.remove('hidden');
          } else {
            tableWrapper?.classList.remove('hidden');
            gridWrapper?.classList.add('hidden');
          }
          this.render(AppState.get('students') || []);
        };
      }

      const btnExport = document.getElementById('btnExportStudents');
      if (btnExport && !btnExport._bound) {
        btnExport._bound = true;
        btnExport.onclick = () => {
          Helpers.toast('Generando lista...', 'info');
          Helpers.exportToCSV(AppState.get('students') || [], 'Estudiantes.csv');
        };
      }

      const btnAdd = document.getElementById('btnAddStudent');
      if (btnAdd && !btnAdd._bound) {
        btnAdd._bound = true;
        btnAdd.onclick = () => this.openModal();
      }

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      const container = document.getElementById('studentsTable') || document.getElementById('studentsGrid');
      if (container) {
        container.innerHTML = '<div class="col-span-3 text-center p-8">' + Helpers.errorState('Error al cargar estudiantes', 'App.students.init()') + '</div>';
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  _subscribeRealtime() {
    this._realtimeSubscribed = true;
    
    RealtimeManager.subscribe('directora-students', (channel) => {
      channel
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'students' },
          () => {
            this.init();
          }
        );
    });
  },

  async printAllCarnets() {
    Helpers.toast('Generando carnets...', 'info');
    const students = AppState.get('students') || [];
    if (!students.length) { Helpers.toast('Sin estudiantes para imprimir', 'warning'); return; }
    const list = students.map(s => ({
      name:      s.name || '',
      matricula: s.matricula || '',
      classroom: s.classrooms?.name || s.classroom_name || '',
      nivel:     s.classrooms?.level || s.level || '',
      p1_name:   s.p1_name || '',
      p2_name:   s.p2_name || ''
    }));
    await Helpers.printAllCarnets(list);
  },

  render(students) {
    const tableContainer = document.getElementById('studentsTable');
    const gridContainer = document.getElementById('studentsGrid');
    
    if (!students?.length) {
      if (tableContainer) tableContainer.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-500">No hay estudiantes.</td></tr>';
      if (gridContainer) gridContainer.innerHTML = '<div class="col-span-3 text-center py-8 text-slate-500">No hay estudiantes.</div>';
      return;
    }

    const pageStudents = students; // Ya vienen paginados desde el servidor

    // Render Table
    if (tableContainer) {
      tableContainer.innerHTML = pageStudents.map(s => `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer" ondblclick="App.students.openModal('${s.id}')">
          <td class="p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-[#E8F2FF] flex items-center justify-center text-sm font-black text-[#0B63C7] overflow-hidden">
                ${s.avatar_url ? `<img src="${s.avatar_url}" class="w-full h-full object-cover">` : (s.name || '?').charAt(0)}
              </div>
              <div>
                <div class="font-bold text-slate-800">${Helpers.escapeHTML(s.name)}</div>
                <div class="text-[10px] text-slate-400 font-black uppercase tracking-widest">${s.matricula || 'SIN MATRÍCULA'}</div>
              </div>
            </div>
          </td>
          <td class="p-4 text-sm font-medium text-slate-600">
            <span class="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black uppercase text-slate-500">
              ${Helpers.escapeHTML(s.classrooms?.name || 'No asignada')}
            </span>
          </td>
          <td class="p-4">
            <span class="px-3 py-1 ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} rounded-full text-[10px] font-black uppercase tracking-widest">
              ${s.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td class="p-4 text-right">
            <div class="flex justify-end gap-2">
              <button onclick="App.students.openModal('${s.id}')" class="w-9 h-9 flex items-center justify-center bg-[#E8F2FF] text-[#0B63C7] hover:bg-[#0B63C7] hover:text-white rounded-xl transition-all shadow-sm" title="Editar">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="App.students.delete('${s.id}')" class="w-9 h-9 flex items-center justify-center bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl transition-all shadow-sm" title="Eliminar">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>`).join('');
    }

    // Render Grid
    if (gridContainer) {
      gridContainer.innerHTML = pageStudents.map(s => `
        <div class="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div class="absolute top-0 right-0 w-24 h-24 bg-[#E8F2FF] rounded-bl-[4rem] -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          
          <div class="flex items-start gap-4 mb-4 relative">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0B63C7] to-[#0850A0] flex items-center justify-center shadow-lg shadow-blue-100">
              <i data-lucide="user" class="w-8 h-8 text-white"></i>
            </div>
            <div class="flex-1">
              <h3 class="font-black text-slate-800 text-lg leading-tight mb-1">${Helpers.escapeHTML(s.name)}</h3>
              <p class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <i data-lucide="home" class="w-3 h-3"></i> ${s.classrooms?.name || 'Sin Aula'}
              </p>
            </div>
            <div class="flex flex-col gap-1">
               <span class="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
                 ${s.is_active ? 'Activo' : 'Inactivo'}
               </span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 mb-6 relative">
            <div class="bg-slate-50 p-3 rounded-2xl">
              <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Promedio</p>
              <p class="text-xl font-black text-[#0B63C7]">${s.average_grade || '-'}</p>
            </div>
            <div class="bg-slate-50 p-3 rounded-2xl">
              <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Asistencia</p>
              <p class="text-xl font-black text-emerald-600">${s.attendance || 0}%</p>
            </div>
          </div>

          <div class="flex items-center justify-between pt-4 border-t border-slate-50">
            <div class="flex -space-x-2">
               <div class="w-8 h-8 rounded-full border-2 border-white bg-blue-100 flex items-center justify-center text-[10px]" title="Padre: ${Helpers.escapeHTML(s.p1_name || 'N/A')}"><i data-lucide="user" class="w-3.5 h-3.5 text-blue-500"></i></div>
            </div>
            <div class="flex gap-2">
              <button onclick="App.students.openModal('${s.id}')" class="p-2.5 bg-slate-100 text-slate-600 hover:bg-[#0B63C7] hover:text-white rounded-xl transition-all">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="App.students.delete('${s.id}')" class="p-2.5 bg-slate-100 text-slate-600 hover:bg-rose-600 hover:text-white rounded-xl transition-all">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        </div>`).join('');
    }

    if (window.lucide) lucide.createIcons();
  },

  _renderDirPagination(page, totalPages, total, students) {
    let container = document.getElementById('dirStudentsPagination');
    if (!container) {
      const tableWrapper = document.getElementById('studentsTableWrapper');
      const gridWrapper = document.getElementById('studentsGrid');
      const parent = tableWrapper || gridWrapper?.parentElement;
      if (!parent) return;
      container = document.createElement('div');
      container.id = 'dirStudentsPagination';
      parent.insertAdjacentElement('afterend', container);
    }
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    const start = (page - 1) * 10 + 1;
    const end = Math.min(page * 10, total);
    container.className = 'flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white rounded-b-3xl';
    container.innerHTML = `
      <span class="text-xs font-bold text-slate-400">${start}–${end} de ${total} estudiantes</span>
      <div class="flex gap-2">
        <button id="dirBtnPrev" class="px-3 py-1.5 text-xs font-black rounded-xl border border-slate-200 text-slate-500 hover:bg-[#E8F2FF] hover:border-blue-300 hover:text-[#0B63C7] transition-all disabled:opacity-40 disabled:cursor-not-allowed" ${page <= 1 ? 'disabled' : ''}>← Ant</button>
        <span class="px-3 py-1.5 text-xs font-black text-[#0B63C7] bg-[#E8F2FF] rounded-xl">${page} / ${totalPages}</span>
        <button id="dirBtnNext" class="px-3 py-1.5 text-xs font-black rounded-xl border border-slate-200 text-slate-500 hover:bg-[#E8F2FF] hover:border-blue-300 hover:text-[#0B63C7] transition-all disabled:opacity-40 disabled:cursor-not-allowed" ${page >= totalPages ? 'disabled' : ''}>Sig →</button>
      </div>`;
    document.getElementById('dirBtnPrev')?.addEventListener('click', () => { this._dirPage--; this.init(); });
    document.getElementById('dirBtnNext')?.addEventListener('click', () => { this._dirPage++; this.init(); });
  },

  async applyFilters() {
    this._dirPage = 1;
    const term = document.getElementById('searchStudent')?.value.toLowerCase() || '';
    const classroomId = document.getElementById('filterClassroom')?.value || 'all';
    const status = document.getElementById('filterStStatus')?.value || '';
    // const level = document.getElementById('filterLevel')?.value || 'all'; // Comentado si no se usa

    const filters = {};
    if (term) filters.search = term;
    if (classroomId !== 'all') filters.classroom_id = classroomId;
    if (status) filters.status = status;

    const pageSize = 10;
    const range = { from: 0, to: pageSize - 1 };

    UI.setLoading(true);
    try {
      const { data, count } = await DirectorApi.getStudents(filters, range);
      this._totalStudentsCount = count || 0;
      this.render(data);
      this._renderDirPagination(1, Math.ceil((count || 0) / pageSize), count || 0, data);
    } catch (e) {
      Helpers.toast('Error al filtrar', 'error');
    } finally {
      UI.setLoading(false);
    }
  },

  async save() {
    const id = document.getElementById('stId')?.value;
    const payload = this.getFormData();
    
    // Capturar datos de Auth para nuevo estudiante
    const emailUser = document.getElementById('stEmailUser')?.value?.trim();
    const password = document.getElementById('stPassword')?.value?.trim();

    if (!payload.name || payload.name.trim().length < 3) return Helpers.toast('Nombre inválido (min 3 caracteres)', 'warning');
    
    UI.setLoading(true);
    try {
      let res;
      if (id) {
        // Limpiar campos auxiliares que no existen en la DB
        const { _inheritedParentId, ...cleanPayload } = payload;
        res = await DirectorApi.updateStudent(id, cleanPayload);
        if (res?.error && (res.error.message?.includes('classroom_id') || res.error.code === '42703')) {
          const { classroom_id, ...payloadWithout } = cleanPayload;
          res = await DirectorApi.updateStudent(id, payloadWithout);
        }
      } else {
        // Extraer y limpiar el campo auxiliar antes de enviar a DB
        const inheritedParentId = payload._inheritedParentId;
        delete payload._inheritedParentId;

        // Si se seleccionó un hermano, heredar su parent_id directamente
        if (inheritedParentId) {
          payload.parent_id = inheritedParentId;
          // Validación de padre menos estricta cuando hay hermano
        } else if (emailUser && password) {
          const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
          });

          const { data: authData, error: authError } = await tempClient.auth.signUp({
            email: emailUser,
            password: password,
            options: {
              data: { name: payload.p1_name, role: 'padre', phone: payload.p1_phone },
              emailRedirectTo: null
            }
          });

          let parentId = null;

          if (authError) {
            // User already exists – look up their profile by email
            if (authError.message?.toLowerCase().includes('already registered') ||
                authError.status === 422) {
              const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', emailUser)
                .maybeSingle();
              if (existing?.id) {
                parentId = existing.id;
                Helpers.toast('Usuario ya existe – vinculando al estudiante', 'info');
              } else {
                throw new Error('El correo ya está registrado pero no tiene perfil. Contacta al administrador.');
              }
            } else {
              throw authError;
            }
          } else if (authData?.user) {
            parentId = authData.user.id;
          }

          if (parentId) {
            payload.parent_id = parentId;
            // Upsert profile to ensure role is set correctly
            await supabase.from('profiles').upsert({
              id:    parentId,
              name:  payload.p1_name,
              email: emailUser,
              phone: payload.p1_phone,
              role:  'padre'
            }, { onConflict: 'id' });
          }
        }

        // Validar que el padre quedó asignado
        if (!payload.parent_id && !inheritedParentId) {
          // Si no se eligió hermano ni usuario, aún puede crear sin parent_id (padre se asignará luego)
        }
        
        res = await DirectorApi.createStudent(payload);
        // Si falla por classroom_id, reintentar sin esa columna
        if (res?.error && (res.error.message?.includes('classroom_id') || res.error.code === '42703')) {
          const { classroom_id, _inheritedParentId: _aux, ...payloadWithout } = payload;
          res = await DirectorApi.createStudent(payloadWithout);
        }
      }
      
      const { error } = res || {};
      if (error) {
        const msg = typeof error === 'string' ? error : (error.message || error.details || JSON.stringify(error));
        throw new Error(msg);
      }
      
      Helpers.toast(id ? 'Estudiante actualizado' : 'Estudiante creado', 'success');
      UI.closeModal();
      QueryCache.invalidate('dir_students');
      this.init();
    } catch (e) {
      Helpers.toast('Error al guardar: ' + (e.message || e), 'error');
    } finally {
      UI.setLoading(false);
    }
  },

  async printAllCarnets() {
    // Get students from AppState
    const students = AppState.get('students') || [];
    // Map them to the format expected by Helpers.printAllCarnets
    const formattedStudents = students.map(s => ({
      name: s.name,
      matricula: s.matricula,
      classroom: s.classrooms?.name || '',
      nivel:     s.classrooms?.level || s.level || '',
      p1_name:   s.p1_name || '',
      p2_name:   s.p2_name || ''
    }));
    await Helpers.printAllCarnets(formattedStudents);
  },

  async delete(id) {
    const student = (AppState.get('students') || []).find(s => String(s.id) === String(id));
    const name = student?.name || 'este estudiante';
    const ok = window.confirm(`¿Eliminar a "${name}"?\n\nEsta acción no se puede deshacer. Se perderán todos los datos del estudiante.`);
    if (!ok) return;
    UI.setLoading(true);
    try {
      const res = await DirectorApi.deleteStudent(id);
      const { error } = res || {};
      if (error) throw new Error(typeof error === 'string' ? error : (error.message || JSON.stringify(error)));
      Helpers.toast('Estudiante eliminado correctamente', 'success');
      QueryCache.invalidate('dir_students');
      this.init();
    } catch (e) {
      Helpers.toast('Error al eliminar: ' + (e.message || e), 'error');
    } finally {
      UI.setLoading(false);
    }
  },

  getFormData() {
    const v = (id) => document.getElementById(id)?.value?.trim() || null;
    const n = (id, def = null) => { const val = parseFloat(document.getElementById(id)?.value); return isNaN(val) ? def : val; };
    const i = (id, def = 5) => { const val = parseInt(document.getElementById(id)?.value); return isNaN(val) ? def : val; };

    // Si se seleccionó un hermano, heredar el parent_id de ese estudiante
    const siblingId = v('stSiblingId');
    let inheritedParentId = null;
    if (siblingId) {
      const sibSel = document.getElementById('stSiblingId');
      const opt = sibSel?.options[sibSel?.selectedIndex];
      inheritedParentId = opt?.dataset?.parentId || null;
    }

    return {
      name:                  v('stName'),
      matricula:             v('stMatricula') || null,
      classroom_id:          v('stClassroom') ? parseInt(v('stClassroom')) : null,
      age:                   i('stAge', null),
      age_type:              v('stAgeType') || 'años',
      schedule:              v('stHorario'),
      start_date:            v('stJoinedDate') || new Date().toISOString().split('T')[0],
      is_active:             document.getElementById('active')?.checked ?? true,
      blood_type:            v('bloodType'),
      allergies:             v('allergies'),
      authorized_pickup:     v('authorized'),
      authorized_pickup_phone: v('authorizedPhone'),
      p1_name:               v('p1Name'),
      p1_phone:              v('p1Phone'),
      p1_job:                v('p1Profession'),
      p1_address:            v('p1Address'),
      p1_emergency_contact:  v('p1Emergency'),
      p1_email:              v('stEmailNotif'),
      p2_name:               v('p2Name'),
      p2_phone:              v('p2Phone'),
      p2_job:                v('p2Profession'),
      p2_address:            v('p2Address'),
      monthly_fee:           n('monthlyFee', 0),
      prolongado_fee:        n('prolongadoFee', 0),
      due_day:               i('dueDay', 5),
      payment_plan:          v('paymentPlan') || 'monthly',
      // Si hay hermano seleccionado, el parent_id se fuerza en save()
      _inheritedParentId:    inheritedParentId
    };
  },

  async openModal(id = null) {
    const { StudentRecordModal } = await import('../shared/student-record-modal.js');
    StudentRecordModal.open(id ? 'edit' : 'new', id ? String(id) : null);
  }
};
