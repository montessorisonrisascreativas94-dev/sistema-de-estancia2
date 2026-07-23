import { supabase, ensureRole, initOneSignal } from '../shared/supabase.js';
import { Api } from './api.js';
import { Helpers } from '../shared/helpers.js';
import { SmartLoader } from '../shared/smart-loader.js';
import { AppState } from './appState.js';
import { VideoCallModule } from '../shared/videocall.js';
import { PaymentsModule }  from './payments.js';
import { TasksModule }     from './tasks.js';
import { AttendanceModule } from './attendance.js';
import { ChatModule }      from './chat.js';
import { FeedModule }      from './feed.js';
import { ProfileModule }   from './profile.js';
import { GradesModule }    from './grades.js';
import { ReportsModule }   from './reports.js';
import { DailyReportModule } from './daily-report.js';
import { initLiveClassListener } from './attendance_live.js';
import { NotifyPermission } from '../shared/notify-permission.js';
import { BadgeSystem } from '../shared/badges.js';
import { OnboardingGuide } from '../shared/onboarding.js';
import { Prefetch } from '../shared/prefetch.js';
import { VideoCallUI } from '../shared/videocall-ui.js';
import { ParentRatingModule } from './parent_rating.js';
import { WizardPayment } from './payment-wizard.js';
import { RecentActivityModule } from './recent-activity.js';

