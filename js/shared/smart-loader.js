/**
 * SmartLoader — Sistema de Estados Inteligentes
 * Humanizes every loading state, prevents double-click,
 * shows progress, and builds user confidence.
 */

const MESSAGES = {
  directora: {
    dashboard:    ['📊 Estamos preparando tu panel de control...', 'Consultando indicadores institucionales...', 'Actualizando métricas del colegio...'],
    estudiantes:  ['👧 Organizando el expediente de los estudiantes...', 'Cargando información de matrícula...', 'Verificando datos académicos...'],
    maestros:     ['👩‍🏫 Preparando la información del personal...', 'Cargando perfiles de las maestras...', 'Organizando datos del equipo docente...'],
    asistencia:   ['📝 Preparando el registro de asistencia...', 'Verificando puntualidad de hoy...', 'Cargando historial de asistencia...'],
    calificaciones: ['📖 Calculando el progreso académico...', 'Evaluando competencias por área...', 'Organizando las calificaciones...'],
    pagos:        ['💳 Verificando los movimientos financieros...', 'Cargando estado de cuentas...', 'Actualizando información de pagos...'],
    muro:         ['🎉 Preparando las publicaciones más recientes...', 'Cargando el muro escolar...', 'Organizando las noticias del colegio...'],
    chat:         ['💬 Conectando las conversaciones...', 'Sincronizando mensajes...', 'Cargando contactos...'],
    reportes:     ['📈 Generando información para ti...', 'Compilando datos institucionales...', 'Preparando reportes...'],
    ciclo:        ['🏫 Preparando el año escolar...', 'Verificando períodos académicos...', 'Cargando configuración del ciclo...'],
    aulas:        ['🏠 Organizando las aulas del colegio...', 'Cargando información de salones...', 'Verificando disponibilidad...'],
    inscripciones: ['📋 Procesando inscripciones...', 'Verificando preinscripciones pendientes...', 'Cargando expedientes...'],
    finanzas:     ['💰 Cargando resumen financiero...', 'Verificando cuentas por cobrar...', 'Actualizando información contable...'],
    incidencias:  ['⚠️ Cargando reportes de incidencias...', 'Verificando estado de quejas...', 'Organizando seguimientos...'],
    perfil:       ['👤 Cargando tu perfil...', 'Verificando información personal...', 'Preparando configuración...'],
    tareas:       ['📋 Preparando las tareas del aula...', 'Cargando evidencias de trabajos...', 'Verificando entregas pendientes...'],
    default:      ['✨ Estamos preparando todo para ti...', 'Cargando información...', 'Un momento por favor...']
  },
  maestra: {
    't-home':         ['🌞 Preparando el aula y las actividades de hoy...', 'Cargando tu panel de maestra...', 'Verificando tareas pendientes...'],
    't-class-detail': ['📚 Organizando la información del aula...', 'Cargando lista de estudiantes...', 'Preparando rutina diaria...'],
    't-attendance':   ['📝 Preparando el registro de asistencia...', 'Cargando marcación de hoy...', 'Verificando estudiantes...'],
    't-tasks':        ['📋 Preparando las tareas y evaluaciones...', 'Cargando evidencias enviadas...', 'Organizando calificaciones...'],
    't-routine':      ['🕐 Cargando la rutina del día...', 'Verificando horarios...', 'Preparando actividades...'],
    't-wall':         ['🎉 Cargando publicaciones del aula...', 'Preparando el muro...', 'Organizando noticias...'],
    't-students':     ['👧 Preparando los expedientes de tus alumnos...', 'Cargando información de estudiantes...', 'Verificando datos académicos...'],
    't-chat':         ['💬 Conectando con las familias...', 'Cargando conversaciones...', 'Sincronizando mensajes...'],
    't-chat-detail':  ['💬 Cargando la conversación...', 'Sincronizando mensajes...', 'Verificando nuevos mensajes...'],
    't-profile':      ['👤 Cargando tu perfil...', 'Verificando información personal...'],
    default:          ['📚 Preparando tu espacio de trabajo...', 'Cargando información...', 'Un momento por favor...']
  },
  padre: {
    dashboard:      ['👨‍👩‍👧 Estamos preparando la información de tu hijo...', 'Cargando su progreso académico...', 'Verificando novedades...'],
    asistencia:     ['📝 Consultando la asistencia de tu hijo...', 'Verificando registros de entrada y salida...'],
    pagos:          ['💳 Revisando el estado de tu cuenta...', 'Cargando movimientos financieros...'],
    calificaciones: ['📖 Consultando las calificaciones de tu hijo...', 'Preparando el progreso académico...'],
    tareas:         ['📋 Cargando las tareas de tu hijo...', 'Verificando trabajos pendientes...'],
    muro:           ['🎉 Preparando las publicaciones del colegio...', 'Cargando noticias recientes...'],
    chat:           ['💬 Conectando con la maestra...', 'Cargando conversaciones...'],
    perfil:         ['👤 Cargando información familiar...', 'Verificando datos del estudiante...'],
    default:        ['👨‍👩‍👧 Preparando la información de tu familia...', 'Cargando datos...', 'Un momento por favor...']
  },
  asistente: {
    dashboard:    ['📝 Organizando las actividades del día...', 'Cargando panel de asistencia...', 'Verificando registros...'],
    access:       ['🔐 Verificando accesos de hoy...', 'Cargando registros de entrada y salida...'],
    attendance:   ['📝 Preparando el control de asistencia...', 'Cargando marcaciones...', 'Verificando puntualidad...'],
    default:      ['📝 Preparando tu espacio de trabajo...', 'Cargando información...', 'Un momento por favor...']
  }
};

