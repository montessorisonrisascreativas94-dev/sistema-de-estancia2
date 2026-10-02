import { supabase, sendEmail } from '../shared/supabase.js';
import { AssistantApi } from './api.js';
import { Helpers } from '../shared/helpers.js';

/**
 * M�dulo de Gesti�n de Maestros para Asistente
 */
export const TeachersModule = {
  _view: 'table',
  _toggleBound: false,

  _loadView() {
    this._view = 'table';
    try {
      const v = localStorage.getItem('asis_staff_view');
      if (v === 'grid' || v === 'table') this._view = v;
    } catch (_) {}
  },

  _saveView() {
    try { localStorage.setItem('asis_staff_view', this._view); } catch (_) {}
  },

  _paintToggle() {
    const btn = document.getElementById('btnToggleStaffView');
    if (!btn) return;
    const isGrid = this._view === 'grid';
    btn.innerHTML = `<i data-lucide="${isGrid ? 'table' : 'layout-grid'}" class="w-4 h-4"></i>` +
      `<span data-staff-view-label>${isGrid ? 'Ver tabla' : 'Ver tarjetas'}</span>`;
    btn.setAttribute('aria-pressed', String(isGrid));
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
    this._paintToggle();
  },

  async init() {
    this._loadView();
    this._bindToggle();
    this._applyView();

    const btnAdd = document.getElementById('btnAddTeacher');
    if (btnAdd) btnAdd.onclick = () => this.openModal();
    
    const search = document.getElementById('teacherSearch');
    if (search) search.oninput = (e) => this.loadTeachers(e.target.value);

    const btnSave = document.getElementById('btnSaveTeacher');
    if (btnSave) btnSave.onclick = () => this.saveTeacher();

    await this.loadTeachers();
  },

  _bindToggle() {
    if (this._toggleBound) return;
    const btn = document.getElementById('btnToggleStaffView');
    if (!btn) return;
    this._toggleBound = true;
    btn.addEventListener('click', () => {
      this._view = this._view === 'grid' ? 'table' : 'grid';
      this._saveView();
      this._applyView();
      this.loadTeachers(document.getElementById('teacherSearch')?.value || '');
    });
  },

  async loadTeachers(searchTerm = '') {
    const tbody = document.getElementById('teachersTableBody');
    const grid = document.getElementById('teachersGrid');
    if (!tbody && !grid) return;
    this._applyView();

    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-8">${Helpers.skeleton(3, 'h-12')}</td></tr>`;
    if (grid) grid.innerHTML = `<div class="col-span-full p-8">${Helpers.skeleton(3, 'h-12')}</div>`;
    
    try {
      const teachers = await AssistantApi.getTeachersDetail(searchTerm);
      if (!teachers.length) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4">${Helpers.emptyState('No hay maestros registrados')}</td></tr>`;
        if (grid) grid.innerHTML = `<div class="col-span-full">${Helpers.emptyState('No hay maestros registrados')}</div>`;
        if (window.lucide) lucide.createIcons();
        return;
      }

      const ROLE_BADGE = {
        maestra:   'bg-emerald-100 text-emerald-700',
        asistente: 'bg-orange-100 text-orange-700',
        encargada: 'bg-purple-100 text-purple-700',
      };
      const ROLE_LABEL = {
        maestra:   'Maestro/a',
        asistente: 'Asistente',
        encargada: 'Encargada',
      };
      const ROLE_ICON = {
        maestra:   'book-open',
        asistente: 'clipboard-list',
        encargada: 'award',
      };

      if (tbody) {
        tbody.innerHTML = teachers.map(t => `
          <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 cursor-pointer" ondblclick="window.openTeacherModal('${t.id}')">
            <td class="px-6 py-4 font-bold text-slate-700 text-sm">${Helpers.escapeHTML(t.name)}</td>
            <td class="px-6 py-4 text-slate-500 text-xs font-medium uppercase tracking-wider">${Helpers.escapeHTML(t.email || '-')}</td>
            <td class="px-6 py-4 text-slate-500 text-xs font-bold">${Helpers.escapeHTML(t.phone || '-')}</td>
            <td class="px-6 py-4">
              <div class="flex gap-1.5">
                <button onclick="window.openTeacherModal('${t.id}')" class="px-2 py-1 rounded-lg bg-teal-50 text-teal-600 text-[10px] font-black uppercase hover:bg-teal-100 transition-all border border-teal-100 flex items-center gap-1">
                  <i data-lucide="edit-2" class="w-3 h-3"></i>Editar
                </button>
                <button onclick="window.App.teachers.deleteTeacher('${t.id}','${Helpers.escapeHTML(t.name)}')" class="px-2 py-1 rounded-lg bg-rose-50 text-rose-500 text-[10px] font-black uppercase hover:bg-rose-100 transition-all border border-rose-100 flex items-center gap-1">
                  <i data-lucide="trash-2" class="w-3 h-3"></i>Eliminar
                </button>
              </div>
            </td>
          </tr>
        `).join('');
      }

      if (grid) {
        grid.innerHTML = teachers.map(t => {
          const role = t.role || 'maestra';
          const initial = (t.name || '?').trim().charAt(0).toUpperCase();
          return `
            <article class="bg-white rounded-3xl border-2 border-slate-100 shadow-sm hover:shadow-md hover:border-teal-200 transition-all overflow-hidden cursor-pointer group"
              onclick="window.openTeacherModal('${t.id}')"
              onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openTeacherModal('${t.id}')}"
              tabindex="0" role="button" aria-label="Abrir ficha de ${Helpers.escapeHTML(t.name || '')}">

              <div class="p-5 flex items-center gap-3">
                <div class="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 overflow-hidden shrink-0 flex items-center justify-center">
                  ${t.avatar_url
                    ? `<img src="${Helpers.escapeHTML(t.avatar_url)}" class="w-full h-full object-cover" alt="">`
                    : `<span class="font-black text-teal-600 text-lg">${Helpers.escapeHTML(initial)}</span>`}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-black text-slate-700 text-sm truncate group-hover:text-teal-600 transition-colors">${Helpers.escapeHTML(t.name)}</div>
                  <div class="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">${Helpers.escapeHTML(t.email || 'Sin correo')}</div>
                </div>
                <span class="shrink-0 px-2 py-1 rounded-full text-[9px] font-black uppercase ${ROLE_BADGE[role] || 'bg-slate-100 text-slate-600'} flex items-center gap-1">
                  <i data-lucide="${ROLE_ICON[role] || 'user'}" class="w-3 h-3"></i>${Helpers.escapeHTML(ROLE_LABEL[role] || role)}
                </span>
              </div>

              <div class="px-5 pb-4 grid grid-cols-1 gap-2">
                <div class="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                  <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Teléfono</span>
                  <span class="block text-sm font-black text-slate-700">${Helpers.escapeHTML(t.phone || '—')}</span>
                </div>
              </div>

              <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
                <button onclick="event.stopPropagation();window.openTeacherModal('${t.id}')" class="px-3 py-1.5 bg-white text-teal-600 text-[10px] font-black uppercase rounded-xl border border-teal-100 hover:bg-teal-50 transition-all flex items-center gap-1">
                  <i data-lucide="edit-2" class="w-3 h-3"></i>Editar
                </button>
                <button onclick="event.stopPropagation();window.App.teachers.deleteTeacher('${t.id}','${Helpers.escapeHTML(t.name)}')" class="px-3 py-1.5 bg-white text-rose-500 text-[10px] font-black uppercase rounded-xl border border-rose-100 hover:bg-rose-50 transition-all flex items-center gap-1">
                  <i data-lucide="trash-2" class="w-3 h-3"></i>Eliminar
                </button>
              </div>
            </article>`;
        }).join('');
      }
      
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center text-rose-500 py-8 font-bold text-sm">Error cargando maestros</td></tr>`;
      if (grid) grid.innerHTML = `<div class="col-span-full text-center text-rose-500 py-8 font-bold text-sm">Error cargando maestros</div>`;
      if (window.lucide) lucide.createIcons();
    }
  },

  async openModal(id = null) {
    const IC = 'w-full px-4 py-2.5 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-teal-100 focus:border-teal-400 bg-slate-50/50 transition-all text-sm font-medium';
    const LC = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1';

    const html = `
      <div class="bg-gradient-to-r from-teal-600 to-emerald-600 text-white p-4 rounded-t-3xl flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <div class="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center"><i data-lucide="users" class="w-5 h-5 text-white"></i></div>
          <div>
            <h3 class="text-base font-black">${id ? 'Editar Personal' : 'Nuevo Personal'}</h3>
            <p class="text-[9px] text-white/70 font-bold uppercase tracking-widest">Maestras y Asistentes</p>
          </div>
        </div>
        <button onclick="window._closeAsistenteModal()" class="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-all"><i data-lucide="x" class="w-4 h-4 text-white"></i></button>
      </div>

      <div class="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar" style="max-height: calc(90vh - 120px);">
        <input type="hidden" id="teacherId" value="${id || ''}">

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">
            <label class="${LC}">Nombre completo *</label>
            <input id="teacherName" placeholder="Ej: Maria Lopez" class="${IC} py-2">
          </div>
          <div class="sm:col-span-2">
            <label class="${LC}">Correo electrónico *</label>
            <input id="teacherEmail" type="email" placeholder="usuario@sonrisascreativas.com" class="${IC} py-2">
          </div>
          <div>
            <label class="${LC}">Teléfono</label>
            <input id="teacherPhone" type="tel" placeholder="Opcional" class="${IC} py-2">
          </div>
          <div>
            <label class="${LC}">Rol</label>
            <select id="teacherRole" class="${IC} py-2">
              <option value="maestra">Maestra</option>
              <option value="asistente">Asistente</option>
              <option value="encargada">Encargada</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="${LC}">Aula asignada</label>
            <select id="teacherClassroom" class="${IC} py-2"><option value="">-- Sin Aula --</option></select>
          </div>
          <div class="sm:col-span-2">
            <label class="${LC}">Contraseña ${id ? '(Solo si desea cambiarla)' : '(Mínimo 6 caracteres) *'}</label>
            <input id="teacherPassword" type="text" placeholder="********" class="${IC} py-2">
          </div>

          <!-- QR DE ACCESO -->
          <div class="sm:col-span-2 bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-100 p-3 space-y-3">
            <p class="text-[10px] font-black text-orange-700 uppercase tracking-widest flex items-center gap-1.5"><i data-lucide="qr-code" class="w-3.5 h-3.5"></i> Código QR de Acceso</p>
            <div class="flex gap-1.5">
              <input id="teacherMatricula" placeholder="ID Empleado (ej: TEA-2026-1234)" class="${IC} py-2 text-xs">
              <button type="button" onclick="window._genTeacherCode()" class="px-3 py-2 bg-orange-600 text-white rounded-xl font-black text-[9px] uppercase hover:bg-orange-700 transition-all shrink-0">Gen</button>
            </div>
            <div id="asis-teacher-qr" class="bg-white p-2 rounded-xl border border-orange-100 min-h-[120px] flex items-center justify-center">
              <p class="text-[9px] text-slate-400 font-bold text-center">Genera un ID para ver el QR</p>
            </div>
            <button type="button" onclick="window._printTeacherQR()" class="w-full py-2 bg-slate-800 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-900 transition-all flex items-center justify-center gap-1.5"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Imprimir Carnet</button>
          </div>
          <div class="sm:col-span-2">
            <label class="flex items-center gap-3 p-3 bg-white border-2 border-slate-100 rounded-2xl cursor-pointer">
              <input type="checkbox" id="teacherActive" checked class="w-4 h-4 rounded accent-teal-600">
              <span class="text-[11px] font-black text-slate-700 uppercase">Cuenta Activa</span>
            </label>
          </div>
        </div>
      </div>

      <div class="bg-white p-4 rounded-b-3xl border-t border-slate-100 flex justify-end gap-2 shrink-0">
        <button onclick="window._closeAsistenteModal()" class="px-4 py-2 text-slate-500 font-black text-[9px] uppercase hover:bg-slate-50 rounded-xl transition-all">Cancelar</button>
        <button onclick="window._saveTeacherNow()" class="px-6 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl font-black text-[9px] uppercase shadow-md hover:-translate-y-0.5 transition-all active:scale-95" id="btnSaveTeacherModal">Guardar</button>
      </div>`;

    const gc = document.getElementById('globalModalContainer');
    if (gc) {
      gc.innerHTML = '<div id="asis-teacher-modal-inner" class="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-hidden mx-3 flex flex-col relative animate-scaleIn">' + html + '</div>';
      gc.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:9999;';
      
      // Manejar clic afuera para cerrar
      gc.onmousedown = (e) => {
        if (e.target === gc) window._closeAsistenteModal();
      };
    }

    window._closeAsistenteModal = () => {
      if (gc) { gc.style.display = 'none'; gc.innerHTML = ''; }
    };

    // Load classrooms
    try {
      const { data } = await supabase.from('classrooms').select('id, name').order('name');
      const sel = document.getElementById('teacherClassroom');
      if (sel && data) data.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o); });
    } catch (_) {}

    // Prefill if editing
    if (id) {
      try {
        const { data: t } = await supabase.from('profiles').select('id, name, email, phone, avatar_url, role, is_active, access_code').eq('id', id).single();
        if (t) {
          const sv = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v || ''; };
          sv('teacherName', t.name); sv('teacherEmail', t.email); sv('teacherPhone', t.phone);
          if (document.getElementById('teacherRole')) document.getElementById('teacherRole').value = t.role || 'maestra';
          const cb = document.getElementById('teacherActive');
          if (cb) cb.checked = t.is_active !== false;
          // Use access_code first, fallback to notes for legacy data
          const code = t.access_code || (t.notes?.startsWith('TEA-') || t.notes?.startsWith('DIR-') || t.notes?.startsWith('ASI-') ? t.notes : null);
          sv('teacherMatricula', code);
          // Find classroom
          const { data: cls } = await supabase.from('classrooms').select('id').eq('teacher_id', id).maybeSingle();
          if (cls) document.getElementById('teacherClassroom').value = cls.id;
        }
      } catch (_) {}
    }

    window._saveTeacherNow = () => this.saveTeacher();
    // Exponer globalmente para los onclick del HTML
    window.openTeacherModal = (id) => this.openModal(id);

    // QR functions for teacher modal
    const _loadQR = () => new Promise(r => {
      if (window.QRCode) { r(); return; }
      const s = document.createElement('script');
      s.src = 'js/shared/qrcode.min.js';
      s.onload = r; document.head.appendChild(s);
    });

    window._genTeacherCode = async () => {
      const code = 'TEA-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
      const el = document.getElementById('teacherMatricula');
      if (el) { el.value = code; await window._renderTeacherQR(code); }
    };

    window._renderTeacherQR = async (code) => {
      const container = document.getElementById('asis-teacher-qr');
      if (!container || !code) return;
      await _loadQR();
      container.innerHTML = '';
      new window.QRCode(container, {
        text: JSON.stringify({ matricula: code, type: 'karpus-staff', v: 1 }),
        width: 110, height: 110, colorDark: '#1e293b', colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
    };

    window._printTeacherQR = () => {
      const code = document.getElementById('teacherMatricula')?.value?.trim();
      const name = document.getElementById('teacherName')?.value?.trim() || 'Personal';
      const container = document.getElementById('asis-teacher-qr');
      const img = container?.querySelector('img')?.src || container?.querySelector('canvas')?.toDataURL();
      if (!img || !code) { Helpers.toast('Genera el QR primero', 'warning'); return; }
      const win = window.open('', '_blank');
      const escName = Helpers.escapeHTML(name);
      const escCode = Helpers.escapeHTML(code);
      win.document.write(`<!DOCTYPE html><html><head><title>Carnet ${escName}</title><style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}.card{border:4px solid #0d9488;border-radius:20px;padding:24px;text-align:center;max-width:260px;}.hdr{background:#0d9488;color:white;margin:-24px -24px 16px;padding:12px;border-radius:16px 16px 0 0;font-weight:900;font-size:12px;text-transform:uppercase;}img{width:160px;height:160px;border-radius:8px;}.name{font-size:16px;font-weight:900;color:#1e293b;margin-top:12px;}.code{font-size:10px;color:#64748b;font-weight:700;margin-top:4px;}</style></head><body><div class="card"><div class="hdr">STAFF • COLEGIO MONTESSORI SONRISAS CREATIVAS</div><img src="${img}"><div class="name">${escName}</div><div class="code">ID: ${escCode}</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);
      win.document.close();
    };

    // Auto-render if editing and has code
    document.getElementById('teacherMatricula')?.addEventListener('input', (e) => {
      clearTimeout(window._teacherQrDebounce);
      window._teacherQrDebounce = setTimeout(() => window._renderTeacherQR(e.target.value.trim()), 600);
    });

    // Auto-render on edit load
    const existingCode = document.getElementById('teacherMatricula')?.value?.trim();
    if (existingCode) setTimeout(() => window._renderTeacherQR(existingCode), 400);
    if (window.lucide) window.lucide.createIcons();
  },

  async saveTeacher() {
    const gc = document.getElementById('globalModalContainer');
    const getVal = (id) => (gc?.querySelector('#' + id) || document.getElementById(id))?.value?.trim() || '';
    const getChecked = (id) => (gc?.querySelector('#' + id) || document.getElementById(id))?.checked ?? true;

    const id          = getVal('teacherId');
    const name        = getVal('teacherName');
    const email       = getVal('teacherEmail');
    const password    = getVal('teacherPassword');
    const phone       = getVal('teacherPhone');
    const role        = getVal('teacherRole') || 'maestra';
    const classroomId = getVal('teacherClassroom') || null;
    const isActive    = getChecked('teacherActive');
    const matricula   = getVal('teacherMatricula') || null;

    if (!name || name.length < 2) { Helpers.toast('El nombre es obligatorio', 'warning'); return; }
    if (!email || !email.includes('@')) { Helpers.toast('El correo es obligatorio', 'warning'); return; }

    const btn = document.getElementById('btnSaveTeacherModal');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
      if (id) {
        const updates = { name, phone, role };
        if (matricula !== null) updates.access_code = matricula;
        const { error } = await supabase.from('profiles').update(updates).eq('id', id);
        if (error) throw error;
        // Update classroom assignment
        await supabase.from('classrooms').update({ teacher_id: null }).eq('teacher_id', id);
        if (classroomId) await supabase.from('classrooms').update({ teacher_id: id }).eq('id', classroomId);
        Helpers.toast('Maestra actualizada correctamente');
      } else {
        // Crear nuevo maestro (Usa signUp normal con persistSession: false)
        if (!password || password.length < 6) throw new Error('Contrase�a requerida (min 6 caracteres)');
        
        // Use temp client to avoid logging out the current asistente session
        const { createClient: _cc, SUPABASE_URL: _url, SUPABASE_ANON_KEY: _key } = await import('../shared/supabase.js');
        const tempClient = _cc(_url, _key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email: email,
          password: password,
          options: { data: { full_name: name, role: role } }
        });

        if (authError) {
          if (authError.status === 422 || authError.message?.toLowerCase().includes('already registered')) {
            // User exists � just upsert the profile with maestra role
            const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
            if (existing?.id) {
              await supabase.from('profiles').update({ name, phone, role: 'maestra' }).eq('id', existing.id);
              Helpers.toast('Perfil de maestra actualizado (usuario ya exist�a)');
              window._closeAsistenteModal?.();
              await this.loadTeachers();
              return;
            }
          }
          throw authError;
        }
        
        if (authData.user) {
          const { error: profError } = await supabase.from('profiles').upsert({
            id: authData.user.id,
            name, email, phone, role
          }, { onConflict: 'id' });
          if (profError) throw profError;
          // Assign classroom
          if (classroomId) await supabase.from('classrooms').update({ teacher_id: authData.user.id }).eq('id', classroomId);
          Helpers.toast('Maestro creado exitosamente');

          const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0f2fe; border-radius: 10px;">
              <h2 style="color: #0369a1;">¡Bienvenida al Equipo de Colegio Montessori Sonrisas Creativas! 🎉</h2>
              <p>Hola <b>${name}</b>,</p>
              <p>Se ha creado tu cuenta de acceso al Panel de Maestra en Colegio Montessori Sonrisas Creativas.</p>
              <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><b>Usuario (Email):</b> ${email}</p>
                <p style="color:#6b7280;font-size:13px;">Por seguridad, usa el enlace de abajo para establecer tu contraseña.</p>
              </div>
              <p>Accede desde aquí: <a href="${window.location.origin}/login.html" style="color: #0369a1; font-weight: bold;">Iniciar Sesión</a></p>
              <hr style="border: none; border-top: 1px solid #e0f2fe; margin: 20px 0;">
              <p style="font-size: 12px; color: #666;">Colegio Montessori Sonrisas Creativas - Administración</p>
            </div>
          `;
          await sendEmail(email, `Bienvenida a Colegio Montessori Sonrisas Creativas - Credenciales de Acceso`, html);
        }
      }
      window._closeAsistenteModal?.();
      await this.loadTeachers();
    } catch (e) {
      Helpers.toast(e.message || 'Error al guardar', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar Personal'; }
    }
  },

  async deleteTeacher(id, name) {
      const ok = window.confirm(`¿Eliminar a "${name}"?\n\nEsta acción no se puede deshacer. El usuario perderá acceso al sistema inmediatamente.`);
      if (!ok) return;
      try {
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) throw error;
        Helpers.toast('Personal eliminado correctamente', 'success');
        await this.loadTeachers();
      } catch (e) {
        Helpers.toast('Error al eliminar: ' + e.message, 'error');
      }
    }

};