window.App = {
  feed: FeedModule, payments: PaymentsModule, tasks: TasksModule,
  attendance: AttendanceModule, chat: ChatModule, profile: ProfileModule,
  grades: GradesModule, navigateTo: navigateTo,
  openDigitalID: openDigitalID,
  switchStudent: switchStudent,
  updateHeaderProfile: updateHeaderProfile,
  openRatingModal: () => {
    const modal = document.getElementById('rating-modal');
    if (modal) modal.classList.remove('hidden');
  },
  sharePadreQR: () => {
    const student = AppState.get('currentStudent');
    const container = document.getElementById('padre-qr-container');
    const canvas = container?.querySelector('canvas');
    if (!canvas) return;
    canvas.toBlob(blob => {
      const file = new File([blob], `qr-${student?.matricula || 'acceso'}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        navigator.share({ title: 'Código QR de acceso', files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name;
        a.click(); URL.revokeObjectURL(url);
      }
    });
  },
  printPadreQR: () => {
    const student = AppState.get('currentStudent');
    const container = document.getElementById('padre-qr-container');
    const canvas = container?.querySelector('canvas');
    if (!canvas || !student) return;
    const imgData = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>QR ${student.name}</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;padding:2rem;}
      img{width:200px;height:200px;border:2px solid #e2e8f0;border-radius:12px;padding:8px;}
      h2{margin:1rem 0 .25rem;font-size:1.2rem;color:#1e293b;}p{color:#64748b;font-size:.9rem;}</style></head>
      <body><img src="${imgData}"><h2>${student.name}</h2><p>Matrícula: ${student.matricula}</p><script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
  }
};
window.BadgeSystem = BadgeSystem;

window.PadreErrors = [];
window._padreReportError = (source, err) => {
  window.PadreErrors.push({ t: Date.now(), source, msg: err?.message || String(err), stack: err?.stack?.slice(0, 200) });
  if (window.PadreErrors.length > 50) window.PadreErrors.shift();
};

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message?.toLowerCase() ?? '';
  if (msg.includes('indexeddb') || msg.includes('network') || msg.includes('fetch')) return;
  window._padreReportError('unhandledrejection', e.reason);
});

window.addEventListener('error', (e) => {
  window._padreReportError('error', { message: `${e.filename}:${e.lineno} ${e.message}`, stack: '' });
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    AppState.set('loading', true);

    const auth = await ensureRole('padre');
    if (!auth) return;
    
    // Initialize Parent Rating Module
    window.user = auth.user;
    ParentRatingModule.init();

    AppState.set('user', auth.user);
    AppState.set('profile', auth.profile);

    // ⚡ PREFETCH: Iniciar carga silenciosa de recursos críticos
    Prefetch.start({
      userId: auth.user.id,
      role: 'padre',
      classroomId: auth.profile?.classroom_id,
      studentId: null // Se actualizará al obtener estudiantes
    });

    // ✅ FIX OneSignal: Solo inicializar en el dominio correcto para evitar errores de consola
    const host = window.location.hostname;
    const isProd = host === 'montessorisonrisascreativas.com' || host === 'www.montessorisonrisascreativas.com' || host.endsWith('.montessorisonrisascreativas.com') || host === 'localhost';
    
    if (isProd) {
      try { await initOneSignal(auth.user); } catch(e) {

      }
    } else {
    }

    const { data: students, error } = await supabase
      .from('students')
      .select('*, classrooms(id, name, level, teacher_id)')
      .eq('parent_id', auth.user.id)
      .order('name');

    if (error) throw error;
    if (!students?.length) {
      const el = document.getElementById('dashboardGrid');
      if (el) el.innerHTML = Helpers.emptyState('No hay estudiantes vinculados a esta cuenta.');
      return;
    }

    const currentStudent = students[0];
    AppState.set('students', students);
    AppState.set('currentStudent', currentStudent);

    // If classrooms join came back null but classroom_id exists, fetch it separately
    for (const s of students) {
      if (!s.classrooms && s.classroom_id) {
        const { data: cls } = await supabase
          .from('classrooms')
          .select('id, name, level, teacher_id')
          .eq('id', s.classroom_id)
          .maybeSingle();
        if (cls) s.classrooms = cls;
      }
    }

    // Re-set state after classroom enrichment so all consumers see the updated data
    AppState.set('students', students);
    AppState.set('currentStudent', students[0]);

    // Actualizar sidebar y header ANTES de cargar datos
    updateHeaderProfile(auth.profile, currentStudent, students);
    setupNavigation();
    setupGlobalListeners();
    
    // Sidebar Manager
    import('../shared/sidebar-manager.js')
      .then(({ initSidebar }) => initSidebar())
      .catch(() => {
        // Fallback mínimo
        const menuBtn = document.getElementById('menuBtn');
        const sidebar  = document.getElementById('sidebar');
        const overlay  = document.getElementById('sidebarOverlay');
        const _openSidebar = () => {
          sidebar?.classList.add('mobile-visible');
          if (overlay) overlay.style.display = 'block';
        };
        const _closeSidebar = () => {
          sidebar?.classList.remove('mobile-visible');
          if (overlay) overlay.style.display = 'none';
        };
        if (menuBtn && sidebar) {
          menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.contains('mobile-visible') ? _closeSidebar() : _openSidebar();
          });
        }
        if (overlay) overlay.addEventListener('click', _closeSidebar);
      });

    // Activar sección home inmediatamente
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    const homeSection = document.getElementById('home');
    if (homeSection) {
      homeSection.classList.remove('hidden');
      homeSection.classList.add('active');
    }

    // Mostrar skeletons inmediatamente
  const timeline = document.getElementById('dailyEmojiTimeline');
  if (timeline) {
    timeline.innerHTML = `
      <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl animate-pulse">
        <div class="w-10 h-10 bg-slate-200 rounded-xl shrink-0"></div>
        <div class="flex-1 h-4 bg-slate-200 rounded-xl"></div>
        <div class="w-16 h-4 bg-slate-200 rounded-xl"></div>
      </div>`;
  }

    // Carga paralela — no bloquea UI
    refreshDashboard().then(() => {
      // Iniciar badges DESPUÉS de que las tarjetas del dashboard existan
      BadgeSystem.init(auth.user.id);
    });

    if (currentStudent?.classroom_id) {
      initLiveClassListener(currentStudent.classroom_id);
    }

    // Logout — ambos botones (móvil y desktop)
    const logoutHandler = async () => {
      await supabase.auth.signOut();
      window.location.href = 'login.html';
    };
    document.getElementById('btnLogout')?.addEventListener('click', logoutHandler);
    document.getElementById('btnLogoutDesktop')?.addEventListener('click', logoutHandler);

    // Badge de mensajes no leídos
    loadUnreadBadge();
    initMessageBadgeRealtime();

    // 🔴 Sistema de badges — se inicia en el .then() de refreshDashboard arriba

    // Precargar librería QR en background para que esté lista cuando el padre la necesite
    setTimeout(() => {
      if (!window.QRCode) {
        const s = document.createElement('script');
        s.src = 'js/shared/qrcode.min.js';
        document.head.appendChild(s);
      }
    }, 2000);

    // 🎓 Guía de bienvenida para nuevos padres
    const parentName = auth.profile?.name?.split(' ')[0] || 'Bienvenido';
    
    OnboardingGuide.init({
      userName:   parentName,
      storageKey: 'padre_v2',
      userId:     auth.user.id,
      navigateTo: navigateTo,
      delay:      2000,
      steps: [
        {
          target:  '[data-target="home"]',
          icon:    '🏠',
          title:   'Inicio',
          text:    'Aquí ves el resumen del día: asistencia, tareas pendientes, pagos y más. Todo de un vistazo.'
        },
        {
          target:  '[data-target="class"]',
          icon:    '📢',
          title:   'Muro del Aula',
          text:    'La maestra publica fotos, videos y comunicados aquí. ¡Mantente al día con lo que pasa en el aula!'
        },
        {
          target:  '[data-target="tasks"]',
          icon:    '📚',
          title:   'Tareas',
          text:    'Revisa las tareas asignadas, fechas de entrega y calificaciones de tu hijo/a.'
        },
        {
          target:  '#dashboardGrid',
          icon:    '💳',
          title:   'Pagos',
          text:    'Envía tu comprobante de transferencia directamente desde aquí. Selecciona el mes y adjunta la foto.'
        },
        {
          target:  '[data-target="profile"]',
          icon:    '👤',
          title:   'Mi Perfil',
          text:    'Activa las notificaciones push para recibir alertas en tiempo real sobre tu hijo/a.'
        }
      ]
    });

    // 🔔 Pedir permiso de notificaciones al cargar (con delay para no interrumpir)
    setTimeout(() => NotifyPermission.requestIfNeeded('notifPermissionSlot'), 3000);

    // Realtime: actualizar rutina diaria cuando la maestra la guarda
    _initDailyLogRealtime(currentStudent.id);

  } catch (e) {

    Helpers.toast('Error al iniciar el panel', 'error');
  } finally {
    AppState.set('loading', false);
    // Hide initial loading screen
    const initialLoading = document.getElementById('initialLoading');
    if (initialLoading) {
      initialLoading.style.display = 'none';
    }
  }
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function refreshDashboard() {
  const student = AppState.get('currentStudent');
  if (!student) return;

  // Use local date (not UTC) to match what the maestra saves
  const now   = new Date();
  const today = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  // Carga paralela — allSettled para que un fallo no bloquee el resto
  const [financeRes, academicRes, logsRes, todayAttRes, postsRes] = await Promise.allSettled([
    Api.getStudentFinancialStatus(student.id),
    Api.getStudentGrades(student.id),
    Api.getDailyLog(student.id, today),
    supabase.from('attendance').select('status').eq('student_id', student.id).eq('date', today).maybeSingle(),
    // Cargar últimos 3 posts para la sección de inicio
    supabase
      .from('posts')
      .select('*, teacher:profiles(id, name, avatar_url)')
      .or(`classroom_id.is.null,classroom_id.eq.${student.classroom_id}`)
      .order('created_at', { ascending: false })
      .limit(3)
  ]);

  const finance  = financeRes.status  === 'fulfilled' ? financeRes.value  : null;
  const academic = academicRes.status === 'fulfilled' ? academicRes.value : null;
  let   logs     = logsRes.status     === 'fulfilled' ? logsRes.value     : null;
  const todayAtt = todayAttRes.status === 'fulfilled' ? todayAttRes.value?.data : null;
  const latestPosts = postsRes.status === 'fulfilled' ? (postsRes.value?.data || []) : [];

  // Registrar errores si fallaron promesas críticas
  [financeRes, academicRes, logsRes, todayAttRes, postsRes].forEach((res, i) => {
    if (res.status === 'rejected') {
      import('../shared/db-utils.js').then(({ safeHandle }) => {
        safeHandle(res.reason, `refreshDashboard.Promise[${i}]`);
      });
    }
  });

  if (finance?.config) AppState.set('financeConfig', finance.config);
  if (finance?.history) AppState.set('financeHistory', finance.history);
  AppState.set('todayAttendance', todayAtt?.status || null);

  renderDailySummary(logs);
  renderLatestPosts(latestPosts);

  // ── Initialize Recent Activity Feed ──
  RecentActivityModule.destroy();
  RecentActivityModule.init();

  // ── Update quick stats row in the Resumen Diario card ──
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  // Attendance
  const attStatus = todayAtt?.status;
  const attMap = { present:'✅ Presente', presente:'✅ Presente', late:'⏰ Tardanza', absent:'❌ Ausente' };
  set('attendanceStatus', attMap[attStatus?.toLowerCase()] || (attStatus ? attStatus : '—'));
  // Tasks
  const evidences = academic?.evidences || [];
  const pendingTasks = evidences.filter(e => !e.submitted && !e.status?.includes('submitted')).length;
  set('tasksStatus', pendingTasks > 0 ? `${pendingTasks} pendiente${pendingTasks !== 1 ? 's' : ''}` : '✅ Al día');
  // Last grade
  const lastEv = evidences.length ? evidences[evidences.length - 1] : null;
  set('lastGradeValue', lastEv ? (lastEv.score ?? lastEv.grade ?? lastEv.value ?? '—') : '—');
  // Messages badge  
  const unreadCount = AppState.get('unreadMessages') || 0;
  set('messagesStatus', unreadCount > 0 ? `${unreadCount} nuevo${unreadCount !== 1 ? 's' : ''}` : 'Sin nuevos');
  
  // Load weekly summary for the dashboard
  DailyReportModule.setStudent(student.id);
  DailyReportModule.loadWeeklySummary();

  // 🚨 Banner de deuda vencida
  _updateDebtBanner(finance);

  // checkActiveMeetings en background — no bloquea las tarjetas
  checkActiveMeetings().catch(() => {});
}

// ── Banner de deuda vencida ───────────────────────────────────────────────────
function _updateDebtBanner(finance) {
  const banner  = document.getElementById('debtBanner');
  const msgEl   = document.getElementById('debtBannerMsg');
  if (!banner) return;

  const debt    = finance?.debt?.total || 0;
  const items   = finance?.debt?.items || [];
  const overdue = items.filter(p => {
    const s = (p.status || '').toLowerCase();
    return s === 'overdue' || s === 'vencido';
  });

  if (overdue.length > 0 || debt > 0) {
    banner.classList.remove('hidden');
    const total = Helpers.formatCurrency(debt);
    if (msgEl) {
      if (overdue.length > 0) {
        msgEl.innerHTML = `<span class="text-rose-200">🚨 Pago Vencido:</span> Tienes ${overdue.length} mensualidad(es) atrasada(s). Total a pagar: <span class="text-white underline">${total}</span>`;
      } else {
        msgEl.innerHTML = `<span class="text-amber-200">⏳ Saldo Pendiente:</span> Tu balance actual es <span class="text-white font-black">${total}</span>. Recuerda pagar antes del día 5 para evitar recargos.`;
      }
    }
  } else {
    banner.classList.add('hidden');
  }
}

// ── Tarjetas del Dashboard ────────────────────────────────────────────────────
function renderHomeCards(student, data) {
  const grid = document.getElementById('dashboardGrid');
  if (!grid) return;

  const { finance, academic, todayAtt } = data || {};
  const debtTotal = finance?.debt?.total || 0;
  const pendingItems = finance?.debt?.items || [];
  const inReview = pendingItems.filter(p => p.evidence_url || p.proof_url).length > 0;
  const isLive = AppState.get('isClassLive');

  // Mapeo de estados de asistencia
  const attLabels = {
    present: 'Presente',
    presente: 'Presente',
    absent: 'Ausente',
    ausente: 'Ausente',
    late: 'Tarde',
    tarde: 'Tarde'
  };
  const currentAtt = attLabels[todayAtt?.toLowerCase()] || 'Hoy';

  // Iconos como unicode para evitar problemas de encoding
  const ICONS = {
    calendar:  '\uD83D\uDCC5', // 📅
    chat:      '\uD83D\uDCAC', // 💬
    video:     '\uD83C\uDFA5', // 🎥
    card:      '\uD83D\uDCB3', // 💳
    trophy:    '\uD83C\uDFC6', // 🏆
    live:      '\uD83D\uDD34', // 🔴
  };

  const cards = [
    {
      title: 'Asistencia',
      value: currentAtt,
      sub: todayAtt ? 'Actualizado' : 'Ver registro',
      icon: ICONS.calendar,
      color: todayAtt ? 'border-emerald-300' : 'border-emerald-200',
      iconBg: todayAtt ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700',
      target: 'live-attendance'
    },
    {
      title: isLive ? 'Clase en Vivo' : 'Videollamada',
      value: isLive ? (ICONS.live + ' En vivo') : 'Aula Virtual',
      sub: isLive ? 'Unirse ahora' : 'Disponible pronto',
      icon: ICONS.video,
      color: isLive ? 'border-rose-300 ring-2 ring-rose-300 animate-pulse' : 'border-violet-200',
      iconBg: isLive ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700',
      target: 'videocall'
    },
    {
      title: 'Pagos',
      value: Helpers.formatCurrency(debtTotal),
      sub: debtTotal > 0 ? 'Pendiente' : (inReview ? 'En Revisión' : 'Al día'),
      icon: ICONS.card,
      color: debtTotal > 0 ? 'border-amber-200' : (inReview ? 'border-blue-200' : 'border-emerald-200'),
      iconBg: debtTotal > 0 ? 'bg-amber-100 text-amber-700' : (inReview ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'),
      target: 'payments'
    },
    {
      title: 'Notas',
      value: String(academic?.evidences?.length ?? 0),
      sub: 'Calificaciones',
      icon: ICONS.trophy,
      color: 'border-green-200',
      iconBg: 'bg-green-100 text-green-700',
      target: 'grades'
    }
  ];

  grid.innerHTML = cards.map(card =>
    '<div class="bg-white rounded-2xl p-4 border-2 ' + card.color + ' shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group relative" data-target="' + card.target + '">' +
      '<span id="badge-card-' + card.target + '" class="hidden absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow px-1 z-10">0</span>' +
      '<div class="flex justify-between items-start mb-3">' +
        '<div class="w-11 h-11 rounded-xl ' + card.iconBg + ' flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform">' + card.icon + '</div>' +
        '<i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors mt-1"></i>' +
      '</div>' +
      '<p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">' + card.title + '</p>' +
      '<h4 class="text-sm font-black text-slate-800 leading-tight">' + card.value + '</h4>' +
      '<p class="text-[10px] font-bold text-slate-500 mt-0.5">' + card.sub + '</p>' +
    '</div>'
  ).join('');

  if (window.lucide) lucide.createIcons();
}

// ── Reporte Diario ────────────────────────────────────────────────────────────
function renderDailySummary(log) {
  // Update time stamp
  const lastUpEl = document.getElementById('lastUpdateTime');
  if (lastUpEl) lastUpEl.textContent = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

  const timeline = document.getElementById('dailyEmojiTimeline');
  if (!timeline) return;

  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

  if (!log) {
    timeline.innerHTML = `
      <div class="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
        <span class="text-3xl">✨</span>
        <div>
          <p class="font-black text-sm text-slate-600">Sin reporte aún</p>
          <p class="text-xs text-slate-400 font-medium">La maestra actualizará la rutina de hoy</p>
        </div>
      </div>`;
    return;
  }

  const rawEvents = log.infant_data || [];

  // Fallback from top-level fields if no infant_data
  const items = [];
  if (rawEvents.length) {
    const typeMap = {
      milk:   (e) => ({ icon:'🍼', label:'Biberón',       detail: e.oz ? e.oz + ' oz' : '' }),
      sleep:  (e) => ({ icon:'😴', label: e.label || 'Durmió',        detail: e.end_time ? ('hasta ' + fmtTime(e.end_time)) : 'En siesta...' }),
      diaper: (e) => ({ icon: e.subtype==='wet'?'💧':'💩', label: e.subtype==='wet'?'Pañal mojado':'Pañal sucio', detail: '' }),
      food:   (e) => ({ icon:'🍽️', label: e.meal||'Comida', detail: e.amount||'' }),
      temp:   (e) => ({ icon:'🌡️', label:'Temperatura',   detail: e.value ? e.value + '°C' : '' }),
      med:    (e) => ({ icon:'💊', label:'Medicamento',   detail: e.name||'' }),
      note:   (e) => ({ icon:'📝', label:'Nota',          detail: e.text||'' }),
      bath:   (_) => ({ icon:'🛁', label:'Baño',          detail: '' }),
      handwash: (e) => ({ icon:'🧼', label: e.label || 'Lavado de manos', detail: '' }),
      toothbrush: (e) => ({ icon:'🪥', label: e.label || 'Cepillado dental', detail: '' }),
      activity: (e) => ({ icon:'🏫', label: e.label || 'Actividad educativa', detail: '' }),
      playground: (e) => ({ icon:'🌳', label: e.label || 'Salida al patio', detail: '' }),
      welcome_song: (e) => ({ icon:'👋', label: e.label || 'Canción de bienvenida', detail: '' }),
      prayer: (e) => ({ icon:'🙏', label: e.label || 'Oración / reflexión', detail: '' }),
      behavior: (e) => {
        const behaviorLabels = {
          social: { shared:'Compartió con compañeros', alone:'Jugó solo', group:'Participó en grupo', emotional_support:'Necesitó apoyo emocional' },
          classroom: { attention:'Prestó atención', participation:'Participó activamente', curiosity:'Mostró curiosidad', completed:'Terminó actividades', needed_help:'Necesitó ayuda constante' },
          emotional: { controlled:'Controló emociones', frustrated:'Se frustró fácilmente', crying:'Lloró por separación', anxious:'Mostró ansiedad', calmed:'Se calmó rápidamente' },
          montessori: { manipulation:'Manipulación materiales', fine_motor:'Motricidad fina', gross_motor:'Motricidad gruesa', language:'Lenguaje', concentration:'Concentración', autonomy:'Autonomía' }
        };
        let detail = '';
        if (e.category && e.data) {
          const catLabels = behaviorLabels[e.category];
          if (catLabels && e.data[e.category]) detail = catLabels[e.data[e.category]] || '';
        }
        return { icon:'🤝', label: e.label || 'Comportamiento', detail };
      },
    };
    rawEvents.forEach(e => {
      const fn = typeMap[e.type];
      const base = fn ? fn(e) : { icon:'📌', label: e.label || e.type, detail: '' };
      items.push({ ...base, timeStr: fmtTime(e.created_at || e.start_time) });
    });
  } else {
    const moodMap = { feliz:'😊', bien:'😊', normal:'😐', triste:'😢', inquieto:'😫', enojado:'😡', muy_feliz:'😁', cansado:'😴', enfermo:'🤒' };
    if (log.mood) items.push({ icon: moodMap[log.mood.toLowerCase()]||'😊', label:'Ánimo', detail: log.mood, timeStr: fmtTime(log.created_at) });

    // Parsear food JSON estructurado
    if (log.food) {
      let foodObj = {};
      try { foodObj = JSON.parse(log.food); } catch { foodObj = { breakfast: log.food }; }
      const fl = { todo:'Comió todo ✅', poco:'Comió poco ⚠️', nada:'No comió ❌', ayuda:'Necesitó ayuda 🆘' };
      if (foodObj.breakfast) items.push({ icon:'🍞', label:'Desayuno', detail: fl[foodObj.breakfast]||foodObj.breakfast, timeStr:'' });
      if (foodObj.lunch)     items.push({ icon:'🥗', label:'Almuerzo', detail: fl[foodObj.lunch]||foodObj.lunch,         timeStr:'' });
      if (foodObj.snack)     items.push({ icon:'🍎', label:'Merienda', detail: fl[foodObj.snack]||foodObj.snack,         timeStr:'' });
    }
    if (log.nap === 'si')    items.push({ icon:'💤', label:'Siesta', detail:'Durmió su siesta', timeStr:'' });
    else if (log.nap === 'no') items.push({ icon:'☀️', label:'Sin siesta', detail:'No durmió siesta', timeStr:'' });
    else if (log.nap === 'poco') items.push({ icon:'⏰', label:'Siesta', detail:'Durmió poco', timeStr:'' });
    else if (log.nap === 'excelente') items.push({ icon:'⭐', label:'Siesta', detail:'Durmió excelente', timeStr:'' });
    if (log.notes) items.push({ icon:'📝', label:'Observación', detail: log.notes, timeStr: fmtTime(log.created_at) });
  }

  if (!items.length) {
    timeline.innerHTML = `<div class="text-center py-4 text-slate-400 text-sm font-bold">Sin eventos registrados hoy</div>`;
    return;
  }

  timeline.innerHTML = items.map(item => `
    <div class="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-[#E8F2FF] hover:border-[#0B63C7]/20 transition-all">
      <span class="text-2xl leading-none w-9 text-center shrink-0">${item.icon}</span>
      <div class="flex-1 min-w-0">
        <p class="font-black text-sm text-[#1A2340] leading-tight">${Helpers.escapeHTML(item.label)}</p>
        ${item.detail ? `<p class="text-xs text-slate-500 font-medium truncate">${Helpers.escapeHTML(item.detail)}</p>` : ''}
      </div>
      ${item.timeStr ? `<span class="text-[10px] font-black text-[#0B63C7] bg-[#E8F2FF] px-2 py-1 rounded-lg shrink-0">${item.timeStr}</span>` : ''}
    </div>`).join('');

  if (window.lucide) lucide.createIcons();
}


// ── Últimas publicaciones en home ─────────────────────────────────────────────
function renderLatestPosts(posts) {
  const container = document.getElementById('latestPostsContainer');
  if (!container) return; // el elemento es opcional en el HTML

  if (!posts?.length) {
    container.innerHTML =
      '<p class="text-xs text-slate-400 text-center py-4">Sin publicaciones recientes.</p>';
    return;
  }

  container.innerHTML = posts.map(p => {
    const teacher = Array.isArray(p.teacher) ? p.teacher[0] : (p.teacher || {});
    const name    = teacher.name || p.teacher_name || 'Maestra';
    const date    = Helpers.formatDate(p.created_at);
    const content = (p.content || '').substring(0, 120) + ((p.content?.length > 120) ? '…' : '');
    return `
      <div class="flex gap-3 items-start py-3 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-xl transition-colors"
           onclick="App.navigateTo('class')">
        <div class="w-9 h-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-black text-sm shrink-0">
          ${name.charAt(0).toUpperCase()}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-black text-slate-700 truncate">${Helpers.escapeHTML(name)}</p>
          <p class="text-xs text-slate-500 leading-snug mt-0.5">${Helpers.escapeHTML(content)}</p>
          <p class="text-[10px] text-slate-400 mt-1">${date}</p>
        </div>
      </div>`;
  }).join('');
}


// ── Navegación ────────────────────────────────────────────────────────────────
export async function navigateTo(targetId) {
  if (!targetId) return;
  Helpers.vibrate?.('light');

  // ✅ LIMPIEZA DE REALTIME: Eliminar canales al cambiar de sección
  if (window.RealtimeManager) RealtimeManager.unsubscribeAll(['notifications', 'live_status']);
  // Cleanup feed channel
  if (FeedModule._channel) {
    supabase.removeChannel(FeedModule._channel);
    FeedModule._channel = null;
  }

  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.add('hidden');
    sec.classList.remove('active');
  });

  const target = document.getElementById(targetId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
      
      // Cambiar color de la barra de estado/tema según sección
      const themeColors = {
        home: '#0ea5e9', tasks: '#F59E0B', class: '#3B82F6', 
        payments: '#059669', 'live-attendance': '#10B981'
      };
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[targetId] || '#0ea5e9');

    AppState.set('currentSection', targetId);

    // 🔴 Marcar badges como leídos al entrar a la sección
    BadgeSystem.mark(targetId);
    // También limpiar badge de la tarjeta del dashboard
    const cardBadge = document.getElementById('badge-card-' + targetId);
    if (cardBadge) { cardBadge.classList.add('hidden'); cardBadge.classList.remove('flex'); }

    const student = AppState.get('currentStudent');
    switch (targetId) {
      case 'home':
        refreshDashboard().then(() => {
          // Re-aplicar badges en tarjetas después de que se rendericen
          if (window.BadgeSystem) BadgeSystem._reapplyCardBadges();
        });
        break;
      case 'payments': {
        const fin = AppState.get('financeConfig') || {};
        // Update header stats
        const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        const paidTotal = (AppState.get('financeHistory') || []).reduce((s, p) => s + Number(p.amount || 0), 0);
        setEl('paymentsBalance', Helpers.formatCurrency(paidTotal));
        setEl('paymentsMonthlyFee', Helpers.formatCurrency(fin.monthly_fee || 0));
        setEl('paymentsDueDay', fin.due_day || '-');
        PaymentsModule.init(student?.id);
        WizardPayment.init();
        // Auto-fill amount for colegiatura if empty
        setTimeout(() => {
          const amountInput = document.getElementById('paymentAmount');
          const concept = document.getElementById('paymentConcept')?.value;
          if (amountInput && !amountInput.value && concept === 'mensualidad' && fin.monthly_fee > 0) {
            amountInput.value = fin.monthly_fee;
          }
        }, 300);
        break;
      }
      case 'tasks':           TasksModule.init(student?.id); break;
      case 'live-attendance': AttendanceModule.init(student?.id); break;
      case 'notifications':   ChatModule.init(); break;
      case 'class':           FeedModule.init(student?.classroom_id); break;
      case 'profile':         ProfileModule.init(); _initPadreQR(student); NotifyPermission.requestIfNeeded(); break;
      case 'grades':          GradesModule.init(student?.id); break;
      case 'reports':         ReportsModule.init(); break;
      case 'rutina-diaria': {
        const sid = AppState.get('currentStudent')?.id;
        DailyReportModule.setStudent(sid);
        DailyReportModule.load().then(() => {
          requestAnimationFrame(() => { if (window.lucide) lucide.createIcons(); });
        });
        break;
      }
      case 'qr-access':       _initPadreQR(student); break;
      case 'videocall': {
        const student = AppState.get('currentStudent');
        const profile = AppState.get('profile');
        VideoCallUI.renderSection('videocall-section', {
          role: 'padre',
          // Mostrar nombre del estudiante en la videollamada, no del padre
          userName: student?.name || profile?.name || 'Padre',
          studentName: student?.name || '',
          classroomId: student?.classroom_id || null
        });
        break;
      }
    }
  }

  document.querySelectorAll('[data-target]').forEach(btn => {
    const isActive = btn.dataset.target === targetId;
    btn.classList.toggle('active', isActive);
  });
  
  // Cerrar sidebar en móvil al navegar
  if (window.innerWidth < 768 && closeSidebar) {
    closeSidebar(); // Usar la nueva función para cerrar el sidebar
  }
}

// --- Funciones globales para sidebar ---
let openSidebar, closeSidebar;

function setupNavigation() {
  Helpers.delegate(document.body, '[data-target]', 'click', (_e, el) => {
    navigateTo(el.dataset.target);
  });

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');

  openSidebar = () => {
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open', 'animate-slide-in');
    sidebar.classList.remove('animate-slide-out');
    overlay.classList.remove('hidden');
  };

  closeSidebar = () => {
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    sidebar.classList.add('animate-slide-out');
    overlay.classList.add('hidden');
    setTimeout(() => sidebar.classList.remove('animate-slide-out', 'animate-slide-in'), 300);
  };

  // Toggle sidebar
  if (menuToggleBtn) menuToggleBtn.addEventListener('click', openSidebar);
  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  // Category dropdowns
  document.querySelectorAll('.sidebar-category').forEach(categoryBtn => {
    categoryBtn.addEventListener('click', () => {
      const submenu = categoryBtn.closest('.sidebar-category-group')?.querySelector('.submenu');
      const chevron = categoryBtn.querySelector('.category-chevron');
      if (!submenu) return;
      
      // Toggle current
      submenu.classList.toggle('open');
      if (chevron) chevron.style.transform = submenu.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
      
      // Optional: Close others on mobile
      if (window.innerWidth < 768) {
        document.querySelectorAll('.submenu').forEach(other => {
          if (other !== submenu && other.classList.contains('open')) {
            other.classList.remove('open');
            const otherChevron = other.closest('.sidebar-category-group')?.querySelector('.category-chevron');
            if (otherChevron) otherChevron.style.transform = 'rotate(0deg)';
          }
        });
      }
    });
  });
}

function setupGlobalListeners() {
  // Solo actualizar header cuando cambia el estudiante
  AppState.subscribe('currentStudent', (student) => {
    if (student) {
      updateHeaderProfile(AppState.get('profile'), student);
      if (student.classroom_id) initLiveClassListener(student.classroom_id);
    }
  });

  // Actualizar tarjeta de asistencia en tiempo real cuando el BadgeSystem detecta un ponche
  window.addEventListener('karpus:attendance-update', (e) => {
    const student = AppState.get('currentStudent');
    if (!student) return;
    const payload = e.detail;
    // Solo actualizar si es el estudiante actual
    if (String(payload?.student_id) !== String(student.id)) return;
    const status = payload?.status || 'present';
    AppState.set('todayAttendance', status);
    // Re-renderizar solo la tarjeta de asistencia sin recargar todo
    const attCard = document.querySelector('[data-target="live-attendance"]');
    if (attCard) {
      const attLabels = { present: 'Presente', presente: 'Presente', absent: 'Ausente', late: 'Tarde' };
      const label = attLabels[status?.toLowerCase()] || 'Registrado';
      const valEl = attCard.querySelector('h4');
      const subEl = attCard.querySelector('p:last-child');
      if (valEl) valEl.textContent = label;
      if (subEl) subEl.textContent = 'Actualizado ahora';
      attCard.className = attCard.className.replace(/border-\w+-\d+/g, 'border-emerald-300');
    }
  });
}

// ── Badge mensajes no leídos ──────────────────────────────────────────────────
async function loadUnreadBadge() {
  try {
    const user = AppState.get('user');
    if (!user) return;

    let total = 0;
    const { data, error } = await supabase.rpc('get_unread_counts');
    if (!error && data) {
      total = Object.values(data).reduce((a, b) => a + Number(b), 0);
    }
    // Si el RPC falla, mostrar 0 silenciosamente

    const badge = document.getElementById('badge-muro');
    if (!badge) return;

    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.classList.remove('hidden');
      badge.classList.add('flex');
    } else {
      badge.classList.add('hidden');
      badge.classList.remove('flex');
    }
  } catch (_) { /* silencioso */ }
}

// Actualizar badge en tiempo real cuando llega un mensaje nuevo
function initMessageBadgeRealtime() {
  const user = AppState.get('user');
  if (!user || window._padreUnreadChannel) return;
  window._padreUnreadChannel = supabase
    .channel('padre_unread_' + user.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages'
    }, () => { loadUnreadBadge(); })
    .subscribe();
}

/**
 * ✨ Abrir Carnet Digital con Brillo Máximo
 */
async function openDigitalID() {
  const student = AppState.get('currentStudent');
  if (!student) return;

  Helpers.vibrate('medium');

  const html = `
    <div class="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl animate-scaleIn">
      <div class="bg-indigo-600 p-6 text-white text-center">
        <h3 class="text-xl font-black">Carnet Digital</h3>
        <p class="text-xs font-bold text-white/70 uppercase tracking-widest mt-1">Escaneo de Acceso</p>
      </div>
      <div class="p-8 flex flex-col items-center gap-6">
        <div class="w-24 h-24 rounded-2xl border-4 border-indigo-50 overflow-hidden shadow-lg">
          <img src="${student.avatar_url || 'img/1.jpg'}" class="w-full h-full object-cover">
        </div>
        <div class="text-center">
          <h4 class="text-lg font-black text-slate-800">${Helpers.escapeHTML(student.name)}</h4>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">${Helpers.escapeHTML(student.classrooms?.name || 'Sin aula')}</p>
        </div>
        <div id="digitalIDQR" class="p-4 bg-slate-50 rounded-3xl border-2 border-slate-100"></div>
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Muestra este código en la puerta para marcar asistencia rápida</p>
      </div>
    </div>
  `;

  if (window.openGlobalModal) window.openGlobalModal(html);

  // Generar QR
  setTimeout(() => {
    const qrContainer = document.getElementById('digitalIDQR');
    if (qrContainer && window.QRCode) {
      new QRCode(qrContainer, {
        text: student.matricula || student.id,
        width: 180,
        height: 180,
        colorDark: "#1e1b4b",
        colorLight: "#f8fafc"
      });
    }
  }, 100);

  // ✨ Modo Brillo Máximo (Opcional - solo si el navegador lo soporta)
  if ('wakeLock' in navigator) {
    try { await navigator.wakeLock.request('screen'); } catch(_) {}
  }
}

function updateHeaderProfile(profile, student, allStudents = []) {
  const studentName = student?.name || 'Estudiante';

  // Sidebar — nombre + avatar del estudiante
  const sidebarName = document.getElementById('sidebarStudentName');
  if (sidebarName) sidebarName.textContent = studentName;

  const sidebarClassroom = document.getElementById('sidebarClassroomName');
  if (sidebarClassroom) {
    const classroomName = student?.classrooms?.name;
    if (classroomName) {
      sidebarClassroom.textContent = classroomName;
    } else if (student?.classroom_id) {
      // Fallback: fetch classroom name directly
      sidebarClassroom.textContent = 'Cargando...';
      import('../shared/supabase.js').then(({ supabase }) => {
        supabase.from('classrooms').select('name').eq('id', student.classroom_id).maybeSingle()
          .then(({ data }) => {
            sidebarClassroom.textContent = data?.name || 'Sin aula asignada';
            if (data?.name && student) {
              student.classrooms = { ...(student.classrooms || {}), name: data.name };
            }
          }).catch(() => { sidebarClassroom.textContent = 'Sin aula asignada'; });
      });
    } else {
      sidebarClassroom.textContent = 'Sin aula asignada';
    }
  }

  // UX: Añadir indicador visual y disparador si hay múltiples estudiantes
  const switcherTrigger = document.getElementById('studentSwitcherTrigger');
  if (switcherTrigger && allStudents.length > 1) {
    const label = switcherTrigger.querySelector('p');
    if (label && !label.innerHTML.includes('chevron')) {
      label.innerHTML += ' <i data-lucide="chevron-down" class="inline w-3 h-3 ml-1"></i>';
    }
    switcherTrigger.onclick = () => _showStudentSwitcher(allStudents);
  }

  // ── CHIPS DE HERMANOS ─────────────────────────────────────────
  if (allStudents.length > 1) {
    let chipsInner = '';
    allStudents.forEach(function(s) {
      const isActive = String(s.id) === String(student?.id);
      const firstName = (s.name || 'Estudiante').split(' ')[0];
      const esc = firstName.replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
      const avatarBgClass = isActive ? 'bg-white text-emerald-600' : 'bg-slate-500 text-white';
      const avatarHtml = s.avatar_url
        ? '<img src="' + s.avatar_url + '" class="w-6 h-6 rounded-full object-cover mr-1.5 shrink-0" alt="">'
        : '<span class="w-6 h-6 rounded-full ' + avatarBgClass + ' flex items-center justify-center text-[10px] font-black mr-1.5 shrink-0">' + firstName.charAt(0) + '</span>';
      const btnClass = isActive
        ? 'flex items-center px-3 py-1.5 rounded-full text-[11px] font-black transition-all active:scale-95 bg-emerald-500 text-white shadow-md'
        : 'flex items-center px-3 py-1.5 rounded-full text-[11px] font-black transition-all active:scale-95 bg-slate-700 text-white hover:bg-slate-600';
      chipsInner += '<button type="button" onclick="App.switchStudent(\'' + s.id + '\')" class="' + btnClass + '">' + avatarHtml + esc + '</button>';
    });
    const chipsHTML = '<div class="flex flex-wrap gap-2">' + chipsInner + '</div>';

    const desktopEl = document.getElementById('siblingsChipsDesktop');
    const mobileEl  = document.getElementById('siblingsChipsMobile');
    if (desktopEl) desktopEl.innerHTML = chipsHTML;
    if (mobileEl)  mobileEl.innerHTML  = chipsHTML;
  } else {
    const desktopEl = document.getElementById('siblingsChipsDesktop');
    const mobileEl  = document.getElementById('siblingsChipsMobile');
    if (desktopEl) desktopEl.innerHTML = '';
    if (mobileEl)  mobileEl.innerHTML  = '';
  }

  const sidebarAvatar = document.getElementById('sidebarStudentAvatar');
  if (sidebarAvatar) {
    sidebarAvatar.innerHTML = student?.avatar_url
      ? '<img src="' + student.avatar_url + '" class="w-full h-full object-cover">'
      : '<span class="text-sm font-black text-emerald-700">' + studentName.charAt(0) + '</span>';
  }

  // Mobile header avatar también abre el selector
  const mobileAvatar = document.getElementById('headerAvatarMobile');
  if (mobileAvatar && allStudents.length > 1) {
    mobileAvatar.style.cursor = 'pointer';
    mobileAvatar.onclick = () => _showStudentSwitcher(allStudents);
  }

  document.querySelectorAll('.guardian-name-display').forEach(el => el.textContent = studentName);
  document.querySelectorAll('.student-name-display').forEach(el => el.textContent = studentName);
  document.querySelectorAll('.classroom-name-display').forEach(el => {
    el.textContent = student?.classrooms?.name || 'Sin aula';
  });



  // Mobile header avatar
  if (mobileAvatar) {
    mobileAvatar.innerHTML = student?.avatar_url
      ? '<img src="' + student.avatar_url + '" class="w-full h-full object-cover">'
      : '<span class="text-sm font-black text-sky-700">' + studentName.charAt(0) + '</span>';
  }

  // Render siblings in profile section
  const siblingsContainer = document.getElementById('profile-siblings-container');
  const siblingsList = document.getElementById('profile-siblings-list');
  if (siblingsContainer && siblingsList) {
    if (allStudents.length > 1) {
      siblingsContainer.classList.remove('hidden');
      siblingsList.innerHTML = allStudents.map(s => {
        const isActive = String(s.id) === String(student?.id);
        return `
          <button onclick="App.switchStudent('${s.id}')" 
            class="flex items-center gap-2 p-3 rounded-2xl transition-all border-2 ${isActive ? 'bg-emerald-500 border-emerald-600 text-white' : 'bg-white border-slate-100 hover:bg-emerald-50 hover:border-emerald-200 text-slate-700'}">
            <div class="w-8 h-8 rounded-xl overflow-hidden ${isActive ? 'bg-white/20' : 'bg-slate-100'} flex items-center justify-center shrink-0">
              ${s.avatar_url 
                ? `<img src="${s.avatar_url}" class="w-full h-full object-cover">` 
                : `<span class="font-black ${isActive ? 'text-white' : 'text-slate-400'}">${s.name.charAt(0)}</span>`
              }
            </div>
            <span class="text-sm font-bold">${Helpers.escapeHTML(s.name)}</span>
          </button>`;
      }).join('');
    } else {
      siblingsContainer.classList.add('hidden');
      siblingsList.innerHTML = '';
    }
  }

  if (window.lucide) lucide.createIcons();
}

/**
 * 🔄 Cambio de Estudiante (Multi-hijo)
 */
async function switchStudent(studentId) {
  const all = AppState.get('students') || [];
  const selected = all.find(s => String(s.id) === String(studentId));
  if (!selected) return;

  Helpers.vibrate('medium');
  Helpers.showLoader('Cambiando perfil...');

  try {
    // 1. Limpiar Caché de Prefetch y AppState específico
    Prefetch.clear();
    AppState.set('currentDailyLog', null);
    AppState.set('currentGrades', null);
    AppState.set('currentPayments', null);

    // 2. Desuscribir Canales Realtime actuales de forma exhaustiva
    // FIX orphaned channels: use removeChannel() (not just unsubscribe) to fully release socket slots
    const channels = ['_dailyLogChannel', '_chatChannel', '_classroomChannel', '_notificationChannel', '_padreUnreadChannel'];
    channels.forEach(ch => {
      if (window[ch]) {
        try { supabase.removeChannel(window[ch]); } catch(err) {
          // Channel removal failed — non-critical
        }
        window[ch] = null;
      }
    });

    // 3. Actualizar Estado Global
    AppState.set('currentStudent', selected);
    localStorage.setItem('karpus_last_student_id', studentId);

    // Actualizar módulo de rutina diaria con el nuevo estudiante
    DailyReportModule.setStudent(selected.id);
    
    // 4. Reiniciar Realtime para el nuevo hijo
    _initDailyLogRealtime(selected.id);
    if (selected.classroom_id) initLiveClassListener(selected.classroom_id);

    // 5. Recargar Dashboard y UI
    updateHeaderProfile(AppState.get('profile'), selected, all);
    await refreshDashboard();
    
    // Si estamos en una sección específica, reiniciarla
    const currentSection = AppState.get('currentSection') || 'home';
    navigateTo(currentSection);

    Helpers.hideLoader();
    Helpers.toast(`Perfil de ${selected.name.split(' ')[0]} cargado`, 'success');

  } catch (e) {
    // Profile switch failed — toast already shown
    Helpers.hideLoader();
    Helpers.toast('Error al cambiar de perfil: ' + (e.message || e), 'error');
  }
}

function _showStudentSwitcher(students) {
  const current = AppState.get('currentStudent');
  const html = `
    <div class="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl animate-scaleIn w-full max-w-xs">
      <div class="p-6 border-b border-slate-100 bg-slate-50/50">
        <h3 class="font-black text-slate-800 text-center">Cambiar de Estudiante</h3>
      </div>
      <div class="p-4 space-y-2">
        ${students.map(s => `
          <button onclick="App.switchStudent('${s.id}'); App.ui.closeModal()" 
            class="w-full p-4 flex items-center gap-4 rounded-3xl transition-all ${String(s.id) === String(current?.id) ? 'bg-indigo-50 border-2 border-indigo-200' : 'bg-white border border-slate-100 hover:bg-slate-50'}">
            <div class="w-12 h-12 rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
              ${s.avatar_url ? `<img src="${s.avatar_url}" class="w-full h-full object-cover">` : `<span class="font-black text-slate-400">${s.name.charAt(0)}</span>`}
            </div>
            <div class="text-left flex-1 min-w-0">
              <p class="font-black text-slate-800 text-sm truncate">${Helpers.escapeHTML(s.name)}</p>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${Helpers.escapeHTML(s.classrooms?.name || 'Sin aula')}</p>
            </div>
            ${String(s.id) === String(current?.id) ? '<i data-lucide="check" class="w-4 h-4 text-indigo-600"></i>' : ''}
          </button>
        `).join('')}
      </div>
      <div class="p-4 bg-slate-50 flex justify-center">
         <button onclick="App.ui.closeModal()" class="text-[10px] font-black text-slate-400 uppercase tracking-widest p-2">Cerrar</button>
      </div>
    </div>
  `;
  window.openGlobalModal(html);
  if (window.lucide) lucide.createIcons();
}

function _initDailyLogRealtime(studentId) {
  // FIX orphaned channels: always clean up before creating a new subscription
  // Using supabase.removeChannel() (not just .unsubscribe()) to fully release the socket slot
  if (window._dailyLogChannel) {
    try {
      supabase.removeChannel(window._dailyLogChannel);
    } catch (err) {
      // Channel cleanup failed — non-critical
    }
    window._dailyLogChannel = null;
  }

  window._dailyLogChannel = supabase
    .channel('daily_log_' + studentId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'daily_logs'
      // No filter here — filter client-side to avoid bigint cast issues
    }, async (payload) => {
      if (String(payload.new?.student_id) !== String(studentId) &&
          String(payload.old?.student_id) !== String(studentId)) return;
      const now = new Date();
      const today = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');
      try {
        const log = await Api.getDailyLog(studentId, today);
        renderDailySummary(log);
      } catch (err) {
        // Realtime daily log callback failed
      }
    })
    .subscribe();
}

async function checkActiveMeetings() {
  try {
    const meetings = await VideoCallModule.getMyMeetings();
    const active   = (meetings || []).find(m => m.status === 'live');
    AppState.set('isClassLive', !!active);

    const btn = document.querySelector('.node-videocall');
    if (!btn) return;

    if (active) {
      btn.classList.remove('hidden');
      btn.classList.add('ring-2', 'ring-rose-400', 'animate-pulse');
      if (!btn._vcInitialized) {
        btn.addEventListener('click', () => {
          navigateTo('videocall');
          window.open('https://meet.jit.si/ColegioSonrisas-edu-2026_' + active.room_name, '_blank');
        });
        btn._vcInitialized = true;
      }
    } else {
      btn.classList.add('hidden');
      btn.classList.remove('ring-2', 'ring-rose-400', 'animate-pulse');
    }
  } catch (_) {}
}

// ── QR de Acceso del Padre ────────────────────────────────────────────────────
async function _initPadreQR(student) {
  const container = document.getElementById('padre-qr-container');
  const matLabel  = document.getElementById('padre-qr-matricula');
  const nameLabel = document.getElementById('padre-qr-name');
  if (!container || !student) {

    return;
  }

  const matricula = student.matricula;
  const name      = student.name;

  if (matLabel) matLabel.textContent = matricula || 'Sin matrícula';
  if (nameLabel) nameLabel.textContent = name || '';

  // Mostrar botones siempre (solo compartir para el padre)
  const shareBtn = document.getElementById('btn-share-padre-qr');
  const printBtn = document.getElementById('btn-print-padre-qr');
  if (shareBtn) shareBtn.classList.remove('hidden');
  if (printBtn) printBtn.classList.remove('hidden');

  if (!matricula) {
    container.innerHTML = '<div class="w-48 h-48 flex flex-col items-center justify-center text-slate-400 gap-2 text-center"><p class="text-xs font-bold">Sin matrícula asignada.<br>Contacta a la directora.</p></div>';
    if (window.lucide) lucide.createIcons({ props: { class: 'w-10 h-10' } });
    return;
  }

  // Mostrar spinner mientras carga
  container.innerHTML = '<div class="w-48 h-48 flex items-center justify-center"><div class="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div></div>';

  // Esperar QR lib (ya debería estar precargada)
  try {
    if (!window.QRCode) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/shared/qrcode.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    container.innerHTML = '';
    const qrData = matricula;

    new window.QRCode(container, {
      text: qrData,
      width: 192, height: 192,
      colorDark: '#1e293b', colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.L
    });
  } catch (e) {

    container.innerHTML = '<div class="w-48 h-48 flex items-center justify-center text-rose-500 text-xs text-center font-bold">Error al cargar QR.<br>Reintenta recargando la página.</div>';
  }

  // Imprimir
  window.App.printPadreQR = () => {
    const img = container.querySelector('img')?.src || container.querySelector('canvas')?.toDataURL();
    if (!img) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>QR - ${matricula}</title>
      <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
      .card{border:2px solid #e2e8f0;border-radius:16px;padding:24px;text-align:center;max-width:280px;}
      .logo{font-size:12px;font-weight:900;color:#10B981;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;}
      img{width:192px;height:192px;}.name{font-size:16px;font-weight:900;color:#1e293b;margin-top:12px;}
      .mat{font-size:11px;color:#64748b;font-weight:700;margin-top:4px;}.hint{font-size:9px;color:#94a3b8;margin-top:8px;}</style>
    </head><body><div class="card">
      <div class="logo">🎓 Colegio Montessori Sonrisas Creativas</div>
      <img src="${img}" alt="QR">
      <div class="name">${name}</div>
      <div class="mat">${matricula}</div>
      <div class="hint">Escanea para registrar entrada/salida</div>
    </div><script>window.onload=()=>{window.print();}<\/script></body></html>`);
    win.document.close();
  };

  // Compartir (solo padre)
  window.App.sharePadreQR = async () => {
    const canvas = container.querySelector('canvas');
    const img    = container.querySelector('img');
    try {
      if (canvas) {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const file = new File([blob], `QR-${matricula}.png`, { type: 'image/png' });
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title: `QR Colegio Montessori Sonrisas Creativas - ${name}`, text: `Código QR de ${name} para Colegio Montessori Sonrisas Creativas`, files: [file] });
          } else {
            // Fallback: descargar
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `QR-${matricula}.png`; a.click();
            URL.revokeObjectURL(url);
          }
        });
      } else if (img) {
        // Compartir como URL si no hay canvas
        if (navigator.share) {
          await navigator.share({ title: `QR Colegio Montessori Sonrisas Creativas - ${name}`, text: `Código QR de ${name}`, url: img.src });
        }
      }
    } catch (_) {}
  };
}

