import { DirectorApi } from './api.js';
import { Helpers } from '../shared/helpers.js';
import { UI } from './ui.module.js';
import { AppState } from './state.js';
import { supabase, createClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../shared/supabase.js';
import { auditLog } from '../shared/db-utils.js';
import { QueryCache } from '../shared/query-cache.js';
import { RealtimeManager } from '../shared/realtime-manager.js';
import { findCanonicalClassroom } from '../shared/constants.js';

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
      if (!dashboardData?.stats) {
        const { DashboardService } = await import('./dashboard.service.js');
        dashboardData = await DashboardService.getFullData();
      }
      if (!dashboardData?.stats) dashboardData = { stats: {} }; // fallback seguro

      const kpis = dashboardData.stats;

      // 3. Promedio general (rendimiento académico global)
      const avgGrade = await this._loadAvgGrade();

      // 4. Actualizar tarjetas KPI
      const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
      
      setTxt('totalStudents', count || kpis.students || 0);
      setTxt('activeStudents', kpis.active || 0);
      setTxt('incidents', kpis.pendingInquiries || 0);
      setTxt('classroomsCount', kpis.classrooms || 0);
      setTxt('avgGrade', avgGrade);
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
          const label = btnToggleView.querySelector('[data-stu-view-label]');
          if (label) label.textContent = _view === 'grid' ? 'Ver tabla' : 'Ver tarjetas';
          btnToggleView.innerHTML = `<i data-lucide="${_view === 'grid' ? 'table' : 'layout-grid'}"></i> ` +
            `<span data-stu-view-label>${_view === 'grid' ? 'Ver tabla' : 'Ver tarjetas'}</span>`;
          if (window.lucide) lucide.createIcons();
          
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

  // Promedio general de rendimiento (0-100) basado en las evaluaciones activas
  async _loadAvgGrade() {
    try {
      const { buildScoresMap, moduleAvg, avgOf } = await import('../shared/eval-utils.js');
      const safe = r => r.status === 'fulfilled' ? r.value : { data: [] };
      const [modRes, actRes, scoreRes, studRes] = await Promise.allSettled([
        supabase.from('eval_modules').select('id,area_id,period_id,name,eval_type,config').is('deleted_at', null).limit(2000),
        supabase.from('eval_activities').select('id,module_id,name').is('deleted_at', null).limit(5000),
        supabase.from('eval_scores').select('module_id,activity_id,student_id,value,stars,level,yesno,checklist,rubric').limit(20000),
        supabase.from('students').select('id,is_active').is('deleted_at', null).limit(2000)
      ]);

      const modules = safe(modRes).data || [];
      const activities = safe(actRes).data || [];
      const scores = safe(scoreRes).data || [];
      const students = safe(studRes).data || [];

      const actsByModule = new Map();
      activities.forEach(a => {
        if (!actsByModule.has(a.module_id)) actsByModule.set(a.module_id, []);
        actsByModule.get(a.module_id).push(a);
      });

      const scoreMap = buildScoresMap(scores, activities);
      const studentAvgs = [];
      students.filter(s => s.is_active !== false).forEach(st => {
        const vals = [];
        modules.forEach(m => {
          const ma = moduleAvg(m, actsByModule.get(m.id) || [], st.id, scoreMap);
          if (ma != null) vals.push(ma);
        });
        if (vals.length) studentAvgs.push(avgOf(vals));
      });

      const overall = avgOf(studentAvgs);
      return overall == null ? '-' : overall.toFixed(1);
    } catch (_) {
      return '-';
    }
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
      p2_name:   s.p2_name || '',
      p1_phone:  s.p1_phone || '',
      p2_phone:  s.p2_phone || '',
      _parentName:  s._parentName || '',
      _parentPhone: s._parentPhone || '',
      student_id:   s.id || '',
      is_active:    s.is_active !== false
    }));
    await Helpers.printAllCarnets(list);
  },

  render(students) {
    const tableContainer = document.getElementById('studentsTable');
    const gridContainer = document.getElementById('studentsGrid');
    
    if (!students?.length) {
      if (tableContainer) tableContainer.innerHTML = '<tr><td colspan="4"><div class="dc-empty"><i data-lucide="user-x"></i><span>No hay estudiantes para mostrar.</span></div></td></tr>';
      if (gridContainer) gridContainer.innerHTML = '<div class="dc-empty"><i data-lucide="user-x"></i><span>No hay estudiantes para mostrar.</span></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    const pageStudents = students; // Ya vienen paginados desde el servidor
    this._roomsById = this._roomsById || new Map();
    const canonOf = (s) => findCanonicalClassroom(s?.classrooms?.level || s?.classrooms?.name || s?.level_requested || s?.level || '');

    // Render Table
    if (tableContainer) {
      tableContainer.innerHTML = pageStudents.map(s => {
        const canon = canonOf(s);
        const color = canon?.color || '#0B63C7';
        const roomName = s.classrooms?.name || 'Sin aula';
        const avatar = s.avatar_url
          ? `<img src="${Helpers.escapeHTML(s.avatar_url)}" alt="">`
          : `<i data-lucide="user"></i>`;
        return `
        <tr ondblclick="App.students.openModal('${s.id}')" style="cursor:pointer">
          <td>
            <div class="dc-student-top" style="padding-left:.4rem">
              <div class="dc-student-av" style="--room:${color};width:2.6rem;height:2.6rem;font-size:.9rem">${avatar}</div>
              <div class="dc-student-id">
                <span class="dc-student-name">${Helpers.escapeHTML(s.name)}</span>
                <span class="dc-student-mat">${Helpers.escapeHTML(s.matricula || 'Sin matrícula')}</span>
              </div>
            </div>
          </td>
          <td>
            <div class="dc-student-badges" style="margin-top:0">
              <span class="dc-badge ${s.classrooms ? 'dc-badge--room' : 'dc-badge--none'}" style="--room:${color}">
                <i data-lucide="door-open"></i><span>${Helpers.escapeHTML(roomName)}</span>
              </span>
              ${canon ? `<span class="dc-badge dc-badge--room" style="--room:${color}"><i></i><span>Línea ${Helpers.escapeHTML(canon.line)}</span></span>` : ''}
            </div>
          </td>
          <td>
            <span class="dc-badge ${s.is_active ? 'dc-badge--on' : 'dc-badge--off'}">
              <i data-lucide="${s.is_active ? 'check' : 'pause'}"></i>${s.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td>
            <div class="dc-student-actions" style="justify-content:flex-end">
              <button class="dc-icon-btn" onclick="event.stopPropagation();App.students.openModal('${s.id}')" title="Editar">
                <i data-lucide="pencil"></i>
              </button>
              <button class="dc-icon-btn dc-icon-btn--danger" onclick="event.stopPropagation();App.students.delete('${s.id}')" title="Eliminar">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // Render tarjetas (contenedores con borde y color de línea del aula)
    if (gridContainer) {
      gridContainer.innerHTML = pageStudents.map(s => {
        const canon = canonOf(s);
        const color = canon?.color || '#0B63C7';
        const roomName = s.classrooms?.name || 'Sin aula';
        const avatar = s.avatar_url
          ? `<img src="${Helpers.escapeHTML(s.avatar_url)}" alt="">`
          : `<i data-lucide="user"></i>`;
        return `
        <article class="dc-student ${s.is_active ? '' : 'dc-student--off'}" style="--room:${color}"
          onclick="App.students.openModal('${s.id}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.students.openModal('${s.id}')}"
          tabindex="0" role="button" aria-label="Abrir ficha de ${Helpers.escapeHTML(s.name || '')}">

          <div class="dc-student-top">
            <div class="dc-student-av">${avatar}</div>
            <div class="dc-student-id">
              <h3 class="dc-student-name">${Helpers.escapeHTML(s.name)}</h3>
              <span class="dc-student-mat">${Helpers.escapeHTML(s.matricula || 'Sin matrícula')}</span>
              <div class="dc-student-badges">
                <span class="dc-badge ${s.classrooms ? 'dc-badge--room' : 'dc-badge--none'}">
                  <i data-lucide="door-open"></i><span>${Helpers.escapeHTML(roomName)}</span>
                </span>
                ${canon ? `<span class="dc-badge dc-badge--room"><i></i><span>Línea ${Helpers.escapeHTML(canon.line)}</span></span>` : ''}
                <span class="dc-badge ${s.is_active ? 'dc-badge--on' : 'dc-badge--off'}">
                  <i data-lucide="${s.is_active ? 'check' : 'pause'}"></i>${s.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          </div>

          <div class="dc-student-stats">
            <div class="dc-student-stat">
              <span class="dc-student-stat-k">Nivel</span>
              <span class="dc-student-stat-v" style="color:var(--room)">${Helpers.escapeHTML(s.classrooms?.level || canon?.line || '—')}</span>
            </div>
            <div class="dc-student-stat">
              <span class="dc-student-stat-k">Edad</span>
              <span class="dc-student-stat-v">${s.age != null ? Helpers.escapeHTML(String(s.age)) + ' ' + Helpers.escapeHTML(s.age_type || 'años') : '—'}</span>
            </div>
          </div>

          <div class="dc-student-foot">
            <span class="dc-student-parent" title="${Helpers.escapeHTML(roomName)}">
              <i data-lucide="door-open"></i><span>${Helpers.escapeHTML(roomName)}</span>
            </span>
            <div class="dc-student-actions">
              <button class="dc-icon-btn" onclick="event.stopPropagation();App.students.openModal('${s.id}')" title="Editar">
                <i data-lucide="pencil"></i>
              </button>
              <button class="dc-icon-btn dc-icon-btn--danger" onclick="event.stopPropagation();App.students.delete('${s.id}')" title="Eliminar">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
        </article>`;
      }).join('');
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
    const raw = AppState.get('students');
    const students = Array.isArray(raw) ? raw : [];
    // Map them to the format expected by Helpers.printAllCarnets
    const formattedStudents = students.map(s => ({
      name:      s.name || '',
      matricula: s.matricula || '',
      classroom: s.classrooms?.name || s.classroom_name || '',
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
