import { ensureRole, supabase, initOneSignal } from '../shared/supabase.js';
import { Security } from '../shared/security.js';
import { AppState } from './state.js';
import { AssistantApi } from './api.js';
import { PaymentsModule } from './payments.js';
import { AccessModule } from './access.js';
import { TeachersModule } from './teachers.js';
import { Helpers } from '../shared/helpers.js';
import { WallModule } from '../shared/wall.js';
import { StudentsModule } from './modules/students.js';
import { initCajaCobro, CajaCobroV2 } from '../shared/caja-cobro-v2.js';
import { RoomsModule } from './modules/rooms.js';
import { DashboardModule } from './modules/dashboard.js';
import { BadgeSystem } from '../shared/badges.js';
import { ImageLoader } from '../shared/image-loader.js';
import { RealtimeManager } from '../shared/realtime-manager.js';
import { UIPremium } from '../shared/ui-premium.js';
import { AssistantAccountingModule } from './accounting.module.js';
import { InscripcionesModule } from '../directora/inscripciones.module.js';
import { CatalogoModule } from '../shared/catalogo-conceptos.module.js';
import { NewsCenter } from '../shared/news-center.js';
import { openGlobalModal, closeGlobalModal } from '../shared/modal.js';
import { InvoiceModule } from '../shared/invoice.js';
import { AssistantChatApp } from './chat_app.js';

// Exponer globalmente para onclick en HTML
window.InscripcionesModule = InscripcionesModule;
window.CatalogoModule = CatalogoModule;
window.CajaCobroV2 = CajaCobroV2;
window.InvoiceModule = InvoiceModule;

// Close modal global — alias para compatibilidad con código existente
window._closeAsistenteModal = closeGlobalModal;

// Cierre de modales estáticos al hacer clic fuera del contenido
document.addEventListener('click', (e) => {
  const staticModals = ['roomModal', 'roomStudentsModal', 'paymentDetailModal', 'paymentModal', 'attendanceModal', 'accessModal'];
  for (const id of staticModals) {
    const modal = document.getElementById(id);
    if (modal && e.target === modal && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      break;
    }
  }
});

window.openGlobalModal = openGlobalModal;
window.closeGlobalModal = closeGlobalModal;

window.App = {
  payments: {
    markPaid:      (id)  => PaymentsModule.markPaid(id),
    rejectPayment: (id, notes)  => PaymentsModule.rejectPayment(id, notes),
    deletePayment: (id)  => PaymentsModule.deletePayment(id),
    openModal:     (sid) => PaymentsModule.openPaymentModal(sid),
    closeModal:    ()    => PaymentsModule.closeModal(),
    filterBy:      (s)   => PaymentsModule.filterBy(s),
    waiveMora:     (id)  => PaymentsModule.waiveMora(id),
    _confirmApproval: (id) => PaymentsModule._confirmApproval(id)
  },
  accounting: AssistantAccountingModule,
  registerAccess: (sid, type) => window.App._registerAccess(sid, type),
  confirmPayment: (id) => PaymentsModule.markPaid(id),
  rejectPayment:  (id) => PaymentsModule.rejectPayment(id),
  deletePayment:  (id) => PaymentsModule.deletePayment(id),
  registerPayment:(sid) => PaymentsModule.openPaymentModal(sid),
  openTeacherModal: (id) => window.App._openTeacherModal(id),
  toggleCommentSection: (id) => window.App._toggleCommentSection(id),
  deleteComment: (cid, pid) => window.App._deleteComment(cid, pid),
  sendComment: (pid) => window.App._sendComment(pid),
  toggleLike: (pid) => window.App._toggleLike(pid),
  selectChatContact: (uid, name, role) => window.App._selectChatContact(uid, name, role),
  students: StudentsModule,
  printAllCarnets: () => StudentsModule.printAllCarnets(),
  rooms: RoomsModule,
  teachers: {
    openModal:     (id)         => TeachersModule.openModal(id),
    deleteTeacher: (id, name)   => TeachersModule.deleteTeacher(id, name)
  }
};

/**
 * Inicializaci�n principal del Panel de Asistente
 */
