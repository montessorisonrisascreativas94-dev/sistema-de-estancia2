import { logError } from './db-utils.js';
import { showOverlay, closeOverlay } from './loading-feedback.js';

// Supabase JS — cargado localmente (js/shared/supabase-js.min.js via script tag en HTML)
// El UMD expone window.supabase.createClient
import { createClient } from "./supabase-wrapper.js";

export { createClient };
export const SUPABASE_URL      = "https://yswizaskeftxpcphixiy.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzd2l6YXNrZWZ0eHBjcGhpeGl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDM4NTcsImV4cCI6MjA5NzkxOTg1N30.SQEZzGCCsADmbYTNrpjw6k1uBs8mXnhn8IhzTHH6rto";

const options = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'karpus_auth_token_v2'
  },
  global: {
    headers: { 'x-application-name': 'karpus-kids' }
  },
  db: {
    schema: 'public'
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);

// El proyecto mezcla módulos ES con scripts que invocan Edge Functions
// vía fetch (student-record-modal.js, helpers.js). Estas variables NO
// existían: sin ellas, fnBase quedaba en null y TODO envío de correo /
// creación de usuario devolvía "no-edge-base" sin intentar la llamada.
if (typeof window !== 'undefined') {
  window.SUPABASE_URL      = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  window.__SUPABASE_EDGE_BASE__ = SUPABASE_URL + '/functions/v1';
}

// ── Auto-refresh: detectar JWT expirado y refrescar sesión ───────────────────
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED') console.log('✅ JWT Refrescado');
  if (event === 'SIGNED_OUT') {
    // ✅ LIMPIEZA TOTAL DE CANALES AL SALIR
    if (window.RealtimeManager) window.RealtimeManager.unsubscribeAll();
    localStorage.removeItem('karpus_directora_state');
    localStorage.removeItem('karpus_maestra_state');
    localStorage.removeItem('karpus_padre_state');
    localStorage.removeItem('karpus_asistente_state');
    window.location.href = 'login.html';
  }
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    // Guardar rastro de última actividad
    if (session?.user) {
      // Usar then() en lugar de catch() directo sobre el builder para evitar TypeError
      supabase.from('profiles')
        .update({ last_sign_in_at: new Date().toISOString() })
        .eq('id', session.user.id)
        .then(({ error }) => {
          if (error) console.warn('[Auth] No se pudo actualizar last_sign_in_at:', error);
        });
    }
  }
});

// Interceptar errores 401 globalmente y refrescar token
// IMPORTANTE: usar promise-pending para COLA de espera (peticiones concurrentes)
let _refreshPromise = null;
let _redirectingToLogin = false;
const _originalFetch = window.fetch;

// RPC/tabla endpoints conocidos como opcionales (no desplegados en producción todavía).
// Las respuestas 404 de estos endpoints se suprimen del log para no confundir.
const _OPTIONAL_ENDPOINTS = [
  '/rpc/get_tasks_for_period',
  '/rpc/get_direct_message',
  '/rpc/get_student_history',
  '/rpc/get_unread_counts',
  '/rest/v1/posts',
  '/functions/v1/generate-invoice',
  '/functions/v1/process-event',
  '/functions/v1/send-push',
];

// Desregistrar SWs orfanados que puedan interceptar URLs malformadas en file://
if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
  const proto = (window.location.protocol || '').toLowerCase();
  const host = window.location.hostname;
  if (proto === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '') {
    navigator.serviceWorker.getRegistrations?.()
      .then((regs) => Promise.all(regs.map(r => r.unregister().catch(() => {}))))
      .catch(() => {});
  }
}

