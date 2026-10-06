import { DirectorApi } from './api.js';
import { Helpers } from '../shared/helpers.js';
import { UI } from './ui.module.js';
import { AppState } from './state.js';
import { supabase } from '../shared/supabase.js';
import { auditLog } from '../shared/db-utils.js';
import { requireReauth } from '../shared/reauth.js';
import { QueryCache } from '../shared/query-cache.js';
import {
  findCanonicalClassroom,
  findSpecialClassroom,
  formatClassroomLevel,
  formatClassroomFullName,
  sanitizeClassroomDisplayName,
  dedupeClassrooms,
} from '../shared/constants.js';

const ROLE_BADGE = Object.freeze({
  maestra:    'bg-emerald-100 text-emerald-700',
  asistente:  'bg-orange-100 text-orange-700',
  encargada: 'bg-purple-100 text-purple-700',
  directora: 'bg-blue-100 text-blue-700',
  admin:     'bg-indigo-100 text-indigo-700',
  padre:     'bg-slate-100 text-slate-600',
});

const ROLE_LABEL = Object.freeze({
  maestra:    'Maestro/a',
  asistente:  'Asistente',
  encargada: 'Encargada',
  directora: 'Directora',
  admin:     'Administrador',
  padre:     'Padre/Madre',
});

const QR_PREFIX = Object.freeze({
  maestra:    'TEA',
  asistente:  'ASI',
  encargada: 'ENC',
  directora: 'DIR',
  admin:     'ADM',
});

const THEME_COLOR = Object.freeze({
  maestra:    { border: 'border-[#28B54D]',    text: 'text-[#28B54D]',    gradient: 'from-emerald-50' },
  asistente:  { border: 'border-orange-500]',   text: 'text-orange-600',   gradient: 'from-orange-50' },
  encargada: { border: 'border-purple-500]',   text: 'text-purple-600',   gradient: 'from-purple-50' },
  directora: { border: 'border-[#0B63C7]',    text: 'text-[#0B63C7]',    gradient: 'from-[#E8F2FF]/60' },
  admin:     { border: 'border-indigo-500]',   text: 'text-indigo-600',   gradient: 'from-indigo-50' },
  otro:      { border: 'border-slate-400]',    text: 'text-slate-700',    gradient: 'from-slate-50' },
  all:       { border: 'border-[#0B63C7]',    text: 'text-[#0B63C7]',    gradient: 'from-[#E8F2FF]/60' },
});