const LONG_PROCESS_STEPS = {
  closeYear: [
    { icon: '🔒', text: 'Cerrando el Año Escolar' },
    { icon: '✓', text: 'Archivando publicaciones del muro' },
    { icon: '✓', text: 'Guardando registros de asistencia' },
    { icon: '✓', text: 'Generando boletines de calificaciones' },
    { icon: '✓', text: 'Promoviendo estudiantes de grado' },
    { icon: '✓', text: 'Bloqueando períodos académicos' },
    { icon: '✓', text: 'Cerrando cuentas financieras' },
    { icon: '✓', text: 'Preparando el nuevo ciclo escolar' }
  ],
  closePeriod: [
    { icon: '📊', text: 'Cerrando el Período' },
    { icon: '✓', text: 'Calculando promedios finales' },
    { icon: '✓', text: 'Evaluando competencias por área' },
    { icon: '✓', text: 'Generando reportes de progreso' },
    { icon: '✓', text: 'Bloqueando calificaciones' },
    { icon: '✓', text: 'Notificando a las familias' }
  ],
  promote: [
    { icon: '🎓', text: 'Promoviendo estudiantes' },
    { icon: '✓', text: 'Verificando requisitos de aprobación' },
    { icon: '✓', text: 'Asignando nuevos grados' },
    { icon: '✓', text: 'Actualizando matrículas' },
    { icon: '✓', text: 'Preparando expedientes académicos' }
  ]
};

let _progressOverlay = null;
let _progressTimer = null;
let _currentModule = 'directora';
let _dotCount = 0;
let _dotTimer = null;

function getRole() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('panel_maestra') || path.includes('maestra')) return 'maestra';
  if (path.includes('panel_padres') || path.includes('padre')) return 'padre';
  if (path.includes('panel_asistente') || path.includes('asistente')) return 'asistente';
  return 'directora';
}

function detectModule(sectionId) {
  const role = getRole();
  const roleMessages = MESSAGES[role] || MESSAGES.directora;
  if (roleMessages[sectionId]) return sectionId;
  for (const key of Object.keys(roleMessages)) {
    if (sectionId.includes(key) || key.includes(sectionId)) return key;
  }
  return 'default';
}