// ── Detección de Nuevo Ciclo Académico ───────────────────────────────────────
async function _checkNewAcademicPeriod(classroomId) {
  if (!classroomId) return;
  try {
    const STORAGE_KEY = `karpus_last_period_${classroomId}`;

    const { data: periodData, error } = await supabase.rpc('get_active_period', {
      p_classroom_id: classroomId
    });
    if (error || !periodData?.found) return;

    const currentPeriodId = String(periodData.id);
    const lastSeenPeriodId = localStorage.getItem(STORAGE_KEY);

    // Si es la primera vez o el período cambió → mostrar banner
    if (lastSeenPeriodId && lastSeenPeriodId !== currentPeriodId) {
      _showNewCycleBanner(periodData.name);
    }

    // Guardar el período actual como "visto"
    localStorage.setItem(STORAGE_KEY, currentPeriodId);
  } catch (_) { /* silencioso — RPC puede no existir aún */ }
}

function _showNewCycleBanner(periodName) {
  // Crear banner de nuevo ciclo
  const banner = document.createElement('div');
  banner.id = 'newCycleBanner';
  banner.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
  `;
  banner.innerHTML = `
    <div style="background:white;border-radius:28px;max-width:380px;width:100%;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.3);animation:karpusBounceIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">
      <!-- Header festivo -->
      <div style="background:linear-gradient(135deg,#f97316,#ec4899,#8b5cf6);padding:32px 24px;text-align:center;">
        <div style="font-size:56px;margin-bottom:8px;">🎉</div>
        <h2 style="margin:0;color:white;font-family:sans-serif;font-size:22px;font-weight:900;letter-spacing:-0.5px;">¡Nuevo Ciclo Académico!</h2>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-family:sans-serif;font-size:14px;font-weight:600;">${periodName}</p>
      </div>
      <!-- Cuerpo -->
      <div style="padding:24px;">
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f0fdf4;border-radius:14px;border:1px solid #bbf7d0;">
            <span style="font-size:20px;">✨</span>
            <div>
              <p style="margin:0;font-family:sans-serif;font-size:13px;font-weight:800;color:#15803d;">Muro renovado</p>
              <p style="margin:2px 0 0;font-family:sans-serif;font-size:11px;color:#16a34a;">Solo verás publicaciones del nuevo período</p>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#eff6ff;border-radius:14px;border:1px solid #bfdbfe;">
            <span style="font-size:20px;">📚</span>
            <div>
              <p style="margin:0;font-family:sans-serif;font-size:13px;font-weight:800;color:#1d4ed8;">Tareas actualizadas</p>
              <p style="margin:2px 0 0;font-family:sans-serif;font-size:11px;color:#2563eb;">Las tareas del ciclo anterior están archivadas</p>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#fdf4ff;border-radius:14px;border:1px solid #e9d5ff;">
            <span style="font-size:20px;">📋</span>
            <div>
              <p style="margin:0;font-family:sans-serif;font-size:13px;font-weight:800;color:#7e22ce;">Boletín disponible</p>
              <p style="margin:2px 0 0;font-family:sans-serif;font-size:11px;color:#9333ea;">Revisa las calificaciones del período anterior en "Boletines"</p>
            </div>
          </div>
        </div>
        <button onclick="document.getElementById('newCycleBanner').remove()"
          style="width:100%;padding:16px;background:linear-gradient(135deg,#f97316,#ec4899);color:white;border:none;border-radius:16px;font-family:sans-serif;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 4px 16px rgba(249,115,22,0.4);">
          ¡Entendido, empecemos! 🚀
        </button>
      </div>
    </div>
    <style>
      @keyframes karpusBounceIn {
        0%   { transform: scale(0.7); opacity: 0; }
        60%  { transform: scale(1.05); opacity: 1; }
        100% { transform: scale(1); }
      }
    </style>
  `;

  // Cerrar al hacer clic fuera
  banner.addEventListener('click', (e) => {
    if (e.target === banner) banner.remove();
  });

  document.body.appendChild(banner);
}
