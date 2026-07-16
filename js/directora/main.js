import { ensureRole, supabase, initOneSignal } from '../shared/supabase.js';
import { AppState } from './state.js';
import { Helpers } from '../shared/helpers.js';
import { UIPremium } from '../shared/ui-premium.js';
import { WallModule } from './wall.module.js';
import { DashboardService } from './dashboard.service.js';
import { UIHelpers, DirectorUI } from './ui.module.js';
import { renderDashboardV2 } from './dashboard-v2.js';
import { StudentsModule } from './students.module.js';
import { TeachersModule } from './teachers.module.js';
import { PaymentsModule } from './payments.module.js';
import { NewPaymentsModule } from './payments-new.module.js';
import { InvoicingModule } from './invoicing.module.js';
import { AccountingModule } from './accounting.module.js';
import { BadgeSystem } from '../shared/badges.js';

// ── Tenant config row — única fila de configuración del tenant ─────────────────
const SCHOOL_SETTINGS_ID = 1;
import { GradesModule } from './grades.module.js';
import { PermitsModule } from './permits.module.js';
import { InquiriesModule } from './inquiries.module.js';
import { ChatModule } from './chat.module.js';
import { RoomsModule } from './rooms.module.js';
import { AcademicCycleModule } from './academic-cycle.module.js';
import { InscripcionesModule } from './inscripciones.module.js';
import { CatalogoModule } from '../shared/catalogo-conceptos.module.js';
import { CajaModule } from './caja.module.js';
import { initCajaCobro, CajaCobroV2 } from '../shared/caja-cobro-v2.js';
import { AccessModule } from './access.module.js';
import { SchoolYearModule } from './school-year.module.js';

window.CajaModule = CajaModule;
window.CajaCobroV2 = CajaCobroV2;
import { AttendanceModule } from './attendance.module.js';
import { RealtimeManager } from '../shared/realtime-manager.js';
import { QueryCache } from '../shared/query-cache.js';
import { ImageLoader } from '../shared/image-loader.js';
import { auditLog } from '../shared/db-utils.js';
const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

window.InscripcionesModule = InscripcionesModule;
window.CatalogoModule = CatalogoModule;
window.NewPaymentsModule = NewPaymentsModule;

window.App = {
  navigation: { goTo: goToSection },
  students: StudentsModule,
  teachers: { ...TeachersModule, edit: (id) => TeachersModule.openModal(id) },
  rooms: RoomsModule,
  payments: PaymentsModule,
  invoicing: InvoicingModule,
  accounting: AccountingModule,
  attendance: AttendanceModule,
  grades: GradesModule,
  ui: { ...UIHelpers, ...DirectorUI },
  inquiries: InquiriesModule,
  permits: PermitsModule,
  chat: ChatModule,
  automation: { renderSmartWidgets: () => {} }, // stub — módulo no disponible
  academic:   AcademicCycleModule,
  caja:       CajaModule,
  cuentasCobrar: { init: () => import('./cuentas-cobrar.module.js').then(m => m.CuentasCobrarModule.init()), remindStudent: (id) => import('./cuentas-cobrar.module.js').then(m=>m.CuentasCobrarModule.remindStudent(id)), applyFilter: (v) => import('./cuentas-cobrar.module.js').then(m=>m.CuentasCobrarModule.applyFilter(v)) },
  wall: {
    toggleCommentSection: (pid) => WallModule.toggleCommentSection(pid),
    sendComment: (pid) => WallModule.sendComment(pid),
    deletePost: (pid) => WallModule.deletePost(pid),
    toggleLike: (pid) => WallModule.toggleLike(pid),
    openNewPostModal: () => WallModule.openNewPostModal(),
    loadPosts: (container) => WallModule.loadPosts(container || 'muroPostsContainer')
  }
};

window.WallModule = WallModule;

window.openGlobalModal = function(html, wide = false) {
  const container = document.getElementById('globalModalContainer');
  if (!container) return;
  const maxW = wide ? 'max-w-4xl' : 'max-w-2xl';
  container.innerHTML = `
    <div id="globalModalInner" class="bg-white rounded-3xl shadow-2xl w-full ${maxW} max-h-[92vh] overflow-y-auto mx-3 my-4 relative animate-scaleIn">
      <button onclick="App.ui.closeModal()" class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all z-[110]">
        <i data-lucide="x" class="w-6 h-6"></i>
      </button>
      ${html}
    </div>`;
  container.style.cssText = 'display:flex;align-items:flex-start;justify-content:center;padding-top:4vh;position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:var(--z-modal,100);overflow-y:auto;';
  
  // Cerrar al hacer clic fuera del contenido (en el overlay)
  container.onmousedown = (e) => {
    if (e.target === container) {
      App.ui.closeModal();
    }
  };

  if (window.lucide) lucide.createIcons();
};

/**
 * ?? Navegaci�n Global
 */