document.addEventListener('DOMContentLoaded', async () => {
  
  // 1. Verificar Rol
  const auth = await ensureRole(['asistente', 'admin', 'directora', 'encargada']);
  if (!auth) return;
  
  AppState.set('user', auth.user);
  AppState.set('profile', auth.profile);

  // ?? Sistema de badges por sección
  BadgeSystem.init(auth.user.id);

  // ?? Campanita de novedades (centro de notificaciones)
  NewsCenter.init(auth.user.id);

  // Badge inscripciones pendientes
  const loadPreBadge = async () => {
    try {
      const { count } = await supabase.from('student_preregistrations').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      const b = document.getElementById('badge-inscripciones');
      if (b) {
        if (count > 0) { b.textContent = count > 99 ? '99+' : String(count); b.classList.remove('hidden'); }
        else b.classList.add('hidden');
      }
    } catch (_) {}
  };
  loadPreBadge();
  try {
    supabase.channel('asistente-preinsc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_preregistrations' }, () => loadPreBadge())
      .subscribe();
  } catch (_) {}

  // Sidebar profile
  const profile = auth.profile;
  const nameEl = document.getElementById('sidebarUserName');
  if (nameEl) nameEl.textContent = profile?.name || 'Asistente';
  const avatarEl = document.getElementById('sidebarAvatar');
  if (avatarEl && profile?.avatar_url) avatarEl.src = profile.avatar_url;

  // Logout
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    RealtimeManager.unsubscribeAll();
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
  
  // 2. Inicializar m�dulos ligeros y navegaci�n
  // La navegaci�n ahora se encargar� de la carga perezosa (lazy loading) de las secciones.
  WallModule.init('muroPostsContainer', { accentColor: 'teal', likeColor: 'emerald' }, AppState);
  
  // ? FIX OneSignal: Solo inicializar en el dominio correcto para evitar errores de consola
  if (window.location.hostname === 'montessorisonrisascreativas.com' || window.location.hostname === 'localhost') {
    try { initOneSignal(auth.user); } catch(_) { /* silencioso */ }
  } else {
  }
  
  initNavigation(); // Esto cargar� el dashboard y configurar� los listeners

  // Asignar funciones internas al objeto global App
  Object.assign(window.App, {
    _registerAccess: (sid, type) => AccessModule.register(sid, type),
    _confirmPayment: (id) => PaymentsModule.confirmPayment(id),
    _rejectPayment: (id) => PaymentsModule.rejectPayment(id),
    _deletePayment: (id) => PaymentsModule.deletePayment(id),
    _registerPayment: (sid) => PaymentsModule.openModal(sid),
    _openTeacherModal: (id) => TeachersModule.openModal(id),
    _toggleCommentSection: (id) => WallModule.toggleCommentSection(id),
    _deleteComment: (cid, pid) => WallModule.deleteComment(cid, pid),
    _sendComment: (pid) => sendComment(pid),
    _toggleLike: (pid) => WallModule.toggleLike(pid),
    _selectChatContact: (uid, name, role) => selectAssistantChat(uid, name, role),
    selectChatContact: (uid, name, role) => selectAssistantChat(uid, name, role),
    // Estudiantes
    _openStudentModal: (id) => StudentsModule.openModal(id),
    _deleteStudent: (id, name) => StudentsModule._deleteStudent(id, name),
    _genMatricula: () => window._genMatricula?.(),
    printAllCarnets: () => StudentsModule.printAllCarnets(),
    _openRoomModal: (id) => RoomsModule.openModal(id),
    openNewPostModal,
    submitNewPost
  });

  // Exponer WallModule globalmente
  window.WallModule = WallModule;
  window.openTeacherModal = (id) => TeachersModule.openModal(id);
  window.openNewPostModal = openNewPostModal;
  window.submitNewPost = submitNewPost;

  // Mantener compatibilidad temporal para onclick en HTML que no use App.
  Object.assign(window, window.App);

  if (window.lucide) lucide.createIcons();
});

/**
 * 🚀 MURO ESCOLAR - Crear Publicación
 */