window.fetch = async function(...args) {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
  // Guard contra URLs malformadas tipo /C:/... (ruta Windows absoluta) — evitar 400 ruidoso
  if (typeof url === 'string' && url.length > 3) {
    const hasDrive = /^\/?[a-zA-Z]:[\\/]/.test(url) || /^\/[a-zA-Z]:\//.test(url);
    if (hasDrive) {
      console.warn('[supabase/fetch] Bloqueada URL con ruta de unidad malformada:', url);
      return new Response('', { status: 200, statusText: 'OK', headers: { 'Content-Type': 'text/plain' } });
    }
  }
  const isSupabase = url && url.includes(SUPABASE_URL);

  // ── Feedback empático en cargas lentas (peticiones Supabase > 3s) ──────────
  let slowTimer = null;
  let slowWarned = false;
  if (isSupabase) {
    slowTimer = setTimeout(() => {
      slowWarned = true;
      showOverlay({
        title: 'Estamos trabajando contigo...',
        message: 'Gracias por tu paciencia, la información está casi lista.',
        autoCloseMs: 8000
      });
    }, 3000);
  }

  const finishSlowTimer = () => {
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
    if (slowWarned) closeOverlay();
  };

  if (isSupabase) {
    const options = args[1] || {};
    options.headers = options.headers || {};
    
    // Siempre inyectar/ sobrescribir apikey (para Edge Functions, fetch directo y evitar valores stale)
    options.headers['apikey'] = SUPABASE_ANON_KEY;

    // ✅ OBTENER SIEMPRE token FRESCO y SOBRESCRIBIR header Authorization.
    // El SDK de Supabase a veces cachea headers con JWT vencido — esta línea lo corrige.
    let bearerToken = SUPABASE_ANON_KEY;
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        bearerToken = data.session.access_token;
      }
    } catch (_) { /* Sin sesión — usar anon como fallback */ }
    options.headers['Authorization'] = `Bearer ${bearerToken}`;

    args[1] = options;
  }

  const res = await _originalFetch.apply(this, args);
  finishSlowTimer();

  // Suppress 404 console noise for optional/not-yet-deployed RPC endpoints.
  // These are intentionally handled by fallback logic in the calling code.
  if (res.status === 404 && isSupabase && _OPTIONAL_ENDPOINTS.some(ep => url.includes(ep))) {
    // Return the 404 response as-is so calling code can handle it,
    // but we've already prevented it from appearing as an unhandled network error.
    return res;
  }

  // Interceptar 401: Sistema de COLA para peticiones concurrentes.
  // La primera que llega dispara el refresh, TODAS las demás ESPERAN en cola,
  // luego TODAS reintentan con el nuevo token (incluida la primera).
  if (res.status === 401 && isSupabase && !url.includes('/auth/v1/')) {
    console.warn('[supabase-js] 401 detectado en:', url.split('?')[0]);

    // —— Paso 1: Crear o reutilizar promesa de refresh compartida —— //
    if (!_refreshPromise) {
      _refreshPromise = (async () => {
        try {
          console.warn('[supabase-js] Refrescando sesión (única llamada concurrente)...');
          const { data: refreshed, error } = await supabase.auth.refreshSession();
          if (!error && refreshed?.session) {
            console.log('[supabase-js] ✅ Sesión refrescada. Todas las peticiones en cola reintentan.');
            return refreshed.session.access_token;
          }
          console.error('[supabase-js] ❌ Refresh falló:', error?.message || error);
          // Login redirect — solo UNA vez, flag para evitar múltiples location.assign
          if (!_redirectingToLogin) {
            _redirectingToLogin = true;
            try { await supabase.auth.signOut(); } catch (_) {}
            setTimeout(() => { window.location.href = 'login.html'; }, 150);
          }
          return null;
        } catch (e) {
          console.error('[supabase-js] ❌ Excepción en refresh:', e);
          if (!_redirectingToLogin) {
            _redirectingToLogin = true;
            try { await supabase.auth.signOut(); } catch (_) {}
            setTimeout(() => { window.location.href = 'login.html'; }, 150);
          }
          return null;
        }
      })().finally(() => {
        // Limpiar cache de refresh para el siguiente ciclo 401
        setTimeout(() => { _refreshPromise = null; }, 2000);
      });
    }

    // —— Paso 2: TODAS las peticiones esperan la promesa compartida —— //
    const newToken = await _refreshPromise;
    if (newToken) {
      // Clonar args para no mutar el original, inyectar NUEVO token y REINTENTAR
      const retryOptions = { ...(args[1] || {}), headers: { ...((args[1] || {}).headers || {}) } };
      retryOptions.headers['Authorization'] = `Bearer ${newToken}`;
      retryOptions.headers['apikey'] = SUPABASE_ANON_KEY;
      console.log('[supabase-js] ↻ Reintentando:', url.split('?')[0]);
      return _originalFetch.apply(this, [args[0], retryOptions]);
    }
    // Si newToken es null, falló el refresh. Devolver respuesta original 401.
  }
  return res;
};