export function goToSection(sectionId) {
  if (!sectionId) return;

  Helpers.vibrate?.('light');

  // ✅ LIMPIEZA DE REALTIME: Eliminar canales al cambiar de sección
  // Excepto notificaciones globales si existieran
  RealtimeManager.unsubscribeAll(['notifications']);

  // Desuscribir muro al salir (ahorro de recursos Realtime)
  const prevSection = AppState.get('currentSection');
  if (prevSection === 'muro' && sectionId !== 'muro') {
    WallModule.destroy?.();
  }

  if (prevSection === 'accesos' && sectionId !== 'accesos') {
    try {
      if (AccessModule?.stopScanner) {
        AccessModule.stopScanner();
      }
      // Lazy QR: Limpiar QRs generados para ahorrar memoria
      const qrContainer = document.getElementById('accesos-content');
      if (qrContainer) qrContainer.innerHTML = '';
    } catch (_) {}
  }

  // Ocultar todas las secciones
  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.remove('active');
  });

  const target = document.getElementById(sectionId);
  if (target) {
    target.classList.add('active');
    AppState.set('currentSection', sectionId);

    // ✨ Transición fluida Premium
    UIPremium.applySectionTransition(sectionId);

    // Carga bajo demanda por módulo (Lazy Loading via import())
    switch (sectionId) {
      case 'dashboard':
        renderDashboardV2();
        break;

      // ── GESTIÓN ACADÉMICA (hub) ──────────────────────────────────────
      case 'gestion-academica':
        _renderGestionAcademica();
        break;
      case 'maestros':
        import('./teachers.module.js').then(m => m.TeachersModule.init());
        break;
      case 'estudiantes':
        import('./students.module.js').then(m => m.StudentsModule.init());
        break;
      case 'aulas':
        import('./rooms.module.js').then(m => m.RoomsModule.init());
        break;
      case 'asistencia':
        import('./attendance.module.js').then(m => m.AttendanceModule.init());
        break;
      case 'calificaciones':
        import('./grades.module.js').then(m => m.GradesModule.init());
        break;
      case 'videoconferencia': {
        const profile = AppState.get('profile');
        import('../shared/videocall-ui.js').then(({ VideoCallUI }) => {
          VideoCallUI.renderSection('videocall-directora-section', {
            role: 'directora', userName: profile?.name || 'Directora', classroomId: null
          });
        }).catch(() => {});
        break;
      }

      // ── CICLO ESCOLAR (hub) ──────────────────────────────────────────
      case 'ciclo-escolar':
        _renderCicloEscolar();
        break;
      case 'ciclo-escolar-config':
        SchoolYearModule.init();
        break;
      case 'ciclo-academico':
        import('./academic-cycle.module.js').then(m => m.AcademicCycleModule.init());
        break;
      case 'inscripciones':
        InscripcionesModule.load();
        break;
      case 'catalogo':
        CatalogoModule.init();
        break;
      case 'staff-permits':
        import('./permits.module.js').then(m => m.PermitsModule.init());
        break;

      // ── FINANZAS (hub) ───────────────────────────────────────────────
      case 'finanzas':
        _renderFinanzas();
        break;
      case 'caja':
        initCajaCobro('caja');
        break;
      case 'pagos':
        NewPaymentsModule.init();
        break;
      case 'contabilidad':
        import('./accounting.module.js').then(m => m.AccountingModule.init()).catch(() => {});
        break;
      case 'cuentas-cobrar':
        import('./cuentas-cobrar.module.js').then(m => m.CuentasCobrarModule.init()).catch(() => {});
        break;

      // ── COMUNICACIÓN ─────────────────────────────────────────────────
      case 'comunicacion':
        import('./chat.module.js').then(m => m.ChatModule.init());
        break;
      case 'muro':
        import('./wall.module.js').then(m => {
          m.WallModule.init('muroPostsContainer', { accentColor: 'blue', likeColor: 'blue' }, AppState);
        });
        break;
      case 'reportes':
        import('./reports.module.js').then(m => m.ReportsModule.init());
        break;

      // ── SISTEMA ──────────────────────────────────────────────────────
      case 'accesos':
        import('./access.module.js').then(m => m.AccessModule.init());
        break;
      case 'configuracion':
        loadProfile();
        import('../shared/notify-permission.js').then(m => m.NotifyPermission.requestIfNeeded());
        break;
    }

    // Marcar badge como leído al entrar
    BadgeSystem.mark(sectionId);
  }

  // Mapear sub-secciones a su botón padre en el sidebar
  const _parentSection = {
    maestros:'gestion-academica', estudiantes:'gestion-academica',
    aulas:'gestion-academica',    asistencia:'gestion-academica',
    calificaciones:'gestion-academica', videoconferencia:'gestion-academica',
    'ciclo-academico':'ciclo-escolar', 'staff-permits':'ciclo-escolar',
    'inscripciones':'ciclo-escolar',
    accesos:'ciclo-escolar',
    caja:'finanzas', pagos:'finanzas', contabilidad:'finanzas',
    'cuentas-cobrar':'finanzas', catalogo:'finanzas',
    muro:'comunicacion', reportes:'comunicacion',
  };
  const activeSidebarId = _parentSection[sectionId] || sectionId;

  // Actualizar Botones Nav (Sidebar)
  document.querySelectorAll('[data-section]').forEach(btn => {
    const match = btn.dataset.section === activeSidebarId || btn.dataset.section === sectionId;
    btn.classList.toggle('bg-white/20', match);
    btn.classList.toggle('active', match);
  });

  // Actualizar Bottom Nav si existe
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === sectionId);
  });

  // Cerrar sidebar en móvil si está abierto
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && window.innerWidth < 768) {
    sidebar.classList.remove('mobile-visible');
    if (overlay) { overlay.style.display = 'none'; }
  }

  // FIX setTimeout→requestAnimationFrame: icons are in the DOM at this point,
  // rAF guarantees paint before re-processing — no arbitrary 50ms guess needed.
  if (window.lucide) requestAnimationFrame(() => lucide.createIcons());
}