async function openNewPostModal() {
  const html = `
      <div class="modal-header bg-gradient-to-r from-teal-600 to-emerald-600 text-white p-6 rounded-t-3xl flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl shadow-inner">📝</div>
          <div>
            <h3 class="text-xl font-black">Crear Publicación</h3>
            <p class="text-xs text-white/70 font-bold uppercase tracking-widest">Muro Escolar</p>
          </div>
        </div>
      </div>
      
      <div class="p-8 bg-white space-y-6">
        <div>
          <label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">Contenido del Mensaje</label>
          <textarea id="postContent" rows="4" class="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-teal-100 focus:border-teal-400 bg-slate-50/50 transition-all text-sm font-medium resize-none" placeholder="¿Qué quieres compartir hoy con los padres?"></textarea>
        </div>

        <div>
          <label class="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2 ml-1">Aula (Opcional)</label>
          <select id="postClassroom" class="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-teal-100 focus:border-teal-400 bg-slate-50/50 transition-all text-sm font-medium appearance-none">
            <option value="">General (Todos)</option>
          </select>
        </div>

        <div class="flex flex-col md:flex-row gap-6 items-center bg-slate-50 p-6 rounded-3xl border-2 border-slate-100">
          <div class="relative group cursor-pointer">
            <div id="postMediaPreview" class="w-24 h-24 rounded-[2rem] bg-white border-4 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 group-hover:border-teal-400 group-hover:bg-teal-50 transition-all overflow-hidden">
              <i data-lucide="camera" class="w-8 h-8 mb-1"></i>
              <span class="text-[9px] font-black uppercase">Media</span>
            </div>
            <input type="file" id="postFile" class="absolute inset-0 opacity-0 cursor-pointer" accept="image/*,video/*">
          </div>
          <div class="flex-1">
            <h4 class="text-sm font-black text-slate-800 mb-1">📸 MULTIMEDIA</h4>
            <p class="text-xs text-slate-500">Sube una imagen o video para acompañar tu publicación. Máximo 10MB.</p>
          </div>
        </div>
      </div>

      <div class="p-6 border-t bg-slate-50 rounded-b-3xl flex justify-end gap-3">
        <button onclick="window._closeAsistenteModal()" class="px-6 py-3 border-2 border-slate-200 text-slate-700 font-bold text-sm rounded-2xl hover:bg-slate-100 transition-all">Cancelar</button>
        <button id="btnSubmitPost" onclick="window.submitNewPost()" class="px-6 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold text-sm rounded-2xl hover:from-teal-700 hover:to-emerald-700 transition-all shadow-lg shadow-teal-200">Publicar</button>
      </div>
  `;
  window.openGlobalModal(html);

  // Load classrooms for the select
  try {
    const { data: classrooms } = await supabase.from('classrooms').select('id, name').order('name');
    const select = document.getElementById('postClassroom');
    if (select && classrooms) {
      select.innerHTML = '<option value="">General (Todos)</option>';
      classrooms.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
      });
    }
  } catch (_) { /* silencioso */ }

  if (window.lucide) lucide.createIcons();
}

async function submitNewPost() {
  const content = document.getElementById('postContent').value.trim();
  const fileInput = document.getElementById('postFile');
  const file = fileInput?.files[0];
  const btn = document.getElementById('btnSubmitPost');
  const classroomSelect = document.getElementById('postClassroom');

  if (!content && !file) return Helpers.toast('Escribe algo o sube un archivo', 'warning');

  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto"></i>';
  if(window.lucide) window.lucide.createIcons();

  try {
    let mediaUrl = null;
    let mediaType = null;

    if (file) {
      const ext = file.type.startsWith('video') ? file.name.split('.').pop() : 'webp';
      const path = `posts/${Date.now()}_${Math.random().toString(36).substr(2,9)}.${ext}`;
      
      const publicUrl = await ImageLoader.uploadToStorage(
        file,
        'classroom_media',
        path,
        { maxWidth: 1200, maxHeight: 1200, quality: 0.82, maxSizeKB: 400 }
      );
      mediaUrl = publicUrl;
      mediaType = file.type.startsWith('video') ? 'video' : 'image';
    }

    const user = AppState.get('user');
    if (!user) throw new Error('No hay sesión activa');

    const insertPayload = {
      teacher_id:   user.id,
      content:      content,
      media_url:    mediaUrl,
      media_type:   mediaType,
      classroom_id: classroomSelect?.value || null
    };

    const { error } = await supabase.from('posts').insert(insertPayload);

    if (error) throw error;

    // Notificar a padres si el post es de un aula específica
    if (insertPayload.classroom_id) {
      const { emitEvent } = await import('../shared/supabase.js').catch(() => ({ emitEvent: null }));
      const prof = AppState.get('profile');
      emitEvent?.('post.created', {
        classroom_id: insertPayload.classroom_id,
        teacher_name: prof?.name || 'Administración',
        content_preview: (content || '').substring(0, 80)
      }).catch(() => {});
    }

    Helpers.toast('Publicado correctamente', 'success');
    window._closeAsistenteModal();
  } catch (err) {
    Helpers.toast('Error al publicar: ' + (err.message || ''), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'PUBLICAR';
      if(window.lucide) window.lucide.createIcons();
    }
  }
}

