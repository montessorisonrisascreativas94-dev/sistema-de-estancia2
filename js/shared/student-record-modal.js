/**
 * StudentRecordModal — Expediente Digital Escolar Premium
 * Modal multitestaña 90% pantalla inspirado en Stripe/Linear.
 * 
 * Modos:
 *   'new'      — Crear estudiante desde cero
 *   'admit'    — Admitir desde preinscripción (precarga datos)
 *   'edit'     — Editar estudiante existente
 */
import { supabase } from './supabase.js';
import { Helpers } from './helpers.js';

const IN = 'srm-input';
const LB = 'srm-label';
const I = 'w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all bg-white';
const L = 'block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5';

const TABS = [
  { id: 'info',    label: 'Info General',  icon: 'user' },
  { id: 'family',  label: 'Familia',       icon: 'users' },
  { id: 'health',  label: 'Salud',         icon: 'heart-pulse' },
  { id: 'payments', label: 'Pagos',        icon: 'credit-card' },
  { id: 'docs',    label: 'Documentos',    icon: 'folder-open' },
  { id: 'access',  label: 'Accesos',       icon: 'key-round' },
  { id: 'history', label: 'Historial',     icon: 'clock' },
];

const BLOOD_TYPES = ['No sabe','A+','A-','B+','B-','AB+','AB-','O+','O-'];
const LEVELS = ['Maternal','Infante','Párvulos','Pre-Kinder','Kinder','Preprimaria','1ro Primaria','2do Primaria','3ro Primaria','4to Primaria','5to Primaria','6to Primaria'];
const SCHEDULES = ['8:00-12:00','8:00-15:00','8:00-17:00'];
const PAYMENT_PLANS = [{v:'monthly',l:'Mensual'},{v:'two_installments',l:'Dos Cuotas'},{v:'semestral',l:'Semestral'},{v:'anual',l:'Anual'}];

let _state = { mode: 'new', studentId: null, preData: null, activeTab: 'info', data: {}, classes: [] };