async function loadProfile() {
  try {
    const profile = AppState.get('profile');
    if (!profile) return;
    
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('confDirName', profile.name);
    setVal('confDirBio', profile.bio);
    setVal('confPhone', profile.phone);
    setVal('confEmail', profile.email);

    // Cargar todos los school_settings
    try {
      // Cargar todas las configuraciones del colegio
      const { data: settings } = await supabase
        .from('school_settings')
        .select('*')
        .eq('id', SCHOOL_SETTINGS_ID)
        .maybeSingle();

      if (settings) {
        // Datos básicos
        setVal('confSchoolName', settings.school_name);
        setVal('confRNC', settings.rnc);
        setVal('confPhone', settings.phone);
        setVal('confEmail', settings.email);
        setVal('confWebsite', settings.website);
        setVal('confAddress', settings.address);
        setVal('confCity', settings.city);
        setVal('confState', settings.state);
        setVal('confZipCode', settings.zip_code);
        setVal('confCountry', settings.country);
        
        // Configuración de facturación
        setVal('confCurrency', settings.currency);
        setVal('confTaxRate', settings.tax_rate);
        setVal('confInvoicePrefix', settings.invoice_prefix);
        setVal('confInvoiceCounter', settings.invoice_counter);
        setVal('confFooterNote', settings.footer_note);
        setVal('confTermsConditions', settings.terms_conditions);
        
        // Logo
        setVal('confLogoUrl', settings.logo_url);
        if (settings.logo_url) {
          const logoEl = document.getElementById('confSchoolLogo');
          const placeholderEl = document.getElementById('confSchoolLogoPlaceholder');
          if (logoEl) {
            logoEl.src = settings.logo_url;
            logoEl.classList.remove('hidden');
          }
          if (placeholderEl) {
            placeholderEl.classList.add('hidden');
          }
        }
        
        // Horario
        if (settings.open_time)  { const el = document.getElementById('confOpenTime');  if (el) el.value = settings.open_time; }
        if (settings.close_time) { const el = document.getElementById('confCloseTime'); if (el) el.value = settings.close_time; }
        
        if (settings.work_days) {
          try {
            const days = typeof settings.work_days === 'string' ? JSON.parse(settings.work_days) : settings.work_days;
            document.querySelectorAll('.work-day-btn').forEach(btn => {
              if (days.includes(btn.dataset.day)) {
                btn.dataset.active = 'true';
                btn.style.background = '#0B63C7';
                btn.style.color = 'white';
                btn.style.borderColor = '#0B63C7';
              }
            });
          } catch (_) {}
        }
        _updateSchedulePreview();
      }
    } catch (_) {}

    // Inicializar toggle de d�as y preview
    window.toggleWorkDay = (btn) => {
      const active = btn.dataset.active === 'true';
      if (active) {
        btn.dataset.active = 'false';
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
      } else {
        btn.dataset.active = 'true';
        btn.style.background = '#0B63C7';
        btn.style.color = 'white';
        btn.style.borderColor = '#0B63C7';
      }
      _updateSchedulePreview();
    };

    document.getElementById('confOpenTime')?.addEventListener('change', _updateSchedulePreview);
    document.getElementById('confCloseTime')?.addEventListener('change', _updateSchedulePreview);
    
    const nameEl = document.getElementById('sidebarName'); 
    if(nameEl) nameEl.textContent = profile.name || 'Directora';
    
    // Actualizar avatares (usando los nuevos IDs �nicos)
    const sidebarAvatarImg = document.getElementById('sidebarProfileAvatar');
    if (sidebarAvatarImg) {
      sidebarAvatarImg.src = profile.avatar_url || 'img/monte.jpg';
    }
    
    const configAvatarImg = document.getElementById('configProfileAvatar');
    if (configAvatarImg) {
      configAvatarImg.src = profile.avatar_url || 'img/monte.jpg';
    }

    // Inicializar ID de acceso QR de la directora
    _initDirectorAccessId(profile);
    
  } catch (err) {
  }
}

/**
 * ?? Inicializaci�n Principal
 */