/**
 * Navegaci�n lateral
 */
const loadedSections = new Set();

const ASIS_FINANCIAL_SECTIONS = new Set(['pagos', 'contabilidad', 'catalogo', 'finanzas', 'caja', 'nomina', 'dgii']);

function initNavigation() {
  const navLinks = document.querySelectorAll('[data-section]');
  const sections = document.querySelectorAll('section[id]');

  const showSection = async (target) => {
    // Módulo financiero deshabilitado: redirigir al dashboard
    if (ASIS_FINANCIAL_SECTIONS.has(target)) {
      target = 'dashboard';
    }
    Helpers.vibrate?.('light');

    // ✅ LIMPIEZA DE REALTIME: Eliminar canales al cambiar de sección
    RealtimeManager.unsubscribeAll(['notifications']);

    // Desuscribir muro al salir (ahorro de recursos Realtime)
    const prevSection = AppState.get('currentSection');
    if (prevSection === 'muro' && target !== 'muro') {
      WallModule.destroy?.();
      // Permitir re-inicializar el muro la próxima vez
      loadedSections.delete('muro');
    }

    // 1. Limpiar clases activas en botones de navegación�n
    navLinks.forEach(l => {
      l.classList.remove('bg-white/20', 'bg-teal-50', 'text-teal-600', 'active');
      // Si el bot�n est� en el sidebar y no es el activo, restaurar su estilo original de texto blanco
      if (!l.classList.contains('active')) {
        l.classList.add('text-white');
      }
    });

    const activeLink = document.querySelector(`[data-section="${target}"]`);
    if (activeLink) {
      activeLink.classList.add('bg-white/20', 'active');
      activeLink.classList.remove('text-white');
    }

    // Actualizar Bottom Nav
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === target);
    });
    
    // 2. Manejo de visibilidad de secciones (ESCENARIO)
    // Lógica de salida de sección (Limpieza)
    if (prevSection === 'accesos' && target !== 'accesos') {
      try {
        if (AccessModule?.stopScanner) {
          AccessModule.stopScanner();
        }
      } catch (_) {}
    }

    sections.forEach(s => {
      s.classList.add('hidden');
      s.classList.remove('active');
    });

    const sectionEl = document.getElementById(target);
    if (sectionEl) {
      sectionEl.classList.remove('hidden');
      sectionEl.classList.add('active'); 
      UIPremium.applySectionTransition(target);
    } else {

    }
    
    AppState.set('currentSection', target);

    // ?? Marcar badge como le�do al entrar a la secci�n
    BadgeSystem.mark(target);

    // 3. Cerrar sidebar en m�vil autom�ticamente al cambiar de secci�n
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth < 768) {
      sidebar.classList.remove('mobile-visible');
      const ov = document.getElementById('sidebarOverlay');
      if (ov) ov.style.display = 'none';
    }

    // ? --- L�GICA DE CARGA PEREZOSA (LAZY LOADING) ---
    if (!loadedSections.has(target)) {
      try {
        switch (target) {
          case 'inscripciones':
            InscripcionesModule.load();
            break;
          case 'catalogo':
            CatalogoModule.init();
            break;
          case 'pagos':
            initCajaCobro('pagosContainer');
            PaymentsModule.init().catch(()=>{});
            import('../shared/payment-queue.js').then(m =>
              m.PaymentQueue.init('payment-queue-container')
            ).catch(() => {});
            break;
          case 'contabilidad':
            await AssistantAccountingModule.init();
            break;
          case 'accesos':
            await AccessModule.init();
            document.getElementById('btnExteriorMode')?.addEventListener('click', () => AccessModule.toggleExteriorMode());
            break;
          case 'maestros':
            await TeachersModule.init();
            break;
          case 'estudiantes':
            await StudentsModule.init();
            break;
          case 'aulas':
            await RoomsModule.init();
            break;
          case 'muro':
            WallModule.init('muroPostsContainer', { 
              accentColor: 'teal', 
              likeColor: 'emerald' 
            }, AppState);
            break;
          case 'staff-permits':
            import('../directora/permits.module.js').then(m => {
              window.App.permits = m.PermitsModule;
              m.PermitsModule.init();
            });
            break;
          case 'chat':
            await initAssistantChat();
            break;
          case 'videocall': {
            const vcProfile = AppState.get('profile') || {};
            import('../shared/videocall-ui.js').then(({ VideoCallUI }) => {
              VideoCallUI.renderSection('videocall-asistente-section', {
                role: 'asistente',
                userName: vcProfile?.name || 'Asistente',
                classroomId: null
              });
            }).catch(() => {});
            break;
          }
          case 'perfil':
            initProfile();
            import('../shared/notify-permission.js').then(m => m.NotifyPermission.requestIfNeeded());
            break;
        }
        loadedSections.add(target);
      } catch (err) {

        Helpers.toast(`Error al cargar ${target}`, 'error');
      }
    } else {
      // Re-cargar datos frescos al volver a una secci�n ya visitada
      switch (target) {
        case 'maestros':   TeachersModule.loadTeachers?.(); break;
        case 'estudiantes': StudentsModule.loadStudents?.(); break;
        case 'aulas':      RoomsModule.loadRooms?.(); break;
        case 'pagos':      PaymentsModule.loadPayments?.(); break;
      }
    }
  };

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });

  // Exponer navegación para onclicks del dashboard
  window.App.navigateTo = showSection;

  // Carga inicial del dashboard
  DashboardModule.init().then(() => loadedSections.add('dashboard'));
  showSection('dashboard');

  // -- Sidebar (mobile + desktop collapse) delegado al módulo unificado ------
  import('../shared/sidebar-manager.js')
    .then(({ initSidebar, initSidebarDropdowns }) => {
      initSidebar();
      initSidebarDropdowns();
    })
    .catch(() => {
      // Fallback mínimo
      document.getElementById('menuBtn')?.addEventListener('click', () => {
        const sb = document.getElementById('sidebar');
        const ov = document.getElementById('sidebarOverlay');
        if (!sb) return;
        const open = sb.classList.toggle('mobile-visible');
        if (ov) ov.style.display = open ? 'block' : 'none';
      });
      document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.remove('mobile-visible');
        const ov = document.getElementById('sidebarOverlay');
        if (ov) ov.style.display = 'none';
      });
    });
}




