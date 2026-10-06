import { DirectorApi } from './api.js';
import { Helpers } from '../shared/helpers.js';
import { UI } from './ui.module.js';
import { supabase } from '../shared/supabase.js';
import { QueryCache } from '../shared/query-cache.js';
import {
  CANONICAL_CLASSROOMS,
  SPECIAL_CLASSROOMS,
  SPECIAL_CLASSROOMS_META,
  findCanonicalClassroom,
  findSpecialClassroom,
  formatClassroomFullName,
  formatClassroomLevel,
  classroomColorFor,
  validateAgeForClassroom,
  suggestClassroomByAge,
  ageInDays,
} from '../shared/constants.js';

export const RoomsModule = {
  _rooms: [],
  _filtersBound: false,
  _view: 'grid',

  async init() {
    if (!document.getElementById('roomsGrid') && !document.getElementById('roomsTable')) return;

    this._loadViewPreference();
    this._bindToggle();
    this._applyView();

    // Invalidar cache para obtener datos frescos
    QueryCache.invalidate('dir_classrooms_occ');

    const gridEl = document.getElementById('roomsGrid');
    const tableEl = document.getElementById('roomsTable');
    const loader = this._gridLoader();
    if (this._view === 'grid' && gridEl) { gridEl.innerHTML = loader; if (tableEl) tableEl.innerHTML = ''; }
    else if (tableEl) { tableEl.innerHTML = Array.from({length: 6}).map(() => '<tr><td colspan="5" class="py-4 px-6"><div class="h-8 bg-slate-100 rounded-2xl animate-pulse"></div></td></tr>').join(''); if (gridEl) gridEl.innerHTML = ''; }

    try {
      const res = await DirectorApi.getClassroomsWithOccupancy();
      const rawRooms = res?.data || [];
      if (res?.error) throw new Error(res.error);

      // ============================================================
      // DEDUPLICACIÓN DEFENSIVA (en caso de que el SQL no se haya
      // ejecutado o aún existan duplicados en la BD).
      // Dos aulas que correspondan a la MISMA aula canónica se
      // fusionan: se queda la que tenga teacher_id / mayor id.
      // ============================================================
      const dedup = new Map();
      rawRooms.forEach((r) => {
        const canon = findCanonicalClassroom(r.level || r.name);
        const special = canon ? null : (findSpecialClassroom(r.name) || findSpecialClassroom(r.level));
        const key = canon
          ? `canon:${canon.id}`
          : special
            ? `special:${special.key}`
            : `custom:${(r.level || r.name || r.id).toString().toLowerCase()}`;

        if (!dedup.has(key)) {
          dedup.set(key, r);
          return;
        }
        const prev = dedup.get(key);
        // Score: elige la fila más "útil".
        const scorePrev = (prev.teacher_id ? 1000 : 0) + (prev.is_special ? 500 : 0) + Number(prev.id || 0);
        const scoreNew  = (r.teacher_id ? 1000 : 0) + (r.is_special ? 500 : 0) + Number(r.id || 0);
        if (scoreNew > scorePrev) {
          // Fusionar occupancy: prev.student_count a r si r no lo tiene.
          if (r.student_count == null && prev.student_count != null) {
            r.student_count = prev.student_count;
          }
          dedup.set(key, r);
        } else {
          if (prev.student_count == null && r.student_count != null) {
            prev.student_count = r.student_count;
          }
        }
      });
      const classrooms = Array.from(dedup.values());

      this._rooms = [...classrooms];

      CANONICAL_CLASSROOMS.forEach((canon) => {
        const exists = this._rooms.some((r) => {
          const cr = findCanonicalClassroom(r.level || r.name);
          return cr && cr.id === canon.id;
        });
        if (exists) return;
        this._rooms.push({
          id: null,
          __canonicalPlaceholder: true,
          name: canon.displayLevel || canon.name,
          level: canon.level,
          capacity: 20,
          student_count: 0,
          color: canon.color,
          is_live: true,
          profiles: null,
          teacher_id: null,
          __canonId: canon.id,
          line: canon.line,
          minAge: canon.minAge,
          maxAge: canon.maxAge,
          labelRange: canon.labelRange
        });
      });

      try {
        this._rooms.sort((a, b) => {
          const ca = findCanonicalClassroom(a.level || a.name);
          const cb = findCanonicalClassroom(b.level || b.name);
          const ia = ca ? ca.id : 9000;
          const ib = cb ? cb.id : 9000;
          if (ia !== ib) return ia - ib;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
      } catch (_) {}

      const missingCanon = CANONICAL_CLASSROOMS.filter((c) => !classrooms.some((r) => {
        const f = findCanonicalClassroom(r.level || r.name);
        return f && f.id === c.id;
      }));
      if (missingCanon.length) {
        try {
          supabase.from('classrooms').select('id,level,name').is('deleted_at', null).then(async ({ data: rows = [] }) => {
            const toInsert = [];
            missingCanon.forEach((c) => {
              const already = rows.some((r) => {
                const f = findCanonicalClassroom(r.level || r.name);
                return f && f.id === c.id;
              });
              if (!already) {
                toInsert.push({
                  name: c.name,
                  level: c.level,
                  capacity: 20,
                  is_live: true,
                  color: c.color,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
              }
            });
            if (toInsert.length) {
              const { error } = await supabase.from('classrooms').insert(toInsert, { defaultToNull: true }).select().maybeSingle();
              if (!error) QueryCache.invalidate('dir_classrooms_occ');
            }
          }).catch(() => {});
        } catch (_) {}
      }

      SPECIAL_CLASSROOMS_META.forEach(meta => {
        const exists = this._rooms.some(r => {
          const key = r.level || r.name || '';
          return !!findSpecialClassroom(key) ||
            key === meta.key ||
            String(r.name) === meta.displayName ||
            String(r.name) === meta.key;
        });
        if (!exists) {
          this._rooms.push({
            id: null,
            isSpecial: true,
            name: meta.displayName,
            level: meta.key,
            capacity: 20,
            student_count: 0,
            color: meta.color,
            __meta: meta
          });
        }
      });

      this._populateLineFilter();
      this._bindFilters();
      this.render();

      if (!this._rooms.length) {
        const gridEl = document.getElementById('roomsGrid');
        const tableEl = document.getElementById('roomsTable');
        const empty = this._emptyState('No hay aulas registradas', 'Crea la primera aula del catálogo oficial para comenzar.');
        if (this._view === 'grid' && gridEl) { gridEl.innerHTML = empty; if (tableEl) tableEl.innerHTML = ''; }
        else if (tableEl) { tableEl.innerHTML = empty; if (gridEl) gridEl.innerHTML = ''; }
      }
    } catch (e) {
      const gridEl2 = document.getElementById('roomsGrid');
      const tableEl2 = document.getElementById('roomsTable');
      const err = this._emptyState('Error al cargar aulas', e.message, true);
      if (this._view === 'grid' && gridEl2) { gridEl2.innerHTML = err; if (tableEl2) tableEl2.innerHTML = ''; }
      else if (tableEl2) { tableEl2.innerHTML = err; if (gridEl2) gridEl2.innerHTML = ''; }
    }
    if (window.lucide) lucide.createIcons();

    // Cargar estudiantes sin aula en paralelo
    this.loadUnassigned();
  },

  _activeContainer() {
    return this._view === 'table'
      ? (document.getElementById('roomsTable') || document.getElementById('roomsGrid'))
      : (document.getElementById('roomsGrid') || document.getElementById('roomsTable'));
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

  _loadViewPreference() {
    try {
      const v = localStorage.getItem('dc_rooms_view');
      if (v === 'grid' || v === 'table') this._view = v;
    } catch (_) {}
  },

  _saveViewPreference() {
    try { localStorage.setItem('dc_rooms_view', this._view); } catch (_) {}
  },

  _bindToggle() {
    const btn = document.getElementById('btnToggleRoomsView');
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', () => {
        this._view = this._view === 'grid' ? 'table' : 'grid';
        this._saveViewPreference();
        this._applyView();
        this.render();
      });
    }
  },

  _paintToggleLabel() {
    const btn = document.getElementById('btnToggleRoomsView');
    if (!btn) return;
    const isGrid = this._view === 'grid';
    btn.innerHTML = `<i data-lucide="${isGrid ? 'table' : 'layout-grid'}"></i> ` +
      `<span data-rooms-view-label>${isGrid ? 'Ver tabla' : 'Ver tarjetas'}</span>`;
    btn.setAttribute('aria-pressed', String(isGrid));
    btn.setAttribute('title', isGrid ? 'Cambiar a vista de tabla' : 'Cambiar a vista de tarjetas');
  },

  /** Muestra el contenedor correspondiente a la vista activa */
  _applyView() {
    const grid = document.getElementById('roomsGrid');
    const table = document.getElementById('roomsTableWrapper');
    if (this._view === 'table') {
      grid?.classList.add('hidden');
      table?.classList.remove('hidden');
    } else {
      grid?.classList.remove('hidden');
      table?.classList.add('hidden');
    }
    this._paintToggleLabel();
  },

  _emptyState(title, msg, isError) {
    return '<div class="dc-empty" style="grid-column:1/-1">' +
      '<i data-lucide="' + (isError ? 'alert-triangle' : 'door-open') + '"></i>' +
      '<span style="color:var(--dc-ink);font-weight:900">' + Helpers.escapeHTML(title || '') + '</span>' +
      '<span>' + Helpers.escapeHTML(msg || '') + '</span>' +
    '</div>';
  },

  /** Filtro por nivel legible ("1° Primero", "Inglés Afterschool"…) */
  _populateLineFilter() {
    const sel = document.getElementById('roomsLineFilter');
    if (!sel) return;
    const current = sel.value;
    const levels = [...new Set(
      this._rooms
        .map(r => {
          const canon = findCanonicalClassroom(r.level || r.name);
          if (canon?.displayLevel) return canon.displayLevel;
          const special = findSpecialClassroom(r.name) || findSpecialClassroom(r.level);
          return special?.displayName || formatClassroomLevel(r.level || r.name) || null;
        })
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'es'));
    sel.innerHTML = '<option value="">Todos los niveles</option>' +
      levels.map(l => `<option value="${Helpers.escapeHTML(l)}">${Helpers.escapeHTML(l)}</option>`).join('');
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
    const level = document.getElementById('roomsLineFilter')?.value || '';
    const status = document.getElementById('roomsStatusFilter')?.value || 'all';

    const levelOf = (r) => {
      const canon = findCanonicalClassroom(r.level || r.name);
      if (canon?.displayLevel) return canon.displayLevel;
      const special = findSpecialClassroom(r.name) || findSpecialClassroom(r.level);
      return special?.displayName || formatClassroomLevel(r.level || r.name) || '';
    };

    return this._rooms.filter(r => {
      if (term) {
        const hay = `${r.name || ''} ${r.level || ''} ${levelOf(r)} ${r.profiles?.name || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (level && levelOf(r) !== level) return false;
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
    // Los KPIs describen la realidad de la BD: las clases especiales virtuales
    // (id === null) se muestran en la lista pero NO son aulas reales.
    const real = this._rooms.filter(r => r.id);
    const total = real.length;
    const students = real.reduce((a, r) => a + Number(r.student_count || 0), 0);
    const capacity = real.reduce((a, r) => a + Number(r.capacity || 0), 0);
    const pct = capacity > 0 ? Math.round((students / capacity) * 100) : 0;
    const assigned = real.filter(r => r.profiles?.name).length;

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
    this._applyView();
    const gridEl = document.getElementById('roomsGrid');
    const tableEl = document.getElementById('roomsTable');
    if (!gridEl && !tableEl) return;

    const list = this._filtered();
    this._renderKpis();

    const counter = document.getElementById('roomsCounter');
    if (counter) {
      counter.innerHTML = list.length === this._rooms.length
        ? `<b>${list.length}</b> aulas`
        : `<b>${list.length}</b> de ${this._rooms.length} aulas`;
    }

    const empty = this._emptyState('Sin resultados', 'Ajusta la búsqueda o los filtros aplicados.');

    if (this._view === 'grid') {
      if (gridEl) gridEl.innerHTML = !list.length ? empty : list.map(r => UI.renderClassroomCard(r)).join('');
      if (tableEl) tableEl.innerHTML = '';
    } else {
      if (tableEl) tableEl.innerHTML = !list.length ? empty : list.map(r => UI.renderClassroomRow(r)).join('');
      if (gridEl) gridEl.innerHTML = '';
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
    if (!roomId || roomId === 'null' || !Number.isInteger(parseInt(roomId, 10))) {
      return Helpers.toast('Las clases especiales no se pueden eliminar desde aquí', 'warning');
    }
    const ok = window._karpusConfirmDelete
      ? await window._karpusConfirmDelete('\u00bfEliminar aula "' + roomName + '"?', 'Los estudiantes quedar\u00e1n sin aula asignada. El hist\u00f3rico de asistencia y notas se conserva.')
      : confirm('\u00bfEliminar aula "' + roomName + '"? Los estudiantes quedar\u00e1n sin aula.');
    if (!ok) return;

    const roomIdNum = parseInt(roomId, 10);
    try {
      // 1) Soltar a los estudiantes del aula
      await supabase.from('students').update({ classroom_id: null }).eq('classroom_id', roomIdNum);

      // 2) Soft delete. classrooms tiene columna deleted_at y TODAS las consultas
      //    filtran .is('deleted_at', null), asi que el aula desaparece de la UI
      //    pero attendance/grades/report_cards conservan su FK intacta.
      //    Un DELETE fisico falla con:
      //    "attendance_classroom_id_fkey violates foreign key constraint"
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

      Helpers.toast('Aula eliminada', 'success');
      QueryCache.invalidate('dir_classrooms_occ');
      QueryCache.invalidate('dir_classrooms');
      await this.init();
    } catch (e) {
      const msg = /foreign key constraint/i.test(e.message || '')
        ? 'No se pudo eliminar el aula. Revisa la migraci\u00f3n sql/16_fix_classroom_delete.sql'
        : 'Error al eliminar: ' + e.message;
      Helpers.toast(msg, 'error');
    }
  },

  async openModal(roomId = null) {
    // Normaliza: las clases especiales se pintan con id === null y no existen en BD.
    if (roomId != null && !Number.isInteger(parseInt(roomId, 10))) roomId = null;
    const IC = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#0B63C7] bg-slate-50/50 transition-all text-sm font-medium';
    const IC_READONLY = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none bg-slate-100 text-slate-600 cursor-not-allowed text-sm font-medium';
    const LC = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1';

    // El value conserva la clave real de BD ("1ro - Línea Roja") para que
    // findCanonicalClassroom siga funcionando; la etiqueta usa el nivel legible.
    const canonOptions = CANONICAL_CLASSROOMS.map((c) => `
      <option value="${Helpers.escapeHTML(c.level)}" data-min="${c.minDays}" data-max="${c.maxDays}">
        ${Helpers.escapeHTML(c.displayLevel || c.level)} (${Helpers.escapeHTML(c.labelRange)})
      </option>
    `).join('');

    const specialOptions = SPECIAL_CLASSROOMS_META.length
      ? '<optgroup label="Clases especiales (sin rango de edad)">' +
        SPECIAL_CLASSROOMS_META.map((s) =>
          `<option value="${Helpers.escapeHTML(s.key)}">${s.emoji} ${Helpers.escapeHTML(s.displayName)}</option>`
        ).join('') +
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
            const canon   = findCanonicalClassroom(room.level || room.name);
            const special = canon ? null : findSpecialClassroom(room.name) || findSpecialClassroom(room.level);
            const color   = canon?.color || special?.color || classroomColorFor(room.name, room.level);
            const label   = canon?.displayLevel || special?.displayName || formatClassroomLevel(room.level || room.name) || '—';
            display.innerHTML =
              `<span class="inline-flex items-center gap-2"><span class="w-3 h-3 rounded-full shrink-0" style="background:${color}"></span>` +
              `<b>${Helpers.escapeHTML(label)}</b>` +
              (special ? '<span class="text-[10px] font-black uppercase tracking-wider opacity-70">especial</span>' : '') +
              '</span>';
          }
          if (ageDisp) {
            const canon = findCanonicalClassroom(room.level || room.name);
            const special = canon ? null : findSpecialClassroom(room.name) || findSpecialClassroom(room.level);
            ageDisp.textContent = canon
              ? canon.labelRange
              : (special ? 'Sin rango (clase especial)' : 'No definido');
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
        const special = canon ? null : findSpecialClassroom(v);
        if (canon) {
          hintBox.classList.remove('hidden');
          hintText.textContent = `Rango oficial: ${canon.labelRange}`;
          hintBox.className = 'mt-2 px-3 py-2 rounded-xl font-bold text-[11px] hidden';
          hintBox.style.background = canon.color + '22';
          hintBox.style.color = canon.color;
          hintBox.classList.remove('hidden');
          const nm = document.getElementById('roomName');
          // El nombre se autocompleta con el nivel legible, no con "1ro – Línea Roja"
          if (nm && !nm.value.trim()) nm.value = canon.displayLevel || canon.level;
        } else if (special) {
          hintBox.classList.remove('hidden');
          hintBox.className = 'mt-2 px-3 py-2 rounded-xl text-[11px] font-bold';
          hintBox.style.background = special.color + '1F';
          hintBox.style.color = special.color;
          hintText.textContent = `${special.emoji} Clase especial — sin restricción de rango de edad`;
          const nm = document.getElementById('roomName');
          if (nm && !nm.value.trim()) nm.value = special.displayName;
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