export const StudentRecordModal = {

  async open(mode = 'new', studentId = null, preData = null) {
    _state = { mode, studentId, preData, activeTab: 'info', data: {}, classes: [] };

    if (mode === 'edit' && studentId) {
      _state.data = await this._loadStudent(studentId);
    } else if (mode === 'admit' && preData) {
      _state.data = this._mapPreData(preData);
    }

    _state.classes = await this._loadClasses();

    const gc = document.getElementById('globalModalContainer');
    if (!gc) return;

    gc.innerHTML = `
      <div id="srm-overlay" class="srm-overlay">
        <div class="srm-modal">
          ${this._renderHeader()}
          ${this._renderTabs()}
          <div class="srm-body" id="srmBody">${this._renderTabContent('info')}</div>
          ${this._renderFooter()}
        </div>
      </div>
    `;
    gc.style.display = 'block';
    gc.style.zIndex = '9999';
    gc.style.position = 'fixed';

    this._bindEvents();
    if (window.lucide) lucide.createIcons();
  },

  close() {
    if (typeof closeGlobalModal === 'function') {
      closeGlobalModal();
    } else {
      const gc = document.getElementById('globalModalContainer');
      if (gc) { gc.style.display = 'none'; gc.innerHTML = ''; }
    }
  },

  // ════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ════════════════════════════════════════════════════════════════

  async _loadStudent(id) {
    const numId = parseInt(id, 10);
    const { data } = await supabase
      .from('students')
      .select('*, parent:parent_id(email, phone, name)')
      .eq('id', numId)
      .single();
    return data || {};
  },

  async _loadClasses() {
    const { data } = await supabase.from('classrooms').select('id, name, level, capacity').order('name');
    return data || [];
  },

  _mapPreData(p) {
    return {
      _preId: p.id,
      name: [p.student_name, p.student_last_name].filter(Boolean).join(' '),
      student_name: p.student_name || '',
      student_last_name: p.student_last_name || '',
      birth_date: p.birth_date || '',
      gender: p.gender || '',
      nationality: p.nationality || '',
      level_requested: p.level_requested || '',
      school_year_requested: p.school_year_requested || '',
      schedule: p.schedule || '',
      suggested_level: p.suggested_level || null,
      age_match: p.age_match,
      director_authorization_requested: p.director_authorization_requested,
      director_authorization_note: p.director_authorization_note || null,
      director_authorization_approved: p.director_authorization_approved ?? null,
      p1_name: p.p1_name || '',
      p1_relationship: p.p1_relationship || '',
      p1_cedula: p.p1_cedula || '',
      p1_phone: p.p1_phone || '',
      p1_whatsapp: p.p1_whatsapp || '',
      p1_email: p.p1_email || '',
      p1_address: p.p1_address || '',
      p1_occupation: p.p1_occupation || '',
      p1_profession: p.p1_profession || '',
      p1_workplace: p.p1_workplace || '',
      p2_name: p.p2_name || '',
      p2_relationship: p.p2_relationship || '',
      p2_cedula: p.p2_cedula || '',
      p2_phone: p.p2_phone || '',
      p2_whatsapp: p.p2_whatsapp || '',
      p2_email: p.p2_email || '',
      p2_address: p.p2_address || '',
      p2_occupation: p.p2_occupation || '',
      p2_profession: p.p2_profession || '',
      p2_workplace: p.p2_workplace || '',
      emergency_name: p.emergency_name || '',
      emergency_relationship: p.emergency_relationship || '',
      emergency_phone: p.emergency_phone || '',
      emergency_cedula: p.emergency_cedula || '',
      authorized_persons: p.authorized_persons || [],
      blood_type: p.blood_type || '',
      allergies: p.allergies || '',
      medical_conditions: p.medical_conditions || '',
      medications: p.medications || '',
      food_restrictions: p.food_restrictions || '',
      medical_notes: p.medical_notes || '',
      photo_url: p.photo_url || '',
      birth_certificate_url: p.birth_certificate_url || '',
      cedula_front_url: p.cedula_front_url || '',
      cedula_back_url: p.cedula_back_url || '',
      p1_cedula_front_url: p.p1_cedula_front_url || '',
      p1_cedula_back_url: p.p1_cedula_back_url || '',
      p2_cedula_front_url: p.p2_cedula_front_url || '',
      p2_cedula_back_url: p.p2_cedula_back_url || '',
    };
  },

  // ════════════════════════════════════════════════════════════════
  // RENDER: HEADER
  // ════════════════════════════════════════════════════════════════

  _renderHeader() {
    const d = _state.data;
    const mode = _state.mode;
    const photo = d.photo_url || d.avatar_url || '';
    const name = d.name || d.student_name || 'Nuevo Estudiante';
    const matricula = d.matricula || 'Sin matrícula';
    const status = d.is_active === false ? 'Inactivo' : (mode === 'admit' ? 'Preinscrito' : 'Activo');
    const statusColor = d.is_active === false ? 'bg-rose-100 text-rose-700' : (mode === 'admit' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700');
    const classroom = d.classrooms?.name || d.level_requested || '—';
    const modeLabel = mode === 'admit' ? 'Modo Admisión' : mode === 'edit' ? 'Editar Expediente' : 'Nuevo Estudiante';

    return `
      <div class="srm-header">
        <div class="srm-header-info">
          <div class="srm-avatar">
            ${photo ? `<img src="${Helpers.escapeHTML(photo)}" class="w-full h-full object-cover rounded-2xl">` : 
              `<div class="w-full h-full rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <span class="text-3xl font-black text-white">${(name||'?').charAt(0)}</span>
              </div>`}
          </div>
          <div class="srm-identity">
            <h2 class="text-xl font-black text-slate-800 leading-tight">${Helpers.escapeHTML(name)}</h2>
            <div class="flex flex-wrap items-center gap-2 mt-1.5">
              <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-500">${Helpers.escapeHTML(matricula)}</span>
              <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase ${statusColor}">${status}</span>
              <span class="text-[10px] font-bold text-slate-400">${Helpers.escapeHTML(classroom)}</span>
              ${d.age ? `<span class="text-[10px] font-bold text-slate-400">${d.age} ${d.age_type || 'años'}</span>` : ''}
            </div>
          </div>
          <div class="srm-mode-badge">${modeLabel}</div>
        </div>
        <button onclick="StudentRecordModal.close()" class="srm-close-btn" title="Cerrar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>`;
  },

  // ════════════════════════════════════════════════════════════════
  // RENDER: TABS BAR
  // ════════════════════════════════════════════════════════════════

  _renderTabs() {
    return `
      <div class="srm-tabs">
        ${TABS.map(t => `
          <button class="srm-tab ${_state.activeTab === t.id ? 'active' : ''}" data-tab="${t.id}" onclick="StudentRecordModal.switchTab('${t.id}')">
            <i data-lucide="${t.icon}" class="w-4 h-4"></i>
            <span>${t.label}</span>
          </button>`).join('')}
      </div>`;
  },

  switchTab(tabId) {
    _state.activeTab = tabId;
    document.querySelectorAll('.srm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.getElementById('srmBody').innerHTML = this._renderTabContent(tabId);
    if (window.lucide) lucide.createIcons();
  },

  // ════════════════════════════════════════════════════════════════
  // RENDER: TAB CONTENT
  // ════════════════════════════════════════════════════════════════

  _renderTabContent(tabId) {
    switch(tabId) {
      case 'info':    return this._tabInfo();
      case 'family':  return this._tabFamily();
      case 'health':  return this._tabHealth();
      case 'payments': return this._tabPayments();
      case 'docs':    return this._tabDocs();
      case 'access':  return this._tabAccess();
      case 'history': return this._tabHistory();
      default: return '';
    }
  },

  _v(field, def = '') { return (_state.data[field] ?? def) || ''; },

  // ── TAB 1: INFORMACIÓN GENERAL ──────────────────────────────

  _tabInfo() {
    const d = _state.data;
    const classOpts = _state.classes.map(c => 
      `<option value="${c.id}" ${d.classroom_id == c.id ? 'selected' : ''}>${c.name} (${c.level || ''})</option>`
    ).join('');
    const levelOpts = LEVELS.map(l => `<option value="${l}" ${this._v('level_requested') === l ? 'selected' : ''}>${l}</option>`).join('');
    const schedOpts = SCHEDULES.map(s => `<option value="${s}" ${this._v('schedule') === s ? 'selected' : ''}>${s}</option>`).join('');

    return `
      <div class="srm-grid-2">
        <div><label class="${L}">Nombres *</label><input id="srm-name" value="${Helpers.escapeHTML(this._v('name') || this._v('student_name'))}" class="${I}" placeholder="Nombre completo"></div>
        <div><label class="${L}">Apellidos</label><input id="srm-lastname" value="${Helpers.escapeHTML(this._v('student_last_name'))}" class="${I}" placeholder="Apellidos"></div>
        <div><label class="${L}">Fecha de Nacimiento</label><input id="srm-birthdate" type="date" value="${this._v('birth_date')}" class="${I}"></div>
        <div><label class="${L}">Sexo</label>
          <select id="srm-gender" class="${I}"><option value="">Seleccionar</option>
            <option value="Masculino" ${this._v('gender')==='Masculino'?'selected':''}>Masculino</option>
            <option value="Femenino" ${this._v('gender')==='Femenino'?'selected':''}>Femenino</option>
          </select></div>
        <div><label class="${L}">Nacionalidad</label><input id="srm-nationality" value="${Helpers.escapeHTML(this._v('nationality','Dominicana'))}" class="${I}"></div>
        <div><label class="${L}">Lugar de Nacimiento</label><input id="srm-birthplace" value="${Helpers.escapeHTML(this._v('birth_place'))}" class="${I}" placeholder="Ciudad, País"></div>
      </div>

      <div class="srm-section-divider"><i data-lucide="map-pin" class="w-4 h-4"></i> Ubicación</div>
      <div class="srm-grid-3">
        <div class="col-span-2"><label class="${L}">Dirección</label><input id="srm-address" value="${Helpers.escapeHTML(this._v('address'))}" class="${I}" placeholder="Calle, #"></div>
        <div><label class="${L}">Provincia</label><input id="srm-province" value="${Helpers.escapeHTML(this._v('province'))}" class="${I}"></div>
        <div><label class="${L}">Municipio</label><input id="srm-municipality" value="${Helpers.escapeHTML(this._v('municipality'))}" class="${I}"></div>
        <div><label class="${L}">Sector</label><input id="srm-sector" value="${Helpers.escapeHTML(this._v('sector'))}" class="${I}"></div>
      </div>

      <div class="srm-section-divider"><i data-lucide="graduation-cap" class="w-4 h-4"></i> Información Académica</div>
      <div class="srm-grid-3">
        <div><label class="${L}">Matrícula</label>
          <div class="flex gap-2"><input id="srm-matricula" value="${Helpers.escapeHTML(this._v('matricula'))}" class="${I}" placeholder="MSC-2026-0000">
          <button onclick="StudentRecordModal.genMatricula()" class="srm-btn-sm srm-btn-blue">Gen</button></div></div>
        <div><label class="${L}">Nivel Solicitado</label>
          <select id="srm-level" class="${I}"><option value="">Seleccionar</option>${levelOpts}</select></div>
        <div><label class="${L}">Aula Asignada</label>
          <select id="srm-classroom" class="${I}"><option value="">Sin asignar</option>${classOpts}</select></div>
        <div><label class="${L}">Horario</label>
          <select id="srm-schedule" class="${I}"><option value="">Seleccionar</option>${schedOpts}</select></div>
        <div><label class="${L}">Fecha de Inscripción</label><input id="srm-startdate" type="date" value="${this._v('start_date','').split('T')[0]}" class="${I}"></div>
        <div><label class="${L}">Estado</label>
          <label class="flex items-center gap-2 mt-2 cursor-pointer"><input type="checkbox" id="srm-active" ${d.is_active !== false ? 'checked' : ''} class="w-5 h-5 rounded text-emerald-600"><span class="text-sm font-black text-emerald-700">Activo</span></label></div>
      </div>

      <div class="srm-section-divider"><i data-lucide="message-square" class="w-4 h-4"></i> Observaciones</div>
      <div><label class="${L}">Notas Generales</label><textarea id="srm-observations" class="${I}" rows="2" placeholder="Observaciones...">${Helpers.escapeHTML(this._v('observations'))}</textarea></div>
    `;
  },

  // ── TAB 2: FAMILIA ──────────────────────────────────────────

  _tabFamily() {
    const d = _state.data;
    const authPersons = d.authorized_persons || [];

    return `
      <!-- TUTOR PRINCIPAL -->
      <div class="srm-card">
        <div class="srm-card-header srm-card-blue"><i data-lucide="user" class="w-5 h-5"></i><span>Tutor Principal</span></div>
        <div class="srm-grid-2">
          <div><label class="${L}">Nombre *</label><input id="srm-p1name" value="${Helpers.escapeHTML(this._v('p1_name'))}" class="${I}"></div>
          <div><label class="${L}">Parentesco</label>
            <select id="srm-p1rel" class="${I}"><option value="">Seleccionar</option>
              <option value="Padre" ${this._v('p1_relationship')==='Padre'?'selected':''}>Padre</option>
              <option value="Madre" ${this._v('p1_relationship')==='Madre'?'selected':''}>Madre</option>
              <option value="Tutor Legal" ${this._v('p1_relationship')==='Tutor Legal'?'selected':''}>Tutor Legal</option>
            </select></div>
          <div><label class="${L}">Cédula</label><input id="srm-p1cedula" value="${Helpers.escapeHTML(this._v('p1_cedula'))}" class="${I}" placeholder="001-1234567-8"></div>
          <div><label class="${L}">Teléfono *</label><input id="srm-p1phone" value="${Helpers.escapeHTML(this._v('p1_phone'))}" class="${I}" placeholder="809-123-4567"></div>
          <div><label class="${L}">WhatsApp</label><input id="srm-p1whatsapp" value="${Helpers.escapeHTML(this._v('p1_whatsapp'))}" class="${I}"></div>
          <div><label class="${L}">Correo *</label><input id="srm-p1email" type="email" value="${Helpers.escapeHTML(this._v('p1_email'))}" class="${I}"></div>
          <div class="col-span-2"><label class="${L}">Dirección</label><input id="srm-p1address" value="${Helpers.escapeHTML(this._v('p1_address'))}" class="${I}"></div>
          <div><label class="${L}">Profesión</label><input id="srm-p1profession" value="${Helpers.escapeHTML(this._v('p1_profession'))}" class="${I}"></div>
          <div><label class="${L}">Empresa</label><input id="srm-p1workplace" value="${Helpers.escapeHTML(this._v('p1_workplace'))}" class="${I}"></div>
          <div><label class="${L}">Ocupación</label><input id="srm-p1occupation" value="${Helpers.escapeHTML(this._v('p1_occupation'))}" class="${I}"></div>
          <div><label class="${L}">Contacto Emergencia</label><input id="srm-p1emergency" value="${Helpers.escapeHTML(this._v('p1_emergency_contact'))}" class="${I}"></div>
        </div>
      </div>

      <!-- TUTOR SECUNDARIO -->
      <div class="srm-card">
        <div class="srm-card-header srm-card-slate"><i data-lucide="user-plus" class="w-5 h-5"></i><span>Tutor Secundario</span></div>
        <div class="srm-grid-2">
          <div><label class="${L}">Nombre</label><input id="srm-p2name" value="${Helpers.escapeHTML(this._v('p2_name'))}" class="${I}"></div>
          <div><label class="${L}">Parentesco</label>
            <select id="srm-p2rel" class="${I}"><option value="">Seleccionar</option>
              <option value="Madre" ${this._v('p2_relationship')==='Madre'?'selected':''}>Madre</option>
              <option value="Padre" ${this._v('p2_relationship')==='Padre'?'selected':''}>Padre</option>
              <option value="Tutor Legal" ${this._v('p2_relationship')==='Tutor Legal'?'selected':''}>Tutor Legal</option>
            </select></div>
          <div><label class="${L}">Cédula</label><input id="srm-p2cedula" value="${Helpers.escapeHTML(this._v('p2_cedula'))}" class="${I}"></div>
          <div><label class="${L}">Teléfono</label><input id="srm-p2phone" value="${Helpers.escapeHTML(this._v('p2_phone'))}" class="${I}"></div>
          <div><label class="${L}">WhatsApp</label><input id="srm-p2whatsapp" value="${Helpers.escapeHTML(this._v('p2_whatsapp'))}" class="${I}"></div>
          <div><label class="${L}">Correo</label><input id="srm-p2email" type="email" value="${Helpers.escapeHTML(this._v('p2_email'))}" class="${I}"></div>
          <div class="col-span-2"><label class="${L}">Dirección</label><input id="srm-p2address" value="${Helpers.escapeHTML(this._v('p2_address'))}" class="${I}"></div>
          <div><label class="${L}">Profesión</label><input id="srm-p2profession" value="${Helpers.escapeHTML(this._v('p2_profession'))}" class="${I}"></div>
          <div><label class="${L}">Empresa</label><input id="srm-p2workplace" value="${Helpers.escapeHTML(this._v('p2_workplace'))}" class="${I}"></div>
        </div>
      </div>

      <!-- EMERGENCIA -->
      <div class="srm-card">
        <div class="srm-card-header srm-card-rose"><i data-lucide="phone-call" class="w-5 h-5"></i><span>Contacto de Emergencia</span></div>
        <div class="srm-grid-2">
          <div><label class="${L}">Nombre *</label><input id="srm-emerName" value="${Helpers.escapeHTML(this._v('emergency_name'))}" class="${I}"></div>
          <div><label class="${L}">Parentesco</label><input id="srm-emerRel" value="${Helpers.escapeHTML(this._v('emergency_relationship'))}" class="${I}"></div>
          <div><label class="${L}">Cédula</label><input id="srm-emerCedula" value="${Helpers.escapeHTML(this._v('emergency_cedula'))}" class="${I}"></div>
          <div><label class="${L}">Teléfono *</label><input id="srm-emerPhone" value="${Helpers.escapeHTML(this._v('emergency_phone'))}" class="${I}"></div>
        </div>
      </div>

      <!-- PERSONAS AUTORIZADAS -->
      <div class="srm-card">
        <div class="srm-card-header srm-card-amber"><i data-lucide="shield-check" class="w-5 h-5"></i><span>Personas Autorizadas a Recoger</span></div>
        <div id="srm-auth-persons" class="space-y-2">
          ${authPersons.length ? authPersons.map((ap, i) => this._authPersonRow(ap, i)).join('') : '<p class="text-xs text-slate-400 italic">No hay personas autorizadas registradas</p>'}
        </div>
        <button onclick="StudentRecordModal.addAuthPerson()" class="srm-btn-outline mt-3"><i data-lucide="plus" class="w-4 h-4"></i> Agregar Persona</button>
      </div>

      <!-- HERMANOS -->
      <div class="srm-card">
        <div class="srm-card-header srm-card-indigo"><i data-lucide="users" class="w-5 h-5"></i><span>Hermanos en la Escuela</span></div>
        <div id="srm-siblings-list"><p class="text-xs text-slate-400 italic">Cargando...</p></div>
      </div>
    `;
  },

  _authPersonRow(ap, i) {
    return `
      <div class="srm-auth-row" data-idx="${i}">
        <input value="${Helpers.escapeHTML(ap.name || '')}" class="${I} srm-auth-name" placeholder="Nombre">
        <input value="${Helpers.escapeHTML(ap.relationship || '')}" class="${I} srm-auth-rel" placeholder="Parentesco">
        <input value="${Helpers.escapeHTML(ap.phone || '')}" class="${I} srm-auth-phone" placeholder="Teléfono">
        <button onclick="this.closest('.srm-auth-row').remove()" class="srm-btn-icon-rose"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>`;
  },

  addAuthPerson() {
    const container = document.getElementById('srm-auth-persons');
    if (!container) return;
    const empty = container.querySelector('.italic');
    if (empty) empty.remove();
    container.insertAdjacentHTML('beforeend', this._authPersonRow({}, Date.now()));
    if (window.lucide) lucide.createIcons();
  },

  // ── TAB 3: SALUD ────────────────────────────────────────────

  _tabHealth() {
    const d = _state.data;
    const bloodOpts = BLOOD_TYPES.map(b => `<option value="${b}" ${this._v('blood_type')===b?'selected':''}>${b}</option>`).join('');
    return `
      <div class="srm-grid-2">
        <div><label class="${L}">Tipo de Sangre</label><select id="srm-blood" class="${I}"><option value="">Seleccionar</option>${bloodOpts}</select></div>
        <div><label class="${L}">EPS / Seguro Médico</label><input id="srm-insurance" value="${Helpers.escapeHTML(this._v('insurance'))}" class="${I}"></div>
        <div><label class="${L}">Pediatra</label><input id="srm-pediatrician" value="${Helpers.escapeHTML(this._v('pediatrician'))}" class="${I}"></div>
        <div><label class="${L}">Teléfono Pediatra</label><input id="srm-pediatricianPhone" value="${Helpers.escapeHTML(this._v('pediatrician_phone'))}" class="${I}"></div>
      </div>

      <div class="srm-section-divider"><i data-lucide="alert-triangle" class="w-4 h-4 text-rose-500"></i> Alertas Médicas</div>
      <div class="srm-grid-2">
        <div class="col-span-2"><label class="${L}">Alergias</label><input id="srm-allergies" value="${Helpers.escapeHTML(this._v('allergies'))}" class="${I}" placeholder="Ej: Maní, Polvo, Lactosa"></div>
        <div class="col-span-2"><label class="${L}">Medicamentos</label><input id="srm-medications" value="${Helpers.escapeHTML(this._v('medications'))}" class="${I}" placeholder="Nombre y dosis"></div>
        <div class="col-span-2"><label class="${L}">Condiciones Médicas</label><textarea id="srm-medconditions" class="${I}" rows="2">${Helpers.escapeHTML(this._v('medical_conditions'))}</textarea></div>
        <div><label class="${L}">Discapacidad</label><input id="srm-disability" value="${Helpers.escapeHTML(this._v('disability'))}" class="${I}"></div>
        <div><label class="${L}">Restricciones Alimenticias</label><input id="srm-foodrestrict" value="${Helpers.escapeHTML(this._v('food_restrictions'))}" class="${I}"></div>
      </div>

      <div class="srm-section-divider"><i data-lucide="syringe" class="w-4 h-4"></i> Vacunas</div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="srm-vaccines-complete" ${d.vaccines_complete ? 'checked' : ''} class="w-5 h-5 rounded"><span class="text-sm font-bold text-slate-700">Esquema de Vacunas Completo</span></label>
      </div>

      <div class="srm-section-divider"><i data-lucide="file-text" class="w-4 h-4"></i> Observaciones</div>
      <div><label class="${L}">Notas Médicas</label><textarea id="srm-mednotes" class="${I}" rows="2">${Helpers.escapeHTML(this._v('medical_notes'))}</textarea></div>
      <div><label class="${L}">Autorizado para Emergencias Médicas</label><input id="srm-emerMedAuth" value="${Helpers.escapeHTML(this._v('emergency_medical_authorization'))}" class="${I}"></div>
    `;
  },

  // ── TAB 4: PAGOS ────────────────────────────────────────────

  _tabPayments() {
    const d = _state.data;
    const planOpts = PAYMENT_PLANS.map(p => `<option value="${p.v}" ${this._v('payment_plan','monthly')===p.v?'selected':''}>${p.l}</option>`).join('');
    return `
      <div class="srm-grid-3">
        <div><label class="${L}">Plan de Pago</label><select id="srm-plan" class="${I}">${planOpts}</select></div>
        <div><label class="${L}">Mensualidad ($)</label>
          <div class="relative"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
          <input id="srm-monthlyfee" type="number" step="0.01" value="${this._v('monthly_fee','0')}" class="${I} pl-8"></div></div>
        <div><label class="${L}">Día Prolongado ($)</label>
          <div class="relative"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
          <input id="srm-prolongadofee" type="number" step="0.01" value="${this._v('prolongado_fee','0')}" class="${I} pl-8"></div></div>
        <div><label class="${L}">Costo Inscripción ($)</label>
          <div class="relative"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
          <input id="srm-registrationfee" type="number" step="0.01" value="${this._v('registration_fee','0')}" class="${I} pl-8"></div></div>
        <div><label class="${L}">Descuento (%)</label>
          <div class="relative"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
          <input id="srm-discount" type="number" step="0.01" value="${this._v('discount','0')}" class="${I} pl-8"></div></div>
        <div><label class="${L}">Día Vencimiento</label><input id="srm-duedate" type="number" min="1" max="31" value="${this._v('due_day','5')}" class="${I}"></div>
      </div>

      <div class="srm-section-divider"><i data-lucide="receipt" class="w-4 h-4"></i> Estado Financiero</div>
      <div id="srm-payment-summary" class="srm-card bg-slate-50"><p class="text-xs text-slate-400">Cargando estado financiero...</p></div>
    `;
  },

  // ── TAB 5: DOCUMENTOS ───────────────────────────────────────

  _tabDocs() {
    const docs = [
      { key: 'photo_url',              label: 'Foto del Estudiante',     icon: 'camera' },
      { key: 'birth_certificate_url',  label: 'Acta de Nacimiento',      icon: 'file-text' },
      { key: 'cedula_front_url',       label: 'Cédula (Frontal)',        icon: 'id-card' },
      { key: 'cedula_back_url',        label: 'Cédula (Trasera)',        icon: 'id-card' },
      { key: 'p1_cedula_front_url',    label: 'Cédula Tutor 1 (Frontal)', icon: 'id-card' },
      { key: 'p1_cedula_back_url',     label: 'Cédula Tutor 1 (Trasera)', icon: 'id-card' },
      { key: 'p2_cedula_front_url',    label: 'Cédula Tutor 2 (Frontal)', icon: 'id-card' },
      { key: 'p2_cedula_back_url',     label: 'Cédula Tutor 2 (Trasera)', icon: 'id-card' },
      { key: 'vaccine_card_url',       label: 'Tarjeta de Vacunas',      icon: 'syringe' },
      { key: 'contract_signed_url',    label: 'Contrato Firmado',        icon: 'file-check' },
    ];

    return `
      <div class="srm-grid-3">
        ${docs.map(d => {
          const url = this._v(d.key);
          const hasFile = url && url.length > 5;
          return `
            <div class="srm-doc-card ${hasFile ? 'srm-doc-loaded' : 'srm-doc-missing'}">
              <div class="srm-doc-thumb">
                ${hasFile && url.startsWith('data:') ? `<img src="${url}" class="w-full h-full object-cover">` : 
                  hasFile ? `<img src="${url}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<i data-lucide=\\'file\\' class=\\'w-8 h-8 text-slate-300\\'></i>'">` :
                  `<i data-lucide="${d.icon}" class="w-8 h-8 text-slate-300"></i>`}
              </div>
              <div class="srm-doc-info">
                <span class="text-xs font-bold text-slate-700">${d.label}</span>
                <span class="text-[10px] font-bold ${hasFile ? 'text-emerald-600' : 'text-rose-500'}">${hasFile ? 'Cargado' : 'Falta'}</span>
              </div>
              <div class="srm-doc-actions">
                ${hasFile ? `<a href="${url}" target="_blank" class="srm-btn-icon-blue" title="Ver"><i data-lucide="eye" class="w-3.5 h-3.5"></i></a>` : ''}
                <label class="srm-btn-icon-green cursor-pointer" title="Subir">
                  <i data-lucide="upload" class="w-3.5 h-3.5"></i>
                  <input type="file" accept="image/*" class="hidden" onchange="StudentRecordModal.handleDocUpload('${d.key}', this)">
                </label>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  },

  async handleDocUpload(key, input) {
    const file = input.files[0];
    if (!file) return;
    Helpers.toast('Subiendo documento...', 'info');
    const ext = file.name.split('.').pop();
    const path = `students/docs/${Date.now()}_${Math.random().toString(36).substr(2,6)}.${ext}`;
    const { error } = await supabase.storage.from('karpus-uploads').upload(path, file);
    if (error) { Helpers.toast('Error al subir', 'error'); return; }
    const { data } = supabase.storage.from('karpus-uploads').getPublicUrl(path);
    _state.data[key] = data.publicUrl;
    this.switchTab('docs');
    Helpers.toast('Documento cargado', 'success');
  },

  // ── TAB 6: ACCESOS ──────────────────────────────────────────

  _tabAccess() {
    const d = _state.data;
    const preName = (this._v('name') || this._v('student_name') + ' ' + this._v('student_last_name') || '');
    const classroomEl = document.getElementById('srm-classroom');
    const classroomName = classroomEl?.options?.[classroomEl.selectedIndex]?.text
      || _state.classes?.find(c => String(c.id) === String(d.classroom_id || this._v('classroom_id')))?.name
      || d.classrooms?.name
      || 'Pendiente';
    const levelName = classroomEl?.options?.[classroomEl.selectedIndex]?.dataset?.level
      || _state.classes?.find(c => String(c.id) === String(d.classroom_id || this._v('classroom_id')))?.level
      || d.classrooms?.level
      || this._v('level_requested')
      || '';
    const monthlyFee = document.getElementById('srm-monthlyfee')?.value || this._v('monthly_fee') || '0.00';
    const scheduleSel = document.getElementById('srm-schedule');
    const scheduleTxt = scheduleSel?.options?.[scheduleSel.selectedIndex]?.text || this._v('schedule') || 'Regular (8:00 AM – 12:00 PM)';
    const studentMatricula = document.getElementById('srm-matricula')?.value || _state.data?.matricula || 'MSC-XXXXXXXX';
    const p1Name = this._v('p1_name') || 'Família';
    const currentEmail = this._v('login_email') || this._v('p1_email') || d.parent?.email || '';
    const currentPw = this._v('password') || '';

    return `
      <div class="srm-grid-2">
        <div>
          <label class="${L}">Correo de Login</label>
          <div class="flex gap-2">
            <input id="srm-emailuser" type="email" value="${Helpers.escapeHTML(d.parent?.email || this._v('login_email'))}" class="${I} flex-1" placeholder="usuario@ejemplo.com">
            <button type="button" onclick="StudentRecordModal._syncEmailFromP1()" title="Copiar correo del padre/madre 1" class="srm-btn-sm srm-btn-dark px-3 whitespace-nowrap">
              <i data-lucide="copy" class="w-3 h-3"></i>
            </button>
          </div>
        </div>
        <div><label class="${L}">Correo Notificaciones</label><input id="srm-emailnotif" type="email" value="${Helpers.escapeHTML(this._v('p1_email'))}" class="${I}"></div>
        <div>
          <label class="${L}">Contraseña Temporal</label>
          <div class="flex gap-2">
            <input id="srm-password" type="text" placeholder="8+ caracteres alfanuméricos + símbolo" value="${Helpers.escapeHTML(currentPw)}" class="${I} flex-1">
            <button type="button" onclick="StudentRecordModal._genSecurePassword()" title="Generar contraseña segura (8+ alfanum+símbolo)" class="srm-btn-sm srm-btn-blue px-3 whitespace-nowrap">
              <i data-lucide="key-round" class="w-3 h-3"></i>
            </button>
          </div>
          <p class="text-[10px] text-slate-400 mt-1 font-bold">Recomendado: minúscula, mayúscula, dígito, símbolo. Mín. 8 caracteres.</p>
        </div>
        <div><label class="${L}">Último Acceso</label><input value="${this._v('last_login') ? new Date(d.last_login).toLocaleString() : 'Nunca'}" class="${I}" readonly style="background:#f8fafc"></div>
      </div>

      <div class="srm-section-divider mt-6"><i data-lucide="sparkles" class="w-4 h-4"></i> Vista Previa Credenciales</div>
      <div id="srm-credpreview" class="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 space-y-3 shadow-inner">
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-white rounded-xl p-3 border border-blue-100">
            <p class="text-[10px] font-black uppercase text-blue-600 tracking-wide">Estudiante</p>
            <p class="text-sm font-black text-slate-800 mt-0.5">${Helpers.escapeHTML(preName || '—')}</p>
          </div>
          <div class="bg-white rounded-xl p-3 border border-emerald-100">
            <p class="text-[10px] font-black uppercase text-emerald-600 tracking-wide">Matrícula</p>
            <p class="text-sm font-black text-emerald-700 mt-0.5 font-mono tracking-tight">${Helpers.escapeHTML(studentMatricula)}</p>
          </div>
          <div class="bg-white rounded-xl p-3 border border-purple-100">
            <p class="text-[10px] font-black uppercase text-purple-600 tracking-wide">Aula / Nivel</p>
            <p class="text-sm font-black text-slate-800 mt-0.5">${Helpers.escapeHTML(classroomName)} ${levelName ? `<span class="text-[10px] text-purple-600 font-bold">· ${levelName}</span>` : ''}</p>
          </div>
          <div class="bg-white rounded-xl p-3 border border-amber-100">
            <p class="text-[10px] font-black uppercase text-amber-600 tracking-wide">Horario</p>
            <p class="text-xs font-bold text-slate-700 mt-0.5">${Helpers.escapeHTML(scheduleTxt)}</p>
          </div>
          <div class="bg-white rounded-xl p-3 border border-sky-100 col-span-2">
            <p class="text-[10px] font-black uppercase text-sky-600 tracking-wide">Credenciales de Acceso</p>
            <div class="mt-1.5 flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 border border-sky-200">
                <i data-lucide="mail" class="w-3 h-3"></i> ${currentEmail ? Helpers.escapeHTML(currentEmail) : '<span class="text-sky-400 italic">correo pendiente</span>'}
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700 border border-orange-200">
                <i data-lucide="lock" class="w-3 h-3"></i> ${currentPw ? Helpers.escapeHTML(currentPw) : '<span class="text-orange-400 italic">sin contraseña</span>'}
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                <i data-lucide="dollar-sign" class="w-3 h-3"></i> Mensualidad: $${monthlyFee}
              </span>
            </div>
          </div>
        </div>
        <div class="flex gap-2 pt-1">
          <button onclick="StudentRecordModal._refreshCredPreview()" class="srm-btn-sm srm-btn-dark flex-1">
            <i data-lucide="refresh-cw" class="w-3 h-3"></i> Actualizar Vista
          </button>
          <button onclick="StudentRecordModal._sendTestWelcomeEmail()" class="srm-btn-sm srm-btn-green flex-1">
            <i data-lucide="send" class="w-3 h-3"></i> Enviar Correo Prueba
          </button>
        </div>
      </div>

      <div class="srm-section-divider"><i data-lucide="qr-code" class="w-4 h-4"></i> Código QR de Asistencia</div>
      <div class="srm-qr-section">
        <div id="srm-qr-container" class="srm-qr-box">
          <p class="text-xs text-slate-400 font-bold text-center">Genera o ingresa una matrícula para ver el QR</p>
        </div>
        <p id="srm-qr-label" class="text-lg font-black text-slate-700 mt-2">—</p>
        <div class="flex gap-2 mt-3">
          <button onclick="StudentRecordModal.genQR()" class="srm-btn-sm srm-btn-orange flex-1">Generar QR</button>
          <button onclick="StudentRecordModal.printCarnet()" class="srm-btn-sm srm-btn-dark flex-1">Imprimir Carnet</button>
          <button onclick="StudentRecordModal.sendCredentials()" class="srm-btn-sm srm-btn-green flex-1">Enviar Credenciales</button>
        </div>
      </div>
    `;
  },

  _syncEmailFromP1() {
    const p1Email = document.getElementById('srm-p1email')?.value?.trim();
    if (p1Email) {
      const u = document.getElementById('srm-emailuser');
      const n = document.getElementById('srm-emailnotif');
      if (u && !u.value) u.value = p1Email;
      if (n && !n.value) n.value = p1Email;
      this._refreshCredPreview();
    }
  },

  _genSecurePassword() {
    const lowers = 'abcdefghijkmnopqrstuvwxyz';
    const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const syms   = '!@#$%&*?+-=';
    const pick   = (s, n) => Array.from({length: n}, () => s[Math.floor(Math.random() * s.length)]).join('');
    const chars = (pick(lowers, 3) + pick(uppers, 2) + pick(digits, 2) + pick(syms, 1)).split('');
    for (let i = chars.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    const pw = chars.join('');
    const el = document.getElementById('srm-password');
    if (el) el.value = pw;
    this._refreshCredPreview();
    Helpers.toast('Contraseña segura generada', 'success');
  },

  _refreshCredPreview() {
    if (_state.activeTab !== 'access') return;
    const body = document.getElementById('srmBody');
    if (!body) return;
    body.innerHTML = this._renderTabContent('access');
    if (window.lucide) lucide.createIcons();
    this._bindEvents();
  },

  async _sendTestWelcomeEmail() {
    const email = document.getElementById('srm-emailuser')?.value?.trim()
      || document.getElementById('srm-emailnotif')?.value?.trim()
      || this._v('p1_email');
    if (!email) return Helpers.toast('Ingresa un correo para la prueba', 'warning');
    const password = document.getElementById('srm-password')?.value?.trim() || 'DemoPass1!';
    const p1Name = document.getElementById('srm-p1name')?.value?.trim() || 'Padre/Madre';
    const studentName = (document.getElementById('srm-name')?.value?.trim() || (document.getElementById('srm-name') && (document.getElementById('srm-student_name')?.value + ' ' + document.getElementById('srm-student_last_name')?.value) || 'Estudiante Demo')).trim();
    const matricula = document.getElementById('srm-matricula')?.value?.trim() || 'MSC-TEST-0001';
    const sel = document.getElementById('srm-classroom');
    const classroom = sel?.options?.[sel?.selectedIndex]?.text || 'Aula de Prueba';
    const level = sel?.options?.[sel?.selectedIndex]?.dataset?.level || this._v('level_requested') || 'Nivel';
    const schedule = document.getElementById('srm-schedule')?.value || 'Regular (8:00 AM – 12:00 PM)';
    const fee = parseFloat(document.getElementById('srm-monthlyfee')?.value || '0') || 0;

    Helpers.toast('Enviando correo de prueba...', 'info');
    try {
      const html = this._buildWelcomeEmailTemplate({ p1Name, studentName, matricula, classroom, level, schedule, email, password, monthlyFee: fee, isTest: true });
      const text = this._buildWelcomeEmailText({ p1Name, studentName, matricula, classroom, level, schedule, email, password, monthlyFee: fee, isTest: true });
      const subject = `[PRUEBA] Bienvenido(a) ${studentName} — Matrícula ${matricula}`;
      const ok = await this._sendEmailViaEdge({ to: email, subject, html, text });
      if (ok) Helpers.toast('Correo de prueba enviado a ' + email, 'success');
      else Helpers.toast('No se pudo enviar el correo (Edge Function sin respuesta)', 'warning');
    } catch (e) {
      Helpers.toast('Error enviando correo prueba: ' + (e.message || e), 'error');
    }
  },

  async _sendEmailViaEdge({ to, subject, html, text, attachments }) {
    const fnUrl = window.__SUPABASE_EDGE_BASE__
      ? window.__SUPABASE_EDGE_BASE__.replace(/\/$/, '') + '/send-email'
      : (window.SUPABASE_URL
        ? window.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/send-email'
        : null);
    if (!fnUrl) return false;

    try {
      const token = supabase?.auth?.currentSession?.access_token || '';
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ to, subject, html, text, attachments })
      });
      if (!resp.ok) return false;
      const r = await resp.json().catch(() => ({}));
      return r && (r.success || r.ok || r.id);
    } catch (_) {
      return false;
    }
  },

  _buildWelcomeEmailText({ p1Name, studentName, matricula, classroom, level, schedule, email, password, monthlyFee, isTest }) {
    return (isTest ? '*** ESTE ES UN CORREO DE PRUEBA – NO ES LA ADMISIÓN OFICIAL ***\n\n' : '') +
      `Estimado(a) ${p1Name},\n\n` +
      `Con mucha alegría le damos la bienvenida a la familia Montessori Sonrisas Creativas.\n` +
      `Su hijo(a) ${studentName} ha sido admitido(a) oficialmente en nuestra institución.\n\n` +
      `DATOS DEL ESTUDIANTE\n` +
      `Nombre completo: ${studentName}\n` +
      `Matrícula: ${matricula}\n` +
      `Aula: ${classroom}\n` +
      `Nivel: ${level || '—'}\n` +
      `Horario: ${schedule}\n` +
      `${monthlyFee ? 'Mensualidad: $' + monthlyFee + '\n' : ''}` +
      `\nCREDENCIALES DE ACCESO AL PORTAL DE PADRES\n` +
      `URL del portal: ${location.origin}/panel_padres.html\n` +
      `Correo (usuario): ${email}\n` +
      `Contraseña temporal: ${password}\n\n` +
      `IMPORTANTE: Por favor cambie su contraseña temporal al ingresar por primera vez.\n\n` +
      `Si tiene alguna duda, contáctenos:\n` +
      `Instagram: @montessorisonrisascreativas\n` +
      `Teléfono: +1 (809) 555-0100\n\n` +
      `Atentamente,\n` +
      `Dirección Académica – Montessori Sonrisas Creativas\n\n` +
      `Este correo fue enviado automáticamente. Por favor no responda a este mensaje.`;
  },

  _buildWelcomeEmailTemplate({ p1Name, studentName, matricula, classroom, level, schedule, email, password, monthlyFee, isTest }) {
    const host = location.origin || 'https://montessorisonrisascreativas.com';
    const logoUrl = `${host}/img/monte.jpg`;
    const portalUrl = `${host}/panel_padres.html`;
    const year = new Date().getFullYear();
    const feeCell = monthlyFee
      ? `<tr><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#475569;font-weight:700">Mensualidad</span></td><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb;text-align:right"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0B63C7;font-weight:900">$${monthlyFee.toFixed(2)} USD</span></td></tr>`
      : '';
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bienvenido a Montessori Sonrisas Creativas</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#334155">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fb">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(11,99,199,0.08)">
  ${isTest ? `<tr><td style="background:#fef3c7;padding:10px 24px;text-align:center"><span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#92400e;font-weight:900;letter-spacing:0.5px;text-transform:uppercase">✉  Correo de prueba – no es admisión oficial</span></td></tr>` : ''}
  <tr>
    <td style="background:linear-gradient(135deg,#0B63C7 0%,#2563eb 55%,#4f46e5 100%);padding:22px 28px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="64"><img src="${logoUrl}" alt="Logo MSC" width="56" height="56" style="border-radius:14px;background:#ffffff;padding:4px;display:block" onerror="this.style.display='none'"></td>
        <td style="padding-left:12px;color:#ffffff">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:900;line-height:1.1">Montessori Sonrisas Creativas</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#dbeafe;margin-top:3px;letter-spacing:0.5px;text-transform:uppercase">Centro Educativo · Año Escolar ${year}</div>
        </td>
      </tr></table>
    </td>
  </tr>
  <tr><td style="padding:28px 28px 18px">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a;font-weight:900;margin-bottom:4px">¡Bienvenido(a) a la familia MSC!</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#475569;margin-top:10px;line-height:1.6">
      Estimado(a) <strong>${Helpers.escapeHTML(p1Name)}</strong>,<br><br>
      Con mucha alegría le confirmamos la <strong style="color:#0B63C7">admisión oficial</strong> de su hijo(a) a Montessori Sonrisas Creativas. A continuación los datos importantes para comenzar esta gran etapa junto a nosotros.
    </div>
  </td></tr>
  <tr><td style="padding:4px 28px">
    <div style="border-radius:14px;background:linear-gradient(135deg,#ecfeff 0%,#eff6ff 50%,#faf5ff 100%);padding:16px 18px;border:1px solid #dbeafe">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#0B63C7;font-weight:900;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:10px">◆ Datos del Estudiante</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#475569;font-weight:700">Nombre</span></td><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb;text-align:right"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;font-weight:900">${Helpers.escapeHTML(studentName)}</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#475569;font-weight:700">Matrícula</span></td><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb;text-align:right"><span style="display:inline-block;background:#10b981;color:#ffffff;padding:3px 10px;border-radius:999px;font-family:'Courier New',monospace;font-size:12px;font-weight:900;letter-spacing:0.3px">${Helpers.escapeHTML(matricula)}</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#475569;font-weight:700">Aula</span></td><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb;text-align:right"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;font-weight:900">${Helpers.escapeHTML(classroom)}</span></td></tr>
        ${level ? `<tr><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#475569;font-weight:700">Nivel</span></td><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb;text-align:right"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f172a;font-weight:900">${Helpers.escapeHTML(level)}</span></td></tr>` : ''}
        <tr><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#475569;font-weight:700">Horario</span></td><td style="padding:6px 0;border-bottom:1px dashed #e5e7eb;text-align:right"><span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#0f172a;font-weight:800">${Helpers.escapeHTML(schedule)}</span></td></tr>
        ${feeCell}
      </table>
    </div>
  </td></tr>
  <tr><td style="padding:18px 28px 4px">
    <div style="border-radius:14px;background:#0f172a;padding:18px 18px;color:#ffffff;border:1px solid #1e293b">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#7dd3fc;font-weight:900;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:12px">🔐 Credenciales de Acceso al Portal</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:6px 0;width:35%"><span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;font-weight:700">Usuario</span></td><td style="padding:6px 0"><span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#ffffff;font-weight:900">${Helpers.escapeHTML(email)}</span></td></tr>
        <tr><td style="padding:6px 0"><span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;font-weight:700">Contraseña</span></td><td style="padding:6px 0"><span style="display:inline-block;background:#1e293b;border:1px dashed #475569;padding:4px 10px;border-radius:8px;font-family:'Courier New',monospace;font-size:13px;color:#fbbf24;font-weight:900;letter-spacing:0.5px">${Helpers.escapeHTML(password)}</span></td></tr>
      </table>
      <div style="margin-top:14px;text-align:center">
        <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#0B63C7 0%,#2563eb 100%);color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:900;letter-spacing:0.5px;text-transform:uppercase;box-shadow:0 6px 18px rgba(11,99,199,0.35)">
          Ingresar al Portal de Padres →
        </a>
      </div>
      <div style="margin-top:10px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#64748b;line-height:1.4">
        URL directa: <a href="${portalUrl}" style="color:#7dd3fc;text-decoration:underline">${portalUrl}</a><br>
        <strong style="color:#fca5a5">Por favor cambie su contraseña temporal al ingresar por primera vez.</strong>
      </div>
    </div>
  </td></tr>
  <tr><td style="padding:22px 28px 6px;color:#475569;font-size:13px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">
    <p style="margin:0">Si durante el proceso tiene alguna pregunta sobre horarios, uniformes, materiales o pagos, no dude en contactarnos respondiendo este correo o por nuestras líneas oficiales.</p>
    <p style="margin:10px 0 0">Con cariño,<br><strong>Dirección Académica</strong><br>Montessori Sonrisas Creativas</p>
  </td></tr>
  <tr><td style="padding:14px 28px 24px">
    <div style="border-top:1px solid #e5e7eb;padding-top:14px;text-align:center;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6">
      <div style="margin-bottom:6px">
        <span style="display:inline-block;margin:0 8px">📱 +1 (809) 555-0100</span>
        <span style="display:inline-block;margin:0 8px">📍 Calle Principal, Centro Educativo</span>
        <span style="display:inline-block;margin:0 8px">📷 @montessorisonrisascreativas</span>
      </div>
      <div style="color:#cbd5e1;font-size:10px;margin-top:8px">
        © ${year} Montessori Sonrisas Creativas · Todos los derechos reservados.<br>
        Este correo fue enviado automáticamente. Por favor no responda directamente a este mensaje.
      </div>
    </div>
  </td></tr>
</table>
</td></tr></table></body></html>`;
  },

  async _createStudentViaEdgeFn({ payload, parentEmail, parentPassword }) {
    const fnBase = window.__SUPABASE_EDGE_BASE__
      ? window.__SUPABASE_EDGE_BASE__.replace(/\/$/, '')
      : (window.SUPABASE_URL ? window.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1' : null);
    if (!fnBase) return { ok: false, fallback: true, reason: 'no-edge-base' };

    const token = supabase?.auth?.currentSession?.access_token || '';
    const body = {
      student: payload,
      parent: {
        email: parentEmail,
        password: parentPassword,
        name: payload.p1_name || payload.name,
        phone: payload.p1_phone || null,
        p1_cedula: payload.p1_cedula || null,
        p2_cedula: payload.p2_cedula || null,
      },
      pre_registration_id: _state.preData?._preId || _state.preData?.id || null,
    };
    try {
      const res = await fetch(fnBase + '/create-student-with-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, fallback: res.status >= 500, status: res.status, body: txt };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, data };
    } catch (e) {
      return { ok: false, fallback: true, reason: 'network', message: e.message };
    }
  },

  // ── TAB 7: HISTORIAL ────────────────────────────────────────

  _tabHistory() {
    return `
      <div id="srm-timeline" class="srm-timeline">
        <p class="text-xs text-slate-400 italic text-center py-6">Cargando historial...</p>
      </div>`;
  },

  async _loadTimeline() {
    const container = document.getElementById('srm-timeline');
    if (!container) return;
    
    const items = [];
    
    if (_state.mode === 'admit' && _state.preData) {
      items.push({ date: _state.preData.created_at, text: 'Preinscripción enviada por los padres', color: 'blue' });
      if (_state.preData.reviewed_at) items.push({ date: _state.preData.reviewed_at, text: 'Revisión realizada', color: 'purple' });
    }
    
    if (_state.studentId) {
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('action, created_at, payload')
        .order('created_at', { ascending: false })
        .limit(50);
      
      const studentName = (_state.data?.name || '').toLowerCase();
      (logs || []).filter(l => {
        const payloadStr = JSON.stringify(l.payload || '').toLowerCase();
        return payloadStr.includes(studentName) || payloadStr.includes(String(_state.studentId));
      }).forEach(l => {
        const detail = l.payload?.description || l.payload?.detail || '';
        items.push({ date: l.created_at, text: l.action + (detail ? ': ' + detail : ''), color: 'slate' });
      });
    }

    if (!items.length) {
      container.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-6">Sin eventos registrados</p>';
      return;
    }

    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    container.innerHTML = items.map(item => `
      <div class="srm-timeline-item">
        <div class="srm-timeline-dot bg-${item.color}-500"></div>
        <div class="srm-timeline-content">
          <p class="text-sm font-bold text-slate-700">${item.text}</p>
          <p class="text-[10px] font-bold text-slate-400">${item.date ? new Date(item.date).toLocaleString() : '—'}</p>
        </div>
      </div>`).join('');
  },

  // ════════════════════════════════════════════════════════════════
  // RENDER: FOOTER
  // ════════════════════════════════════════════════════════════════

  _renderFooter() {
    const mode = _state.mode;
    return `
      <div class="srm-footer">
        <button onclick="StudentRecordModal.close()" class="px-6 py-2.5 text-slate-500 font-black text-xs uppercase hover:bg-slate-100 rounded-xl transition-all">Cancelar</button>
        ${mode === 'admit' ? 
          `<button onclick="StudentRecordModal.admitStudent()" class="srm-btn-primary">
            <i data-lucide="check-circle" class="w-4 h-4"></i> Aprobar Admisión
          </button>` :
          `<button onclick="StudentRecordModal.save()" class="srm-btn-primary">
            <i data-lucide="save" class="w-4 h-4"></i> ${mode === 'edit' ? 'Actualizar' : 'Guardar Estudiante'}
          </button>`
        }
      </div>`;
  },

  // ════════════════════════════════════════════════════════════════
  // ACTIONS
  // ════════════════════════════════════════════════════════════════

  _collectFormData() {
    const g = (id) => document.getElementById(id)?.value?.trim() || null;
    return {
      name: g('srm-name'),
      student_name: g('srm-name'),
      student_last_name: g('srm-lastname'),
      birth_date: g('srm-birthdate'),
      gender: g('srm-gender'),
      nationality: g('srm-nationality'),
      birth_place: g('srm-birthplace'),
      address: g('srm-address'),
      province: g('srm-province'),
      municipality: g('srm-municipality'),
      sector: g('srm-sector'),
      matricula: g('srm-matricula'),
      level_requested: g('srm-level'),
      classroom_id: g('srm-classroom') ? parseInt(g('srm-classroom')) : null,
      schedule: g('srm-schedule'),
      start_date: g('srm-startdate'),
      is_active: document.getElementById('srm-active')?.checked ?? true,
      observations: g('srm-observations'),
      p1_name: g('srm-p1name'),
      p1_relationship: g('srm-p1rel'),
      p1_cedula: g('srm-p1cedula'),
      p1_phone: g('srm-p1phone'),
      p1_whatsapp: g('srm-p1whatsapp'),
      p1_email: g('srm-p1email'),
      p1_address: g('srm-p1address'),
      p1_profession: g('srm-p1profession'),
      p1_workplace: g('srm-p1workplace'),
      p1_occupation: g('srm-p1occupation'),
      p1_emergency_contact: g('srm-p1emergency'),
      p2_name: g('srm-p2name'),
      p2_relationship: g('srm-p2rel'),
      p2_cedula: g('srm-p2cedula'),
      p2_phone: g('srm-p2phone'),
      p2_whatsapp: g('srm-p2whatsapp'),
      p2_email: g('srm-p2email'),
      p2_address: g('srm-p2address'),
      p2_profession: g('srm-p2profession'),
      p2_workplace: g('srm-p2workplace'),
      emergency_name: g('srm-emerName'),
      emergency_relationship: g('srm-emerRel'),
      emergency_cedula: g('srm-emerCedula'),
      emergency_phone: g('srm-emerPhone'),
      blood_type: g('srm-blood'),
      allergies: g('srm-allergies'),
      medications: g('srm-medications'),
      medical_conditions: g('srm-medconditions'),
      disability: g('srm-disability'),
      food_restrictions: g('srm-foodrestrict'),
      medical_notes: g('srm-mednotes'),
      insurance: g('srm-insurance'),
      pediatrician: g('srm-pediatrician'),
      pediatrician_phone: g('srm-pediatricianPhone'),
      vaccines_complete: document.getElementById('srm-vaccines-complete')?.checked ?? false,
      payment_plan: g('srm-plan'),
      monthly_fee: parseFloat(g('srm-monthlyfee') || '0') || 0,
      prolongado_fee: parseFloat(g('srm-prolongadofee') || '0') || 0,
      registration_fee: parseFloat(g('srm-registrationfee') || '0') || 0,
      discount: parseFloat(g('srm-discount') || '0') || 0,
      due_day: parseInt(g('srm-duedate') || '5') || 5,
    };
  },

  async save() {
    if (_state.mode === 'admit') return this.admitStudent();
    const payload = this._collectFormData();
    if (!payload.name || payload.name.length < 3) return Helpers.toast('Nombre inválido', 'warning');

    const emailUser = document.getElementById('srm-emailuser')?.value?.trim();
    const password  = document.getElementById('srm-password')?.value?.trim();

    Helpers.toast('Guardando...', 'info');
    try {
      if (_state.mode === 'edit' && _state.studentId) {
        const { error } = await supabase.from('students').update(payload).eq('id', parseInt(_state.studentId));
        if (error) throw error;
        Helpers.toast('Estudiante actualizado', 'success');
      } else {
        if (emailUser && password) {
          const tempClient = (await import('./supabase.js')).createClient(
            (await import('./supabase.js')).SUPABASE_URL,
            (await import('./supabase.js')).SUPABASE_ANON_KEY,
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
          );
          const { data: authData, error: authError } = await tempClient.auth.signUp({
            email: emailUser, password,
            options: { data: { name: payload.p1_name || payload.name, role: 'padre', phone: payload.p1_phone }, emailRedirectTo: null }
          });
          let parentId = null;
          if (authError) {
            if (authError.message?.toLowerCase().includes('already registered') || authError.status === 422) {
              const { data: existing } = await supabase.from('profiles').select('id').eq('email', emailUser).maybeSingle();
              if (existing?.id) { parentId = existing.id; Helpers.toast('Usuario ya existe – vinculando', 'info'); }
              else throw new Error('El correo ya está registrado pero no tiene perfil.');
            } else throw authError;
          } else if (authData?.user) {
            parentId = authData.user.id;
          }
          if (parentId) {
            payload.parent_id = parentId;
            await supabase.from('profiles').upsert({ id: parentId, name: payload.p1_name || payload.name, email: emailUser, phone: payload.p1_phone, role: 'padre' }, { onConflict: 'id' });
          }
        }
        const { error } = await supabase.from('students').insert([payload]);
        if (error) throw error;
        Helpers.toast('Estudiante creado', 'success');
      }
      this.close();
      if (typeof window !== 'undefined' && window.App?.students?.init) window.App.students.init();
    } catch (e) {
      Helpers.toast('Error: ' + (e.message || e), 'error');
    }
  },

  async admitStudent() {
    const payload = this._collectFormData();
    if (!payload.name || payload.name.length < 3) return Helpers.toast('Nombre inválido', 'warning');
    if (!payload.classroom_id) return Helpers.toast('Selecciona un aula', 'warning');
    if (!payload.matricula) return Helpers.toast('Genera una matrícula', 'warning');

    const parentEmail = document.getElementById('srm-emailuser')?.value?.trim()
      || document.getElementById('srm-emailnotif')?.value?.trim()
      || payload.p1_email;
    const parentPassword = document.getElementById('srm-password')?.value?.trim();

    const p1Name = payload.p1_name || 'Familia';
    const studentName = payload.name;
    const matricula = payload.matricula;
    const sel = document.getElementById('srm-classroom');
    const classroomName = sel?.options?.[sel?.selectedIndex]?.text
      || _state.classes?.find(c => String(c.id) === String(payload.classroom_id))?.name
      || 'Aula Asignada';
    const levelName = sel?.options?.[sel?.selectedIndex]?.dataset?.level
      || _state.classes?.find(c => String(c.id) === String(payload.classroom_id))?.level
      || payload.level_requested
      || '';
    const scheduleSel = document.getElementById('srm-schedule');
    const scheduleTxt = scheduleSel?.options?.[scheduleSel.selectedIndex]?.text || payload.schedule || 'Regular (8:00 AM – 12:00 PM)';
    const fee = payload.monthly_fee || 0;

    Helpers.toast('Paso 1/5 — Validando datos...', 'info');
    payload.is_active = true;
    payload.start_date = payload.start_date || new Date().toISOString().split('T')[0];
    const planType = document.getElementById('srm-plan')?.value || document.getElementById('srm-plan')?.selectedIndex > -1 ? document.getElementById('srm-plan').value : 'Mensual';

    let studentId = null;
    let parentId = null;
    let usedEdgeFn = false;
    let emailSent = false;

    try {
      // ── Paso 2: Crear usuario + estudiante ──
      if (parentEmail && parentPassword && parentPassword.length >= 6) {
        Helpers.toast('Paso 2/5 — Creando usuario padre vía Edge Function...', 'info');
        const edgeResult = await this._createStudentViaEdgeFn({ payload, parentEmail, parentPassword });
        if (edgeResult.ok) {
          usedEdgeFn = true;
          studentId = edgeResult.data?.student?.id || edgeResult.data?.studentId;
          parentId  = edgeResult.data?.parent?.id  || edgeResult.data?.parentId;
          if (!studentId) {
            const { data: stu } = await supabase.from('students').select('id').eq('matricula', matricula).maybeSingle();
            studentId = stu?.id;
          }
        } else if (edgeResult.fallback) {
          Helpers.toast('Edge no disponible – usando admisión local (fallback)', 'warning');
        } else {
          throw new Error(edgeResult.body || ('Error en Edge Function (HTTP ' + (edgeResult.status || '?') + ')'));
        }
      }

      if (!studentId) {
        Helpers.toast('Paso 2/5 — Guardando estudiante localmente...', 'info');
        if (parentEmail && parentPassword && parentPassword.length >= 6) {
          try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
              email: parentEmail, password: parentPassword,
              options: { data: { name: p1Name, role: 'padre', phone: payload.p1_phone }, emailRedirectTo: null }
            });
            if (authError) {
              if (authError.message?.toLowerCase().includes('already registered') || authError.status === 422) {
                const { data: existing } = await supabase.from('profiles').select('id').eq('email', parentEmail).maybeSingle();
                if (existing?.id) { parentId = existing.id; Helpers.toast('Usuario padre existente – vinculando', 'info'); }
              } else {
                Helpers.toast('No se creó usuario – continuar sin usuario (admite estudiante de todas formas)', 'warning');
              }
            } else if (authData?.user) {
              parentId = authData.user.id;
            }
            if (parentId) {
              await supabase.from('profiles').upsert(
                { id: parentId, name: p1Name, email: parentEmail, phone: payload.p1_phone, role: 'padre' },
                { onConflict: 'id' }
              );
            }
          } catch (e) {
            Helpers.toast('Usuario no creado – continúa admisión de estudiante', 'warning');
          }
        }
        if (parentId) payload.parent_id = parentId;
        const { data: insData, error: stErr } = await supabase.from('students').insert([payload]).select('id').limit(1).single();
        if (stErr) throw stErr;
        studentId = insData?.id;
      }
      if (!studentId) throw new Error('No se pudo obtener el ID del estudiante');

      // ── Paso 3: Marcar preinscripción admitida ──
      Helpers.toast('Paso 3/5 — Cerrando preinscripción...', 'info');
      const preId = _state.preData?._preId || _state.preData?.id;
      if (preId) {
        try {
          const noteExtra = `[${new Date().toLocaleString()}] — Admitido(a) como estudiante #${studentId} · Matrícula ${matricula}${usedEdgeFn ? ' · vía Edge Function' : ''}`;
          const { error: upErr } = await supabase
            .from('student_preregistrations')
            .update({
              status: 'admitted',
              reviewed_at: new Date().toISOString(),
              reviewer_note: (_state.preData?.reviewer_note ? _state.preData.reviewer_note + '\n\n' : '') + noteExtra
            })
            .eq('id', preId);
          if (upErr) console.warn('No se actualizó preregistro:', upErr);
        } catch (_) { /* soft error – no abortar */ }
      }

      // ── Paso 4: Plan de pagos + 12 cuotas ──
      Helpers.toast('Paso 4/5 — Creando plan de pagos...', 'info');
      try {
        if (studentId && fee > 0) {
          const dueDay = payload.due_day || 5;
          const startMonth = new Date(payload.start_date || new Date());
          startMonth.setDate(1);
          const plan = {
            student_id: studentId,
            plan_type: planType || 'Mensual',
            total_amount: fee * 12,
            monthly_fee: fee,
            registration_fee: payload.registration_fee || 0,
            discount: payload.discount || 0,
            prolongado_fee: payload.prolongado_fee || 0,
            due_day: dueDay,
            start_date: payload.start_date,
            status: 'active'
          };
          const { data: planData, error: plErr } = await supabase.from('payment_plans').insert([plan]).select('id').limit(1).single();
          if (plErr) throw plErr;
          const planId = planData?.id;
          if (planId) {
            const months = [];
            const monthsEs = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            for (let i = 0; i < 12; i++) {
              const m = new Date(startMonth);
              m.setMonth(m.getMonth() + i);
              const due = new Date(m.getFullYear(), m.getMonth(), Math.min(dueDay, 28));
              months.push({
                payment_plan: planId,
                month_paid: monthsEs[m.getMonth()] + ' ' + m.getFullYear(),
                due_date: due.toISOString().split('T')[0],
                amount: fee,
                status: 'pending',
                description: 'Cuota mensual – Colegiatura MSC'
              });
            }
            const { error: pmErr } = await supabase.from('payments').insert(months);
            if (pmErr) console.warn('No se crearon cuotas de pago:', pmErr);
          }
        }
      } catch (_) { Helpers.toast('Plan de pagos no creado – puedes configurarlo luego en Pagos', 'warning'); }

      // ── Paso 5: Enviar correo bienvenida ──
      if (parentEmail && parentPassword) {
        Helpers.toast('Paso 5/5 — Enviando correo de bienvenida...', 'info');
        try {
          const subject = `Bienvenido(a) ${studentName} — Matrícula ${matricula} · Credenciales de acceso`;
          const html = this._buildWelcomeEmailTemplate({
            p1Name, studentName, matricula, classroom: classroomName, level: levelName,
            schedule: scheduleTxt, email: parentEmail, password: parentPassword,
            monthlyFee: fee, isTest: false
          });
          const text = this._buildWelcomeEmailText({
            p1Name, studentName, matricula, classroom: classroomName, level: levelName,
            schedule: scheduleTxt, email: parentEmail, password: parentPassword,
            monthlyFee: fee, isTest: false
          });
          emailSent = await this._sendEmailViaEdge({ to: parentEmail, subject, html, text });
          if (!emailSent) {
            if (window.__ADMIT_EMAIL_RETRY__) window.__ADMIT_EMAIL_RETRY__({ parentEmail, studentName, matricula });
            const retryBtnId = 'retry-email-' + Date.now();
            const retryHTML = `
              <div id="${retryBtnId}" style="margin-top:8px" class="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800 font-bold">
                <span>⚠ Credenciales generadas pero el correo no llegó. Revisa conexión a Edge Functions/Resend.</span>
                <button onclick="StudentRecordModal._sendWelcomeEmailRetry({to:'${parentEmail}',studentName:'${studentName.replace(/'/g,'')}',matricula:'${matricula.replace(/'/g,'')}',classroom:'${classroomName.replace(/'/g,'')}',level:'${(levelName||'').replace(/'/g,'')}',schedule:'${scheduleTxt.replace(/'/g,'')}',email:'${parentEmail.replace(/'/g,'')}',password:'${parentPassword.replace(/'/g,'')}',fee:${fee}})"
                  class="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-600 text-white px-3 py-1.5 text-xs font-black shadow hover:bg-amber-700 active:scale-95">
                  <i data-lucide="send" class="w-3 h-3"></i> Reenviar
                </button>
              </div>`;
            setTimeout(() => {
              const toastCont = document.querySelector('.toast-container') || document.body;
              const tmp = document.createElement('div');
              tmp.innerHTML = retryHTML;
              const child = tmp.firstElementChild;
              if (toastCont && child) toastCont.appendChild(child);
              if (window.lucide && child) lucide.createIcons({ root: child });
            }, 800);
          }
        } catch (e) { emailSent = false; console.warn('Email send failed:', e); }
      }

      Helpers.toast(
        '¡Admisión exitosa! ' + (emailSent
          ? 'Correo enviado a ' + parentEmail
          : (parentEmail ? 'Sin correo de bienvenida – revisa Edge Functions' : 'Sin correo (falta dirección)')),
        'success',
        { duration: 6000 }
      );

      setTimeout(() => {
        this.close();
        if (typeof window !== 'undefined' && typeof window.App !== 'undefined') {
          try { if (window.App?.students?.init) window.App.students.init(); } catch (_) {}
          try { if (window.App?.inscripciones?.init) window.App.inscripciones.init(); } catch (_) {}
          try { if (window.App?.payments?.init) window.App.payments.init(); } catch (_) {}
        } else if (typeof window.InscripcionesModule !== 'undefined' && typeof window.InscripcionesModule.init === 'function') {
          window.InscripcionesModule.init();
        }
      }, 1200);

    } catch (e) {
      Helpers.toast('Error en admisión (paso 2-5): ' + (e.message || e), 'error', { duration: 8000 });
    }
  },

  async _sendWelcomeEmailRetry({ to, studentName, matricula, classroom, level, schedule, email, password, fee }) {
    Helpers.toast('Reenviando correo de bienvenida...', 'info');
    try {
      const p1Name = document.getElementById('srm-p1name')?.value?.trim() || 'Familia';
      const subject = `Bienvenido(a) ${studentName} — Matrícula ${matricula} · Credenciales de acceso`;
      const html = this._buildWelcomeEmailTemplate({
        p1Name, studentName, matricula, classroom, level, schedule,
        email: email || to, password, monthlyFee: fee || 0, isTest: false
      });
      const text = this._buildWelcomeEmailText({
        p1Name, studentName, matricula, classroom, level, schedule,
        email: email || to, password, monthlyFee: fee || 0, isTest: false
      });
      const ok = await this._sendEmailViaEdge({ to, subject, html, text });
      if (ok) {
        Helpers.toast('¡Correo reenviado a ' + to + '!', 'success');
        const el = document.querySelector('[onclick*="_sendWelcomeEmailRetry"]')?.closest('[id^="retry-email-"]');
        if (el) el.remove();
      } else {
        Helpers.toast('No se pudo reenviar – revisa RESEND_API_KEY y FROM_EMAIL', 'error');
      }
    } catch (e) {
      Helpers.toast('Error: ' + (e.message || e), 'error');
    }
  },

  genMatricula() {
    const el = document.getElementById('srm-matricula');
    if (el) {
      el.value = 'MSC-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
    }
  },

  async genQR() {
    const matricula = document.getElementById('srm-matricula')?.value?.trim();
    if (!matricula) return Helpers.toast('Ingresa una matrícula primero', 'warning');
    const container = document.getElementById('srm-qr-container');
    const label = document.getElementById('srm-qr-label');
    if (!container) return;

    if (!window.QRCode) {
      await new Promise(r => { const s = document.createElement('script'); s.src = 'js/shared/qrcode.min.js'; s.onload = r; document.head.appendChild(s); });
    }
    container.innerHTML = '';
    label.textContent = matricula;
    try {
      new window.QRCode(container, { text: matricula, width: 160, height: 160, colorDark: '#1e293b', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.H });
    } catch (e) {
      container.innerHTML = '<p class="text-xs text-red-500 font-bold">Error al generar QR</p>';
    }
  },

  printCarnet() {
    const matricula = document.getElementById('srm-matricula')?.value?.trim() || _state.data?.matricula || '';
    const name = document.getElementById('srm-name')?.value?.trim() || _state.data?.name || '';
    const container = document.getElementById('srm-qr-container');
    const qrImg = container?.querySelector('img')?.src || container?.querySelector('canvas')?.toDataURL();
    if (!qrImg || !matricula) return Helpers.toast('Genera el QR primero', 'warning');
    const sel = document.getElementById('srm-classroom');
    const classroom = sel?.options[sel?.selectedIndex]?.text || _state.data?.classrooms?.name || _state.classes?.find(c => String(c.id) === String(_state.data?.classroom_id))?.name || '';
    const nivel = sel?.options[sel?.selectedIndex]?.dataset?.level || _state.data?.classrooms?.level || _state.classes?.find(c => String(c.id) === String(_state.data?.classroom_id))?.level || '';
    const p1 = document.getElementById('srm-p1name')?.value?.trim() || _state.data?.p1_name || '';
    const p2 = document.getElementById('srm-p2name')?.value?.trim() || _state.data?.p2_name || '';
    const p1phone = document.getElementById('srm-p1phone')?.value?.trim() || _state.data?.p1_phone || '';
    const p2phone = document.getElementById('srm-p2phone')?.value?.trim() || _state.data?.p2_phone || '';
    const isActive = document.getElementById('srm-active')?.checked ?? _state.data?.is_active ?? true;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(Helpers.getQRPrintTemplate(qrImg, name, matricula, {
        classroom, nivel,
        p1_name: p1, p2_name: p2,
        p1_phone: p1phone, p2_phone: p2phone,
        _parentName:  _state.data?.parent?.name || '',
        _parentPhone: _state.data?.parent?.phone || '',
        student_id: _state.studentId || _state.data?.id || '',
        is_active: isActive
      }));
      win.document.close();
    }
  },

  async sendCredentials() {
    const email = document.getElementById('srm-emailuser')?.value?.trim()
      || document.getElementById('srm-emailnotif')?.value?.trim()
      || this._v('p1_email');
    const password = document.getElementById('srm-password')?.value?.trim();
    if (!email) return Helpers.toast('Ingresa el correo de login', 'warning');
    if (!password || password.length < 6) return Helpers.toast('La contraseña debe tener al menos 6 caracteres', 'warning');
    const p1Name = document.getElementById('srm-p1name')?.value?.trim() || this._v('p1_name') || 'Familia';
    const studentName = document.getElementById('srm-name')?.value?.trim() || this._v('name') || 'Estudiante';
    const matricula = document.getElementById('srm-matricula')?.value?.trim() || this._v('matricula') || 'MSC-XXXXXXXX';
    const sel = document.getElementById('srm-classroom');
    const classroom = sel?.options?.[sel?.selectedIndex]?.text || this._v('classroom') || 'Aula Asignada';
    const level = sel?.options?.[sel?.selectedIndex]?.dataset?.level || this._v('level_requested') || '';
    const schedule = document.getElementById('srm-schedule')?.value || this._v('schedule') || 'Regular';
    const fee = parseFloat(document.getElementById('srm-monthlyfee')?.value || '0') || 0;

    Helpers.toast('Enviando credenciales a ' + email + '...', 'info');
    const subject = `Credenciales Portal de Padres · ${studentName} (${matricula})`;
    const html = this._buildWelcomeEmailTemplate({
      p1Name, studentName, matricula, classroom, level, schedule,
      email, password, monthlyFee: fee, isTest: false
    });
    const text = this._buildWelcomeEmailText({
      p1Name, studentName, matricula, classroom, level, schedule,
      email, password, monthlyFee: fee, isTest: false
    });
    const ok = await this._sendEmailViaEdge({ to: email, subject, html, text });
    if (ok) Helpers.toast('Credenciales enviadas correctamente', 'success');
    else Helpers.toast('No se pudo enviar – revisa Edge Function / Resend. Puedes reintentar.', 'warning');
  },

  // ════════════════════════════════════════════════════════════════
  // EVENT BINDING
  // ════════════════════════════════════════════════════════════════

  _bindEvents() {
    const matInput = document.getElementById('srm-matricula');
    if (matInput) {
      let qrTimeout;
      matInput.addEventListener('input', () => { clearTimeout(qrTimeout); qrTimeout = setTimeout(() => this.genQR(), 600); });
    }

    if (_state.activeTab === 'history') this._loadTimeline();
    if (_state.activeTab === 'family' && _state.studentId) this._loadSiblings();
    if (_state.activeTab === 'payments' && _state.studentId) this._loadPaymentSummary();

    setTimeout(() => {
      const body = document.getElementById('srmBody');
      if (body) body.scrollTop = 0;
    }, 50);
  },

  async _loadSiblings() {
    const container = document.getElementById('srm-siblings-list');
    if (!container || !_state.studentId) return;

    const d = _state.data;
    const parentId = d.parent_id;
    if (!parentId) {
      container.innerHTML = '<p class="text-xs text-slate-400 italic">Sin padre asignado</p>';
      return;
    }

    try {
      const { data: siblings } = await supabase
        .from('students')
        .select('id, name, avatar_url, matricula, classrooms:classroom_id(name)')
        .eq('parent_id', parentId)
        .eq('is_active', true)
        .neq('id', parseInt(_state.studentId, 10))
        .order('name');

      if (!siblings?.length) {
        container.innerHTML = '<p class="text-xs text-slate-400 italic">Sin hermanos registrados</p>';
        return;
      }

      container.innerHTML = `<div class="flex flex-wrap gap-2">
        ${siblings.map(sib => `
          <button onclick="StudentRecordModal.close(); setTimeout(() => StudentRecordModal.open('edit', '${sib.id}'), 200)"
            class="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all shadow-sm active:scale-95 group cursor-pointer">
            <div class="w-7 h-7 rounded-full bg-blue-100 overflow-hidden flex items-center justify-center shrink-0">
              ${sib.avatar_url ? `<img src="${sib.avatar_url}" class="w-full h-full object-cover">` :
                `<span class="text-[10px] font-black text-blue-600">${(sib.name || '?').charAt(0)}</span>`}
            </div>
            <div class="text-left">
              <div class="text-[11px] font-black text-slate-700 group-hover:text-blue-700">${Helpers.escapeHTML(sib.name)}</div>
              <div class="text-[9px] font-bold text-slate-400">${sib.classrooms?.name || 'Sin aula'}</div>
            </div>
          </button>`).join('')}
      </div>`;
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      container.innerHTML = '<p class="text-xs text-red-400 italic">Error al cargar hermanos</p>';
    }
  },

  async _loadPaymentSummary() {
    const container = document.getElementById('srm-payment-summary');
    if (!container || !_state.studentId) return;

    try {
      const { data: plan } = await supabase
        .from('payment_plans')
        .select('id, monthly_fee, due_day, status, start_date')
        .eq('student_id', parseInt(_state.studentId, 10))
        .eq('status', 'active')
        .maybeSingle();

      if (!plan) {
        container.innerHTML = '<p class="text-xs text-slate-400 italic">Sin plan de pago activo</p>';
        return;
      }

      const { data: payments } = await supabase
        .from('payments')
        .select('id, amount, month_paid, due_date, status, paid_at')
        .eq('payment_plan', plan.id)
        .order('due_date');

      const paid = (payments || []).filter(p => p.status === 'paid').length;
      const total = (payments || []).length;
      const totalDue = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);
      const totalPaid = (payments || []).filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);

      container.innerHTML = `
        <div class="grid grid-cols-3 gap-3 mb-3">
          <div class="bg-white p-3 rounded-xl border border-slate-100">
            <p class="text-[10px] font-black text-slate-400 uppercase">Mensualidad</p>
            <p class="text-lg font-black text-blue-700">$${plan.monthly_fee || 0}</p>
          </div>
          <div class="bg-white p-3 rounded-xl border border-slate-100">
            <p class="text-[10px] font-black text-slate-400 uppercase">Pagado</p>
            <p class="text-lg font-black text-emerald-600">${paid}/${total}</p>
          </div>
          <div class="bg-white p-3 rounded-xl border border-slate-100">
            <p class="text-[10px] font-black text-slate-400 uppercase">Pendiente</p>
            <p class="text-lg font-black text-rose-600">$${(totalDue - totalPaid).toFixed(2)}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 mb-2">
          <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full" style="width:${total ? (paid/total*100) : 0}%"></div>
          </div>
          <span class="text-[10px] font-black text-slate-500">${total ? Math.round(paid/total*100) : 0}%</span>
        </div>
        ${payments?.length ? `
          <div class="max-h-32 overflow-y-auto space-y-1">
            ${payments.slice(0, 12).map(p => `
              <div class="flex items-center justify-between px-3 py-1.5 rounded-lg ${p.status === 'paid' ? 'bg-emerald-50' : 'bg-rose-50'}">
                <span class="text-xs font-bold ${p.status === 'paid' ? 'text-emerald-700' : 'text-rose-700'}">${p.month_paid || '—'}</span>
                <span class="text-xs font-black ${p.status === 'paid' ? 'text-emerald-600' : 'text-rose-600'}">${p.status === 'paid' ? 'Pagado' : 'Pendiente'}</span>
              </div>`).join('')}
          </div>` : ''}
      `;
    } catch (e) {
      container.innerHTML = '<p class="text-xs text-red-400 italic">Error al cargar pagos</p>';
    }
  }
};

window.StudentRecordModal = StudentRecordModal;