/**
 * Perfil del Asistente
 */
async function initProfile() {
  const profile = AppState.get('profile');
  if (!profile) return;

  // Fetch fresh profile with access_code from DB
  const { data: freshProfile } = await supabase
    .from('profiles')
    .select('id, name, email, phone, bio, avatar_url, access_code, role')
    .eq('id', profile.id)
    .maybeSingle();
  const p = freshProfile || profile;

  const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
  setVal('profileName', p.name);
  setVal('profilePhone', p.phone);
  setVal('profileEmail', p.email);
  setVal('profileBio', p.bio || '');

  // Helper to set avatar
  const setProfileAvatar = (avatarUrl, name) => {
    const avatarEl = document.getElementById('profileAvatarPreview');
    if (!avatarEl) return;
    const initial = (name || 'A').charAt(0).toUpperCase();
    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">`;
    } else {
      avatarEl.innerHTML = initial;
    }
  };
  
  // Avatar
  const avatarInput   = document.getElementById('profileAvatarInput');
  setProfileAvatar(p.avatar_url, p.name);

  if (avatarInput) {
    avatarInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { 
          const avatarEl = document.getElementById('profileAvatarPreview');
          avatarEl.innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover rounded-full">`; 
        };
        reader.readAsDataURL(file);
      }
    };
  }

  // -- QR de Acceso Personal --------------------------------------------------
  const code = p.access_code || (p.notes?.startsWith?.('TEA-') || p.notes?.startsWith?.('ASI-') ? p.notes : null);
  const codeInput = document.getElementById('profileAccessCode');
  if (codeInput && code) codeInput.value = code;

  const _loadQR = () => new Promise(r => {
    if (window.QRCode) { r(); return; }
    const s = document.createElement('script');
    s.src = 'js/shared/qrcode.min.js';
    s.onload = r; document.head.appendChild(s);
  });

  const _renderProfileQR = async (c) => {
    const container = document.getElementById('profileQrContainer');
    if (!container || !c) return;
    await _loadQR();
    container.innerHTML = '';
    new window.QRCode(container, {
      text: JSON.stringify({ matricula: c, name: p.name, type: 'sonrisas-staff', v: 1 }),
      width: 130, height: 130, colorDark: '#1e293b', colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.H
    });
  };

  if (code) setTimeout(() => _renderProfileQR(code), 300);

  window._genProfileAccessCode = async () => {
    const prefix = p.role === 'directora' ? 'DIR' : p.role === 'asistente' ? 'ASI' : 'TEA';
    const newCode = `${prefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    if (codeInput) codeInput.value = newCode;
    // Save immediately
    const { error } = await supabase.from('profiles').update({ access_code: newCode }).eq('id', p.id);
    if (!error) {
      Helpers.toast('C�digo de acceso guardado', 'success');
      AppState.set('profile', { ...AppState.get('profile'), access_code: newCode });
      _renderProfileQR(newCode);
    } else {
      Helpers.toast('Error al guardar c�digo: ' + error.message, 'error');
    }
  };

  window._printProfileQR = () => {
    const c = document.getElementById('profileAccessCode')?.value?.trim();
    const container = document.getElementById('profileQrContainer');
    const img = container?.querySelector('img')?.src || container?.querySelector('canvas')?.toDataURL();
    if (!img || !c) { Helpers.toast('Genera el QR primero', 'warning'); return; }
    const escName = Helpers.escapeHTML(p.name || 'Personal');
    const escRole = Helpers.escapeHTML(p.role || 'Asistente');
    const escCode = Helpers.escapeHTML(c);
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Carnet ${escName}</title>
      <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
      .card{border:4px solid #0d9488;border-radius:20px;padding:24px;text-align:center;max-width:260px;}
      .hdr{background:#0d9488;color:white;margin:-24px -24px 16px;padding:12px;border-radius:16px 16px 0 0;font-weight:900;font-size:12px;text-transform:uppercase;}
      img{width:160px;height:160px;border-radius:8px;}.name{font-size:16px;font-weight:900;color:#1e293b;margin-top:12px;}
      .role{font-size:11px;color:#0d9488;font-weight:800;text-transform:uppercase;margin-top:2px;}
      .code{font-size:10px;color:#64748b;font-weight:700;margin-top:8px;}</style>
    </head><body><div class="card">
      <div class="hdr">STAFF • COLEGIO MONTESSORI SONRISAS CREATIVAS</div>
      <img src="${img}">
      <div class="name">${escName}</div>
      <div class="role">${escRole}</div>
      <div class="code">ID: ${escCode}</div>
    </div><script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  };

  // -- Form submit ------------------------------------------------------------
  const form = document.getElementById('profileForm');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
      try {
        const updates = {
          name:  document.getElementById('profileName')?.value?.trim(),
          phone: document.getElementById('profilePhone')?.value?.trim(),
          bio:   document.getElementById('profileBio')?.value?.trim()
        };
        const file = avatarInput?.files[0];
        if (file) {
          const ext  = file.name.split('.').pop();
          const path = `avatars/${p.id}_${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage.from('karpus-uploads').upload(path, file);
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabase.storage.from('karpus-uploads').getPublicUrl(path);
          updates.avatar_url = publicUrl;
          const sidebarAvatar = document.getElementById('sidebarAvatar');
          if (sidebarAvatar) sidebarAvatar.src = publicUrl;
          const avatarEl = document.getElementById('profileAvatarPreview');
          if (avatarEl) avatarEl.innerHTML = `<img src="${publicUrl}" class="w-full h-full object-cover rounded-full">`;
        }
        const { error } = await supabase.from('profiles').update(updates).eq('id', p.id);
        if (error) throw error;
        Helpers.toast('Perfil actualizado correctamente', 'success');
        AppState.set('profile', { ...AppState.get('profile'), ...updates });
        const nameDisplay = document.getElementById('profileNameDisplay');
        const sidebarName = document.getElementById('sidebarUserName');
        if (nameDisplay) nameDisplay.textContent = updates.name;
        if (sidebarName)  sidebarName.textContent  = updates.name;
      } catch (err) {
        Helpers.toast('Error al guardar perfil: ' + (err.message || ''), 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar Cambios'; }
      }
    };
  }

  if (window.lucide) lucide.createIcons();
}

// --- Funciones Globales de Ventana ---
window.selectAssistantChat = async (userId) => {
  await AssistantChatApp.selectChatById(userId);
};

async function initAssistantChat() {
  await AssistantChatApp.init();
}

window.App.runEmergencyCycle = async function() {
  if (!confirm('¿Ejecutar ciclo de pagos de emergencia?')) return;
  const { data, error } = await supabase.rpc('run_payment_cycle');
  if (error) alert('Error: ' + error.message);
  else alert('Éxito: ' + data.generated + ' cobros generados.');
  window.location.reload();
};