// Global error handler � captura errores no manejados
window.addEventListener('unhandledrejection', (e) => {
  // Ignorar errores de IndexedDB (OneSignal) y errores de red silenciosos
  const msg = e.reason?.message?.toLowerCase() ?? '';
  if (msg.includes('indexeddb') || msg.includes('network') || msg.includes('fetch')) return;
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Verificar Rol
    const auth = await ensureRole('directora');
    if (!auth) return;

    // 2. Guardar en Estado
    AppState.set('user', auth.user);
    AppState.set('profile', auth.profile);

    // 3. Inicializar OneSignal
    // ? FIX: Solo inicializar en el dominio correcto para evitar errores de consola
    const host = window.location.hostname;
    const isProd = host === 'montessorisonrisascreativas.com' || host === 'www.montessorisonrisascreativas.com' || host.endsWith('.montessorisonrisascreativas.com') || host === 'localhost';
    
    if (isProd) {
      try { initOneSignal(auth.user); } catch(e) {
      }
    } else {
    }

    // 4. Cargar Perfil Inicial
    loadProfile();

    // 5. Iniciar Dashboard por defecto
    goToSection('dashboard');

    // Cargar ciclos escolares en los selectores del sidebar y header
    _loadCycleSelectors();
    
    // 5a. Iniciar Realtime para Dashboard
    DashboardService.subscribeToChanges();
    DashboardService.onUpdate(() => {
      // Actualizar Dashboard cuando haya cambios
      const currentSection = AppState.get('currentSection');
      if (currentSection === 'dashboard') {
        DashboardService.getFullData(true).then(data => {
          if (data) DirectorUI.renderDashboard(data);
        });
      }
    });

    // 5b. Buscadores en tiempo real (Debounced)
    const setupSearch = (id, module) => {
      const el = document.getElementById(id);
      if (!el) return;

      el.addEventListener('input', debounce((e) => {
        const value = e.target.value.toLowerCase();
        if (window.App[module] && window.App[module].filter) {
          window.App[module].filter(value);
        }
      }, 300));
    };

    setupSearch('searchTeacher', 'teachers');
    setupSearch('searchStudent', 'students');
    setupSearch('searchGradeStudent', 'grades');
    setupSearch('searchPaymentStudent', 'payments');
    setupSearch('wallSearch', 'wall');
    setupSearch('chatSearchInput', 'chat');

    // 5c. Badge de mensajes no le�dos (directora)
    loadUnreadMessageBadge(auth.user.id);

    // Badge de posts nuevos en muro
    loadNewPostsBadge();

        BadgeSystem.init(auth.user.id);

    // Cargar badge de pre-inscripciones pendientes
    const loadPreBadge = async () => {
      try {
        const {count} = await supabase.from('student_preregistrations').select('id',{count:'exact',head:true}).eq('status','pending');
        const b=document.getElementById('badge-ciclo');
        if(b) {
          if(count>0){
            b.textContent=count>99?'99+':String(count);
            b.classList.remove('hidden');
          } else {
            b.classList.add('hidden');
          }
        }
      } catch(e){}
    };
    loadPreBadge();
    
    // Suscribirse a cambios en preinscripciones para actualizar badge en tiempo real
    try {
      supabase.channel('preinscripciones-realtime')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'student_preregistrations'
        }, () => loadPreBadge())
        .subscribe();
    } catch(e){}

    // ?? Sistema de badges por secci�n
    BadgeSystem.init(auth.user.id);

    // ?? Realtime: alertar cuando un padre sube un comprobante
    // Se elimin� la importaci�n de payment-service.js (404)
    // El monitoreo de pagos se maneja ahora dentro del PaymentsModule o v�a Supabase directamente si es necesario.

    // 6. Configurar Logout
    document.getElementById('btnLogout')?.addEventListener('click', async () => {
      RealtimeManager.unsubscribeAll();
      QueryCache.clear();
      await supabase.auth.signOut();
      window.location.href = 'login.html';
    });


    // 7. Sidebar — delegado al módulo unificado sidebar-manager.js
    import('../shared/sidebar-manager.js')
      .then(({ initSidebar }) => {
        initSidebar();
        // Inicializar toggles de dropdowns del sidebar
        initSidebarDropdowns();
      })
      .catch((err) => {
        console.warn('[Sidebar] sidebar-manager.js no cargó, usando fallback:', err?.message);
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
        // Inicializar toggles de dropdowns también en fallback
        initSidebarDropdowns();
      });

    // 7b. Configurar guardado de perfil
    document.getElementById('btnSaveMainConfig')?.addEventListener('click', async () => {
      // Solo actualizar columnas que existen en profiles (name, bio, phone)
      const updates = {};
      const nameVal  = document.getElementById('confDirName')?.value?.trim();
      const bioVal   = document.getElementById('confDirBio')?.value?.trim();
      const phoneVal = document.getElementById('confPhone')?.value?.trim();
      if (nameVal)  updates.name  = nameVal;
      if (bioVal)   updates.bio   = bioVal;
      if (phoneVal) updates.phone = phoneVal;

      // Guardar ID de acceso QR de la directora
      const accessId = document.getElementById('confDirAccessId')?.value?.trim();
      if (accessId) updates.access_code = accessId;

      const { error } = await supabase.from('profiles').update(updates).eq('id', auth.user.id);
      if (error) {
        Helpers.toast('Error al guardar perfil: ' + error.message, 'error');
      } else {
        // Guardar todas las configuraciones del colegio en school_settings
        const schoolUpdates = {};
        
        // Datos básicos
        const schoolNameVal = document.getElementById('confSchoolName')?.value?.trim();
        const rncVal = document.getElementById('confRNC')?.value?.trim();
        const schoolPhoneVal = document.getElementById('confPhone')?.value?.trim();
        const emailVal = document.getElementById('confEmail')?.value?.trim();
        const websiteVal = document.getElementById('confWebsite')?.value?.trim();
        const addressVal = document.getElementById('confAddress')?.value?.trim();
        const cityVal = document.getElementById('confCity')?.value?.trim();
        const stateVal = document.getElementById('confState')?.value?.trim();
        const zipCodeVal = document.getElementById('confZipCode')?.value?.trim();
        const countryVal = document.getElementById('confCountry')?.value?.trim();
        
        if (schoolNameVal) schoolUpdates.school_name = schoolNameVal;
        if (rncVal) schoolUpdates.rnc = rncVal;
        if (schoolPhoneVal) schoolUpdates.phone = schoolPhoneVal;
        if (emailVal) schoolUpdates.email = emailVal;
        if (websiteVal) schoolUpdates.website = websiteVal;
        if (addressVal) schoolUpdates.address = addressVal;
        if (cityVal) schoolUpdates.city = cityVal;
        if (stateVal) schoolUpdates.state = stateVal;
        if (zipCodeVal) schoolUpdates.zip_code = zipCodeVal;
        if (countryVal) schoolUpdates.country = countryVal;
        
        // Configuración de facturación
        const currencyVal = document.getElementById('confCurrency')?.value;
        const taxRateVal = parseFloat(document.getElementById('confTaxRate')?.value);
        const termsConditionsVal = document.getElementById('confTermsConditions')?.value?.trim();

        if (currencyVal) schoolUpdates.currency = currencyVal;
        if (!isNaN(taxRateVal)) schoolUpdates.tax_rate = taxRateVal;
        if (termsConditionsVal) schoolUpdates.terms_conditions = termsConditionsVal;
        
        // Logo
        const logoUrlVal = document.getElementById('confLogoUrl')?.value?.trim();
        if (logoUrlVal) schoolUpdates.logo_url = logoUrlVal;
        
        // Horario
        const openTime  = document.getElementById('confOpenTime')?.value;
        const closeTime = document.getElementById('confCloseTime')?.value;
        const workDays  = [...document.querySelectorAll('.work-day-btn[data-active="true"]')].map(b => b.dataset.day);
        
        if (openTime)  schoolUpdates.open_time  = openTime;
        if (closeTime) schoolUpdates.close_time = closeTime;
        if (workDays.length) schoolUpdates.work_days = JSON.stringify(workDays);
        
        if (Object.keys(schoolUpdates).length) {
          await supabase.from('school_settings').update(schoolUpdates).eq('id', SCHOOL_SETTINGS_ID);
        }
        
        Helpers.toast('Configuración guardada correctamente', 'success');
        AppState.set('profile', { ...auth.profile, ...updates });
        loadProfile();
      }
    });
    
    // 7c. Configurar actualización del logo en tiempo real
    document.getElementById('confLogoUrl')?.addEventListener('input', (e) => {
      const logoUrl = e.target.value?.trim();
      const logoEl = document.getElementById('confSchoolLogo');
      const placeholderEl = document.getElementById('confSchoolLogoPlaceholder');
      
      if (logoUrl && logoEl) {
        logoEl.src = logoUrl;
        logoEl.classList.remove('hidden');
        if (placeholderEl) placeholderEl.classList.add('hidden');
      } else if (logoEl && placeholderEl) {
        logoEl.classList.add('hidden');
        placeholderEl.classList.remove('hidden');
      }
    });

    // Make sidebar avatar clickable
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const configAvatarInput = document.getElementById('configAvatarInput');
    if (sidebarAvatar && configAvatarInput) {
      sidebarAvatar.style.cursor = 'pointer';
      sidebarAvatar.addEventListener('click', () => {
        configAvatarInput.click();
      });
    }

    // 7b. Avatar upload — preview inmediato + guardar en Supabase
    configAvatarInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        Helpers.toast('Imagen muy grande (máx 5MB)', 'error');
        return;
      }
      if (!file.type.startsWith('image/')) {
        Helpers.toast('Solo se permiten imágenes', 'error');
        return;
      }

      const img       = document.getElementById('configProfileAvatar');
      const sidebarImg = document.getElementById('sidebarProfileAvatar');

      // Preview INMEDIATO con ObjectURL
      const objectUrl = URL.createObjectURL(file);
      if (img)       { img.src = objectUrl; img.style.opacity = '0.6'; }
      if (sidebarImg) sidebarImg.src = objectUrl;
      Helpers.toast('Subiendo foto...', 'info');

      try {
        const ext  = file.name.split('.').pop().toLowerCase().replace('jpeg','jpg');
        const path = `directors/${auth.user.id}_${Date.now()}.${ext}`;

        // Intentar con los buckets disponibles en orden de preferencia
        let publicUrl = null;
        for (const bucket of ['avatars', 'karpus-uploads', 'classroom_media']) {
          const { error: upErr } = await supabase.storage
            .from(bucket)
            .upload(path, file, { upsert: true, contentType: file.type });
          if (!upErr) {
            const { data } = supabase.storage.from(bucket).getPublicUrl(path);
            publicUrl = data.publicUrl;
            break;
          }
        }

        if (!publicUrl) throw new Error('No se pudo subir la imagen. Verifica los permisos de storage en Supabase.');

        const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', auth.user.id);
        if (dbErr) throw dbErr;

        // Actualizar estado
        const currentProfile = AppState.get('profile') || {};
        AppState.set('profile', { ...currentProfile, avatar_url: publicUrl });

        // UI: mostrar URL real con cache-buster
        const bustedUrl = publicUrl + '?t=' + Date.now();
        if (img)       { img.src = bustedUrl; img.style.opacity = '1'; }
        if (sidebarImg) sidebarImg.src = bustedUrl;
        URL.revokeObjectURL(objectUrl);

        // Limpiar input para permitir re-seleccionar el mismo archivo
        configAvatarInput.value = '';
        Helpers.toast('Foto de perfil actualizada ✅', 'success');
      } catch (err) {
        if (img) img.style.opacity = '1';
        URL.revokeObjectURL(objectUrl);
        Helpers.toast('Error al subir la foto: ' + (err.message || err), 'error');
      }
    });

    // 8. Quitar loader inicial
    const loader = document.getElementById('initial-loading');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }

    // 9. Inicializar iconos Lucide
    if (window.lucide) lucide.createIcons();

  } catch (err) {
    // Quitar loader siempre
    const loader = document.getElementById('initial-loading');
    if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 300); }

    // Solo redirigir al login si es error de autenticación, no por cualquier error
    const msg = (err?.message || '').toLowerCase();
    const isAuthError = msg.includes('session') || msg.includes('auth') || msg.includes('jwt') || msg.includes('token');
    if (isAuthError) {
      window.location.href = 'login.html';
    }
    // Para otros errores: mostrar el panel vacío en vez de redirigir
  }
});

