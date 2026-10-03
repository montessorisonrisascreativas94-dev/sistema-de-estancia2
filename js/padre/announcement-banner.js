import { supabase } from '../shared/supabase.js';
import { escapeHtml } from '../shared/helpers.js';
import { NotifyPermission } from '../shared/notify-permission.js';

const STYLE_ID = 'pabStyles';
const ROOT_ID = 'pabRoot';
const HOME_BANNER_ID = 'homeGeneralBanner';
const DISMISS_KEY = 'pab_dismissed';
const TIPS_LAST_KEY = 'pab_tip_idx';
const DEFAULT_SETTINGS = {
  check_in_start: '07:30',
  check_in_end: '08:30',
  check_out_start: '16:00',
  check_out_end: '17:30',
};

/** Tips educativos rotativos — mensajes de "conexion emocional" al padre. */
const EDU_TIPS = [
  { minAge: 1,  maxAge: 3,  tip: 'Entre los 1 y 3 años el cerebro multiplica sus conexiones neuronales. Hablarle despacio, con frases cortas y mirándole a los ojos, mejora su comprensión del lenguaje hasta un 40%.' },
  { minAge: 1,  maxAge: 5,  tip: 'El juego simbólico (jugar a "ser" papá/mamá, maestro/a, medico/a) a los 2-5 años desarrolla la empatía: tu hijo aprende a ponerse en el lugar del otro.' },
  { minAge: 3,  maxAge: 6,  tip: 'A los 3-6 años, 15 minutos de lectura compartida al día duplican el vocabulario activo del niño antes de entrar a primaria. No importa releer el mismo cuento: la repetición le da seguridad.' },
  { minAge: 4,  maxAge: 7,  tip: 'Sabías que los niños de 4 a 7 años que manipulan objetos (bloques, plastilina, puzzles) antes de aprender sumas, desarrollan mejor el razonamiento espacial y abstracto? Es la base de las matemáticas futuras.' },
  { minAge: 5,  maxAge: 8,  tip: 'Entre los 5-8 años, las rutinas consistentes (hora de dormir, cena, baño, lectura) reducen la ansiedad en un 35% y mejoran la atención en clase el día siguiente.' },
  { minAge: 6,  maxAge: 12, tip: 'A partir de los 6 años, darle al niño una pequeña responsabilidad diaria (regar una planta, poner la mesa, ordenar sus libros) aumenta su autoestima: aprende que "cuento" para el grupo familiar.' },
  { minAge: 2,  maxAge: 99, tip: 'Un abrazo de 10 segundos después del colegio libera oxitocina: reduce el estrés del día, mejora su sueño y refuerza el vínculo seguro que él necesita para explorar el mundo sin miedo.' },
  { minAge: 1,  maxAge: 99, tip: '¿Por qué repetimos las mismas canciones y juegos en Montessori? Porque la repetición crea "huellas" en el cerebro: así tu hijo consolida destrezas hasta que las domina por completo. ¡No es aburrimiento, es maestría!' },
  { minAge: 1,  maxAge: 99, tip: 'Cada vez que le preguntas "¿cómo te has sentido hoy?" y escuchas sin interrumpir, estás entrenando su inteligencia emocional. Los niños que nombran sus emociones se frustran menos.' },
  { minAge: 1,  maxAge: 99, tip: 'El error es información, no fracaso. En Montessori celebramos el "casi lo consigo": los niños que escuchan "¡vamos a intentarlo de otro modo!" desarrollan una mentalidad de crecimiento.' },
  { minAge: 3,  maxAge: 99, tip: 'El aburrimiento constructivo es bueno. Dejar espacios sin pantallas ni juguetes planeados hace que tu hijo desarrolle creatividad e imaginación: él inventa su propio juego.' },
  { minAge: 1,  maxAge: 99, tip: 'Tu estado emocional es su primer termómetro. Si tú llegas tranquilo/a al recogerle, él interpreta "mundo seguro". Si vas con prisas, él percibe "mundo inquieto". Respira hondo 3 veces antes de entrar: él lo nota.' },
];

/** Tipos que se consideran "anuncio" dentro del banner */
const ANNOUNCEMENT_TYPES = [
  'announcement', 'post', 'muro', 'alert', 'task', 'homework',
  'attendance', 'event', 'info', 'message', 'grade', 'payment', 'live'
];

const ICONS = {
  announcement: '\u{1F4E2}', post: '\u{1F4E3}', muro: '\u{1F4E3}', alert: '\u26A0\uFE0F',
  task: '\u{1F4DA}', homework: '\u{1F4DA}', attendance: '\u{1F4CB}', event: '\u{1F4C5}',
  info: '\u2139\uFE0F', message: '\u{1F4AC}', grade: '\u2B50', payment: '\u{1F4B5}', live: '\u{1F534}',
};

