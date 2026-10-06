import { supabase } from '../../shared/supabase.js';
import { Helpers } from '../../shared/helpers.js';
import {
  CANONICAL_CLASSROOMS,
  SPECIAL_CLASSROOMS,
  SPECIAL_CLASSROOMS_META,
  findCanonicalClassroom,
  findSpecialClassroom,
  validateAgeForClassroom,
  suggestClassroomByAge,
  ageInDays,
  dedupeClassrooms,
  sanitizeClassroomDisplayName,
  formatClassroomFullName,
} from '../../shared/constants.js';

export const RoomsModule = {
  _view: 'table',
  _toggleBound: false,

  _loadView() {
    this._view = 'table';
    try {
      const v = localStorage.getItem('asis_rooms_view');
      if (v === 'grid' || v === 'table') this._view = v;
    } catch (_) {}
  },

  _saveView() {
    try { localStorage.setItem('asis_rooms_view', this._view); } catch (_) {}
  },

  _paintToggle() {
    const btn = document.getElementById('btnToggleRoomsView');
    if (!btn) return;
    const isGrid = this._view === 'grid';
    btn.innerHTML = `<i data-lucide="${isGrid ? 'table' : 'layout-grid'}" class="w-4 h-4"></i>` +
      `<span data-rooms-view-label>${isGrid ? 'Ver tabla' : 'Ver tarjetas'}</span>`;
    btn.setAttribute('aria-pressed', String(isGrid));
  },

  _applyView() {
    const table = document.getElementById('roomsTableWrapper');
    const grid = document.getElementById('roomsGrid');
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
    this._loadView();
    this._bindToggle();
    this._applyView();
    await this.loadRooms();
    this.setupListeners();
  },

  _bindToggle() {
    if (this._toggleBound) return;
    const btn = document.getElementById('btnToggleRoomsView');
    if (!btn) return;
    this._toggleBound = true;
    btn.addEventListener('click', () => {
      this._view = this._view === 'grid' ? 'table' : 'grid';
      this._saveView();
      this._applyView();
      this.loadRooms();
    });
  },

  setupListeners() {
    if (this._listenersBound) return;
    this._listenersBound = true;

    const btnAdd = document.getElementById('btnAddRoom');
    if (btnAdd) btnAdd.onclick = () => this.openModal();

    const btnSave = document.getElementById('btnSaveRoom');
    if (btnSave) btnSave.onclick = () => this.saveRoom();

    const close = () => this.closeModal();
    document.getElementById('btnCancelRoom')?.addEventListener('click', close);
    document.getElementById('btnCancelRoom2')?.addEventListener('click', close);

    // Cerrar al hacer clic fuera del contenido del modal
    const modal = document.getElementById('roomModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });
    }
  },

  async loadRooms() {
    const tbody = document.getElementById('roomsTable');
    const grid = document.getElementById('roomsGrid');
    if (!tbody && !grid) return;
    this._applyView();

    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mx-auto"></div></td></tr>';
    if (grid) grid.innerHTML = `<div class="col-span-full py-8 text-center"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mx-auto"></div></div>`;

    try {
      const { data: rawRoomsRaw, error } = await supabase
        .from('classrooms')
        .select('id, name, level, capacity, teacher:teacher_id(name), students(count), teacher_id, is_special, is_live, color')
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;

      // ==========================================================
      // SANITIZAR + NORMALIZAR para dedupeClassrooms
      // ==========================================================
      const rawRooms = (rawRoomsRaw || []).map((r) => {
        const n = sanitizeClassroomDisplayName(r.name);
        const l = sanitizeClassroomDisplayName(r.level);
        const canon = findCanonicalClassroom(l || n);
        const special = canon ? null : (findSpecialClassroom(n) || findSpecialClassroom(l));
        const studentCount = r.students?.[0]?.count || 0;
        return {
          ...r,
          name:  canon?.displayLevel || special?.displayName || n,
          level: canon?.level || special?.key || l,
          color: r.color || canon?.color || special?.color || '#0B63C7',
          capacity: r.capacity || canon?.capacity || 20,
          student_count: studentCount,
          __students: r.students,
        };
      });

      // ==========================================================
      // DEDUPLICACIÓN OFICIAL (constants.js)
      // ==========================================================
      let rooms = dedupeClassrooms(rawRooms).map((r) => {
        // Restaurar estructura students: [ { count } ] (como Supabase la devuelve)
        const count = typeof r.student_count === 'number' ? r.student_count : (r.__students?.[0]?.count || 0);
        return {
          ...r,
          students: [{ count }],
          name: formatClassroomFullName(r.name, r.level),
        };
      });

      // Inyectar clases especiales que no estén aún en la BD (fallback)
      SPECIAL_CLASSROOMS_META.forEach((meta) => {
        const exists = rooms.some((r) => {
          const k = r.level || r.name || '';
          return !!findSpecialClassroom(k)
            || k === meta.key
            || String(r.name) === meta.displayName
            || String(r.name) === meta.key;
        });
        if (!exists) {
          rooms.push({
            id: null,
            isSpecial: true,
            name: meta.displayName,
            level: meta.key,
            capacity: 20,
            teacher: { name: '' },
            students: [{ count: 0 }],
            __meta: meta,
          });
        }
      });

      if (!rooms || rooms.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400">No hay aulas registradas.</td></tr>';
        if (grid) grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 font-bold text-sm">No hay aulas registradas.</div>`;
        return;
      }

      const meta = (r) => {
        const count = r.students?.[0]?.count || 0;
        const cap = r.capacity || 20;
        const pct = cap > 0 ? Math.round((count / cap) * 100) : 0;
        const barColor = pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
        const canon = findCanonicalClassroom(r.level || r.name);
        const special = canon ? null : findSpecialClassroom(r.name) || findSpecialClassroom(r.level);
        return { count, cap, pct, barColor, canon, special };
      };

      if (tbody) {
        tbody.innerHTML = rooms.map(r => {
          const { count, cap, pct, barColor, special } = meta(r);
          const specialBadge = special
            ? `<span class="ml-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider" style="background:${special.color}22;color:${special.color}">${special.emoji || '★'} especial</span>`
            : '';
          return `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors cursor-pointer" ondblclick="window.App.rooms.openModal('${r.id || ''}')">
              <td class="px-4 py-3 font-bold text-slate-800 text-sm">${Helpers.escapeHTML(r.name)}${specialBadge}</td>
              <td class="px-4 py-3 text-slate-500 text-sm hidden md:table-cell">${Helpers.escapeHTML(r.teacher?.name || 'Sin asignar')}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-slate-100 rounded-full h-2 max-w-[80px]">
                    <div class="${barColor} h-full rounded-full" style="width:${Math.min(pct, 100)}%"></div>
                  </div>
                  <span class="text-xs font-bold text-slate-500">${count}/${cap}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-center">
                <span class="px-2 py-1 rounded-full text-[10px] font-bold ${pct < 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
                  ${pct < 100 ? 'Disponible' : 'Llena'}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-1">
                  ${r.id ? `
                  <button onclick="event.stopPropagation(); window.App.rooms.openModal('${r.id}')" class="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg">
                    <i data-lucide="edit-3" class="w-4 h-4"></i>
                  </button>
                  <button onclick="event.stopPropagation(); window.App.rooms.deleteRoom('${r.id}', '${Helpers.escapeHTML(r.name)}')" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>` : '<span class="text-[10px] text-slate-400 font-bold px-2">Fallback · sin registrar</span>'}
                </div>
              </td>
            </tr>`;
        }).join('');
      }

      if (grid) {
        grid.innerHTML = rooms.map(r => {
          const { count, cap, pct, barColor, canon, special } = meta(r);
          const accent = special?.color || canon?.color || '#14B8A6';
          const teacher = r.teacher?.name || '';
          const initial = (teacher.trim()[0] || '?').toUpperCase();
          const openId = r.id || '';
          return `
            <article class="bg-white rounded-3xl border-2 border-slate-100 shadow-sm hover:shadow-md hover:border-teal-200 transition-all overflow-hidden cursor-pointer group"
              ${openId ? `onclick="window.App.rooms.openModal('${openId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.App.rooms.openModal('${openId}')}" tabindex="0"` : ''}
              role="button" aria-label="Abrir aula ${Helpers.escapeHTML(r.name || '')}">

              <div class="h-1.5" style="background:${accent}"></div>

              <div class="p-5 flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="font-black text-slate-700 text-sm truncate group-hover:text-teal-600 transition-colors">${Helpers.escapeHTML(r.name)}</h3>
                    ${special ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0" style="background:${special.color}22;color:${special.color}">${special.emoji || '★'} especial</span>` : ''}
                  </div>
                  <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">${Helpers.escapeHTML(r.level || 'General')}</p>
                </div>
                <div class="flex gap-1 shrink-0">
                  ${openId ? `
                  <button onclick="event.stopPropagation();window.App.rooms.openModal('${openId}')" class="p-1.5 bg-slate-100 text-slate-500 hover:bg-teal-500 hover:text-white rounded-xl transition-all" title="Editar">
                    <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                  </button>
                  <button onclick="event.stopPropagation();window.App.rooms.deleteRoom('${openId}', '${Helpers.escapeHTML(r.name)}')" class="p-1.5 bg-slate-100 text-slate-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all" title="Eliminar">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>` : ''}
                </div>
              </div>

              <div class="px-5 pb-4 space-y-3">
                ${canon ? `<div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${canon.color}"></span>
                  <span class="text-[10px] font-black uppercase tracking-wider text-slate-500">${Helpers.escapeHTML(canon.displayLevel)}</span>
                </div>` : special ? `<div class="flex items-center gap-2">
                  <span class="text-base">${special.emoji || '★'}</span>
                  <span class="text-[10px] font-black uppercase tracking-wider" style="color:${special.color}">${Helpers.escapeHTML(special.displayName)}</span>
                </div>` : ''}

                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Ocupación</span>
                    <span class="text-xs font-black text-slate-600">${count}/${cap}</span>
                  </div>
                  <div class="flex-1 bg-slate-100 rounded-full h-2">
                    <div class="${barColor} h-full rounded-full" style="width:${Math.min(pct, 100)}%"></div>
                  </div>
                  <div class="flex items-center justify-between mt-1">
                    <span class="text-[9px] font-bold text-slate-400">${pct}% ocupado</span>
                    <span class="text-[9px] font-black ${pct < 100 ? 'text-emerald-600' : 'text-rose-600'}">${pct < 100 ? `${cap - count} libres` : 'Sin cupos'}</span>
                  </div>
                </div>
              </div>

              <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2">
                <div class="w-8 h-8 rounded-xl text-white flex items-center justify-center text-xs font-bold shrink-0" style="background:${teacher ? accent : '#CBD5E1'}">${teacher ? Helpers.escapeHTML(initial) : '?'}</div>
                <span class="text-xs font-bold text-slate-600 truncate">${teacher ? Helpers.escapeHTML(teacher) : (r.isSpecial || special ? 'Asignar instructor…' : 'Sin maestra asignada')}</span>
              </div>
            </article>`;
        }).join('');
      }

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error('Error loadRooms:', e);
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8">' + Helpers.errorState('Error al cargar aulas', 'App.rooms.init()') + '</td></tr>';
      if (grid) grid.innerHTML = `<div class="col-span-full py-8 text-center">${Helpers.errorState('Error al cargar aulas', 'App.rooms.init()')}</div>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  async deleteRoom(id, name) {
    const ok = confirm(`\u00bfEliminar aula "${name}"?\n\nLos estudiantes quedar\u00e1n sin aula asignada. El hist\u00f3rico de asistencia y notas se conserva.`);
    if (!ok) return;

    const roomIdNum = parseInt(id, 10);
    try {
      // 1) Soltar a los estudiantes del aula
      await supabase.from('students').update({ classroom_id: null }).eq('classroom_id', roomIdNum);

      // 2) Soft delete: attendance/grades/report_cards apuntan al aula, asi que
      //    un DELETE fisico revienta con "attendance_classroom_id_fkey".
      //    classrooms.deleted_at es el patron que ya usa el resto del proyecto.
      const { error } = await supabase
        .from('classrooms')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', roomIdNum);

      // Instalaciones anteriores a sql/10_fixes.sql no tienen deleted_at:
      // se cae a borrado fisico, limpiando antes la FK que lo bloquea.
      if (error && /deleted_at|column/i.test(error.message || '')) {
        await supabase.from('attendance').update({ classroom_id: null }).eq('classroom_id', roomIdNum);
        const { error: delErr } = await supabase.from('classrooms').delete().eq('id', roomIdNum);
        if (delErr) throw delErr;
      } else if (error) {
        throw error;
      }

      Helpers.toast('Aula eliminada correctamente', 'success');
      await this.loadRooms();
    } catch (e) {
      const msg = /foreign key constraint/i.test(e.message || '')
        ? 'No se pudo eliminar el aula. Revisa la migraci\u00f3n sql/16_fix_classroom_delete.sql'
        : 'Error al eliminar: ' + e.message;
      Helpers.toast(msg, 'error');
    }
  },

  async openModal(roomId = null) {
    const modal = document.getElementById('roomModal');
    const title = document.getElementById('roomModalTitle');
    
    // Configurar campos por defecto
    document.getElementById('roomId').value = '';
    document.getElementById('roomName').value = '';
    document.getElementById('roomCapacity').value = '15';
    
    // Cargar select de maestras
    await this.populateTeachersSelect();

    if (roomId) {
      title.textContent = 'Editar Aula';
      try {
        const { data: rm, error } = await supabase.from('classrooms').select('id, name, level, capacity, teacher_id').eq('id', roomId).single();
        if (error) throw error;

        document.getElementById('roomId').value = rm.id;
        document.getElementById('roomName').value = rm.name || '';
        document.getElementById('roomTeacher').value = rm.teacher_id || '';
        document.getElementById('roomCapacity').value = rm.capacity || 15;
      } catch (_) {
        Helpers.toast('Error cargando aula', 'error');
        return;
      }
    } else {
      title.textContent = 'Nueva Aula';
      document.getElementById('roomTeacher').value = '';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    await this._loadStudentsChecklist(roomId);
  },

  async _loadStudentsChecklist(roomId) {
    const list = document.getElementById('roomStudentsChecklist');
    if (!list) return;
    list.innerHTML = '<div class="text-[10px] text-slate-400 p-2">Cargando...</div>';

    try {
      const { data: students, error } = await supabase
        .from('students')
        .select('id, name, classroom_id')
        .order('name');

      if (error) throw error;

      if (!students?.length) {
        list.innerHTML = '<div class="text-[10px] text-slate-400 p-2 italic">No hay estudiantes registrados.</div>';
        return;
      }

      const rid = roomId ? String(roomId) : null;
      // Mostrar: sin aula + los que ya están en esta aula
      const visible = students.filter(s =>
        !s.classroom_id || (rid && String(s.classroom_id) === rid)
      );

      if (!visible.length) {
        list.innerHTML = '<div class="text-[10px] text-slate-400 p-2 italic">Todos los estudiantes ya tienen aula asignada.</div>';
        return;
      }

      list.innerHTML = visible.map(s => {
        const inThisRoom = rid && String(s.classroom_id) === rid;
        return `<label class="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-slate-100 px-1 rounded-lg">
          <input type="checkbox" value="${s.id}" ${inThisRoom ? 'checked' : ''}
            class="room-student-check w-4 h-4 rounded accent-teal-600">
          <span class="text-sm font-medium text-slate-700">${Helpers.escapeHTML(s.name)}</span>
          ${inThisRoom ? '<span class="text-[9px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-bold ml-auto">En esta aula</span>' : ''}
        </label>`;
      }).join('');
    } catch (_) {
      // fallback sin classroom_id
      try {
        const { data: students2 } = await supabase
          .from('students').select('id, name').order('name');
        if (students2?.length) {
          list.innerHTML = students2.map(s => `
            <label class="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-slate-100 px-1 rounded-lg">
              <input type="checkbox" value="${s.id}" class="room-student-check w-4 h-4 rounded accent-teal-600">
              <span class="text-sm font-medium text-slate-700">${Helpers.escapeHTML(s.name)}</span>
            </label>`).join('');
        } else {
          list.innerHTML = '<div class="text-[10px] text-slate-400 p-2 italic">No hay estudiantes.</div>';
        }
      } catch (_) {
        list.innerHTML = '<div class="text-[10px] text-rose-400 p-2">Error cargando estudiantes.</div>';
      }
    }
  },

  closeModal() {
    const modal = document.getElementById('roomModal');
    if (modal) {
      modal.classList.remove('flex');
      modal.classList.add('hidden');
    }
  },

  async populateTeachersSelect() {
    const select = document.getElementById('roomTeacher');
    if (!select) return;
    try {
      const { data, error } = await supabase.from('profiles').select('id, name').eq('role', 'maestra').order('name');
      if (!error && data) {
        select.innerHTML = '<option value="">-- Sin asignar --</option>' + data.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      }
    } catch (e) {}
  },

  async saveRoom() {
    const btn = document.getElementById('btnSaveRoom');
    btn.disabled = true;
    btn.innerHTML = '<i class="lucide-loader-2 animate-spin w-4 h-4"></i> Guardando...';

    const id = document.getElementById('roomId').value;
    const name = document.getElementById('roomName').value.trim();
    const capacity = parseInt(document.getElementById('roomCapacity').value || '0', 10);
    const teacher_id = document.getElementById('roomTeacher').value || null;

    if (!name) {
      Helpers.toast('Se requiere nombre de aula', 'warning');
      this.resetBtn(btn);
      return;
    }

    // Mapear name → level canónico (si coincide con catálogo oficial)
    const canon = findCanonicalClassroom(name);
    const level = canon ? canon.level : (
      SPECIAL_CLASSROOMS.includes(name) ? name : name
    );

    const payload = {
      name,
      capacity: capacity || 20,
      teacher_id,
      level,
    };

    try {
      let savedId = id;
      if (id) {
        const { error } = await supabase.from('classrooms').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data: newRoom, error } = await supabase.from('classrooms').insert([payload]).select('id').single();
        if (error) throw error;
        savedId = newRoom?.id;
      }

      const modal = document.getElementById('roomModal');
      const checks = modal ? modal.querySelectorAll('.room-student-check') : [];
      if (checks.length && savedId && level) {
        const roomIdVal = parseInt(savedId, 10);
        const toAssign = [...checks].filter((c) => c.checked).map((c) => parseInt(c.value, 10));
        const toUnassign = [...checks].filter((c) => !c.checked).map((c) => parseInt(c.value, 10));

        // Validar edad de los que vamos a asignar
        for (const sid of toAssign) {
          try {
            const { data: st } = await supabase
              .from('students')
              .select('id, name, birth_date')
              .eq('id', sid)
              .maybeSingle();
            if (st?.birth_date) {
              const days = ageInDays(st.birth_date);
              const check = validateAgeForClassroom(days, level);
              if (!check.isSpecial && !check.ok) {
                const range = check.range?.labelRange || 'rango oficial';
                const suggest = check.suggestedLevel ? `\nSugerida: ${check.suggestedLevel}` : '';
                const ok = confirm(
                  `⚠️ ${st.name} está fuera del rango de edad para "${level}".` +
                  `\nRango: ${range}${suggest}\n\n¿Autorizar excepción y continuar?`
                );
                if (!ok) { this.resetBtn(btn); return; }
              }
            }
          } catch (_) { /* skip validation */ }
        }

        const updateClassroom = async (ids, value) => {
          if (!ids.length) return;
          const patch = { classroom_id: value };
          if (value !== null) patch.level_requested = level;
          const { error } = await supabase.from('students').update(patch).in('id', ids);
          if (error) throw error;
        };

        await updateClassroom(toAssign, roomIdVal);
        await updateClassroom(toUnassign, null);
      }

      Helpers.toast(id ? 'Aula actualizada correctamente' : 'Aula creada correctamente', 'success');
      this.closeModal();
      await this.loadRooms();
    } catch (_) {
      Helpers.toast('Error al guardar aula: ' + (_.message || _), 'error');
    } finally {
      this.resetBtn(btn);
    }
  },

  resetBtn(btn) {
    btn.disabled = false;
    btn.innerHTML = 'Guardar';
  }
};
