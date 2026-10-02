import { DirectorApi } from './api.js';
import { Helpers } from '../shared/helpers.js';
import { UI } from './ui.module.js';
import { supabase } from '../shared/supabase.js';
import { QueryCache } from '../shared/query-cache.js';
import {
  CANONICAL_CLASSROOMS,
  SPECIAL_CLASSROOMS,
  findCanonicalClassroom,
  validateAgeForClassroom,
  suggestClassroomByAge,
  ageInDays,
} from '../shared/constants.js';

export const RoomsModule = {
  _rooms: [],
  _filtersBound: false,

  async init() {
    const container = document.getElementById('roomsGrid') || document.getElementById('roomsTable');
    if (!container) return;

    // Invalidar cache para obtener datos frescos
    QueryCache.invalidate('dir_classrooms_occ');

    container.innerHTML = this._gridLoader();
    try {
      const res = await DirectorApi.getClassroomsWithOccupancy();
      const classrooms = res?.data || [];
      if (res?.error) throw new Error(res.error);

      this._rooms = classrooms;
      this._populateLineFilter();
      this._bindFilters();
      this.render();

      if (!classrooms.length) {
        container.innerHTML = this._emptyState('No hay aulas registradas', 'Crea la primera aula del catálogo oficial para comenzar.');
      }
    } catch (e) {
      container.innerHTML = this._emptyState('Error al cargar aulas', e.message, true);
    }
    if (window.lucide) lucide.createIcons();

    // Cargar estudiantes sin aula en paralelo
    this.loadUnassigned();
  },

  _gridLoader() {
    return Array.from({ length: 6 }).map(() =>
      '<div class="dc-room" style="--room:#CBD5E1;cursor:default">' +
        '<div class="dc-room-top"><div style="flex:1"><div class="dc-room-name" style="color:#CBD5E1">Cargando…</div>' +
        '<div class="dc-room-level">&nbsp;</div></div></div>' +
        '<div style="height:9px;border-radius:999px;background:#F1F5F9"></div>' +
        '<div style="height:44px;border-radius:.9rem;background:#F1F5F9"></div>' +
      '</div>'
    ).join('');
  },

  _emptyState(title, msg, isError) {
    return '<div class="dc-empty" style="grid-column:1/-1">' +
      '<i data-lucide="' + (isError ? 'alert-triangle' : 'door-open') + '"></i>' +
      '<span style="color:var(--dc-ink);font-weight:900">' + Helpers.escapeHTML(title || '') + '</span>' +
      '<span>' + Helpers.escapeHTML(msg || '') + '</span>' +
    '</div>';
  },

  _populateLineFilter() {
    const sel = document.getElementById('roomsLineFilter');
    if (!sel) return;
    const current = sel.value;
    const lines = [...new Set(
      this._rooms.map(r => findCanonicalClassroom(r.level || r.name)?.line).filter(Boolean)
    )].sort();
    sel.innerHTML = '<option value="">Todas las líneas</option>' +
      lines.map(l => `<option value="${Helpers.escapeHTML(l)}">Línea ${Helpers.escapeHTML(l)}</option>`).join('');
    sel.value = current;
  },

  _bindFilters() {
    if (this._filtersBound) return;
    this._filtersBound = true;
    const bind = (id, ev) => document.getElementById(id)?.addEventListener(ev, () => this.render());
    bind('roomsSearch', 'input');
    bind('roomsLineFilter', 'change');
    bind('roomsStatusFilter', 'change');
    document.getElementById('btnRoomsReset')?.addEventListener('click', () => {
      const s = document.getElementById('roomsSearch'); if (s) s.value = '';
      const l = document.getElementById('roomsLineFilter'); if (l) l.value = '';
      const f = document.getElementById('roomsStatusFilter'); if (f) f.value = 'all';
      this.render();
    });
  },

  _filtered() {
    const term = (document.getElementById('roomsSearch')?.value || '').trim().toLowerCase();
    const line = document.getElementById('roomsLineFilter')?.value || '';
    const status = document.getElementById('roomsStatusFilter')?.value || 'all';

    return this._rooms.filter(r => {
      const canon = findCanonicalClassroom(r.level || r.name);
      if (term) {
        const hay = `${r.name || ''} ${r.level || ''} ${canon?.line || ''} ${r.profiles?.name || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (line && canon?.line !== line) return false;
      const occ = Number(r.student_count || 0);
      const cap = Number(r.capacity || 20);
      const free = Math.max(0, cap - occ);
      const hasTeacher = !!r.profiles?.name;
      if (status === 'free' && free === 0) return false;
      if (status === 'full' && free > 0) return false;
      if (status === 'teacher' && !hasTeacher) return false;
      if (status === 'noteacher' && hasTeacher) return false;
      return true;
    });
  },

  _renderKpis() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const total = this._rooms.length;
    const students = this._rooms.reduce((a, r) => a + Number(r.student_count || 0), 0);
    const capacity = this._rooms.reduce((a, r) => a + Number(r.capacity || 20), 0);
    const pct = capacity > 0 ? Math.round((students / capacity) * 100) : 0;
    const assigned = this._rooms.filter(r => r.profiles?.name).length;

    set('roomsKpiTotal', total);
    set('roomsKpiStudents', students);
    set('roomsKpiOcup', pct + '%');
    set('roomsKpiAssigned', assigned);
    set('roomsKpiTotalFoot', capacity + ' cupos totales');
    set('roomsKpiStudentsFoot', capacity - students > 0 ? (capacity - students) + ' cupos libres' : 'aulas al máximo');
    set('roomsKpiOcupFoot', students + ' de ' + capacity + ' lugares');
    set('roomsKpiAssignedFoot', total - assigned > 0 ? (total - assigned) + ' pendientes' : 'todas cubiertas');
  },

  render() {
    const container = document.getElementById('roomsGrid') || document.getElementById('roomsTable');
    if (!container) return;
    const list = this._filtered();

    this._renderKpis();

    const counter = document.getElementById('roomsCounter');
    if (counter) {
      counter.innerHTML = list.length === this._rooms.length
        ? `<b>${list.length}</b> aulas`
        : `<b>${list.length}</b> de ${this._rooms.length} aulas`;
    }

    if (container.tagName === 'TBODY') {
      container.innerHTML = list.map(r => UI.renderClassroomRow(r)).join('');
    } else if (!list.length) {
      container.innerHTML = this._emptyState('Sin resultados', 'Ajusta la búsqueda o los filtros aplicados.');
    } else {
      container.innerHTML = list.map(r => UI.renderClassroomCard(r)).join('');
    }
    if (window.lucide) lucide.createIcons();
  },

  async loadUnassigned() {
    const list = document.getElementById('unassignedStudentsList');
    const countEl = document.getElementById('unassignedCount');
    if (!list) return;

    list.innerHTML = '<div class="text-center py-6"><div class="animate-spin w-5 h-5 border-2 border-amber-500 rounded-full border-t-transparent mx-auto"></div></div>';

    try {
      const { data: students, error } = await supabase
        .from('students')
        .select('id, name, p1_name, is_active')
        .is('classroom_id', null)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      if (countEl) countEl.textContent = students?.length
        ? `${students.length} estudiante${students.length > 1 ? 's' : ''} sin aula`
        : 'Todos los estudiantes tienen aula asignada';

      const kpi = document.getElementById('roomsKpiUnassigned');
      if (kpi) kpi.textContent = students?.length || 0;

      if (!students?.length) {
        list.innerHTML = '<div class="dc-empty" style="grid-column:1/-1"><i data-lucide="check-circle-2"></i><span>Todos los estudiantes activos tienen aula asignada.</span></div>';
        if (window.lucide) lucide.createIcons();
        return;
      }

      const { data: classrooms } = await supabase
        .from('classrooms')
        .select('id, name, level')
        .is('deleted_at', null)
        .order('name');

      const roomOptions = (classrooms || [])
        .map(r => `<option value="${r.id}">${Helpers.escapeHTML(r.name)}</option>`)
        .join('');

      const rowsHtml = students.map((s) => {
        const initial = (s.name || '?').charAt(0).toUpperCase();
        const tutor = s.p1_name ? Helpers.escapeHTML(s.p1_name) : 'Sin tutor registrado';
        return (
          '<div class="dc-unassigned-row" id="unassigned-row-' + s.id + '">' +
            '<div class="dc-unassigned-id">' +
              '<div class="dc-unassigned-av">' + initial + '</div>' +
              '<div class="dc-unassigned-txt">' +
                '<span class="dc-unassigned-name">' + Helpers.escapeHTML(s.name) + '</span>' +
                '<span class="dc-unassigned-sub">' + tutor + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="dc-unassigned-act">' +
              '<select id="select-room-' + s.id + '" class="dc-select" style="min-width:180px">' +
                '<option value="">-- Seleccionar aula --</option>' + roomOptions +
              '</select>' +
              '<button onclick="App.rooms.assignStudent(' + s.id + ')" class="dc-btn dc-btn--primary dc-btn--sm">' +
                '<i data-lucide="check"></i> Asignar' +
              '</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      list.innerHTML = '<div class="dc-unassigned">' + rowsHtml + '</div>';

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      list.innerHTML = '<div class="dc-empty" style="grid-column:1/-1"><i data-lucide="alert-triangle"></i><span>Error al cargar estudiantes sin aula.</span></div>';
      if (window.lucide) lucide.createIcons();
    }
  },

  async assignStudent(studentId) {
    const select = document.getElementById(`select-room-${studentId}`);
    const classroomId = select?.value;
    if (!classroomId) return Helpers.toast('Selecciona un aula primero', 'warning');

    try {
      const [classroomRes, studentRes] = await Promise.all([
        supabase.from('classrooms').select('id, name, level').eq('id', parseInt(classroomId)).maybeSingle(),
        supabase.from('students').select('id, name, birth_date').eq('id', studentId).maybeSingle(),
      ]);
      const classroom = classroomRes?.data;
      const student = studentRes?.data;
      if (student?.birth_date && classroom) {
        const level = classroom.level || classroom.name;
        const days = ageInDays(student.birth_date);
        const check = validateAgeForClassroom(days, level);
        if (!check.isSpecial && !check.ok) {
          const range = check.range?.labelRange || 'rango oficial';
          const suggest = check.suggestedLevel ? `\nAula sugerida por edad: ${check.suggestedLevel}` : '';
          const ok = confirm(
            `⚠️ El estudiante "${student.name}" está fuera del rango de edad para "${level}".\n` +
            `Rango oficial: ${range}${suggest}\n\n¿Autorizar excepción de edad y continuar con la asignación?`
          );
          if (!ok) return;
        }
      }
    } catch (e) { /* ignore validation errors */ }

    const btn = select?.nextElementSibling;
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
      const levelUpdate = { classroom_id: parseInt(classroomId) };
      try {
        const { data: cls } = await supabase.from('classrooms').select('level').eq('id', parseInt(classroomId)).maybeSingle();
        if (cls && cls.level) levelUpdate.level_requested = cls.level;
      } catch (_) { /* ignore */ }

      const { error } = await supabase
        .from('students')
        .update(levelUpdate)
        .eq('id', studentId);

      if (error) throw error;

      const row = document.getElementById(`unassigned-row-${studentId}`);
      if (row) {
        row.style.opacity = '0';
        row.style.transform = 'translateX(20px)';
        setTimeout(() => row.remove(), 300);
      }

      Helpers.toast('Estudiante asignado al aula correctamente', 'success');
      QueryCache.invalidate('dir_students');
      QueryCache.invalidate('dir_classrooms_occ');

      setTimeout(() => {
        const remaining = document.querySelectorAll('[id^="unassigned-row-"]').length;
        const countEl = document.getElementById('unassignedCount');
        if (countEl) countEl.textContent = remaining
          ? `${remaining} estudiante${remaining > 1 ? 's' : ''} sin aula`
          : 'Todos los estudiantes tienen aula asignada';
        if (!remaining) {
          const list = document.getElementById('unassignedStudentsList');
          if (list) list.innerHTML = '<div class="flex items-center gap-3 px-6 py-5 text-sm text-emerald-600 font-bold"><span class="text-xl">✅</span> Todos los estudiantes activos tienen aula asignada.</div>';
        }
        this.init();
      }, 350);
    } catch (e) {
      Helpers.toast('Error al asignar: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Asignar'; }
    }
  },

  async save() {
    const id           = document.getElementById('roomId')?.value?.trim();
    const canonLevel   = document.getElementById('roomCanonLevel')?.value?.trim();
    const customName   = document.getElementById('roomName')?.value?.trim();
    const capacity     = document.getElementById('roomCapacity')?.value;
    const teacher_id   = document.getElementById('roomTeacher')?.value || null;
    const ageException = document.getElementById('roomAgeException')?.checked;

    if (!canonLevel && !id) return Helpers.toast('Selecciona un aula del catálogo oficial', 'warning');
    const name = customName || canonLevel || '';
    if (!name) return Helpers.toast('El nombre del aula es requerido', 'warning');

    const level = canonLevel || (
      CANONICAL_CLASSROOMS.find((c) => c.level === name || c.name === name)?.level || name
    );

    // Validación de edad: si NO hay excepción, validar cada estudiante marcado
    if (!ageException) {
      const checks = document.querySelectorAll('.room-student-check:checked');
      for (const c of checks) {
        const sid = parseInt(c.value, 10);
        const meta = window.__roomStudentsMeta?.get?.(sid);
        if (meta?.birth_date && level) {
          const days = ageInDays(meta.birth_date);
          const check = validateAgeForClassroom(days, level);
          if (check.isSpecial) continue;
          if (!check.ok) {
            const humanRange = check.range?.labelRange || 'rango oficial';
            const suggest = check.suggestedLevel
              ? `\nAula sugerida por edad: ${check.suggestedLevel}`
              : '';
            const ok = confirm(
              `⚠️ El estudiante "${meta.name}" está fuera del rango de edad para "${level}".` +
              `\n\nRango oficial: ${humanRange}${suggest}` +
              `\n\nPara autorizar esta excepción: haz clic en OK (y marca el checkbox "Autorizar excepciones de edad" para evitar este mensaje).` +
              `\n\nCancelar → revisar la asignación.`
            );
            if (!ok) return;
          }
        }
      }
    }

    const btn = document.querySelector('#globalModalContainer button[onclick*="rooms.save"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
      const payload = {
        name,
        level,
        capacity: capacity ? parseInt(capacity) : null,
        teacher_id: teacher_id || null,
      };

      let savedId = id;
      if (id) {
        const { error } = await supabase.from('classrooms').update(payload).eq('id', parseInt(id));
        if (error) throw error;
      } else {
        const { data: newRoom, error } = await supabase.from('classrooms').insert(payload).select('id').single();
        if (error) throw error;
        savedId = newRoom?.id;
      }

      const checks = document.querySelectorAll('.room-student-check');
      if (checks.length > 0 && savedId) {
        const roomIdNum = parseInt(savedId, 10);
        const toAssign   = [...checks].filter(c => c.checked).map(c => parseInt(c.value, 10));
        const toUnassign = [...checks].filter(c => !c.checked).map(c => parseInt(c.value, 10));

        if (toAssign.length) {
          const { error } = await supabase
            .from('students')
            .update({ classroom_id: roomIdNum, level_requested: level })
            .in('id', toAssign);
          if (error) throw error;
        }
        if (toUnassign.length) {
          const { error } = await supabase
            .from('students')
            .update({ classroom_id: null })
            .in('id', toUnassign);
          if (error) throw error;
        }
      }

      Helpers.toast(id ? 'Aula actualizada correctamente' : 'Aula creada correctamente', 'success');
      UI.closeModal();
      QueryCache.invalidate('dir_classrooms_occ');
      QueryCache.invalidate('dir_classrooms');
      QueryCache.invalidate('dir_students');
      await this.init();
    } catch (e) {
      Helpers.toast('Error al guardar aula: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar Aula'; }
    }
  },

  async deleteRoom(roomId, roomName) {
    const ok = window._karpusConfirmDelete
      ? await window._karpusConfirmDelete('¿Eliminar aula "' + roomName + '"?', 'Los estudiantes quedarán sin aula asignada.')
      : confirm('¿Eliminar aula "' + roomName + '"? Los estudiantes quedarán sin aula.');
    if (!ok) return;

    try {
      const { error } = await supabase.from('classrooms').delete().eq('id', parseInt(roomId));
      if (error) throw error;
      Helpers.toast('Aula eliminada', 'success');
      QueryCache.invalidate('dir_classrooms_occ');
      QueryCache.invalidate('dir_classrooms');
      await this.init();
    } catch (e) {
      Helpers.toast('Error al eliminar: ' + e.message, 'error');
    }
  },

  async openModal(roomId = null) {
    const IC = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#0B63C7] bg-slate-50/50 transition-all text-sm font-medium';
    const IC_READONLY = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none bg-slate-100 text-slate-600 cursor-not-allowed text-sm font-medium';
    const LC = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1';

    const canonOptions = CANONICAL_CLASSROOMS.map((c, idx) => `
      <option value="${Helpers.escapeHTML(c.level)}" data-min="${c.minDays}" data-max="${c.maxDays}">
        ${idx + 1}. ${Helpers.escapeHTML(c.level)} — (${c.labelRange})
      </option>
    `).join('');

    const specialOptions = SPECIAL_CLASSROOMS.length
      ? '<optgroup label="Aulas Especiales (sin rango de edad)">' +
        SPECIAL_CLASSROOMS.map((s) => `<option value="${Helpers.escapeHTML(s)}">${Helpers.escapeHTML(s)}</option>`).join('') +
        '</optgroup>'
      : '';

    const html = `
      <div class="modal-header bg-gradient-to-r from-[#0B63C7] to-[#0850A0] text-white p-6 rounded-t-3xl flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl"><i data-lucide="home" class="w-6 h-6 text-white"></i></div>
          <div>
            <h3 class="text-xl font-black">${roomId ? 'Editar Aula' : 'Nueva Aula'}</h3>
            <p class="text-xs text-white/70 font-bold uppercase tracking-widest">Catálogo oficial del colegio</p>
          </div>
        </div>
      </div>

      <div class="modal-body p-6 bg-slate-50/30 space-y-5">
        <input type="hidden" id="roomId" value="${roomId || ''}">

        ${
          roomId
            ? `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="${LC}">Nivel / Aula (Fijo)</label>
                <div id="roomLevelDisplay" class="${IC_READONLY} flex items-center gap-2"><span class="animate-pulse w-4 h-4 bg-slate-300 rounded-full"></span> Cargando...</div>
                <input type="hidden" id="roomCanonLevel" value="">
              </div>
              <div>
                <label class="${LC}">Rango de Edad Oficial</label>
                <div id="roomAgeRangeDisplay" class="${IC_READONLY}">—</div>
              </div>
            </div>`
            : `
            <div>
              <label class="${LC}">Aula del Catálogo Oficial *</label>
              <select id="roomCanonLevel" class="${IC} font-bold text-slate-700">
                <option value="">— Seleccionar aula —</option>
                <optgroup label="12 Aulas Oficiales (con rango de edad)">
                  ${canonOptions}
                </optgroup>
                ${specialOptions}
              </select>
              <div id="roomAgeRangeHint" class="mt-2 px-3 py-2 rounded-xl bg-blue-50/70 text-[11px] text-blue-700 font-bold hidden">
                <i data-lucide="info" class="w-3 h-3 inline mr-1"></i>
                <span id="roomAgeRangeText">Selecciona un aula para ver el rango</span>
              </div>
            </div>`
        }

        <div>
          <label class="${LC}">Nombre visible (personalizable)</label>
          <input id="roomName" placeholder="Se completa automáticamente. Deja vacío para usar el oficial." class="${IC}">
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="${LC}">Maestra Asignada</label>
            <select id="roomTeacher" class="${IC}">
              <option value="">-- Sin asignar --</option>
            </select>
          </div>
          <div>
            <label class="${LC}">Capacidad (estudiantes máx.)</label>
            <input id="roomCapacity" type="number" placeholder="Ej: 20" min="1" max="60" value="20" class="${IC}">
          </div>
        </div>

        <div class="px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-100">
          <label class="flex items-start gap-3 cursor-pointer">
            <input id="roomAgeException" type="checkbox" class="mt-0.5 w-5 h-5 rounded accent-amber-500 shrink-0">
            <div>
              <p class="font-black text-sm text-amber-800">✅ Autorizar excepciones de edad</p>
              <p class="text-[11px] text-amber-700/90 font-bold leading-snug mt-0.5">
                Marca esta casilla para permitir asignar estudiantes aunque su edad no coincida con el rango oficial del aula (previo consentimiento de Dirección).
              </p>
            </div>
          </label>
        </div>

        <div>
          <label class="${LC}">Estudiantes del Aula</label>
          <p class="text-[10px] text-slate-400 mb-2 ml-1">Marca los estudiantes que pertenecen a esta aula. Se valida rango de edad automáticamente.</p>
          <div id="roomStudentsChecklist" class="bg-white border-2 border-slate-100 rounded-2xl max-h-64 overflow-y-auto divide-y divide-slate-50">
            <div class="text-center py-6 text-slate-400 text-xs">Cargando estudiantes...</div>
          </div>
        </div>
      </div>

      <div class="modal-footer bg-white p-6 rounded-b-3xl border-t border-slate-100 flex flex-col sm:flex-row justify-between sm:justify-end gap-3">
        <div class="text-[10px] text-slate-400 font-bold order-2 sm:order-1 self-start sm:self-center">
          🔒 Estructura de aulas y edades fijas (catálogo oficial)
        </div>
        <div class="flex gap-3 order-1 sm:order-2">
          <button onclick="App.ui.closeModal()" class="px-6 py-3 text-slate-500 font-black text-xs uppercase hover:bg-slate-100 rounded-2xl transition-all">Cancelar</button>
          <button onclick="App.rooms.save()" class="px-8 py-3 bg-gradient-to-r from-[#0B63C7] to-[#0850A0] text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-blue-200 hover:-translate-y-0.5 transition-all active:scale-95">Guardar Aula</button>
        </div>
      </div>`;

    window.openGlobalModal(html);

    // Cargar maestras
    try {
      const { data: teachers } = await DirectorApi.getTeachers();
      const select = document.getElementById('roomTeacher');
      if (select && teachers?.length) {
        select.innerHTML = '<option value="">-- Sin asignar --</option>' +
          teachers.map((t) => `<option value="${t.id}">${Helpers.escapeHTML(t.name)}</option>`).join('');
      }
    } catch (e) { /* ignore */ }

    // Pre-llenar si es edición
    if (roomId) {
      try {
        const { data: room } = await supabase
          .from('classrooms')
          .select('id, name, level, capacity, teacher_id, is_live')
          .eq('id', parseInt(roomId))
          .single();
        if (room) {
          document.getElementById('roomName').value     = room.name || '';
          document.getElementById('roomCapacity').value = room.capacity || 20;
          document.getElementById('roomCanonLevel').value = room.level || room.name || '';
          const sel = document.getElementById('roomTeacher');
          if (sel) sel.value = room.teacher_id || '';

          const display = document.getElementById('roomLevelDisplay');
          const ageDisp = document.getElementById('roomAgeRangeDisplay');
          if (display) {
            const canon = findCanonicalClassroom(room.level || room.name);
            display.innerHTML = canon
              ? `<span class="inline-flex items-center gap-2"><span class="w-3 h-3 rounded-full shrink-0" style="background:${canon.color}"></span><b>${Helpers.escapeHTML(canon.level)}</b> · Línea ${canon.line}</span>`
              : `<b>${Helpers.escapeHTML(room.level || room.name || '—')}</b>`;
          }
          if (ageDisp) {
            const canon = findCanonicalClassroom(room.level || room.name);
            ageDisp.textContent = canon
              ? canon.labelRange
              : (SPECIAL_CLASSROOMS.includes(room.level || room.name) ? 'Sin rango (aula especial)' : 'No definido');
          }
        }
      } catch (e) { /* ignore */ }
    }

    // Preview de rango al seleccionar (solo para nueva aula)
    const canonSel = document.getElementById('roomCanonLevel');
    const hintBox = document.getElementById('roomAgeRangeHint');
    const hintText = document.getElementById('roomAgeRangeText');
    if (canonSel && hintBox && hintText) {
      canonSel.addEventListener('change', () => {
        const v = canonSel.value;
        if (!v) { hintBox.classList.add('hidden'); return; }
        const canon = findCanonicalClassroom(v);
        if (canon) {
          hintBox.classList.remove('hidden');
          hintText.textContent = `Rango oficial: ${canon.labelRange} · Línea ${canon.line}`;
          hintBox.className = 'mt-2 px-3 py-2 rounded-xl font-bold text-[11px] hidden';
          hintBox.style.background = canon.color + '22';
          hintBox.style.color = canon.color;
          hintBox.classList.remove('hidden');
          const nm = document.getElementById('roomName');
          if (nm && !nm.value.trim()) nm.value = canon.level;
        } else if (SPECIAL_CLASSROOMS.includes(v)) {
          hintBox.classList.remove('hidden');
          hintBox.className = 'mt-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold';
          hintText.textContent = 'Aula especial — Sin restricción de rango de edad';
        } else {
          hintBox.classList.add('hidden');
        }
      });
    }

    await this._loadStudentsChecklist(roomId);
    if (window.lucide) lucide.createIcons();
  },

  async _loadStudentsChecklist(roomId) {
    const list = document.getElementById('roomStudentsChecklist');
    if (!list) return;
    window.__roomStudentsMeta = new Map();

    try {
      let students = null;
      const res = await supabase
        .from('students')
        .select('id, name, classroom_id, birth_date, level_requested')
        .eq('is_active', true)
        .order('name');
      if (res.error && (res.error.code === '42703' || res.error.message?.includes('birth_date') || res.error.message?.includes('level_requested'))) {
        const res2 = await supabase
          .from('students')
          .select('id, name, classroom_id')
          .eq('is_active', true)
          .order('name');
        students = res2.data || [];
      } else {
        students = res.data || [];
      }

      if (!students.length) {
        list.innerHTML = '<div class="px-4 py-5 text-xs text-slate-400 italic">No hay estudiantes registrados.</div>';
        return;
      }

      const rid = roomId ? String(roomId) : null;
      const classroomLevel = (() => {
        const v = document.getElementById('roomCanonLevel')?.value?.trim() || '';
        return v;
      })();

      list.innerHTML = students.map((s) => {
        window.__roomStudentsMeta.set(parseInt(s.id, 10), {
          id: s.id,
          name: s.name,
          birth_date: s.birth_date || null,
          level_requested: s.level_requested || null,
        });
        const inThisRoom = rid && String(s.classroom_id) === rid;
        const inOtherRoom = s.classroom_id && !inThisRoom;

        let ageBadge = '';
        if (s.birth_date && classroomLevel) {
          const days = ageInDays(s.birth_date);
          const check = validateAgeForClassroom(days, classroomLevel);
          if (!check.isSpecial && check.range) {
            ageBadge = check.ok
              ? '<span class="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-black">Edad ✓</span>'
              : `<span class="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black" title="Edad fuera de rango ${check.range.labelRange}${check.suggestedLevel ? ' · Sugerida: ' + check.suggestedLevel : ''}">Edad ⚠</span>`;
          }
        }

        return `
          <label class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#E8F2FF] transition-colors ${inOtherRoom ? 'opacity-60' : ''}">
            <input type="checkbox" value="${s.id}" ${inThisRoom ? 'checked' : ''} ${inOtherRoom ? 'disabled title="Ya está en otra aula"' : ''}
              class="room-student-check w-4 h-4 rounded accent-[#0B63C7] shrink-0">
            <div class="w-7 h-7 rounded-lg bg-[#E8F2FF] text-[#0B63C7] flex items-center justify-center font-black text-xs shrink-0">
              ${(s.name || '?').charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium text-slate-700 block truncate">${Helpers.escapeHTML(s.name)}</span>
              ${s.birth_date ? `<span class="text-[10px] text-slate-400 font-bold">🎂 ${Helpers.escapeHTML(String(s.birth_date).slice(0, 10))}</span>` : ''}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              ${ageBadge}
              ${inThisRoom ? '<span class="text-[9px] bg-[#E8F2FF] text-[#0B63C7] px-2 py-0.5 rounded-full font-black">Aula actual</span>' : ''}
              ${inOtherRoom ? '<span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black">Otra aula</span>' : ''}
            </div>
          </label>`;
      }).join('');
    } catch (e) {
      list.innerHTML = '<div class="px-4 py-5 text-xs text-rose-400">Error al cargar estudiantes.</div>';
    }
  }
};