/** (mantener el STYLE del banner flotante — no lo toco) */
const CSS = `
#${ROOT_ID} { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 1400; width: min(680px, calc(100vw - 24px)); font-family: inherit; }
#${ROOT_ID} .pab-card { background: #fff; border: 2px solid #E2E8F0; border-radius: 22px; box-shadow: 0 18px 40px -18px rgba(15, 23, 42, .38); overflow: hidden; animation: pab-in .32s cubic-bezier(.2,.9,.3,1); }
@keyframes pab-in { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: translateY(0); } }
#${ROOT_ID} .pab-head { display: flex; align-items: center; gap: .7rem; padding: .8rem 1rem; background: linear-gradient(90deg, #0B63C7, #7C3AED); color: #fff; }
#${ROOT_ID} .pab-head-ico { width: 2.1rem; height: 2.1rem; border-radius: .8rem; background: rgba(255,255,255,.22); display: flex; align-items: center; justify-content: center; font-size: 1.05rem; flex: 0 0 auto; }
#${ROOT_ID} .pab-head-txt { min-width: 0; flex: 1; }
#${ROOT_ID} .pab-head-title { font-size: .78rem; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
#${ROOT_ID} .pab-head-sub { font-size: .64rem; font-weight: 700; opacity: .85; }
#${ROOT_ID} .pab-btn { background: rgba(255,255,255,.2); color: #fff; border: 0; border-radius: .7rem; padding: .35rem .6rem; font-size: .62rem; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; cursor: pointer; }
#${ROOT_ID} .pab-btn:hover { background: rgba(255,255,255,.34); }
#${ROOT_ID} .pab-body { padding: .85rem 1rem 1rem; display: none; }
#${ROOT_ID}.pab-open .pab-body { display: block; }
#${ROOT_ID} .pab-warn { display: flex; align-items: flex-start; gap: .6rem; background: #FFFBEB; border: 1px solid #FDE68A; color: #92400E; border-radius: 14px; padding: .6rem .7rem; font-size: .68rem; font-weight: 700; line-height: 1.45; margin-bottom: .75rem; }
#${ROOT_ID} .pab-warn button { margin-left: auto; flex: 0 0 auto; background: #F59E0B; color: #fff; border: 0; border-radius: .6rem; padding: .3rem .55rem; font-size: .6rem; font-weight: 900; text-transform: uppercase; cursor: pointer; }
#${ROOT_ID} .pab-alert { display: flex; align-items: center; gap: .6rem; border-radius: 14px; padding: .65rem .75rem; font-size: .74rem; font-weight: 900; line-height: 1.35; margin-bottom: .7rem; }
#${ROOT_ID} .pab-alert--go { background: #ECFDF5; border: 1px solid #6EE7B7; color: #065F46; }
#${ROOT_ID} .pab-alert--wait { background: #EFF6FF; border: 1px solid #BFDBFE; color: #1E40AF; }
#${ROOT_ID} .pab-alert--done { background: #F1F5F9; border: 1px solid #E2E8F0; color: #475569; }
#${ROOT_ID} .pab-alert span.pab-clock { margin-left: auto; font-variant-numeric: tabular-nums; opacity: .8; font-size: .68rem; }
#${ROOT_ID} .pab-times { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: .5rem; margin-bottom: .75rem; }
#${ROOT_ID} .pab-time { border-radius: 14px; padding: .55rem .6rem; border: 1px solid #E2E8F0; background: #F8FAFC; }
#${ROOT_ID} .pab-time-k { display: block; font-size: .54rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: #94A3B8; }
#${ROOT_ID} .pab-time-v { display: block; font-size: .95rem; font-weight: 900; color: #0F172A; font-variant-numeric: tabular-nums; }
#${ROOT_ID} .pab-time--in  { background: #F0FDF4; border-color: #BBF7D0; }
#${ROOT_ID} .pab-time--in  .pab-time-v { color: #15803D; }
#${ROOT_ID} .pab-time--out { background: #EEF2FF; border-color: #C7D2FE; }
#${ROOT_ID} .pab-time--out .pab-time-v { color: #4338CA; }
#${ROOT_ID} .pab-note { font-size: .64rem; font-weight: 700; color: #64748B; line-height: 1.45; }
#${ROOT_ID} .pab-list { display: flex; flex-direction: column; gap: .4rem; margin-top: .5rem; }
#${ROOT_ID} .pab-item { display: flex; gap: .55rem; align-items: flex-start; padding: .5rem .6rem; border-radius: 12px; border: 1px solid #E2E8F0; background: #fff; }
#${ROOT_ID} .pab-item.pab-unread { border-color: #BFDBFE; background: #F5F9FF; }
#${ROOT_ID} .pab-item-ico { width: 1.6rem; height: 1.6rem; border-radius: .6rem; display: flex; align-items: center; justify-content: center; font-size: .8rem; flex: 0 0 auto; background: #EFF6FF; }
#${ROOT_ID} .pab-item-main { min-width: 0; flex: 1; }
#${ROOT_ID} .pab-item-t { font-size: .72rem; font-weight: 900; color: #0F172A; line-height: 1.3; }
#${ROOT_ID} .pab-item-m { font-size: .64rem; font-weight: 600; color: #64748B; line-height: 1.4; margin-top: .1rem; }
#${ROOT_ID} .pab-item-time { font-size: .56rem; font-weight: 800; color: #94A3B8; white-space: nowrap; }
#${ROOT_ID} .pab-empty { font-size: .66rem; font-weight: 700; color: #94A3B8; text-align: center; padding: .6rem 0; }
@media (max-width: 520px) {
  #${ROOT_ID} .pab-times { grid-template-columns: 1fr; }
  #${ROOT_ID} .pab-warn { flex-wrap: wrap; }
}
@media print { #${ROOT_ID} { display: none !important; } }

/* ───────────────────────────────────────────────────────────────────────
   BANNER GENERAL DINAMICO DEL HOME (no flotante, dentro de #home)
   ─────────────────────────────────────────────────────────────────────── */
#${HOME_BANNER_ID} * { box-sizing: border-box; }
#${HOME_BANNER_ID} .pab-hb { display: flex; flex-direction: column; background: #ffffff; }

/* Cada "cinta" o tarjeta interna */
#${HOME_BANNER_ID} .pab-hb-stack {
  display: flex; align-items: center; gap: .9rem;
  padding: 1.1rem 1.25rem; position: relative; border-bottom: 1px solid rgba(15,23,42,.06);
}
#${HOME_BANNER_ID} .pab-hb-stack:last-child { border-bottom: 0; }

/* ── CINTA 1: saludo y estado de asistencia (gradiente azul→morado) ── */
#${HOME_BANNER_ID} .pab-hb-greet {
  background: linear-gradient(120deg,#0B63C7 0%, #2563EB 45%, #7C3AED 100%);
  color: #fff;
}
#${HOME_BANNER_ID} .pab-hb-greet-left { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: .35rem; }
#${HOME_BANNER_ID} .pab-hb-time { font-size: 1rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.01em; }
#${HOME_BANNER_ID} .pab-hb-status {
  display: flex; align-items: flex-start; gap: .25rem;
  font-size: .82rem; font-weight: 600; line-height: 1.45; opacity: .96;
}
#${HOME_BANNER_ID} .pab-hb-window {
  display: grid; grid-template-columns: 1fr 1fr; gap: .55rem; flex: 0 0 auto; width: 13rem;
}
#${HOME_BANNER_ID} .pab-hb-win {
  background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.25);
  border-radius: .85rem; padding: .45rem .65rem;
  backdrop-filter: blur(4px);
  display: flex; flex-direction: column; gap: .1rem;
}
#${HOME_BANNER_ID} .pab-hb-win--in  { background: rgba(34,197,94,.22); border-color: rgba(134,239,172,.45); }
#${HOME_BANNER_ID} .pab-hb-win--out { background: rgba(139,92,246,.22); border-color: rgba(196,181,253,.45); }
#${HOME_BANNER_ID} .pab-hb-k { font-size: .58rem; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; opacity: .88; }
#${HOME_BANNER_ID} .pab-hb-v { font-size: .82rem; font-weight: 900; font-variant-numeric: tabular-nums; }

/* ── CINTA 2: fase del día (llevar / recoger) ── */
#${HOME_BANNER_ID} .pab-hb-phase { background: #FFFFFF; }
#${HOME_BANNER_ID} .pab-hb-phase-ico {
  width: 2.6rem; height: 2.6rem; border-radius: 1rem; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center; font-size: 1.25rem;
}
#${HOME_BANNER_ID} .pab-hb-phase--dropoff {
  background: linear-gradient(120deg,#ECFDF5 0%, #F0FDF4 100%);
}
#${HOME_BANNER_ID} .pab-hb-phase--dropoff .pab-hb-phase-ico { background: #86EFAC; }
#${HOME_BANNER_ID} .pab-hb-phase--pickup {
  background: linear-gradient(120deg,#FFF7ED 0%, #FEF3C7 100%);
}
#${HOME_BANNER_ID} .pab-hb-phase--pickup  .pab-hb-phase-ico { background: #FDBA74; }
#${HOME_BANNER_ID} .pab-hb-phase-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .18rem; }
#${HOME_BANNER_ID} .pab-hb-phase-title { font-size: .98rem; font-weight: 900; line-height: 1.2; color: #0F172A; }
#${HOME_BANNER_ID} .pab-hb-phase-sub { font-size: .8rem; font-weight: 600; color: #475569; line-height: 1.45; }

/* ── CINTA 3: push NO activado ── */
#${HOME_BANNER_ID} .pab-hb-push {
  background: linear-gradient(120deg, #EFF6FF 0%, #F5F3FF 100%);
  border-left: 4px solid #6366F1;
}
#${HOME_BANNER_ID} .pab-hb-push-ico {
  width: 2.6rem; height: 2.6rem; border-radius: 1rem; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
  background: #C7D2FE;
}
#${HOME_BANNER_ID} .pab-hb-push-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .25rem; }
#${HOME_BANNER_ID} .pab-hb-push-title { font-size: .95rem; font-weight: 900; line-height: 1.2; color: #0F172A; }
#${HOME_BANNER_ID} .pab-hb-push-sub   { font-size: .78rem; font-weight: 600; color: #475569; line-height: 1.5; }
#${HOME_BANNER_ID} .pab-hb-push-btn {
  flex: 0 0 auto; min-width: 8rem;
  background: #4F46E5; color: #fff;
  border: 0; border-radius: .85rem;
  padding: .65rem 1rem;
  font-size: .78rem; font-weight: 900; letter-spacing: .02em;
  cursor: pointer; white-space: nowrap;
  box-shadow: 0 10px 22px -10px rgba(79,70,229,.65);
  transition: transform .08s ease, background .12s ease;
}
#${HOME_BANNER_ID} .pab-hb-push-btn:hover:not([disabled]) { background: #4338CA; }
#${HOME_BANNER_ID} .pab-hb-push-btn:active:not([disabled]) { transform: translateY(1px) scale(.98); }
#${HOME_BANNER_ID} .pab-hb-push-btn[disabled] { background: #94A3B8; cursor: not-allowed; box-shadow: none; }

/* ── CINTA 4: anuncio destacado ── */
#${HOME_BANNER_ID} .pab-hb-ann { background: #ffffff; }
#${HOME_BANNER_ID} .pab-hb-ann-ico {
  width: 2.6rem; height: 2.6rem; border-radius: 1rem; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center; font-size: 1.15rem;
  background: #FEF3C7;
}
#${HOME_BANNER_ID} .pab-hb-ann-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .2rem; }
#${HOME_BANNER_ID} .pab-hb-ann-title { font-size: .92rem; font-weight: 900; line-height: 1.25; color: #0F172A; }
#${HOME_BANNER_ID} .pab-hb-ann-sub   { font-size: .78rem; font-weight: 600; color: #475569; line-height: 1.5; }
#${HOME_BANNER_ID} .pab-hb-ann-time  {
  flex: 0 0 auto; font-size: .68rem; font-weight: 800; color: #64748B;
  background: #F1F5F9; border-radius: .6rem; padding: .25rem .5rem;
}

/* ── CINTA 5: tip "Sabias que..." ── */
#${HOME_BANNER_ID} .pab-hb-tip {
  background: linear-gradient(120deg, #FDF2F8 0%, #F0F9FF 55%, #F5F3FF 100%);
}
#${HOME_BANNER_ID} .pab-hb-tip-ico {
  width: 2.6rem; height: 2.6rem; border-radius: 1rem; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center; font-size: 1.25rem;
  background: #FBCFE8;
}
#${HOME_BANNER_ID} .pab-hb-tip-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .55rem; }
#${HOME_BANNER_ID} .pab-hb-tip-head { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; }
#${HOME_BANNER_ID} .pab-hb-tip-title { font-size: .95rem; font-weight: 900; line-height: 1.2; color: #831843; }
#${HOME_BANNER_ID} .pab-hb-tip-tag {
  font-size: .68rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase;
  background: rgba(131,24,67,.12); color: #831843; border-radius: .55rem; padding: .25rem .55rem;
}
#${HOME_BANNER_ID} .pab-hb-tip-body {
  font-size: .83rem; font-weight: 600; color: #334155; line-height: 1.6;
}

/* Responsive home banner: móvil */
@media (max-width: 640px) {
  #${HOME_BANNER_ID} .pab-hb-stack { padding: 1rem; gap: .75rem; }
  #${HOME_BANNER_ID} .pab-hb-greet,
  #${HOME_BANNER_ID} .pab-hb-phase,
  #${HOME_BANNER_ID} .pab-hb-push {
    flex-direction: column; align-items: flex-start;
  }
  #${HOME_BANNER_ID} .pab-hb-window { width: 100%; grid-template-columns: 1fr 1fr; }
  #${HOME_BANNER_ID} .pab-hb-push-btn { width: 100%; }
  #${HOME_BANNER_ID} .pab-hb-ann { flex-direction: column; align-items: flex-start; }
  #${HOME_BANNER_ID} .pab-hb-ann-time { align-self: flex-end; }
  #${HOME_BANNER_ID} .pab-hb-tip { flex-direction: column; align-items: flex-start; }
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function dateStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "08:30:00" | "08:30" -> minutos desde medianoche */
function toMinutes(value, fallback) {
  if (!value) return fallback;
  const m = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  return (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
}

function nowMinutes() {
  const d = new Date();
  return (d.getHours() * 60) + d.getMinutes();
}

function fmtClock(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return '';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} d`;
}