// ── Global DB error handler — muestra toast automático en errores de DB ───────
window.addEventListener('karpus:db-error', (e) => {
  const msg = e.detail?.message || 'Error de conexión';
  if (window.Helpers?.toast) {
    window.Helpers.toast('Error: ' + msg, 'error');
  }
});

// ── Email error handler ───────────────────────────────────────────────────────
window.addEventListener('karpus:email-error', (e) => {
  const { message, to, subject } = e.detail || {};
  // Only show toast if Helpers is available (panels)
  if (window.Helpers?.toast) {
    window.Helpers.toast('⚠️ Correo no enviado: ' + (message || 'Error desconocido'), 'warning');
  }
  // Always log to console for debugging
});

// ── Global error → log to DB ─────────────────────────────────────────────────
window.addEventListener('error', (e) => {
  // Don't log if it's a network/connection error (would cause infinite loop)
  const msg = e.message || '';
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to load')) return;
  const panel = window.location.pathname.split('/').pop().replace('.html','') || 'unknown';
  logError(panel, msg, e.error?.stack || '', e.filename || '').catch(() => {});
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason);
  // Skip: network errors, OneSignal, 409 conflicts, IDB errors, lucide — these would loop or are non-actionable
  const SKIP_PATTERNS = [
    'indexeddb','network','fetch','onesignal','409','conflict',
    'failed to load','supabase','connection','lucide',
    'load failed','aborted','cancelled','net::err',
    'the operation was aborted','signal is aborted',
    'resizeobserver loop','script error'
  ];
  const skip = SKIP_PATTERNS.some(k => msg.toLowerCase().includes(k));
  if (skip) return;
  const panel = window.location.pathname.split('/').pop().replace('.html','') || 'unknown';
  logError(panel, msg, e.reason?.stack || '', window.location.pathname).catch(() => {});
});

export const TERMS_VERSION = '1.0';

// ── Session Guard — verificar sesión en cada cambio de sección ───────────────
// Llama esto desde los módulos de navegación para proteger rutas del cliente
export async function guardSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      window.location.href = 'login.html';
      return false;
    }
    // Verificar expiración del token
    const expiresAt = session.expires_at || 0;
    const nowSecs   = Math.floor(Date.now() / 1000);
    if (expiresAt - nowSecs < 30) {
      const { error } = await supabase.auth.refreshSession();
      if (error) { window.location.href = 'login.html'; return false; }
    }
    return true;
  } catch (_) {
    window.location.href = 'login.html';
    return false;
  }
}