export const TeachersModule = {
  _listenersBound: false,
  _currentTab: 'all',
  _view: 'table',

  _loadViewPreference() {
    try {
      const v = localStorage.getItem('dc_staff_view');
      if (v === 'grid' || v === 'table') this._view = v;
    } catch (_) {}
  },

  _saveViewPreference() {
    try { localStorage.setItem('dc_staff_view', this._view); } catch (_) {}
  },

  _paintToggleLabel() {
    const btn = document.getElementById('btnToggleStaffView');
    if (!btn) return;
    const isGrid = this._view === 'grid';
    btn.innerHTML = `<i data-lucide="${isGrid ? 'table' : 'layout-grid'}"></i> ` +
      `<span data-staff-view-label>${isGrid ? 'Ver tabla' : 'Ver tarjetas'}</span>`;
    btn.setAttribute('aria-pressed', String(isGrid));
    btn.setAttribute('title', isGrid ? 'Cambiar a vista de tabla' : 'Cambiar a vista de tarjetas');
  },

  _applyView() {
    const table = document.getElementById('teachersTableWrapper');
    const grid = document.getElementById('teachersGrid');
    if (this._view === 'grid') {
      table?.classList.add('hidden');
      grid?.classList.remove('hidden');
    } else {
      table?.classList.remove('hidden');
      grid?.classList.add('hidden');
    }
    this._paintToggleLabel();
  },

  async init(renderTargetId = 'teachersTableBody') {
    const container = document.getElementById(renderTargetId);
    if (!container) return;

    this._loadViewPreference();
    this._bindViewToggle();
    this._applyView();

    const loadingHtml = '<tr><td colspan="6" class="text-center py-8">Cargando...</td></tr>';
    container.innerHTML = loadingHtml;
    const gridLoading = document.getElementById('teachersGrid');
    if (gridLoading) {
      gridLoading.innerHTML = '<div class="dc-empty"><i data-lucide="loader-2"></i><span>Cargando personal...</span></div>';
    }

    try {
      const { data: teachers, error } = await DirectorApi.getTeachers();
      if (error) throw new Error(error);

      const normalized = teachers || [];
      const total = normalized.length;
      const active = normalized.filter(t => t.is_active !== false).length;
      const assistants = normalized.filter(t => t.role === 'asistente').length;
      const inClass = normalized.filter(t => t.class_ids && t.class_ids.length).length;

      const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setTxt('kpiStaffTotal', total);
      setTxt('kpiStaffActive', active);
      setTxt('kpiStaffInClass', inClass);
      setTxt('kpiStaffAssistants', assistants);

      // Contadores para Tabs de roles
      const cnt = { all: total, maestra: 0, asistente: 0, encargada: 0, otro: 0 };
      for (const t of normalized) {
        if (t.role === 'maestra') cnt.maestra++;
        else if (t.role === 'asistente') cnt.asistente++;
        else if (t.role === 'encargada') cnt.encargada++;
        else cnt.otro++;
      }
      setTxt('tabCntAll', cnt.all);
      setTxt('tabCntMaestros', cnt.maestra);
      setTxt('tabCntAsistentes', cnt.asistente);
      setTxt('tabCntEncargadas', cnt.encargada);
      setTxt('tabCntOtros', cnt.otro);

      AppState.set('teachers', normalized);
      this.render(normalized, renderTargetId);

      // Bindings únicos (solo primera vez)
      if (!this._listenersBound) {
        this._listenersBound = true;

        // BUSCADOR EN TIEMPO REAL
        const searchInput = document.getElementById('searchTeacher');
        if (searchInput) {
          searchInput.addEventListener('input', () => {
            const allStaff = AppState.get('teachers') || [];
            this._applyFilter(allStaff);
          });
        }

        // TABS: separación de roles
        document.querySelectorAll('.teacher-tab-btn').forEach((tab) => {
          tab.addEventListener('click', () => {
            const tabName = (tab.getAttribute('data-teacher-tab') || 'all').toString();
            this._currentTab = tabName;
            // Resetear estilos de todas las tabs
            document.querySelectorAll('.teacher-tab-btn').forEach((t) => {
              t.classList.remove(
                'teacher-tab--active',
                'border-[#0B63C7]', 'border-[#28B54D]', 'border-orange-500]', 'border-purple-500]', 'border-slate-400]', 'border-indigo-500]',
                'text-[#0B63C7]', 'text-[#28B54D]', 'text-orange-600', 'text-purple-600', 'text-slate-700', 'text-indigo-600'
              );
              t.classList.add('border-transparent', 'text-slate-500');
              // Quitar bg
              t.className = t.className.replace(/bg-gradient-to-b\s+from-\S+/g, '').trim();
            });
            // Aplicar estilos a la tab activa
            const theme = THEME_COLOR[tabName] || THEME_COLOR.all;
            tab.classList.add('teacher-tab--active', theme.border, theme.text, 'bg-gradient-to-b', theme.gradient, 'to-transparent');
            tab.classList.remove('border-transparent', 'text-slate-500');
            const allStaff = AppState.get('teachers') || [];
            this._applyFilter(allStaff);
          });
        });

        // Botones creación rápida por rol
        const btnAddAsst = document.getElementById('btnAddAssistant');
        if (btnAddAsst) btnAddAsst.addEventListener('click', (e) => { e.preventDefault(); this.openModal(null, 'asistente'); });
        const btnAddEnc = document.getElementById('btnAddEncargada');
        if (btnAddEnc) btnAddEnc.addEventListener('click', (e) => { e.preventDefault(); this.openModal(null, 'encargada'); });
      }

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      container.innerHTML = '<tr><td colspan="5" class="text-center py-8">' + Helpers.errorState('Error al cargar personal', 'App.teachers.init()') + '</td></tr>';
      if (window.lucide) lucide.createIcons();
    }
  },

  _bindViewToggle() {
    const btn = document.getElementById('btnToggleStaffView');
    if (!btn || btn._viewBound) return;
    btn._viewBound = true;
    btn.addEventListener('click', () => {
      this._view = this._view === 'grid' ? 'table' : 'grid';
      this._saveViewPreference();
      this._applyView();
      const allStaff = AppState.get('teachers') || [];
      this._applyFilter(allStaff);
    });
  },

  _applyFilter(allStaff) {
    const search = (document.getElementById('searchTeacher')?.value || '').toLowerCase();
    let filtered = allStaff;
    if (search) {
      filtered = filtered.filter((t) =>
        (t.name || '').toLowerCase().includes(search) ||
        (t.email || '').toLowerCase().includes(search) ||
        ((t.classrooms?.map?.((c) => c?.name)?.join(', ') || '').toLowerCase().includes(search))
      );
    }
    if (this._currentTab && this._currentTab !== 'all') {
      if (this._currentTab === 'otro') {
        filtered = filtered.filter((t) => t.role !== 'maestra' && t.role !== 'asistente' && t.role !== 'encargada');
      } else {
        filtered = filtered.filter((t) => t.role === this._currentTab);
      }
    }
    this.render(filtered);
  },

  render(staff, renderTargetId = 'teachersTableBody') {
    const container = document.getElementById(renderTargetId);
    const grid = document.getElementById('teachersGrid');
    if (!container && !grid) return;

    this._applyView();

    if (!staff || !staff.length) {
      if (container) container.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500">No hay personal que coincida con el filtro actual.</td></tr>';
      if (grid) grid.innerHTML = '<div class="dc-empty"><i data-lucide="user-x"></i><span>No hay personal que coincida con el filtro actual.</span></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    const meta = (t) => {
      const roleBadge = ROLE_BADGE[t.role] || 'bg-slate-100 text-slate-600';
      const roleLbl = ROLE_LABEL[t.role] || t.role || 'Personal';
      const roleIcon = {
        maestra:    '<i data-lucide="book-open" class="w-3 h-3"></i>',
        asistente:  '<i data-lucide="clipboard-list" class="w-3 h-3"></i>',
        encargada: '<i data-lucide="award" class="w-3 h-3"></i>',
        directora: '<i data-lucide="shield" class="w-3 h-3"></i>',
        admin:     '<i data-lucide="briefcase" class="w-3 h-3"></i>',
      }[t.role] || '<i data-lucide="user" class="w-3 h-3"></i>';

      // ✅ Deduplicar aulas + sanitizar nombres (evita "parvalo 2 (variante — canon parvulos i), Párvulos I")
      const rawRooms = Array.isArray(t.classrooms) ? t.classrooms.filter(Boolean) : [];
      const sanitizedRooms = rawRooms.map((c) => {
        const n = sanitizeClassroomDisplayName(c?.name || '');
        const l = sanitizeClassroomDisplayName(c?.level || '');
        const canon = findCanonicalClassroom(l || n);
        const spec = canon ? null : (findSpecialClassroom(n) || findSpecialClassroom(l));
        return {
          ...(c || {}),
          name:  canon?.displayLevel || spec?.displayName || formatClassroomFullName(n, l),
          level: canon?.level || spec?.key || l,
        };
      });
      const deduped = dedupeClassrooms(sanitizedRooms);
      const classroomsLbl = deduped.length
        ? deduped.map((c) => String(c.name || '').trim()).filter(Boolean).join(', ')
        : 'Sin Aula';
      const canon = findCanonicalClassroom(deduped.map((c) => c?.level || c?.name).join(' '));
      return { roleBadge, roleLbl, roleIcon, classroomsLbl, canon, color: canon?.color || '#0B63C7' };
    };

    if (container) {
      container.innerHTML = staff.map((t) => {
        const { roleBadge, roleLbl, roleIcon, classroomsLbl } = meta(t);
        return `
        <tr class="hover:bg-slate-50 transition-colors cursor-pointer" ondblclick="App.teachers.openModal('${t.id}')">
          <td class="p-4 font-bold text-slate-700">${Helpers.escapeHTML(t.name)}</td>
          <td class="p-4 text-slate-500">${Helpers.escapeHTML(t.email || '')}</td>
          <td class="p-4"><span class="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black uppercase text-slate-500">${Helpers.escapeHTML(classroomsLbl)}</span></td>
          <td class="p-4"><span class="inline-flex items-center gap-1.5 px-3 py-1 ${roleBadge} rounded-full text-[10px] font-black uppercase tracking-wider">
            ${roleIcon} ${Helpers.escapeHTML(roleLbl)}
          </span></td>
          <td class="p-4"><span class="inline-flex items-center gap-1.5 px-3 py-1 ${t.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'} rounded-full text-[10px] font-black uppercase tracking-wider">
            <span class="w-1.5 h-1.5 rounded-full ${t.is_active !== false ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
            ${t.is_active !== false ? 'Activo' : 'Inactivo'}
          </span></td>
          <td class="p-4 text-right">
            <div class="flex justify-end gap-2">
              <button onclick="App.teachers.openModal('${t.id}')" class="w-9 h-9 flex items-center justify-center bg-[#E8F2FF] text-[#0B63C7] hover:bg-[#0B63C7] hover:text-white rounded-xl transition-all" title="Editar">
                <i data-lucide="settings" class="w-4 h-4"></i>
              </button>
              <button onclick="App.teachers.delete('${t.id}')" class="w-9 h-9 flex items-center justify-center bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl transition-all" title="Eliminar">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    if (grid) {
      grid.innerHTML = staff.map((t) => {
        const { roleBadge, roleLbl, roleIcon, classroomsLbl, color } = meta(t);
        const initial = (t.name || '?').trim().charAt(0).toUpperCase();
        const active = t.is_active !== false;
        return `
        <article class="dc-student ${active ? '' : 'dc-student--off'}" style="--room:${color}"
          onclick="App.teachers.openModal('${t.id}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.teachers.openModal('${t.id}')}"
          tabindex="0" role="button" aria-label="Abrir ficha de ${Helpers.escapeHTML(t.name || '')}">

          <div class="dc-student-top">
            <div class="dc-student-av">
              ${t.avatar_url ? `<img src="${Helpers.escapeHTML(t.avatar_url)}" alt="">` : Helpers.escapeHTML(initial)}
            </div>
            <div class="dc-student-id">
              <h3 class="dc-student-name">${Helpers.escapeHTML(t.name || 'Sin nombre')}</h3>
              <span class="dc-student-mat">${Helpers.escapeHTML(t.email || 'Sin correo')}</span>
              <div class="dc-student-badges">
                <span class="dc-badge dc-badge--room" style="--room:${color}">
                  <i data-lucide="door-open"></i><span>${Helpers.escapeHTML(classroomsLbl)}</span>
                </span>
                <span class="dc-badge dc-badge--off">
                  ${roleIcon} ${Helpers.escapeHTML(roleLbl)}
                </span>
              </div>
            </div>
          </div>

          <div class="dc-student-stats">
            <div class="dc-student-stat">
              <span class="dc-student-stat-k">Estado</span>
              <span class="dc-student-stat-v" style="color:${active ? '#047857' : 'var(--dc-faint)'}">${active ? 'Activo' : 'Inactivo'}</span>
            </div>
            <div class="dc-student-stat">
              <span class="dc-student-stat-k">Teléfono</span>
              <span class="dc-student-stat-v">${Helpers.escapeHTML(t.phone || '—')}</span>
            </div>
          </div>

          <div class="dc-student-foot">
            <span class="dc-badge ${active ? 'dc-badge--on' : 'dc-badge--off'}">
              <i data-lucide="${active ? 'check' : 'pause'}"></i>${active ? 'Activo' : 'Inactivo'}
            </span>
            <div class="dc-student-actions">
              <button class="dc-icon-btn" onclick="event.stopPropagation();App.teachers.openModal('${t.id}')" title="Editar">
                <i data-lucide="pencil"></i>
              </button>
              <button class="dc-icon-btn dc-icon-btn--danger" onclick="event.stopPropagation();App.teachers.delete('${t.id}')" title="Eliminar">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
        </article>`;
      }).join('');
    }

    if (window.lucide) lucide.createIcons();
  },

  async delete(id) {
    const teacher = (AppState.get('teachers') || []).find(t => t.id === id);
    const name = teacher?.name || 'este usuario';
    const role = teacher?.role === 'asistente' ? 'asistente' : 'maestra';
    
    const ok = window.confirm(`¿Eliminar a "${name}" (${role})?\n\nEsta acción no se puede deshacer. El usuario perderá acceso al sistema inmediatamente.`);
    if (!ok) return;

    const reauth = await requireReauth({ message: 'eliminar esta cuenta de personal' });
    if (!reauth) return;

    UI.setLoading(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      
      await auditLog('staff.delete', { staff_id: id, name, role });
      Helpers.toast(`${role.charAt(0).toUpperCase() + role.slice(1)} eliminada correctamente`, 'success');
      this.init();
    } catch (e) {
      console.error('[Teachers] Error deleting:', e);
      Helpers.toast('No se pudo eliminar: ' + (e.message || 'Error de base de datos'), 'error');
    } finally {
      UI.setLoading(false);
    }
  },

  async save() {
    const id = document.getElementById('tId')?.value;
    const tSel = document.getElementById('tClassroom');
    const classroom_ids = tSel ? Array.from(tSel.selectedOptions).map(o => o.value).filter(Boolean) : [];
    const payload = {
      name:      (document.getElementById('tName').value || '').trim(),
      phone:     (document.getElementById('tPhone').value || '').trim(),
      role:      document.getElementById('tRole').value,
      classroom_ids,
      is_active: document.getElementById('tActive').checked
    };
    // email solo para crear, no para actualizar (Supabase no permite update de email via profiles)
    const emailVal = (document.getElementById('tEmail').value || '').trim();
    if (!id) payload.email = emailVal; // solo en creación

    const matricula = (document.getElementById('tMatricula').value || '').trim();
    if (matricula) payload.access_code = matricula;
    
    const password = document.getElementById('tPassword')?.value;

    if (!payload.name || payload.name.length < 3) return Helpers.toast('Nombre inv�lido (min 3 caracteres)', 'warning');
    if (!id && !emailVal) return Helpers.toast('Correo requerido', 'warning');
    
    UI.setLoading(true);
    try {
      let res;
      if (id) {
        res = await DirectorApi.updateTeacher(id, payload);
      } else {
        if (!password || password.length < 6) throw new Error('Contraseña requerida (mínimo 6 caracteres)');
        
        // Use main supabase client for signUp (avoids multiple GoTrueClient warning)
        // The tempClient approach causes "Multiple GoTrueClient instances" warnings
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: emailVal,
          password: password,
          options: { data: { name: payload.name, role: payload.role, phone: payload.phone } }
        });
        
        if (authError) {
          // If user already exists, try to find their profile and update it
          if (authError.status === 422 || authError.message?.toLowerCase().includes('already registered')) {
            const { data: existingProf } = await supabase.from('profiles').select('id').eq('email', emailVal).maybeSingle();
            if (existingProf?.id) {
              await DirectorApi.updateTeacher(existingProf.id, payload);
              res = { data: existingProf, error: null };
            } else {
              throw authError;
            }
          } else {
            throw authError;
          }
        } else if (authData.user) {
          // Wait briefly for auth trigger
          await new Promise(r => setTimeout(r, 1500));
          
          // First check if profile already exists (maybe created by trigger)
          const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', authData.user.id).maybeSingle();
          
          // Map role: 'encargada' uses 'asistente' until constraint migration runs in Supabase
          // Run fix_rls_safe.sql to allow 'encargada' natively
          const VALID_ROLES = ['directora', 'maestra', 'asistente', 'encargada', 'padre', 'admin'];
          const safeRole = VALID_ROLES.includes(payload.role) ? payload.role : 'maestra';
          // Fallback: if constraint still blocks encargada, use asistente
          const dbRole = safeRole;

          const corePayload = {
            name:        payload.name,
            role:        dbRole,
            phone:       payload.phone || null,
            access_code: payload.access_code || null,
            is_active:   payload.is_active !== false
          };

          if (existingProfile) {
            // Profile already exists (trigger created it): update with correct data
            const { error: updateErr } = await supabase.from('profiles')
              .update(corePayload)
              .eq('id', authData.user.id);
            if (updateErr) console.warn('[Teachers] update profile failed:', updateErr.message);
          } else {
            // Profile doesn't exist: insert it
            const insertPayload = { id: authData.user.id, email: emailVal, ...corePayload };
            const { error: insertErr } = await supabase.from('profiles').insert(insertPayload);
            if (insertErr) {
              console.warn('[Teachers] insert failed:', insertErr.message, insertErr.code);
              // If check constraint blocks the role, fallback to 'asistente'
              if (insertErr.message?.includes('check constraint') || insertErr.code === '23514') {
                const { error: fbErr } = await supabase.from('profiles').insert({ ...insertPayload, role: 'asistente' });
                if (fbErr) console.error('[Teachers] fallback insert also failed:', fbErr.message);
                else Helpers.toast('⚠️ Rol guardado como "asistente" — ejecuta fix_rls_safe.sql para habilitar "encargada"', 'warning');
              } else {
                // Retry once after delay (Supabase trigger may be slow)
                await new Promise(r => setTimeout(r, 800));
                const { error: retryErr } = await supabase.from('profiles').insert(insertPayload);
                if (retryErr) console.error('[Teachers] retry insert failed:', retryErr.message);
              }
            }
          }
          
          // Verify profile was saved
          const { data: verifyOk } = await supabase.from('profiles').select('id').eq('id', authData.user.id).maybeSingle();
          if (!verifyOk) {
            console.error('[Teachers] Profile still missing after all attempts');
            Helpers.toast('⚠️ Perfil no guardado. Ejecuta sql/10_fixes.sql en Supabase SQL Editor', 'warning');
          }
          
          // Assign classrooms (pueden ser varias)
          if (classroom_ids.length) {
            await supabase.from('classrooms').update({ teacher_id: authData.user.id }).in('id', classroom_ids);
          }
          
          res = { data: authData.user, error: null };
        }
      }
      
      const { error } = res || {};
      if (error) throw new Error(error?.message || error?.details || JSON.stringify(error));
      
      const roleName = { 'maestra': 'Maestra', 'asistente': 'Asistente', 'encargada': 'Encargada' }[payload.role] || 'Personal';
      Helpers.toast(id ? `${roleName} actualizado/a correctamente ✅` : `${roleName} creada correctamente ✅`, 'success');
      UI.closeModal();
      // Invalidate cache so init() fetches fresh data from DB
      QueryCache.invalidate('dir_teachers');
      // Small delay to ensure DB has processed
      await new Promise(r => setTimeout(r, 600));
      await this.init();
    } catch (e) {
      Helpers.toast('Error al guardar: ' + (e.message || e), 'error');
    } finally {
      UI.setLoading(false);
    }
  },

  async openModal(id = null, defaultRole = 'maestra') {
    const inputClass = "w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 focus:border-[#0B63C7] bg-slate-50/50 transition-all text-sm font-medium";
    const labelClass = "block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1";
    this._classPickerState = { rooms: [], term: '' };

    const modalHTML = `
      <div class="modal-header bg-gradient-to-r from-[#0B63C7] to-[#0850A0] text-white p-6 rounded-t-3xl flex items-center">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner"><i data-lucide="users" class="w-6 h-6 text-white"></i></div>
          <div>
            <h3 class="text-xl font-black">${id ? 'Editar Personal' : 'Gestión de Personal'}</h3>
            <p class="text-xs text-white/70 font-bold uppercase tracking-widest">Maestras, Asistentes y Encargadas</p>
          </div>
        </div>
      </div>
      <div class="modal-body p-8 bg-slate-50/30" id="teacherForm">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <input type="hidden" id="tId" value="${id || ''}" />
          <div class="col-span-2">
            <label class="${labelClass}">Nombre completo</label>
            <input id="tName" placeholder="Ej: Maria Lopez" class="${inputClass}">
          </div>
          
          <div>
            <label class="${labelClass}">Correo electrónico</label>
            <input id="tEmail" placeholder="usuario@karpus.com" type="email" class="${inputClass}">
          </div>

          <div class="col-span-2 bg-gradient-to-br from-orange-50 to-amber-50 p-6 rounded-[2rem] border-2 border-orange-100 space-y-4">
            <h4 class="text-sm font-black text-orange-800 flex items-center gap-2">
              <div class="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center"><i data-lucide="qr-code" class="w-4 h-4"></i></div>
              CÓDIGO QR DE ACCESO (PERSONAL)
            </h4>
            <p class="text-xs text-orange-600 font-medium leading-relaxed">Este código permite al personal registrar su propia asistencia en el terminal de ponche.</p>
            
            <div class="bg-white p-6 rounded-3xl border border-orange-100 shadow-sm flex flex-col items-center gap-4">
              <div class="flex gap-2 w-full">
                <div class="relative flex-1">
                  <i data-lucide="hash" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                  <input id="tMatricula" placeholder="Generar ID Empleado..." class="${inputClass} pl-10 bg-white border-orange-50 focus:border-orange-300">
                </div>
                <button type="button" onclick="window.genStaffCode()" class="px-6 py-2 bg-orange-600 text-white rounded-2xl font-black text-xs uppercase hover:bg-orange-700 shadow-md transition-all active:scale-95">Generar</button>
              </div>

              <div id="staff-qr-container" class="bg-white p-3 rounded-2xl border-2 border-slate-100 shadow-sm min-h-[160px] flex items-center justify-center w-full max-w-[180px]">
                <p class="text-[10px] text-slate-400 font-black uppercase text-center leading-tight">Ingresa un ID<br>para ver el QR</p>
              </div>

              <div class="flex gap-2 w-full">
                <button type="button" id="btn-print-staff-qr" onclick="window.printStaffQR()"
                  class="flex-1 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
                  <i data-lucide="printer" class="w-3.5 h-3.5"></i> Imprimir Carnet
                </button>
              </div>
            </div>
          </div>

          <div>
            <label class="${labelClass}">Teléfono</label>
            <input id="tPhone" placeholder="Opcional" type="tel" class="${inputClass}">
          </div>

          <div class="col-span-2" id="passwordFieldContainer" style="${id ? 'display:none' : ''}">
            <label class="${labelClass}">Contraseña <span class="text-rose-400 normal-case ml-1 font-normal">(Mínimo 6 caracteres)</span></label>
            <div class="relative">
              <i data-lucide="lock" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
              <input id="tPassword" placeholder="Crear contraseña de acceso" type="text" class="${inputClass} pl-10">
            </div>
            <p class="text-[10px] text-slate-400 mt-1 ml-1">* Solo requerida para nuevos usuarios</p>
          </div>

          <div>
            <label class="${labelClass}">Rol</label>
            <select id="tRole" class="${inputClass}">
              <option value="maestra">Maestra</option>
              <option value="asistente">Asistente</option>
              <option value="encargada">Encargada</option>
            </select>
          </div>
          <div>
            <label class="${labelClass}">Aulas asignadas <span class="text-slate-300 normal-case font-normal">(pueden ser varias)</span></label>
            <select id="tClassroom" multiple class="sr-only" aria-hidden="true" tabindex="-1">
              <option value="" disabled>Sin aulas</option>
            </select>
            <div class="dc-pick" id="tRoomPicker">
              <div class="dc-pick-head">
                <div class="dc-search dc-search--sm">
                  <i data-lucide="search"></i>
                  <input type="text" id="tRoomSearch" placeholder="Buscar aula o línea..." autocomplete="off" />
                </div>
                <span class="dc-pick-counter" id="tRoomCount">0 / 0</span>
              </div>
              <div class="dc-pick-list" id="tRoomList">
                <div class="dc-empty"><span>Cargando aulas...</span></div>
              </div>
            </div>
            <p class="text-[10px] text-slate-400 mt-1 ml-1 font-bold">Marca cada aula de la maestra. El color identifica la línea oficial.</p>
          </div>
          <div class="col-span-2">
            <label class="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl cursor-pointer">
              <input type="checkbox" id="tActive" checked class="w-5 h-5 rounded text-[#0B63C7] focus:ring-blue-200">
              <span class="text-sm font-bold text-slate-700">Cuenta Activa</span>
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer bg-white p-6 rounded-b-3xl border-t border-slate-100 flex justify-end gap-3">
        <button onclick="App.ui.closeModal()" class="px-8 py-3 text-slate-500 font-black text-xs uppercase hover:bg-slate-100 rounded-2xl transition-all">Cancelar</button>
        <button onclick="App.teachers.save()" class="px-10 py-3 bg-gradient-to-r from-[#0B63C7] to-[#0850A0] text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5 transition-all active:scale-95">Guardar Personal</button>
      </div>`;

    window.openGlobalModal(modalHTML);

    // Función para generar código de acceso del personal (prefix dinámico según rol)
    window.genStaffCode = async () => {
      const roleSel = document.getElementById('tRole');
      const selectedRole = roleSel?.value || defaultRole || 'maestra';
      const prefix = QR_PREFIX[selectedRole] || 'TEA';
      const code = prefix + '-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
      const input = document.getElementById('tMatricula');
      if (input) {
        input.value = code;
        window.renderStaffQR(code);
        // If editing an existing teacher, save immediately
        const teacherId = document.getElementById('tId')?.value;
        if (teacherId) {
          const { error } = await supabase.from('profiles').update({ access_code: code }).eq('id', teacherId);
          if (!error) {
            Helpers.toast('Código de acceso guardado', 'success');
            // Update cache
            const teachers = AppState.get('teachers') || [];
            const idx = teachers.findIndex(t => t.id === teacherId);
            if (idx >= 0) teachers[idx].access_code = code;
          }
        }
      }
    };

    // Buscador del selector de aulas
    const roomSearch = document.getElementById('tRoomSearch');
    if (roomSearch && !roomSearch._bound) {
      roomSearch._bound = true;
      roomSearch.addEventListener('input', Helpers.debounce(() => {
        this._classPickerState.term = roomSearch.value.trim().toLowerCase();
        this._renderClassPicker();
      }, 200));
    }

    // Pre-seleccionar rol por defecto (creación nueva) y placeholder adaptativo
    if (!id) {
      setTimeout(() => {
        const roleSel = document.getElementById('tRole');
        if (roleSel) roleSel.value = defaultRole;
        const matInput = document.getElementById('tMatricula');
        if (matInput) {
          const placeholderMap = {
            maestra: 'Generar ID Maestro...',
            asistente: 'Generar ID Asistente...',
            encargada: 'Generar ID Encargada...',
            directora: 'Generar ID Directora...',
            admin: 'Generar ID Admin...'
          };
          matInput.placeholder = placeholderMap[defaultRole] || 'Generar ID Empleado...';
        }
      }, 50);
    }

    // Listener: al cambiar el rol, actualizar placeholder
    setTimeout(() => {
      const roleSel = document.getElementById('tRole');
      const matInput = document.getElementById('tMatricula');
      if (roleSel && matInput) {
        roleSel.addEventListener('change', () => {
          const placeholderMap = {
            maestra: 'Generar ID Maestro...',
            asistente: 'Generar ID Asistente...',
            encargada: 'Generar ID Encargada...',
            directora: 'Generar ID Directora...',
            admin: 'Generar ID Admin...'
          };
          matInput.placeholder = placeholderMap[roleSel.value] || 'Generar ID Empleado...';
        });
      }
    }, 100);

    window.renderStaffQR = async (code) => {
      const container = document.getElementById('staff-qr-container');
      if (!container) return;
      
      if (!code) {
        container.innerHTML = '<p class="text-[10px] text-slate-400 font-black uppercase text-center leading-tight">Ingresa un ID<br>para ver el QR</p>';
        return;
      }

      // Cargar librer�a QR si no est�
      if (!window.QRCode) {
        await new Promise(resolve => {
          const s = document.createElement('script');
          s.src = 'js/shared/qrcode.min.js';
          s.onload = resolve;
          document.head.appendChild(s);
        });
      }
      container.innerHTML = '';
      new window.QRCode(container, {
        text: JSON.stringify({ matricula: code, type: 'karpus-staff', v: 1 }),
        width: 140, height: 140,
        colorDark: '#1e293b', colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    };

    window.printStaffQR = () => {
      const matricula = document.getElementById('tMatricula')?.value?.trim();
      const name = document.getElementById('tName')?.value?.trim();
      const role = document.getElementById('tRole')?.value?.trim();
      const container = document.getElementById('staff-qr-container');
      if (!container || !matricula) { Helpers.toast('Genera el QR primero', 'warning'); return; }

      const qrImg = container.querySelector('img')?.src || container.querySelector('canvas')?.toDataURL();
      if (!qrImg) { Helpers.toast('Genera el QR primero', 'warning'); return; }

      const win = window.open('', '_blank');
      const escName = Helpers.escapeHTML(name || 'Personal');
      const escRole = Helpers.escapeHTML(role || 'Maestra');
      const escMat = Helpers.escapeHTML(matricula || '');
      win.document.write(`<!DOCTYPE html><html><head><title>Carnet Personal - ${escName}</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fff; }
          .card { border: 4px solid #4f46e5; border-radius: 24px; padding: 30px; text-align: center; max-width: 300px; position: relative; }
          .header { background: #4f46e5; color: white; margin: -30px -30px 20px -30px; padding: 15px; border-radius: 20px 20px 0 0; font-weight: 900; text-transform: uppercase; font-size: 14px; }
          img { width: 180px; height: 180px; border: 4px solid #f8fafc; border-radius: 12px; }
          .name { font-size: 18px; font-weight: 900; color: #1e293b; margin-top: 15px; }
          .role { font-size: 12px; color: #4f46e5; font-weight: 800; text-transform: uppercase; margin-top: 2px; }
          .id { font-size: 11px; color: #64748b; font-weight: 700; margin-top: 10px; border-top: 1px solid #eee; pt: 10px; }
        </style>
      </head><body>
        <div class="card">
          <div class="header">STAFF • COLEGIO MONTESSORI SONRISAS CREATIVAS</div>
          <img src="${qrImg}" alt="QR">
          <div class="name">${escName}</div>
          <div class="role">${escRole}</div>
          <div class="id">ID: ${escMat}</div>
        </div>
        <script>window.onload=()=>{window.print();}<\/script>
      </body></html>`);
      win.document.close();
    };

    // Escuchar cambios en el input de matrícula para actualizar QR
    document.getElementById('tMatricula')?.addEventListener('input', (e) => {
      clearTimeout(window._staffQrDebounce);
      window._staffQrDebounce = setTimeout(() => window.renderStaffQR(e.target.value.trim()), 600);
    });

    try {
      const { data: rooms } = await DirectorApi.getClassroomsWithOccupancy();
      const select = document.getElementById('tClassroom');
      if (select && rooms?.length) {
        select.innerHTML = rooms.map(r => `<option value="${r.id}">${Helpers.escapeHTML(formatClassroomFullName(r.name, r.level).trim())}</option>`).join('');
      }
      this._classPickerState = { rooms: rooms || [], term: '' };
      this._renderClassPicker();
    } catch (_) {
      const list = document.getElementById('tRoomList');
      if (list) list.innerHTML = '<div class="dc-empty"><i data-lucide="alert-triangle"></i><span>No se pudieron cargar las aulas.</span></div>';
      if (window.lucide) lucide.createIcons();
    }

    if (id) {
      const teachers = AppState.get('teachers') || [];
      let teacher = teachers.find(t => t.id == id);
      // Fetch from DB to get access_code and notes
      if (!teacher || !teacher.access_code) {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, email, phone, role, is_active, access_code')
          .eq('id', id)
          .maybeSingle();
        if (data) teacher = { ...teacher, ...data };
      }
      if (teacher) {
        const setVal = (eid, val) => { const e = document.getElementById(eid); if(e) e.value = val || ''; };
        setVal('tId', teacher.id);
        setVal('tName', teacher.name);
        setVal('tPhone', teacher.phone);
        setVal('tEmail', teacher.email);
        setVal('tRole', teacher.role);
        // Use access_code first, fallback to notes for legacy
        const code = teacher.access_code || (teacher.notes?.startsWith?.('TEA-') || teacher.notes?.startsWith?.('DIR-') || teacher.notes?.startsWith?.('ASI-') ? teacher.notes : null);
        setVal('tMatricula', code || '');
        const classIds = teacher.class_ids || (Array.isArray(teacher.classrooms) ? teacher.classrooms.map(c => c?.id).filter(Boolean) : (teacher.classroom_id ? [teacher.classroom_id] : []));
        if (classIds.length) {
          const sel = document.getElementById('tClassroom');
          if (sel) {
            classIds.forEach(cid => {
              const opt = sel.querySelector(`option[value="${cid}"]`);
              if (opt) opt.selected = true;
            });
          }
        }
        this._renderClassPicker();
        const checkActive = document.getElementById('tActive');
        if(checkActive) checkActive.checked = teacher.is_active !== false;
        // Auto-render QR if has code
        if (code) setTimeout(() => window.renderStaffQR(code), 400);
      }
    }
    if (window.lucide) lucide.createIcons();
  },

  /**
   * Dibuja el selector de aulas (fuente de verdad: <select id="tClassroom">).
   * Muestra línea oficial, ocupación y cupos libres de cada aula.
   */
  _renderClassPicker() {
    const list = document.getElementById('tRoomList');
    const sel = document.getElementById('tClassroom');
    if (!list || !sel) return;
    const { rooms = [], term = '' } = this._classPickerState || {};

    const selectedIds = new Set(Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean));

    const visible = term
      ? rooms.filter(r => {
          const canon = findCanonicalClassroom(r.level || r.name);
          return `${r.name || ''} ${r.level || ''} ${canon?.line || ''}`.toLowerCase().includes(term);
        })
      : rooms;

    const counter = document.getElementById('tRoomCount');
    if (counter) counter.innerHTML = `<b>${selectedIds.size}</b> de ${rooms.length}`;

    if (!rooms.length) {
      list.innerHTML = '<div class="dc-empty"><i data-lucide="door-closed"></i><span>Aún no hay aulas registradas.</span></div>';
    } else if (!visible.length) {
      list.innerHTML = '<div class="dc-empty"><i data-lucide="search-x"></i><span>Sin coincidencias.</span></div>';
    } else {
      list.innerHTML = visible.map(r => {
        const canon = findCanonicalClassroom(r.level || r.name);
        const color = canon?.color || '#0B63C7';
        const occ = Number(r.student_count || 0);
        const cap = Number(r.capacity || 20);
        const free = Math.max(0, cap - occ);
        const pct = cap > 0 ? Math.round((occ / cap) * 100) : 0;
        const checked = selectedIds.has(r.id);
        return `<label class="dc-pick-item${checked ? ' is-on' : ''}" style="--room:${color}">
          <input type="checkbox" class="dc-pick-check" data-room="${r.id}" ${checked ? 'checked' : ''} aria-label="Asignar ${Helpers.escapeHTML(r.name || 'aula')}">
          <span class="dc-pick-info">
            <span class="dc-pick-name">${Helpers.escapeHTML(formatClassroomFullName(r.name, r.level))}</span>
            <span class="dc-pick-line"><i></i> ${Helpers.escapeHTML(canon?.line ? 'Línea ' + canon.line : (canon?.displayLevel || formatClassroomLevel(r.level) || 'General'))}</span>
            <span class="dc-pick-cap">
              <span class="dc-pick-cap-track"><span class="dc-pick-cap-fill${free === 0 ? ' dc-pick-cap-fill--full' : ''}" style="width:${Math.min(100, pct)}%"></span></span>
              <span class="dc-pick-cap-num">${occ}/${cap}</span>
            </span>
          </span>
          <span class="dc-pick-avail${free === 0 ? ' is-full' : ''}">${free === 0 ? 'Sin cupos' : free + (free === 1 ? ' libre' : ' libres')}</span>
        </label>`;
      }).join('');
    }

    list.querySelectorAll('input[data-room]').forEach(input => {
      input.addEventListener('change', () => {
        const id = input.dataset.room;
        const opt = [...sel.options].find(o => o.value === id);
        if (!opt) return;
        opt.selected = input.checked;
        input.closest('.dc-pick-item')?.classList.toggle('is-on', input.checked);
        const c = document.getElementById('tRoomCount');
        if (c) c.innerHTML = `<b>${Array.from(sel.selectedOptions).filter(o => o.value).length}</b> de ${rooms.length}`;
      });
    });

    if (window.lucide) lucide.createIcons();
  },

  generateLazyQR(id, code) {
    const container = document.getElementById(`qr-placeholder-${id}`);
    if (!container) return;

    container.innerHTML = '<div class="animate-spin w-6 h-6 border-2 border-[#0B63C7] rounded-full border-t-transparent"></div>';
    
    // Generación diferida para ahorrar recursos
    setTimeout(() => {
      const qrData = JSON.stringify({ id, code, role: 'teacher' });
      container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}" 
                                  class="w-full h-full border-4 border-white shadow-lg rounded-xl animate-scaleIn" alt="QR Code">`;
      container.classList.remove('border-dashed', 'bg-slate-50', 'cursor-pointer');
      container.onclick = null;
    }, 300);
  }
};