/**
 * Hub: Gestión Académica — sub-navegación interna
 */
function _renderGestionAcademica() {
  const secs = [
    { id:'maestros',        icon:'user-cog',       label:'Maestros',          desc:'Docentes y personal académico',     color:'#0B63C7' },
    { id:'estudiantes',     icon:'users',           label:'Estudiantes',       desc:'Expedientes y gestión de alumnos',  color:'#0B63C7' },
    { id:'aulas',           icon:'school',          label:'Aulas',             desc:'Salones, capacidad y horarios',     color:'#0D9488' },
    { id:'asistencia',      icon:'calendar-check-2',label:'Asistencia',        desc:'Control diario de asistencia',      color:'#EC4899' },
    { id:'calificaciones',  icon:'star',            label:'Calificaciones',    desc:'Boletines, promedios y evaluaciones',color:'#F59E0B'},
    { id:'videoconferencia',icon:'video',           label:'Videoconferencia',  desc:'Clases virtuales y reuniones',      color:'#8B5CF6' },
  ];
  _renderHub('gestion-academica', '🎓 Gestión Académica', 'Administración del equipo docente, alumnos y procesos educativos', secs);
}

/**
 * Hub: Ciclo Escolar — sub-navegación interna
 */
function _renderCicloEscolar() {
  const secs = [
    { id:'ciclo-escolar-config', icon:'calendar-range', label:'Ciclo Escolar', desc:'Años escolares, calendarios y reinscripción', color:'#0B63C7' },
    { id:'inscripciones',       icon:'clipboard-pen',   label:'Inscripciones', desc:'Pre-inscripciones y admisión', color:'#0D9488' },
    { id:'staff-permits',       icon:'calendar-off',    label:'Permisos Staff', desc:'Ausencias y permisos del personal', color:'#EC4899' },
    { id:'accesos',             icon:'qr-code',          label:'Accesos QR', desc:'Control de entradas y salidas', color:'#64748B' },
  ];
  _renderHub('ciclo-escolar', '📅 Ciclo Escolar', 'Gestión del año escolar, inscripciones, reinscripciones y calendarios', secs);
}