// ⚡ Robustez Realtime: Manejo de WebSockets y reconexión
export const RealtimeUtils = {
  monitorChannel(channel, name = 'global') {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Canal "${name}" conectado.`);
      }
      if (status === 'CLOSED') {
        console.warn(`[Realtime] Canal "${name}" cerrado.`);
      }
      if (status === 'CHANNEL_ERROR') {
        console.error(`[Realtime] Error en canal "${name}". Reintentando...`);
        setTimeout(() => channel.subscribe(), 5000); // Reintento exponencial simple
      }
      if (status === 'TIMED_OUT') {
        console.warn(`[Realtime] Canal "${name}" tiempo agotado.`);
      }
    });
  }
};

/**
 * ensureRole: Verifica el rol del usuario actual y retorna {user, profile}
 */
// ── Autenticación ─────────────────────────────────────────────────────────────
export async function ensureRole(requiredRoles) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  
  // Paso 1: Verificar sesión local (rápido, sin red)
  let session;
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('session_timeout')), 5000))
    ]);
    session = result.data?.session;
    if (result.error || !session?.user) {
      window.location.href = 'login.html';
      return null;
    }
  } catch (_) {
    window.location.href = 'login.html';
    return null;
  }

  // Paso 2: Si el token está próximo a expirar (< 5 min), refrescarlo
  const expiresAt = session.expires_at || 0;
  const nowSecs   = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSecs < 300) {
    try {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshed?.session) {
        window.location.href = 'login.html';
        return null;
      }
      // Usar el token refrescado
      session = refreshed.session;
    } catch (_) {
      window.location.href = 'login.html';
      return null;
    }
  }

  // Paso 3: Validar token contra el servidor (detecta tokens revocados)
  // Solo si el token parece válido localmente pero queremos confirmar
  let user = session.user;
  try {
    const { data: { user: serverUser }, error: userErr } = await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getUser_timeout')), 4000))
    ]);
    if (userErr || !serverUser) {
      // Token inválido en el servidor — limpiar sesión y redirigir
      await supabase.auth.signOut();
      window.location.href = 'login.html';
      return null;
    }
    user = serverUser;
  } catch (_) {
    // Timeout de red — continuar con sesión local (mejor UX que redirigir)
  }

  // Obtener perfil y aceptación de términos en paralelo — con timeout de 8s
  const TIMEOUT = 8000;
  const withTimeout = (promise) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT))
  ]);

  const [profileRes, termsRes] = await Promise.all([
    withTimeout(supabase.from('profiles').select('id, role, name, email, avatar_url, phone, bio, is_temporary_password, notification_email').eq('id', user.id).maybeSingle()),
    withTimeout(supabase.from('terms_acceptance').select('user_id').eq('user_id', user.id).eq('terms_version', TERMS_VERSION).maybeSingle())
  ]).catch(() => [{ data: null, error: new Error('timeout') }, { data: null, error: new Error('timeout') }]);

  if (profileRes.error) { /* profile error — handled below */ }
  if (termsRes.error)   { /* terms error — handled below */ }

  const profile = profileRes.data;
  const terms   = termsRes.data;

  // 1. Si el perfil no existe, intentar crearlo automáticamente
  let resolvedProfile = profile;
  if (!profile && !profileRes.error) {
    const autoRole = user.user_metadata?.role || 'padre';
    // Only create profiles for known staff/parent roles
    const validRoles = ['directora','maestra','asistente','encargada','padre','admin'];
    const safeRole = validRoles.includes(autoRole) ? autoRole : 'padre';
    const { data: newProfile } = await supabase.from('profiles').insert({
      id:    user.id,
      email: user.email,
      name:  user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
      role:  safeRole,
      is_temporary_password: !!user.user_metadata?.is_temporary_password || false,
      notification_email: user.user_metadata?.notification_email || null
    }).select('id, role, name, email, avatar_url, phone, bio, is_temporary_password, notification_email').single();
    resolvedProfile = newProfile;
  }

  if (!resolvedProfile) {
    // No redirigir — dejar que el panel maneje el estado sin perfil
  }

  if (resolvedProfile && !roles.includes(resolvedProfile.role?.toLowerCase())) {
    // Admin can access any panel (they have their own panel_control.html)
    if (resolvedProfile.role?.toLowerCase() === 'admin') {
      window.location.href = 'panel_control.html';
      return null;
    }
    // Encargada can access either panel_encargada.html or panel_asistente.html
    if (resolvedProfile.role?.toLowerCase() === 'encargada') {
      const isAsistePanel = window.location.pathname.includes('panel_asistente');
      const isEncargadaPanel = window.location.pathname.includes('panel_encargada');
      if (!isAsistePanel && !isEncargadaPanel) {
        // Default to panel_encargada if not on either
        window.location.href = 'panel_encargada.html';
        return null;
      }
      // Allow encargada to use either panel
    } else {
      await supabase.auth.signOut();
      window.location.href = 'login.html?error=role';
      return null;
    }
  }

  // 2. Verificar aceptación de términos (solo si es panel real, no login)
  // Si termsRes.error existe (ej: tabla no existe), permitimos pasar para no bloquear la app
  if (!terms && !termsRes.error && !window.location.pathname.includes('login.html')) {
    window.location.href = 'login.html?reason=terms';
    return null;
  }

  return { user, profile: resolvedProfile };
}

// ── Notificaciones internas (realtime) ────────────────────────────────────────
export async function subscribeNotifications(userId, onNotif) {
  if (!userId) return null;
  return supabase.channel('notif_' + userId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + userId }, (payload) => {
      if (onNotif) onNotif(payload.new);
    })
    .subscribe();
}

// ── Email via Resend (Edge Function send-email) ───────────────────────────────
export async function sendEmail(to, subject, html, text) {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { to, subject, html, text }
    });

    if (error) {
      // Log to console so it's visible in browser devtools
      const errMsg = error?.message || JSON.stringify(error);
      window.dispatchEvent(new CustomEvent('karpus:email-error', {
        detail: { message: errMsg, to, subject }
      }));
      return null;
    }

    if (data?.error) {
      window.dispatchEvent(new CustomEvent('karpus:email-error', {
        detail: { message: data.error, to, subject }
      }));
      return null;
    }

    return data;
  } catch (e) {
    window.dispatchEvent(new CustomEvent('karpus:email-error', {
      detail: { message: e?.message || String(e), to, subject }
    }));
    return null;
  }
}



// ── Push via OneSignal (Edge Function send-push) ──────────────────────────────
export async function sendPush(payload) {
  try {
    // Verificar si hay sesión activa antes de invocar
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) return null; // Sin sesión → no invocar Edge Function

    const { data, error } = await supabase.functions.invoke('send-push', {
      body: payload
    });

    if (error) {
      // CORS/preflight errors son esperados en GitHub Pages — ignorar silenciosamente
      return null;
    }
    return data;
  } catch (e) {
    // CORS, network error, o Edge Function no desplegada → silencioso
    return null;
  }
}

// ── Eventos del sistema (process-event) ──────────────────────────────────────
export async function emitEvent(type, data) {
  try {
    // Verificar sesión antes de llamar a Edge Function
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) return null;

    const { data: resData, error } = await supabase.functions.invoke('process-event', {
      body: { type, data }
    });
    
    if (error) {
      // CORS/preflight errors son esperados en GitHub Pages — ignorar silenciosamente
      return null;
    }
    
    return resData;
  } catch (e) {
    // CORS, network error, o Edge Function no desplegada → silencioso
    return null;
  }
}

// ── Helpers de eventos específicos ───────────────────────────────────────────

/** Notificar pago aprobado al padre */
export async function notifyPaymentApproved(paymentId, parentEmail, studentName, amount, month) {
  return Promise.all([
    // sendPush needs parent UUID — fetch it from the payment record
    (async () => {
      try {
        const { data: p } = await supabase
          .from('payments')
          .select('students:student_id(parent_id)')
          .eq('id', paymentId)
          .maybeSingle();
        const parentId = p?.students?.parent_id;
        if (parentId) {
          return sendPush({ user_id: parentId, title: 'Pago Aprobado ✅', message: 'Tu pago de ' + amount + ' para ' + month + ' fue aprobado.', type: 'payment', link: '/panel_padres.html' });
        }
      } catch (_) {}
    })(),
    emitEvent('payment.approved', { payment_id: paymentId, parent_email: parentEmail, student_name: studentName, amount, month })
  ]);
}

/** Notificar entrada/salida al padre */
export async function notifyAttendance(parentEmail, studentName, type, time) {
  return emitEvent('attendance.' + type, { parent_email: parentEmail, student_name: studentName, time });
}

/** Notificar incidente al padre */
export async function notifyIncident(parentEmail, studentName, severity, description) {
  return emitEvent('incident.reported', { parent_email: parentEmail, student_name: studentName, severity, description });
}

/** Notificar nueva tarea a los padres del aula */
export async function notifyTaskCreated(classroomId, title, dueDate) {
  return emitEvent('task.created', { classroom_id: classroomId, title, due_date: dueDate });
}

/** Notificar comprobante subido al staff */
export async function notifyReceiptUploaded(studentId, amount, month) {
  return emitEvent('payment.receipt_uploaded', { student_id: studentId, amount, month });
}

// ── OneSignal ─────────────────────────────────────────────────────────────────
export function initOneSignal(currentUser = null) {
  _initOneSignalAsync(currentUser).catch(() => {});
}

// Reintento exponencial seguro para OneSignal.login().
// El SDK v16 emite "Log.ts:33 SetAlias failed: <uuid>" cuando intenta llamar
// /players antes de que el usuario se haya suscrito al push realmente.
// Para evitar esos 404, esperamos hasta que exista PushSubscription.id
// (o un timeout máximo razonable), y luego reintentamos login con backoff.
function _osLoginWithBackoff(OneSignal, userId, maxWaitMs = 60_000) {
  const START = Date.now();
  const _try = (delayMs) => {
    try {
      const subId = OneSignal.User?.PushSubscription?.id;
      if (subId) {
        const p = OneSignal.login(String(userId));
        if (p && typeof p.catch === 'function') p.catch(() => {});
        return;
      }
    } catch (_) {}
    if (Date.now() - START >= maxWaitMs) return;
    // También nos apoyamos en el evento change de la suscripción (si existe API)
    setTimeout(() => _try(Math.min(5_000, delayMs * 2)), delayMs);
  };
  _try(1_500);
}

async function _initOneSignalAsync(currentUser) {
  try {
    // ✅ Paso 0: Detectar Tracking Prevention (Edge ITP / Safari WebKit ITP).
    //    Si el storage 3rd-party está BLOQUEADO, OneSignal falla al intentar
    //    acceder a localStorage/cookies del dominio cdn.onesignal.com y
    //    emite advertencias ruidosas en consola — ABORTAMOS TEMPRANO.
    const host = window.location.hostname;
    const isProd = host === 'montessorisonrisascreativas.com'
                || host === 'www.montessorisonrisascreativas.com'
                || host.endsWith('.montessorisonrisascreativas.com');
    if (!isProd) return;

    // Check rápido de disponibilidad de 3rd-party storage sin side-effects.
    // Safari ITP/Edge bloquean document.cookie y localStorage si el dominio
    // no fue visitado directamente; en ese caso nos saltamos OneSignal.
    try {
      const PROBE = '__karpus_os_probe__';
      const canAccessCookie = (() => {
        try {
          document.cookie = PROBE + '=1; SameSite=None; Secure';
          const ok = document.cookie.includes(PROBE);
          // Limpiar sonda
          document.cookie = PROBE + '=; SameSite=None; Secure; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          return ok;
        } catch (_) { return false; }
      })();
      if (!canAccessCookie) {
        console.warn('[OneSignal] ⚠️ 3rd-party storage bloqueado (Tracking Prevention).'
          + ' OneSignal no se inicializará en esta sesión. Push notifications desactivadas.');
        return;
      }
    } catch (_) { /* continuar sin abortar */ }

    if (window.OneSignalInitialized) return;
    window.OneSignalInitialized = true;

    let user = currentUser;
    if (!user) {
      const { data } = await supabase.auth.getUser();
      user = data?.user;
    }
    if (!user) return;

    const idbOk = await Promise.race([
      new Promise(resolve => {
        try {
          if (!window.indexedDB) return resolve(false);
          const req = indexedDB.open('_karpus_idb_test', 1);
          req.onsuccess = () => { try { req.result.close(); } catch(_){} resolve(true); };
          req.onerror   = () => resolve(false);
        } catch (_) { resolve(false); }
      }),
      new Promise(resolve => setTimeout(() => resolve(false), 500))
    ]);
    if (!idbOk) return;

    const ONESIGNAL_APP_ID = "47ce2d1e-152e-4ea7-9ddc-8e2142992989";

    if (!document.getElementById('onesignal-sdk')) {
      const s = document.createElement('script');
      s.id = 'onesignal-sdk';
      s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      s.defer = true;
      document.head.appendChild(s);
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: false,
          serviceWorkerPath: '/push/onesignal/OneSignalSDKWorker.js',
          serviceWorkerParam: { scope: '/push/onesignal/' },
          notifyButton: { enable: false },
          welcomeNotification: { disable: false }
        });

        // IMPORTANTE: NO llamamos OneSignal.login() directamente aquí.
        // Hasta que la suscripción no exista, login emite un HTTP 404 ("SetAlias failed")
        // porque el player aún no fue creado en los servidores de OneSignal.
        if (user?.id) {
          // 1) Escuchar cambio de suscripción (primer usuario que acepta push)
          try {
            if (typeof OneSignal.User?.PushSubscription?.addEventListener === 'function') {
              OneSignal.User.PushSubscription.addEventListener('change', () => {
                try {
                  if (OneSignal.User.PushSubscription.id) {
                    const p = OneSignal.login(String(user.id));
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                  }
                } catch (_) {}
              });
            }
          } catch (_) {}
          // 2) Login lazy con backoff: cubre usuarios que YA tienen suscripción activa
          //    de sesiones anteriores (el evento change no se dispara en esta carga).
          _osLoginWithBackoff(OneSignal, user.id);
        }

        // Guardar subscription ID cuando esté disponible
        setTimeout(async () => {
          try {
            const subId = OneSignal.User?.PushSubscription?.id;
            if (subId) {
              await supabase.from('profiles').update({ onesignal_player_id: subId }).eq('id', user.id).catch(() => {});
            }
          } catch (_) {}
        }, 4_000);

        // Y también cuando cambie la suscripción (refresh token / re-suscripción)
        try {
          if (typeof OneSignal.User?.PushSubscription?.addEventListener === 'function') {
            OneSignal.User.PushSubscription.addEventListener('change', async () => {
              try {
                const subId = OneSignal.User?.PushSubscription?.id;
                if (subId) {
                  await supabase.from('profiles').update({ onesignal_player_id: subId }).eq('id', user.id).catch(() => {});
                }
              } catch (_) {}
            });
          }
        } catch (_) {}

      } catch (_) {}
    });
  } catch (_) {}
}

/* ════════════════════════════════════════════════════════════════
   🔥 FALLBACK POSTGREST DIRECTO (último recurso)
   Cuando el SDK de Supabase SDK falla con 401/403/42501 a pesar
   del fetch-interceptor, usamos fetch() NATIVO hacia /rest/v1/
   inyectando apikey + Authorization manualmente.
   ════════════════════════════════════════════════════════════════ */

/**
 * Obtener token + apikey siempre frescos (sin pasar por SDK cache).
 * @returns {{apikey:string, authorization:string, baseUrl:string}}
 */
export async function getRestCredentials() {
  let accessToken = SUPABASE_ANON_KEY;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) accessToken = data.session.access_token;
  } catch (_) { /* Sin sesión, usamos anon */ }
  return {
    apikey:         SUPABASE_ANON_KEY,
    authorization:  `Bearer ${accessToken}`,
    baseUrl:        `${SUPABASE_URL}/rest/v1`,
  };
}

/**
 * Realiza un SELECT directo por PostgREST (bypassea el SDK completamente).
 * Equivalente a: supabase.from(table).select(selectStr).match(filters).order(orderCol,...).limit(n)
 *
 * @param {string} table    - Nombre de la tabla (ej: 'students')
 * @param {object} opts     - { select, filters?: {k:v}, order?: {column, ascending?}, limit?, gte?: {k,v}, lte?: {k,v}, not?: {k,op,v}, is?: {k,v}, in?: {k,[]} }
 * @param {*}      fallback - Valor si falla todo (default: [])
 * @returns {Promise<any[]>}
 */
export async function fetchPostgREST(table, opts = {}, fallback = []) {
  try {
    const { apikey, authorization, baseUrl } = await getRestCredentials();

    // Construir query string (PostgREST syntax)
    const parts = [];
    if (opts.select)  parts.push(`select=${encodeURIComponent(opts.select)}`);

    const addFilter = (key, op, value) => {
      const v = value === null ? 'null' : encodeURIComponent(String(value));
      parts.push(`${encodeURIComponent(key)}=${op}.${v}`);
    };

    if (opts.filters) {
      for (const [k, v] of Object.entries(opts.filters)) addFilter(k, 'eq', v);
    }
    if (opts.is) {
      for (const [k, v] of Object.entries(opts.is)) {
        parts.push(`${encodeURIComponent(k)}=is.${v === null ? 'null' : (v ? 'true' : 'false')}`);
      }
    }
    if (opts.in) {
      for (const [k, arr] of Object.entries(opts.in)) {
        const list = (arr || []).map(x => String(x)).map(encodeURIComponent).join(',');
        parts.push(`${encodeURIComponent(k)}=in.(${list})`);
      }
    }
    if (opts.gte) { for (const [k, v] of Object.entries(opts.gte)) addFilter(k, 'gte', v); }
    if (opts.lte) { for (const [k, v] of Object.entries(opts.lte)) addFilter(k, 'lte', v); }
    if (opts.not) {
      for (const [k, spec] of Object.entries(opts.not)) {
        if (spec && typeof spec === 'object') {
          const [op, v] = Object.entries(spec)[0] || [];
          if (op) addFilter(k, `not.${op}`, v);
        }
      }
    }
    if (opts.order) {
      const col = encodeURIComponent(opts.order.column);
      const asc = opts.order.ascending === false ? 'desc' : 'asc';
      const nulls = opts.order.nullsFirst ? 'nullsfirst' : 'nullslast';
      parts.push(`order=${col}.${asc}.${nulls}`);
    }
    if (typeof opts.limit === 'number') parts.push(`limit=${opts.limit}`);

    const qs = parts.length ? `?${parts.join('&')}` : '';
    const url = `${baseUrl}/${encodeURIComponent(table)}${qs}`;

    const resp = await _originalFetch(url, {
      method: 'GET',
      headers: {
        'apikey':          apikey,
        'Authorization':   authorization,
        'Accept':          'application/json',
        'Accept-Profile':  'public',
        'Content-Type':    'application/json',
        'Range':           opts.limit ? `0-${opts.limit - 1}` : '0-999999',
      },
    });

    if (!resp.ok) {
      console.warn(`[fetchPostgREST] ${table} respondió ${resp.status}`, url.split('?')[0]);
      return fallback;
    }
    const json = await resp.json();
    return Array.isArray(json) ? json : fallback;
  } catch (e) {
    console.warn(`[fetchPostgREST] Excepción en tabla "${table}":`, e?.message || e);
    return fallback;
  }
}

/**
 * Último recurso: Forzar refresh de sesión + devolver token nuevo.
 * @returns {string|null} Nuevo access_token o null si falló.
 */
export async function forceRefreshToken() {
  try {
    // Limpiar cache interna para forzar petición real
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data?.session?.access_token) {
      return data.session.access_token;
    }
    return null;
  } catch (_) {
    return null;
  }
}