export const AnnouncementBanner = {
  _parentId: null,
  _studentId: null,
  _studentName: '',
  _channel: null,
  _items: [],
  _settings: { ...DEFAULT_SETTINGS },
  _attendance: null,
  _lastSeenId: null,

  /** ¿El padre tiene notificaciones push activadas? */
  _pushEnabled() {
    if (NotifyPermission.isGranted()) {
      // Si OneSignal está disponible y el usuario hizo opt-out explícito, respetar
      const optIn = window.OneSignal?.User?.PushSubscription;
      if (optIn && optIn.optedIn === false) return false;
      return true;
    }
    return false;
  },

  _dismissed() {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (_) { return false; }
  },

  _markDismissed() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
  },

  _markAllRead() {
    const unread = this._items.filter(i => !i.is_read).map(i => i.id);
    if (!unread.length) return;
    this._items.forEach(i => { if (unread.includes(i.id)) i.is_read = true; });
    this._render();
    supabase.from('notifications').update({ is_read: true }).in('id', unread).then(() => {
      try { window.UnreadMessages?.refresh(); } catch (_) {}
    });
  },

  async init({ parentId, studentId, studentName }) {
    if (!parentId) return;
    injectStyle();
    this._parentId = parentId;
    this._studentId = studentId || null;
    this._studentName = studentName || 'tu hijo(a)';

    this._buildDOM();
    await this.refresh();
    this._subscribe();

    // Refresca la cuenta regresiva cada minuto
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      if (this._attendance) {
        this._render();
        this._renderHomeBanner();
      }
    }, 60000);
  },

  /** Cambia de hijo sin recrear todo el banner (selector de estudiantes) */
  async rebind({ parentId, studentId, studentName }) {
    if (parentId && parentId !== this._parentId) this._parentId = parentId;
    if (!this._parentId) return;
    this._studentId = studentId ?? this._studentId;
    this._studentName = studentName || this._studentName;

    // Recrear la suscripción realtime para el nuevo student_id
    if (this._channel) {
      try { await supabase.removeChannel(this._channel); } catch (_) {}
      this._channel = null;
    }
    try { sessionStorage.removeItem(DISMISS_KEY); } catch (_) {}

    if (!document.getElementById(ROOT_ID)) this._buildDOM();
    await this.refresh();
    this._subscribe();
  },

  async refresh() {
    if (!this._parentId) return;
    await Promise.all([
      this._loadSettings(),
      this._loadAttendance(),
      this._loadNotifications(),
    ]);
    this._render();
    this._renderHomeBanner();
  },

  async _loadSettings() {
    try {
      const { data } = await supabase
        .from('school_settings')
        .select('check_in_start, check_in_end, check_out_start, check_out_end')
        .eq('id', 1)
        .maybeSingle();
      if (data) this._settings = { ...DEFAULT_SETTINGS, ...data };
    } catch (_) {
      this._settings = { ...DEFAULT_SETTINGS };
    }
  },

  async _loadAttendance() {
    if (!this._studentId) { this._attendance = null; return; }
    const since = dateStr(new Date(Date.now() - 7 * 864e5));
    try {
      const { data } = await supabase
        .from('attendance')
        .select('status, check_in, check_out, date')
        .eq('student_id', this._studentId)
        .gte('date', since)
        .order('date', { ascending: false })
        .limit(1);
      this._attendance = (data && data.length) ? data[0] : null;
    } catch (_) {
      this._attendance = null;
    }
  },

  async _loadNotifications() {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title, message, is_read, created_at, link, priority')
        .eq('user_id', this._parentId)
        .order('created_at', { ascending: false })
        .limit(20);

      this._items = (data || []).filter(n => !n.type || ANNOUNCEMENT_TYPES.includes(n.type));
      const newest = this._items.find(i => !i.is_read) || this._items[0];
      this._lastSeenId = newest?.id ?? null;
    } catch (_) {
      this._items = [];
    }
  },

  _buildDOM() {
    if (document.getElementById(ROOT_ID)) return;
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Avisos y horarios del d\u00eda');
    root.innerHTML = `
      <div class="pab-card">
        <div class="pab-head">
          <div class="pab-head-ico" id="pabHeadIcon">\u{1F4E2}</div>
          <div class="pab-head-txt">
            <div class="pab-head-title">Anuncios y horarios</div>
            <div class="pab-head-sub" id="pabHeadSub">Cargando\u2026</div>
          </div>
          <button class="pab-btn" id="pabToggle" type="button">Ver</button>
          <button class="pab-btn" id="pabClose" type="button" aria-label="Cerrar">\u2715</button>
        </div>
        <div class="pab-body" id="pabBody"></div>
      </div>`;
    document.body.appendChild(root);

    root.classList.add('pab-open');
    root.querySelector('#pabToggle').addEventListener('click', () => {
      root.classList.toggle('pab-open');
      const open = root.classList.contains('pab-open');
      root.querySelector('#pabToggle').textContent = open ? 'Ver' : 'Ver m\u00e1s';
    });
    root.querySelector('#pabClose').addEventListener('click', () => {
      this._markDismissed();
      root.remove();
    });
  },

  _subscribe() {
    if (this._channel || !this._parentId) return;

    const channel = supabase.channel('padre-announcement-' + this._parentId);

    channel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: 'user_id=eq.' + this._parentId
    }, (payload) => {
      const n = payload.new;
      if (!n) return;
      this._items.unshift({
        id: n.id, type: n.type || 'info', title: n.title, message: n.message,
        is_read: false, created_at: n.created_at, link: n.link, priority: n.priority
      });
      this._items = this._items.slice(0, 20);
      // Aviso local: si no hay push activadas, el banner es el canal principal
      this._notifyDesktop(n);
      this._show();
      this._render();
      this._renderHomeBanner();
    });

    if (this._studentId) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table: 'attendance',
        filter: 'student_id=eq.' + this._studentId
      }, async () => {
        await this._loadAttendance();
        this._render();
        this._renderHomeBanner();
      });
    }

    channel.subscribe();
    this._channel = channel;
    // Registrado en window para que el cleanup de logout lo libere
    window._announcementChannel = channel;
  },

  destroy() {
    if (this._channel) {
      try { supabase.removeChannel(this._channel); } catch (_) {}
      this._channel = null;
    }
    window._announcementChannel = null;
    document.getElementById(ROOT_ID)?.remove();
    try { sessionStorage.removeItem(DISMISS_KEY); } catch (_) {}
  },

  _notifyDesktop(n) {
    if (!this._pushEnabled()) return;
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      new Notification(n.title || 'Novedad', { body: n.message || '', tag: 'karpus-' + n.id });
    } catch (_) { /* navegador lo bloquea: el banner sigue funcionando */ }
  },

  _show() {
    const root = document.getElementById(ROOT_ID);
    if (!root) { this._buildDOM(); return; }
    root.classList.remove('pab-dismissed');
    root.classList.add('pab-open');
    const t = root.querySelector('#pabToggle');
    if (t) t.textContent = 'Ver';
  },

  /** Estado del día: hay que llevar / hay que recoger / todo al día */
  _dayPhase() {
    const inEnd = toMinutes(this._settings.check_in_end, DEFAULT_SETTINGS.check_in_end);
    const outStart = toMinutes(this._settings.check_out_start, DEFAULT_SETTINGS.check_out_start);
    const outEnd = toMinutes(this._settings.check_out_end, DEFAULT_SETTINGS.check_out_end);
    const now = nowMinutes();
    const att = this._attendance;

    if (att?.status === 'retirado' || (att?.check_out && now >= outStart)) {
      return { tone: 'done', text: `Ya registraste la salida de ${this._studentName}.` };
    }
    if (now < inEnd && !att?.check_in) {
      const left = inEnd - now;
      return {
        tone: 'go',
        text: `Es hora de llevar a ${this._studentName} a la escuela.`,
        countdown: left > 0 ? `cierra en ${fmtMinutes(left)}` : 'hora de cierre pasada'
      };
    }
    if (now >= outStart && now <= outEnd && !att?.check_out) {
      const left = outEnd - now;
      return {
        tone: 'go',
        text: `Es hora de recoger a ${this._studentName}.`,
        countdown: left > 0 ? `hasta ${fmtMinutes(outEnd)}` : 'busqueda vencida'
      };
    }
    if (att?.status === 'absent') {
      return { tone: 'wait', text: `${this._studentName} fue marcado(a) ausente hoy.` };
    }
    return {
      tone: 'wait',
      text: att?.check_in
        ? `${this._studentName} ya ingreso. Todo al d\u00eda.`
        : `La entrega sigue abierta hasta las ${String(this._settings.check_in_end).slice(0, 5)}.`
    };
  },

  // ── Banner inline del HOME (estático, no flotante) ────────────────────────
  _greetingByTime() {
    const h = new Date().getHours();
    if (h < 6)  return { label: 'Buenas noches', emoji: '\u{1F319}' };
    if (h < 12) return { label: 'Buenos d\u00edas',   emoji: '\u2600\uFE0F' };
    if (h < 19) return { label: 'Buenas tardes', emoji: '\u{1F324}\uFE0F' };
    return { label: 'Buenas noches', emoji: '\u{1F306}' };
  },

  /** Edad en años (aproximada) a partir de birthday: YYYY-MM-DD o Date */
  _ageYears() {
    const b = AppState?.get?.('currentStudent')?.birthday;
    if (!b) return null;
    try {
      const bd = new Date(b);
      if (isNaN(bd.getTime())) return null;
      const now = new Date();
      let age = now.getFullYear() - bd.getFullYear();
      const m = now.getMonth() - bd.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
      return Math.max(0, Math.min(99, age));
    } catch (_) { return null; }
  },

  _pickTip() {
    const age = this._ageYears();
    const pool = (age == null) ? EDU_TIPS : EDU_TIPS.filter(t => age >= t.minAge && age <= t.maxAge);
    const list = pool.length ? pool : EDU_TIPS;
    let idx = 0;
    try {
      const raw = parseInt(localStorage.getItem(TIPS_LAST_KEY) || '0', 10) || 0;
      idx = (raw + 1) % list.length;
      localStorage.setItem(TIPS_LAST_KEY, String(idx));
    } catch (_) { /* incógnito */ }
    return { tip: list[idx].tip, age: age };
  },

  _renderHomeBanner() {
    const wrap = document.getElementById(HOME_BANNER_ID);
    if (!wrap) return;

    const greet = this._greetingByTime();
    const att = this._attendance;
    const pushOn = this._pushEnabled();
    const phase = this._dayPhase();
    const studentFirst = (this._studentName || 'tu hijo(a)').split(' ')[0];
    const parentFirst = AppState?.get?.('profile')?.name?.split(' ')[0] || 'Familia';

    // ── Cinta 1: saludo + status asistencia (gradiente azul/morado) ──
    const hasCheckIn  = !!att?.check_in;
    const hasCheckOut = !!att?.check_out;
    const inStart = String(this._settings.check_in_start || DEFAULT_SETTINGS.check_in_start).slice(0, 5);
    const inEnd   = String(this._settings.check_in_end   || DEFAULT_SETTINGS.check_in_end).slice(0, 5);
    const outStart= String(this._settings.check_out_start|| DEFAULT_SETTINGS.check_out_start).slice(0, 5);
    const outEnd  = String(this._settings.check_out_end  || DEFAULT_SETTINGS.check_out_end).slice(0, 5);

    let statusLine = '';
    let statusIcon = '\u{1F4A1}';
    if (hasCheckOut) {
      statusIcon = '\u2705';
      statusLine = `<b>${escapeHtml(studentFirst)}</b> ya fue entregado(a) a casa. \u00a1Nos vemos ma\u00f1ana!`;
    } else if (hasCheckIn) {
      statusIcon = '\u{1F392}';
      statusLine = `<b>${escapeHtml(studentFirst)}</b> ya est\u00e1 en la escuela aprendiendo hoy. \u00a1Est\u00e1 en buenas manos!`;
    } else {
      statusIcon = '\u23F3';
      statusLine = `Hoy a\u00fan no hay registro de entrada. Ventana de entrega: <b>${escapeHtml(inStart)} \u2013 ${escapeHtml(inEnd)}</b>.`;
    }

    const saludoRow = `
      <div class="pab-hb-greet pab-hb-stack">
        <div class="pab-hb-greet-left">
          <div class="pab-hb-time">${greet.emoji} ${greet.label}, <b>${escapeHtml(parentFirst)}</b></div>
          <div class="pab-hb-status">
            <span style="font-size:1.2rem;margin-right:.3rem">${statusIcon}</span>
            <span>${statusLine}</span>
          </div>
        </div>
        <div class="pab-hb-window">
          <div class="pab-hb-win pab-hb-win--in">
            <span class="pab-hb-k">Entrada</span>
            <span class="pab-hb-v">${escapeHtml(inStart)}\u2013${escapeHtml(inEnd)}</span>
          </div>
          <div class="pab-hb-win pab-hb-win--out">
            <span class="pab-hb-k">Salida</span>
            <span class="pab-hb-v">${escapeHtml(outStart)}\u2013${escapeHtml(outEnd)}</span>
          </div>
        </div>
      </div>`;

    // ── Cinta 2: FASE del día (solo si aplica) ──
    let phaseRow = '';
    if (phase.tone === 'go') {
      const toneClass = phase.countdown?.startsWith('hasta') ? 'pickup' : 'dropoff';
      phaseRow = `
        <div class="pab-hb-phase pab-hb-phase--${toneClass} pab-hb-stack">
          <span class="pab-hb-phase-ico">${toneClass === 'pickup' ? '\u{1F697}' : '\u{1F680}'}</span>
          <div class="pab-hb-phase-txt">
            <div class="pab-hb-phase-title">${toneClass === 'pickup' ? '\u00a1Ya es hora de recoger!' : '\u00a1Es hora de llevar a la escuela!'}</div>
            <div class="pab-hb-phase-sub">
              ${escapeHtml(phase.text)}
              ${phase.countdown ? ` \u00b7 <b>${escapeHtml(phase.countdown)}</b>` : ''}
            </div>
          </div>
        </div>`;
    }

    // ── Cinta 3: Push NO activado → botón Activar ──
    let pushRow = '';
    if (!pushOn) {
      const denied = NotifyPermission.isDenied();
      pushRow = `
        <div class="pab-hb-push pab-hb-stack">
          <span class="pab-hb-push-ico">\u{1F514}</span>
          <div class="pab-hb-push-txt">
            <div class="pab-hb-push-title">Activa las notificaciones push</div>
            <div class="pab-hb-push-sub">As\u00ed te avisaremos en tiempo real cuando tu hijo entre, salga o publiquen en el muro sin necesidad de tener el panel abierto.</div>
          </div>
          <button type="button" id="hbPushBtn" class="pab-hb-push-btn" ${denied ? 'disabled' : ''}>
            ${denied ? 'Bloqueado en el navegador' : 'Activar ahora'}
          </button>
        </div>`;
    }

    // ── Cinta 4: Anuncio destacado (último announcement/alert sin leer o con priority) ──
    const latest = this._items.find(i => (i.type === 'announcement' || i.type === 'alert' || i.type === 'muro') && i.title) || this._items[0];
    let announcementRow = '';
    if (latest) {
      announcementRow = `
        <div class="pab-hb-ann pab-hb-stack">
          <span class="pab-hb-ann-ico">${ICONS[latest.type] || '\u{1F4E2}'}</span>
          <div class="pab-hb-ann-txt">
            <div class="pab-hb-ann-title">${escapeHtml(latest.title)}</div>
            ${latest.message ? `<div class="pab-hb-ann-sub">${escapeHtml(String(latest.message).slice(0, 220))}</div>` : ''}
          </div>
          <span class="pab-hb-ann-time">${escapeHtml(timeAgo(latest.created_at))}</span>
        </div>`;
    }

    // ── Cinta 5: Tip educativo "Sab\u00edas que..." ──
    const { tip, age } = this._pickTip();
    const ageTag = (age != null)
      ? `<span class="pab-hb-tip-tag">\u{1F476} ${age} a\u00f1o${age === 1 ? '' : 's'}</span>`
      : `<span class="pab-hb-tip-tag">\u{1F4A1} Consejo Montessori</span>`;

    const tipRow = `
      <div class="pab-hb-tip pab-hb-stack">
        <span class="pab-hb-tip-ico">\u{1F4AD}</span>
        <div class="pab-hb-tip-txt">
          <div class="pab-hb-tip-head">
            <span class="pab-hb-tip-title">\u00bfSab\u00edas que\u2026?</span>
            ${ageTag}
          </div>
          <div class="pab-hb-tip-body">${escapeHtml(tip)}</div>
        </div>
      </div>`;

    wrap.innerHTML = `
      <div class="pab-hb">
        ${saludoRow}
        ${phaseRow}
        ${pushRow}
        ${announcementRow}
        ${tipRow}
      </div>`;

    // Wire eventos del botón push
    const btn = document.getElementById('hbPushBtn');
    if (btn) btn.addEventListener('click', async () => {
      if (NotifyPermission.isDenied()) return;
      await NotifyPermission.requestSilent();
      if (NotifyPermission.isGranted()) {
        this._renderHomeBanner();
      } else if (NotifyPermission.isDenied()) {
        btn.textContent = 'Bloqueado en el navegador';
        btn.disabled = true;
      }
    });
  },

  _render() {
    const root = document.getElementById(ROOT_ID);
    const body = document.getElementById('pabBody');
    const sub = document.getElementById('pabHeadSub');
    if (!root || !body) return;
    if (this._dismissed()) { root.remove(); return; }

    const pushOn = this._pushEnabled();
    const unread = this._items.filter(i => !i.is_read).length;
    const phase = this._dayPhase();

    if (sub) {
      sub.textContent = unread > 0
        ? `${unread} aviso${unread > 1 ? 's' : ''} sin leer \u00b7 ${phase.text}`
        : phase.text;
    }

    const inStart = String(this._settings.check_in_start || DEFAULT_SETTINGS.check_in_start).slice(0, 5);
    const inEnd = String(this._settings.check_in_end || DEFAULT_SETTINGS.check_in_end).slice(0, 5);
    const outStart = String(this._settings.check_out_start || DEFAULT_SETTINGS.check_out_start).slice(0, 5);
    const outEnd = String(this._settings.check_out_end || DEFAULT_SETTINGS.check_out_end).slice(0, 5);
    const att = this._attendance;

    const warn = pushOn ? '' : `
      <div class="pab-warn">
        <span>\u{1F514}</span>
        <span>No tienes activadas las notificaciones push, as\u00ed que te avisamos aqu\u00ed mismo. Act\u00edvalas para recibir alertas aunque no tengas el panel abierto.</span>
        <button type="button" id="pabEnablePush">Activar</button>
      </div>`;

    const alert = `
      <div class="pab-alert pab-alert--${phase.tone}">
        <span>${phase.tone === 'go' ? '\u{1F680}' : phase.tone === 'done' ? '\u2705' : '\u23F3'}</span>
        <span>${escapeHtml(phase.text)}</span>
        ${phase.countdown ? `<span class="pab-clock">${escapeHtml(phase.countdown)}</span>` : ''}
      </div>`;

    const times = `
      <div class="pab-times">
        <div class="pab-time pab-time--in">
          <span class="pab-time-k">Hora de búsqueda / entrega</span>
          <span class="pab-time-v">${escapeHtml(inStart)} \u2013 ${escapeHtml(inEnd)}</span>
        </div>
        <div class="pab-time pab-time--out">
          <span class="pab-time-k">Hora de recogida</span>
          <span class="pab-time-v">${escapeHtml(outStart)} \u2013 ${escapeHtml(outEnd)}</span>
        </div>
        <div class="pab-time">
          <span class="pab-time-k">Registro de hoy</span>
          <span class="pab-time-v">${att?.check_in ? escapeHtml(fmtClock(att.check_in)) : '\u2014'} / ${att?.check_out ? escapeHtml(fmtClock(att.check_out)) : '\u2014'}</span>
        </div>
      </div>
      <p class="pab-note">Entrada registrada: <b>${att?.check_in ? escapeHtml(fmtClock(att.check_in)) : 'a\u00fan no registrada'}</b> \u00b7 Salida registrada: <b>${att?.check_out ? escapeHtml(fmtClock(att.check_out)) : 'a\u00fan no registrada'}</b></p>`;

    const items = this._items.slice(0, 4).map(i => `
      <div class="pab-item${i.is_read ? '' : ' pab-unread'}" data-link="${escapeHtml(i.link || '')}" role="button" tabindex="0">
        <div class="pab-item-ico">${ICONS[i.type] || '\u{1F514}'}</div>
        <div class="pab-item-main">
          <div class="pab-item-t">${escapeHtml(i.title || 'Novedad')}</div>
          ${i.message ? `<div class="pab-item-m">${escapeHtml(i.message)}</div>` : ''}
        </div>
        <span class="pab-item-time">${escapeHtml(timeAgo(i.created_at))}</span>
      </div>`).join('');

    body.innerHTML = `
      ${warn}
      ${alert}
      ${times}
      <div class="pab-list">${items || '<div class="pab-empty">Sin avisos por ahora.</div>'}</div>`;

    const enableBtn = document.getElementById('pabEnablePush');
    if (enableBtn) {
      enableBtn.addEventListener('click', async () => {
        await NotifyPermission.requestSilent();
        // requestSilent() no devuelve valor: hay que consultar el estado real
        if (NotifyPermission.isGranted()) this._render();
        else if (NotifyPermission.isDenied()) {
          enableBtn.textContent = 'Bloqueado en el navegador';
          enableBtn.disabled = true;
        }
      });
    }

    body.querySelectorAll('.pab-item').forEach(el => {
      const go = () => {
        const link = el.getAttribute('data-link');
        if (link) window.location.href = link;
      };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });

    if (unread > 0) {
      const markBtn = document.createElement('button');
      markBtn.type = 'button';
      markBtn.className = 'pab-btn';
      markBtn.style.cssText = 'background:#DBEAFE;color:#1D4ED8;margin-top:.6rem;width:100%;padding:.45rem;';
      markBtn.textContent = 'Marcar avisos como le\u00eddos';
      markBtn.addEventListener('click', () => this._markAllRead());
      body.appendChild(markBtn);
    }
  },
};

if (typeof window !== 'undefined') window.AnnouncementBanner = AnnouncementBanner;