/**
 * Hub: Finanzas — sub-navegación interna
 */
function _renderFinanzas() {
  const secs = [
    { id:'caja',           icon:'landmark',        label:'Caja',              desc:'Cobros del día y emisión de facturas', color:'#0B63C7' },
    { id:'pagos',          icon:'banknote',         label:'Pagos',             desc:'Control de mensualidades y estados',   color:'#F59E0B' },
    { id:'contabilidad',   icon:'bar-chart-big',    label:'Contabilidad',      desc:'Reportes financieros y flujo de caja', color:'#0B63C7' },
    { id:'cuentas-cobrar', icon:'receipt',          label:'Cuentas por Cobrar',desc:'Deudores, mora y recordatorios',       color:'#EF4444' },
  ];
  _renderHub('finanzas', '💰 Finanzas', 'Motor financiero escolar: caja, pagos, contabilidad y cuentas por cobrar', secs);
}

/**
 * Renderiza un hub de sección con tarjetas de acceso rápido
 */
function _renderHub(containerId, title, subtitle, sections) {
  const section = document.getElementById(containerId);
  if (!section) return;
  // El hub renderiza directo en la sección o en su primer div
  const el = section.querySelector('div') || section;
  el.innerHTML = `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-black text-slate-800">${title}</h2>
        <p class="text-slate-400 font-medium mt-1">${subtitle}</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        ${sections.map(s => `
          <button onclick="App.navigation.goTo('${s.id}')"
            class="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-lg hover:border-slate-200 transition-all active:scale-[.98] group">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style="background:${s.color}18">
              <i data-lucide="${s.icon}" class="w-6 h-6" style="color:${s.color}"></i>
            </div>
            <h3 class="font-black text-slate-800 text-base mb-1">${s.label}</h3>
            <p class="text-sm text-slate-500 font-medium leading-snug">${s.desc}</p>
            <div class="flex items-center gap-1 mt-4 text-xs font-black uppercase tracking-wider" style="color:${s.color}">
              Abrir <i data-lucide="arrow-right" class="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform"></i>
            </div>
          </button>`).join('')}
      </div>
    </div>`;
  if (window.lucide) lucide.createIcons();
}

/**
 * Cargar ciclos escolares en todos los selectores del panel
 */
async function _loadCycleSelectors() {
  try {
    const { data: years } = await supabase
      .from('school_years')
      .select('id,name,is_current,status')
      .order('start_date',{ascending:false})
      .limit(10);

    // Header selector
    const hdr = document.getElementById('headerCycleSelector');
    // Sidebar selector
    const sb = document.getElementById('sidebarCycleSelector');

    if (!years?.length) {
      if (hdr) hdr.innerHTML = '<option value="">No hay ciclos</option>';
      if (sb) sb.innerHTML = '<option value="">No hay ciclos</option>';
      return;
    }

    const opts = years.map(y =>
      `<option value="${y.id}"${y.is_current?' selected':''}>${y.name}${y.is_current?' ✓':''}</option>`
    ).join('');

    if (hdr) hdr.innerHTML = opts;
    if (sb) sb.innerHTML = opts;

    // Guardar el ciclo activo en AppState
    const current = years.find(y => y.is_current) || years[0];
    if (current && window.AppState) AppState.set('activeCycleId', current.id);

  } catch (_) {}
}

// Expose _loadCycleSelectors to window for other modules
window._loadCycleSelectors = _loadCycleSelectors;

/**
 * ?? Notificaciones de Mensajes No Le�dos
 */