function getLoadingMessage(sectionId) {
  const role = getRole();
  const roleMessages = MESSAGES[role] || MESSAGES.directora;
  const mod = detectModule(sectionId);
  const msgs = roleMessages[mod] || roleMessages.default;
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function getAnimatedDots() {
  _dotCount = (_dotCount % 3) + 1;
  return '•'.repeat(_dotCount);
}

export const SmartLoader = {
  _activeSkeletons: new Map(),

  skeleton(type = 'table', rows = 5) {
    const shimmer = 'bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 animate-shimmer rounded-xl';

    if (type === 'table') {
      return `<div class="space-y-3 p-6">
        ${Array(rows).fill('').map((_, i) => `
          <div class="flex items-center gap-4" style="animation-delay:${i * 80}ms">
            <div class="${shimmer} w-10 h-10 rounded-2xl shrink-0"></div>
            <div class="flex-1 space-y-2">
              <div class="${shimmer} h-4 rounded-lg" style="width:${60 + Math.random() * 30}%"></div>
              <div class="${shimmer} h-3 rounded-lg" style="width:${40 + Math.random() * 20}%"></div>
            </div>
            <div class="${shimmer} w-16 h-6 rounded-lg shrink-0"></div>
          </div>
        `).join('')}
      </div>`;
    }

    if (type === 'cards') {
      return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        ${Array(rows).fill('').map((_, i) => `
          <div class="${shimmer} h-24 rounded-2xl" style="animation-delay:${i * 100}ms"></div>
        `).join('')}
      </div>`;
    }

    if (type === 'detail') {
      return `<div class="space-y-4 p-6">
        <div class="${shimmer} h-8 w-48 rounded-xl"></div>
        <div class="${shimmer} h-4 w-72 rounded-lg"></div>
        <div class="grid grid-cols-3 gap-3 mt-6">
          ${Array(6).fill('').map((_, i) => `
            <div class="${shimmer} h-20 rounded-xl" style="animation-delay:${i * 60}ms"></div>
          `).join('')}
        </div>
      </div>`;
    }

    if (type === 'feed') {
      return `<div class="space-y-4 p-6">
        ${Array(rows).fill('').map((_, i) => `
          <div class="flex gap-3" style="animation-delay:${i * 80}ms">
            <div class="${shimmer} w-10 h-10 rounded-full shrink-0"></div>
            <div class="flex-1 space-y-2">
              <div class="${shimmer} h-3 w-24 rounded-lg"></div>
              <div class="${shimmer} h-4 rounded-lg" style="width:${50 + Math.random() * 40}%"></div>
              <div class="${shimmer} h-3 rounded-lg" style="width:${30 + Math.random() * 30}%"></div>
            </div>
          </div>
        `).join('')}
      </div>`;
    }

    return `<div class="space-y-3 p-6">
      ${Array(rows).fill('').map((_, i) => `
        <div class="${shimmer} h-10 rounded-xl" style="animation-delay:${i * 80}ms; width:${60 + Math.random() * 40}%"></div>
      `).join('')}
    </div>`;
  },

  async showIn(containerId, sectionId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const msg = options.message || getLoadingMessage(sectionId);
    const skeletonType = options.skeleton || 'table';
    const rows = options.rows || 5;

    this._activeSkeletons.set(containerId, { sectionId, startTime: Date.now() });

    container.innerHTML = `
      <div class="smart-loading flex flex-col items-center justify-center py-12 px-6 text-center">
        <div class="relative mb-5">
          <div class="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin"></div>
          <div class="absolute inset-0 flex items-center justify-center text-xl">${msg.charAt(0)}</div>
        </div>
        <p class="font-bold text-slate-700 text-sm mb-1 smart-loading-text">${msg}</p>
        <p class="text-xs text-slate-400 smart-loading-sub">Un momento por favor...</p>
        <div class="mt-4 w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full bg-indigo-500 rounded-full animate-smart-progress"></div>
        </div>
      </div>`;

    if (!document.getElementById('smart-loader-styles')) {
      this._injectStyles();
    }

    const startTime = Date.now();
    const messageRotation = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const allMsgs = (MESSAGES[getRole()] || MESSAGES.directora);
      const modMsgs = allMsgs[detectModule(sectionId)] || allMsgs.default;
      const textEl = container.querySelector('.smart-loading-text');
      const subEl = container.querySelector('.smart-loading-sub');

      if (!textEl) { clearInterval(messageRotation); return; }

      if (elapsed > 10000) {
        textEl.textContent = 'Gracias por tu paciencia...';
        subEl.textContent = 'La información está casi lista.';
      } else if (elapsed > 6000) {
        textEl.textContent = 'Casi terminamos...';
        subEl.textContent = 'Estamos sincronizando los últimos datos.';
      } else if (elapsed > 3000) {
        textEl.textContent = modMsgs[1] || 'Sincronizando información...';
        subEl.textContent = 'Estamos trabajando para ti.';
      }
    }, 3000);

    this._activeSkeletons.set(containerId, { sectionId, startTime, messageRotation });
  },

  hideFrom(containerId) {
    const entry = this._activeSkeletons.get(containerId);
    if (entry?.messageRotation) clearInterval(entry.messageRotation);
    this._activeSkeletons.delete(containerId);
  },

  buttonLoading(button, text = 'Guardando...') {
    if (!button) return;
    button._originalHTML = button.innerHTML;
    button._originalDisabled = button.disabled;
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${text}`;
    button.classList.add('pointer-events-none', 'opacity-70');
    if (window.lucide) lucide.createIcons({ nodes: [button] });
  },

  buttonSuccess(button, text = 'Guardado correctamente') {
    if (!button) return;
    button.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> ${text}`;
    button.classList.remove('opacity-70');
    button.classList.add('bg-emerald-500', 'hover:bg-emerald-500', 'text-white', 'border-emerald-500');
    if (window.lucide) lucide.createIcons({ nodes: [button] });

    setTimeout(() => {
      this.buttonReset(button);
    }, 2000);
  },

  buttonError(button, text = 'Error al guardar') {
    if (!button) return;
    button.innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4"></i> ${text}`;
    button.classList.remove('opacity-70');
    button.classList.add('bg-rose-500', 'hover:bg-rose-500', 'text-white', 'border-rose-500');
    if (window.lucide) lucide.createIcons({ nodes: [button] });

    setTimeout(() => {
      this.buttonReset(button);
    }, 3000);
  },

  buttonReset(button) {
    if (!button) return;
    if (button._originalHTML !== undefined) {
      button.innerHTML = button._originalHTML;
    }
    button.disabled = button._originalDisabled || false;
    button.classList.remove('pointer-events-none', 'opacity-70', 'bg-emerald-500', 'hover:bg-emerald-500', 'bg-rose-500', 'hover:bg-rose-500', 'border-emerald-500', 'border-rose-500');
    delete button._originalHTML;
    delete button._originalDisabled;
    if (window.lucide) lucide.createIcons({ nodes: [button] });
  },

  async wrapButton(button, asyncFn, options = {}) {
    const loadingText = options.loadingText || 'Guardando...';
    const successText = options.successText || 'Guardado correctamente';
    const errorText = options.errorText || 'Error al guardar';
    const onSuccess = options.onSuccess;
    const onError = options.onError;

    this.buttonLoading(button, loadingText);
    try {
      const result = await asyncFn();
      this.buttonSuccess(button, successText);
      if (onSuccess) onSuccess(result);
      return result;
    } catch (e) {
      this.buttonError(button, errorText);
      if (onError) onError(e);
      throw e;
    }
  },

  overlay(options = {}) {
    const title = options.title || 'Procesando...';
    const steps = options.steps || [];

    const el = document.createElement('div');
    el.id = 'smart-progress-overlay';
    el.className = 'fixed inset-0 z-[9999] flex items-center justify-center';
    el.innerHTML = `
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>
      <div class="relative bg-white rounded-3xl shadow-2xl p-8 max-w-md w-[90vw] text-center z-10">
        <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-indigo-50 flex items-center justify-center">
          <div class="w-12 h-12 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
        <h3 class="text-lg font-black text-slate-800 mb-2" id="smart-overlay-title">${title}</h3>
        <p class="text-sm text-slate-500 mb-6" id="smart-overlay-subtitle">Por favor espera...</p>
        <div class="space-y-2 text-left mb-6" id="smart-overlay-steps">
          ${steps.map((step, i) => `
            <div class="flex items-center gap-3 text-sm smart-step" data-step="${i}" style="opacity:0.3">
              <span class="w-5 text-center">${step.icon === '✓' ? '<span class="text-slate-300">○</span>' : step.icon}</span>
              <span class="text-slate-600 font-medium">${step.text}</span>
            </div>
          `).join('')}
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div class="h-full bg-indigo-500 rounded-full transition-all duration-500" id="smart-overlay-bar" style="width:0%"></div>
        </div>
        <p class="text-xs text-slate-400 mt-3" id="smart-overlay-pct">0%</p>
      </div>`;

    document.body.appendChild(el);
    _progressOverlay = el;
    return {
      setStep: (stepIndex) => this._overlayStep(stepIndex, steps.length),
      setTitle: (t) => { const e = el.querySelector('#smart-overlay-title'); if (e) e.textContent = t; },
      setSubtitle: (t) => { const e = el.querySelector('#smart-overlay-subtitle'); if (e) e.textContent = t; },
      complete: (msg) => this._overlayComplete(msg),
      error: (msg) => this._overlayError(msg),
      close: () => this._overlayClose()
    };
  },

  _overlayStep(stepIndex, total) {
    if (!_progressOverlay) return;
    const pct = Math.round(((stepIndex + 1) / total) * 100);
    const bar = _progressOverlay.querySelector('#smart-overlay-bar');
    const pctText = _progressOverlay.querySelector('#smart-overlay-pct');
    if (bar) bar.style.width = pct + '%';
    if (pctText) pctText.textContent = pct + '%';

    _progressOverlay.querySelectorAll('.smart-step').forEach((el, i) => {
      if (i < stepIndex) {
        el.style.opacity = '1';
        el.querySelector('span:first-child').innerHTML = '<span class="text-emerald-500 font-bold">✓</span>';
        el.querySelector('span:last-child').classList.add('text-slate-400', 'line-through');
        el.querySelector('span:last-child').classList.remove('text-slate-600');
      } else if (i === stepIndex) {
        el.style.opacity = '1';
        el.querySelector('span:last-child').classList.add('text-slate-800', 'font-bold');
      }
    });
  },

  _overlayComplete(msg = '✅ Todo está preparado. Puedes continuar.') {
    if (!_progressOverlay) return;
    const bar = _progressOverlay.querySelector('#smart-overlay-bar');
    if (bar) { bar.style.width = '100%'; bar.classList.add('bg-emerald-500'); }

    const title = _progressOverlay.querySelector('#smart-overlay-title');
    const subtitle = _progressOverlay.querySelector('#smart-overlay-subtitle');
    if (title) title.textContent = '¡Completado!';
    if (subtitle) subtitle.textContent = msg;

    const spinner = _progressOverlay.querySelector('.animate-spin');
    if (spinner) {
      spinner.classList.remove('animate-spin', 'border-indigo-500', 'border-t-indigo-500');
      spinner.classList.add('bg-emerald-100');
      spinner.innerHTML = '<span class="text-emerald-600 text-2xl">✓</span>';
    }

    _progressOverlay.querySelectorAll('.smart-step').forEach(el => {
      el.style.opacity = '1';
      el.querySelector('span:first-child').innerHTML = '<span class="text-emerald-500 font-bold">✓</span>';
    });

    const pctText = _progressOverlay.querySelector('#smart-overlay-pct');
    if (pctText) pctText.textContent = '100%';

    setTimeout(() => this._overlayClose(), 2500);
  },

  _overlayError(msg = '⚠️ No pudimos completar esta acción. La información permanece segura. Puedes intentarlo nuevamente.') {
    if (!_progressOverlay) return;
    const title = _progressOverlay.querySelector('#smart-overlay-title');
    const subtitle = _progressOverlay.querySelector('#smart-overlay-subtitle');
    const bar = _progressOverlay.querySelector('#smart-overlay-bar');
    if (title) title.textContent = 'Algo no salió bien';
    if (subtitle) subtitle.textContent = msg;
    if (bar) { bar.classList.add('bg-rose-500'); }

    const spinner = _progressOverlay.querySelector('.animate-spin');
    if (spinner) {
      spinner.classList.remove('animate-spin', 'border-indigo-500', 'border-t-indigo-500');
      spinner.classList.add('bg-rose-100');
      spinner.innerHTML = '<span class="text-rose-600 text-2xl">✕</span>';
    }

    setTimeout(() => this._overlayClose(), 4000);
  },

  _overlayClose() {
    if (_progressOverlay) {
      _progressOverlay.style.opacity = '0';
      _progressOverlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => { _progressOverlay?.remove(); _progressOverlay = null; }, 300);
    }
  },

  toast(msg, type = 'success', duration = 4000) {
    if (!msg) return;

    const icons = {
      success: '✅',
      error: '⚠️',
      warning: '⚡',
      info: '💬',
      created: '🎉',
      deleted: '🗑',
      saved: '✓',
      published: '📢'
    };

    const colors = {
      success: 'bg-emerald-500 border-emerald-400',
      error: 'bg-rose-500 border-rose-400',
      warning: 'bg-amber-500 border-amber-400',
      info: 'bg-indigo-500 border-indigo-400',
      created: 'bg-emerald-500 border-emerald-400',
      deleted: 'bg-slate-700 border-slate-600',
      saved: 'bg-emerald-500 border-emerald-400',
      published: 'bg-indigo-500 border-indigo-400'
    };

    document.querySelectorAll('.app-toast').forEach(t => t.remove());

    const el = document.createElement('div');
    el.className = `app-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border text-sm font-bold text-white transition-all duration-300 ${colors[type] || colors.success}`;
    el.innerHTML = `<span class="text-base">${icons[type] || '✅'}</span> ${Helpers.escapeHTML(msg)}`;

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('translate-y-0'));

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(8px)';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  _injectStyles() {
    if (document.getElementById('smart-loader-styles')) return;
    const style = document.createElement('style');
    style.id = 'smart-loader-styles';
    style.textContent = `
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      .animate-shimmer {
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
      }
      @keyframes smart-progress {
        0% { width: 5%; }
        50% { width: 70%; }
        90% { width: 90%; }
        100% { width: 95%; }
      }
      .animate-smart-progress {
        animation: smart-progress 8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      .smart-loading .animate-spin {
        border-width: 3px;
      }
      .smart-step {
        transition: opacity 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }
};

if (typeof window !== 'undefined') {
  window.SmartLoader = SmartLoader;
}