async function loadUnreadMessageBadge(userId) {
  if (!userId) return;
  try {
    let total = 0;

    // Intentar RPC primero
    const { data, error } = await supabase.rpc('get_unread_counts');
    if (!error && data) {
      total = Object.values(data).reduce((a, b) => a + Number(b), 0);
    }
    // Si el RPC falla, simplemente mostrar 0 � no hacer fallback a tablas que pueden no existir

    updateBadgeUI(total);
  } catch (_) {
    updateBadgeUI(0);
  }
}

function updateBadgeUI(total) {
  const badge = document.getElementById('unreadMessagesBadge');
  if (badge) {
    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : total;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Solo actualizar tarjeta del dashboard (no sidebar)
  const cardBadge = document.getElementById('badge-card-comunicacion');
  if (cardBadge) {
    if (total > 0) {
      cardBadge.textContent = total > 99 ? '99+' : String(total);
      cardBadge.classList.remove('hidden');
      cardBadge.classList.add('flex');
    } else {
      cardBadge.classList.add('hidden');
      cardBadge.classList.remove('flex');
    }
  }
}

async function loadNewPostsBadge() {
  try {
    // Guardar timestamp de �ltima visita al muro en localStorage
    const lastVisit = localStorage.getItem('karpus_muro_last_visit') || new Date(0).toISOString();
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', lastVisit);

    const total = count || 0;
    // Solo actualizar tarjeta del dashboard (no sidebar)
    const cardBadge = document.getElementById('badge-card-muro');
    if (cardBadge) {
      if (total > 0) {
        cardBadge.textContent = total > 99 ? '99+' : String(total);
        cardBadge.classList.remove('hidden');
        cardBadge.classList.add('flex');
      } else {
        cardBadge.classList.add('hidden');
        cardBadge.classList.remove('flex');
      }
    }

    // Limpiar badge al entrar a muro
    document.querySelector('[data-section="muro"]')?.addEventListener('click', () => {
      localStorage.setItem('karpus_muro_last_visit', new Date().toISOString());
      if (cardBadge) { cardBadge.classList.add('hidden'); cardBadge.classList.remove('flex'); }
    }, { once: false });

  } catch (_) {}
}

// -- Secci�n de Accesos (QR + Asistencia en vivo) -----------------------------
function _initAccesosSection() {
  const container = document.getElementById('accesos-content');
  if (!container) return;

  // Cargar librer�a QR si no est�
  const loadQR = () => new Promise(resolve => {
    if (window.QRCode) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'js/shared/qrcode.min.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });

  // Cargar estudiantes y generar QRs
  const loadStudentsQR = async () => {
    container.innerHTML = '<div class="flex justify-center py-12"><div class="animate-spin w-8 h-8 border-2 border-orange-500 rounded-full border-t-transparent"></div></div>';
    await loadQR();

    const { data: students } = await supabase
      .from('students')
      .select('id, name, matricula, classrooms:classroom_id(name)')
      .eq('is_active', true)
      .not('matricula', 'is', null)
      .order('name');

    if (!students?.length) {
      container.innerHTML = '<div class="text-center py-12 text-slate-400"><p class="font-bold">No hay estudiantes con matr�cula asignada.</p><p class="text-xs mt-1">Asigna matr�culas desde la secci�n Estudiantes.</p></div>';
      return;
    }

    container.innerHTML = students.map(s => `
      <div class="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col items-center gap-3 hover:shadow-md transition-all">
        <div id="qr-${s.id}" class="bg-slate-50 w-[140px] h-[140px] rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer group hover:bg-orange-50 hover:border-orange-200 transition-all"
             onclick="window._generateLazyStudentQR('${s.id}', '${s.matricula}')">
          <div class="text-center">
            <i data-lucide="qr-code" class="w-6 h-6 text-slate-300 group-hover:text-orange-400 mx-auto mb-1"></i>
            <span class="text-[9px] font-bold text-slate-400 group-hover:text-orange-500 uppercase">Generar QR</span>
          </div>
        </div>
        <div class="text-center">
          <p class="font-black text-slate-800 text-sm">${s.name}</p>
          <p class="text-[10px] font-bold text-orange-600 uppercase tracking-widest">${s.matricula}</p>
          <p class="text-[10px] text-slate-400">${s.classrooms?.name || 'Sin aula'}</p>
        </div>
        <button onclick="window._printStudentQR('${s.id}','${s.name}','${s.matricula}')"
          class="w-full py-2 bg-slate-800 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-900 transition-all flex items-center justify-center gap-1.5">
          <i data-lucide="printer" class="w-3 h-3"></i> Imprimir
        </button>
      </div>`).join('');

    if (window.lucide) lucide.createIcons();
  };

  // Función global para generar QR solo cuando sea necesario (Lazy)
  window._generateLazyStudentQR = (id, matricula) => {
    const el = document.getElementById(`qr-${id}`);
    if (!el || el.querySelector('img')) return;

    el.innerHTML = '<div class="animate-spin w-5 h-5 border-2 border-orange-500 rounded-full border-t-transparent"></div>';
    
    setTimeout(() => {
      const qrData = JSON.stringify({ id, matricula, role: 'student' });
      el.innerHTML = '';
      new QRCode(el, {
        text: qrData,
        width: 120,
        height: 120,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
      el.classList.remove('bg-slate-50', 'border-dashed', 'cursor-pointer');
      el.classList.add('p-2', 'bg-white', 'border-slate-100');
      el.onclick = null;
    }, 200);
  };

  // Funci�n global para imprimir QR individual
  window._printStudentQR = (id, name, matricula) => {
    const el = document.getElementById(`qr-${id}`);
    const img = el?.querySelector('img')?.src || el?.querySelector('canvas')?.toDataURL();
    if (!img) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>QR ${matricula}</title>
      <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
      .card{border:2px solid #e2e8f0;border-radius:16px;padding:20px;text-align:center;max-width:240px;}
      .logo{font-size:11px;font-weight:900;color:#f97316;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;}
      img{width:160px;height:160px;}.name{font-size:14px;font-weight:900;color:#1e293b;margin-top:10px;}
      .mat{font-size:10px;color:#64748b;font-weight:700;margin-top:3px;}.hint{font-size:8px;color:#94a3b8;margin-top:6px;}</style>
    </head><body><div class="card">
      <div class="logo">🎓 Colegio Montessori Sonrisas Creativas</div>
      <img src="${img}">
      <div class="name">${name}</div>
      <div class="mat">${matricula}</div>
      <div class="hint">Escanea para registrar entrada/salida</div>
    </div><script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  };

  loadStudentsQR();
}

// -- Preview din�mico del horario ----------------------------------------------
function _updateSchedulePreview() {
  const preview = document.getElementById('schedulePreview');
  if (!preview) return;

  const days = [...document.querySelectorAll('.work-day-btn[data-active="true"]')].map(b => b.dataset.day);
  const open  = document.getElementById('confOpenTime')?.value  || '';
  const close = document.getElementById('confCloseTime')?.value || '';

  if (!days.length && !open) { preview.classList.add('hidden'); return; }

  const daysText = days.length ? days.join(' � ') : 'Sin d�as seleccionados';
  const timeText = open && close ? `${open} � ${close}` : '';

  preview.classList.remove('hidden');
  preview.innerHTML = `<span class="text-[#0B63C7]">?? ${daysText}</span>${timeText ? `<span class="mx-2 text-blue-300">|</span><span class="text-[#0850A0]">?? ${timeText}</span>` : ''}`;
}

// -- ID de Acceso QR de la Directora ------------------------------------------
async function _initDirectorAccessId(profile) {
  const input = document.getElementById('confDirAccessId');
  if (!input) return;

  // Always fetch fresh from DB to get access_code (not in AppState profile)
  const { data: freshProfile } = await supabase
    .from('profiles')
    .select('id, name, access_code')
    .eq('id', profile.id)
    .maybeSingle();

  const p = freshProfile || profile;
  const code = p.access_code || (p.notes?.startsWith?.('DIR-') ? p.notes : null);
  if (code) input.value = code;

  const _loadQR = () => new Promise(r => {
    if (window.QRCode) { r(); return; }
    const s = document.createElement('script');
    s.src = 'js/shared/qrcode.min.js';
    s.onload = r; document.head.appendChild(s);
  });

  const _renderQR = async (code) => {
    const container = document.getElementById('dir-qr-container');
    if (!container || !code) return;
    await _loadQR();
    container.innerHTML = '';
    new window.QRCode(container, {
      text: JSON.stringify({ matricula: code, name: p?.name || 'Directora', type: 'karpus-staff', v: 1 }),
      width: 100, height: 100, colorDark: '#1e293b', colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.H
    });
  };

  window._genDirectorId = async () => {
    const newCode = 'DIR-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
    input.value = newCode;
    // Save immediately to access_code using fresh profile id
    const { error } = await supabase.from('profiles').update({ access_code: newCode }).eq('id', p.id);
    if (!error) {
      Helpers.toast('ID de directora guardado', 'success');
    }
    await _renderQR(newCode);
  };

  window._printDirectorQR = () => {
    const code = input.value.trim();
    const container = document.getElementById('dir-qr-container');
    const img = container?.querySelector('img')?.src || container?.querySelector('canvas')?.toDataURL();
    if (!img || !code) { Helpers.toast('Genera el QR primero', 'warning'); return; }
    const name = p?.name || 'Directora';
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Carnet ${name}</title><style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}.card{border:4px solid #7c3aed;border-radius:20px;padding:24px;text-align:center;max-width:260px;}.hdr{background:#7c3aed;color:white;margin:-24px -24px 16px;padding:12px;border-radius:16px 16px 0 0;font-weight:900;font-size:12px;text-transform:uppercase;}img{width:160px;height:160px;border-radius:8px;}.name{font-size:16px;font-weight:900;color:#1e293b;margin-top:12px;}.code{font-size:10px;color:#64748b;font-weight:700;margin-top:4px;}</style></head><body><div class="card"><div class="hdr">DIRECTORA • COLEGIO MONTESSORI SONRISAS CREATIVAS</div><img src="${img}"><div class="name">${name}</div><div class="code">ID: ${code}</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  };

  // Auto-render si ya tiene ID
  if (code) setTimeout(() => _renderQR(code), 400);

  input.addEventListener('input', (e) => {
    clearTimeout(window._dirQrDebounce);
    window._dirQrDebounce = setTimeout(() => _renderQR(e.target.value.trim()), 600);
  });
}

/**
 * Inicializar toggles de dropdowns del sidebar
 */
function initSidebarDropdowns() {
  document.querySelectorAll('.kk-nav-group-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Prevenir que el click navegue a una sección si es un toggle
      e.stopPropagation();
      
      const group = btn.closest('.kk-nav-group');
      const submenu = group?.querySelector('.kk-nav-sub');
      
      if (group && submenu) {
        // Toggle la clase 'open' en el botón y el grupo
        btn.classList.toggle('open');
        group.classList.toggle('open');
        
        // Mostrar/ocultar el submenú
        if (submenu.style.display === 'none' || submenu.style.display === '') {
          submenu.style.display = 'block';
        } else {
          submenu.style.display = 'none';
        }
      }
    });
  });
}




