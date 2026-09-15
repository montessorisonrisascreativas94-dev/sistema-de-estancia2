/**
 * Sistema Colegio Montessori Sonrisas Creativas — Centro de Novedades
 * Campana dorada animada (esquina estratégica) + ventana con todos los eventos.
 *
 * - Módulo compartido: funciona en Directora, Asistente, Encargada, Maestra y Padres.
 * - Botón flotante dorado con contador de no leídos, animación de campana al llegar eventos.
 * - Ventana (drawer en escritorio / bottom-sheet en móvil) con lista de eventos
 *   agrupados por tipo, prioridad, tiempo relativo, "marcar leído" y "marcar todo".
 * - Realtime: se suscribe a INSERT en notifications para el usuario actual.
 *
 * Uso en cualquier panel (main.js):
 *   import { NewsCenter } from '../shared/news-center.js';
 *   NewsCenter.init(user.id);
 */
import { supabase } from './supabase.js';
import { escapeHtml } from './helpers.js';

const TYPE_CONFIG = {
  announcement:   { icon: '📢', label: 'Anuncio',        accent: '#0B63C7', priority: 2 },
  chat:           { icon: '💬', label: 'Mensaje',        accent: '#28B54D', priority: 3 },
  message:        { icon: '💬', label: 'Mensaje',        accent: '#28B54D', priority: 3 },
  task:           { icon: '📚', label: 'Tarea',          accent: '#FF9F1C', priority: 4 },
  homework:       { icon: '📚', label: 'Tarea',          accent: '#FF9F1C', priority: 4 },
  submission:     { icon: '📥', label: 'Entrega',        accent: '#8B5CF6', priority: 4 },
  'task-submission': { icon: '📥', label: 'Entrega',     accent: '#8B5CF6', priority: 4 },
  'post-feedback':{ icon: '💬', label: 'Feedback',       accent: '#8B5CF6', priority: 3 },
  payment:        { icon: '💵', label: 'Pago',           accent: '#10B981', priority: 5 },
  receipt:        { icon: '🧾', label: 'Comprobante',    accent: '#FF6B35', priority: 5 },
  alert:          { icon: '⚠️', label: 'Alerta',         accent: '#EF4444', priority: 6 },
  inquiry:        { icon: '🗂️', label: 'Consulta',       accent: '#0B63C7', priority: 4 },
  attendance:     { icon: '📋', label: 'Asistencia',     accent: '#0D9488', priority: 3 },
  grade:          { icon: '⭐', label: 'Calificación',   accent: '#F59E0B', priority: 4 },
  post:           { icon: '📣', label: 'Publicación',    accent: '#0B63C7', priority: 2 },
  muro:           { icon: '📣', label: 'Publicación',    accent: '#0B63C7', priority: 2 },
  comment:        { icon: '💭', label: 'Comentario',     accent: '#64748B', priority: 2 },
  like:           { icon: '❤️', label: 'Reacción',       accent: '#EC4899', priority: 1 },
  'new-student':  { icon: '🧒', label: 'Nuevo estudiante', accent: '#0B63C7', priority: 4 },
  'new-teacher':  { icon: '👩‍🏫', label: 'Nuevo docente',  accent: '#28B54D', priority: 4 },
  event:          { icon: '📅', label: 'Evento',         accent: '#06B6D4', priority: 2 },
  live:           { icon: '🔴', label: 'En vivo',        accent: '#EF4444', priority: 6 },
  info:           { icon: 'ℹ️', label: 'Info',           accent: '#64748B', priority: 0 },
  default:        { icon: '🔔', label: 'Novedad',        accent: '#64748B', priority: 0 }
};

function _cfg(type) { return TYPE_CONFIG[type] || TYPE_CONFIG.default; }

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h';
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return days + 'd';
  return new Date(dateStr).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}

const STYLE = `
#newsCenterBellWrap{position:fixed;right:18px;bottom:18px;z-index:960;filter:drop-shadow(0 6px 14px rgba(255,150,0,.35))}
#newsCenterBell{
  position:relative;width:58px;height:58px;border-radius:50%;cursor:pointer;border:none;outline:none;
  background:radial-gradient(circle at 30% 25%,#FFE873 0%,#FFD43B 45%,#FF9F1C 90%);
  box-shadow:0 8px 24px rgba(255,150,0,.45),inset 0 2px 3px rgba(255,255,255,.6),inset 0 -3px 6px rgba(180,90,0,.35);
  display:flex;align-items:center;justify-content:center;transition:transform .18s cubic-bezier(.34,1.56,.64,1);
  -webkit-tap-highlight-color:transparent;
}
#newsCenterBell:hover{transform:scale(1.08) rotate(-6deg)}
#newsCenterBell:active{transform:scale(.94)}
#newsCenterBell svg{width:26px;height:26px;color:#7A4B00;stroke-width:2.4}
#newsCenterBell.ringing{animation:ncenter-ring .55s ease-in-out 3}
@keyframes ncenter-ring{0%,100%{transform:rotate(0)}20%{transform:rotate(18deg)}40%{transform:rotate(-16deg)}60%{transform:rotate(10deg)}80%{transform:rotate(-6deg)}}
#newsCenterBellWrap .ncenter-halo{position:absolute;inset:-6px;border-radius:50%;background:radial-gradient(circle,rgba(255,200,60,.55),rgba(255,200,60,0) 70%);animation:ncenter-halo-pulse 2.4s infinite;pointer-events:none}
@keyframes ncenter-halo-pulse{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.18);opacity:.25}}
#newsCenterBellWrap.attention #newsCenterBell{animation:ncenter-ring .55s ease-in-out 3}
#newsCenterBadge{
  position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;border-radius:50px;padding:0 6px;
  background:linear-gradient(135deg,#EF4444,#DC2626);color:#fff;font-size:11px;font-weight:900;line-height:1;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 0 2px rgba(255,255,255,.9),0 4px 10px rgba(220,38,38,.5);
}
#newsCenterBadge.hidden{display:none}
#ncenterBackdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);z-index:961;opacity:0;pointer-events:none;transition:opacity .25s ease;border:none;padding:0}
#ncenterBackdrop.show{opacity:1;pointer-events:auto}
#newsCenterModal{
  position:fixed;top:0;right:0;bottom:0;z-index:962;width:min(420px,100vw);
  background:#F5F8FC;box-shadow:-12px 0 40px rgba(15,23,42,.18);
  transform:translateX(105%);transition:transform .3s cubic-bezier(.32,.72,.38,1);
  display:flex;flex-direction:column;overflow:hidden;margin:0;
}
#newsCenterModal.show{transform:translateX(0)}
.ncenter-head{
  background:linear-gradient(135deg,#0B63C7 0%,#0850A0 55%,#1e3a8a 100%);
  color:#fff;padding:18px 18px 14px;position:relative;overflow:hidden;flex-shrink:0;
}
.ncenter-head::before{content:'';position:absolute;top:-40px;right:-40px;width:130px;height:130px;border-radius:50%;background:rgba(255,212,59,.14);pointer-events:none}
.ncenter-head::after{content:'';position:absolute;left:0;bottom:0;width:100%;height:3px;background:linear-gradient(90deg,#FFD43B,#FF9F1C,#FF7A00)}
.ncenter-head-top{display:flex;align-items:center;gap:10px}
.ncenter-bell-mini{width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ncenter-bell-mini svg{width:20px;height:20px;color:#FFD43B}
.ncenter-title{flex:1;min-width:0}
.ncenter-title h2{margin:0;font-size:1.05rem;font-weight:900;line-height:1.15}
.ncenter-title p{margin:2px 0 0;font-size:.68rem;font-weight:700;color:rgba(255,255,255,.75);letter-spacing:.06em;text-transform:uppercase}
.ncenter-close{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .18s}
.ncenter-close:hover{background:rgba(255,255,255,.3);transform:scale(1.05)}
.ncenter-close svg{width:17px;height:17px}
.ncenter-toolbar{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}
.ncenter-chip{
  display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:50px;font-size:.72rem;font-weight:800;
  border:1px solid transparent;cursor:pointer;transition:all .18s;background:rgba(255,255,255,.14);color:rgba(255,255,255,.9)
}
.ncenter-chip:hover{background:rgba(255,255,255,.24)}
.ncenter-chip.active{background:#FFD43B;color:#5B3A00;box-shadow:0 3px 10px rgba(255,212,59,.35)}
.ncenter-chip .ncenter-chip-count{background:rgba(0,0,0,.14);border-radius:50px;padding:0 6px;font-size:.64rem}
.ncenter-chip.active .ncenter-chip-count{background:rgba(91,58,0,.18)}
#ncenterMarkAll{
  margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:50px;font-size:.68rem;font-weight:800;
  border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;cursor:pointer;transition:all .18s
}
#ncenterMarkAll:hover{background:rgba(255,255,255,.25)}
#ncenterMarkAll.hidden{display:none}
.ncenter-body{flex:1;overflow-y:auto;padding:14px 14px 18px;-webkit-overflow-scrolling:touch}
.ncenter-grouped{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.ncenter-grouped:empty{display:none}
.ncenter-group-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:50px;font-size:.66rem;font-weight:800;background:#fff;border:1px solid #E2E8F0;color:#475569}
.ncenter-group-chip b{font-size:.72rem}
.ncenter-total-line{font-size:.66rem;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;margin:0 4px 10px}
.ncenter-item{
  display:flex;align-items:flex-start;gap:11px;padding:12px;border-radius:16px;background:#fff;border:1px solid #E2E8F0;
  cursor:pointer;transition:all .18s ease;margin-bottom:8px;box-shadow:0 1px 3px rgba(15,23,42,.05)
}
.ncenter-item:hover{transform:translateY(-2px) scale(1.005);box-shadow:0 10px 24px rgba(11,99,199,.12);border-color:#BFDBFE}
.ncenter-item.is-read{opacity:.62}
.ncenter-item.is-read:hover{opacity:.85}
.ncenter-item.unread{background:linear-gradient(180deg,#F0F7FF,#F8FBFF);border-color:#BFDBFE;box-shadow:inset 3px 0 0 var(--nc-accent,#0B63C7),0 2px 8px rgba(11,99,199,.08)}
.ncenter-item-icon{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;box-shadow:0 2px 6px rgba(15,23,42,.08)}
.ncenter-item-main{flex:1;min-width:0}
.ncenter-item-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px}
.ncenter-item-type{font-size:.6rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
.ncenter-item-title{font-size:.83rem;font-weight:800;color:#1A2340;line-height:1.25}
.ncenter-item-title.is-read{color:#64748B}
.ncenter-item-msg{font-size:.74rem;color:#64748B;font-weight:500;line-height:1.4;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ncenter-item-time{font-size:.66rem;font-weight:700;color:#94A3B8;flex-shrink:0;white-space:nowrap}
.ncenter-unread-dot{width:8px;height:8px;border-radius:50%;background:#EF4444;flex-shrink:0;animation:ncenter-dot-pulse 1.6s infinite}
@keyframes ncenter-dot-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{opacity:.7;box-shadow:0 0 0 4px rgba(239,68,68,0)}}
.ncenter-prio{font-size:.58rem;font-weight:900;text-transform:uppercase;padding:2px 7px;border-radius:50px;letter-spacing:.05em}
.ncenter-empty{text-align:center;padding:2.5rem 1rem;color:#94A3B8}
.ncenter-empty-title{font-weight:800;color:#475569;font-size:.9rem;margin-top:10px}
.ncenter-skeleton{display:flex;align-items:center;gap:11px;padding:12px;border-radius:16px;background:#fff;border:1px solid #E2E8F0;margin-bottom:8px}
.ncenter-skeleton .sk{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:800px 100%;animation:ncenter-shimmer 1.6s infinite linear;border-radius:8px}
@keyframes ncenter-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
@media (max-width:520px){
  #newsCenterBellWrap{right:14px;bottom:calc(14px + env(safe-area-inset-bottom))}
  #newsCenterBell{width:54px;height:54px}
  #newsCenterBell svg{width:24px;height:24px}
  #newsCenterModal{width:100vw;border-radius:22px 22px 0 0}
}
@media print{#newsCenterBellWrap,#newsCenterModal,#ncenterBackdrop{display:none !important}}
`;

let _state = {
  userId: null,
  items: [],
  filter: 'all', // all | unread
  opened: false,
  channelName: null
};

function _els() { return {
  bellWrap: document.getElementById('newsCenterBellWrap'),
  bell: document.getElementById('newsCenterBell'),
  badge: document.getElementById('newsCenterBadge'),
  modal: document.getElementById('newsCenterModal'),
  backdrop: document.getElementById('ncenterBackdrop'),
  list: document.getElementById('ncenterList'),
  grouped: document.getElementById('ncenterGrouped'),
  markAll: document.getElementById('ncenterMarkAll'),
  chipAll: document.getElementById('ncenterChipAll'),
  chipUnread: document.getElementById('ncenterChipUnread'),
  emptyCount: document.getElementById('ncenterEmptyCount')
}; }

function _injectStyles() {
  if (document.getElementById('newsCenterStyles')) return;
  const s = document.createElement('style');
  s.id = 'newsCenterStyles';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function _buildDOM() {
  if (document.getElementById('newsCenterBellWrap')) return;

  // Botón campana flotante
  const wrap = document.createElement('div');
  wrap.id = 'newsCenterBellWrap';
  wrap.innerHTML = `
    <span class="ncenter-halo"></span>
    <button id="newsCenterBell" type="button" aria-label="Centro de Novedades" title="Centro de Novedades">
      <i data-lucide="bell"></i>
      <span id="newsCenterBadge" class="hidden">0</span>
    </button>`;

  // Backdrop + modal
  const backdrop = document.createElement('div');
  backdrop.id = 'ncenterBackdrop';

  const modal = document.createElement('div');
  modal.id = 'newsCenterModal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Centro de Novedades');
  modal.innerHTML = `
    <div class="ncenter-head">
      <div class="ncenter-head-top">
        <div class="ncenter-bell-mini"><i data-lucide="bell"></i></div>
        <div class="ncenter-title">
          <h2>Centro de Novedades</h2>
          <p>Eventos y alertas de tu panel</p>
        </div>
        <button class="ncenter-close" id="ncenterCloseBtn" type="button" aria-label="Cerrar">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="ncenter-toolbar">
        <button class="ncenter-chip active" id="ncenterChipAll" type="button">Todas</button>
        <button class="ncenter-chip" id="ncenterChipUnread" type="button">No leídas <span class="ncenter-chip-count" id="ncenterEmptyCount">0</span></button>
        <button id="ncenterMarkAll" class="hidden" type="button"><i data-lucide="check-check" class="w-3.5 h-3.5"></i> Marcar todas</button>
      </div>
      <div class="ncenter-grouped" id="ncenterGrouped"></div>
    </div>
    <div class="ncenter-body" id="ncenterList"></div>`;

  document.body.appendChild(wrap);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  // Eventos
  wrap.querySelector('#newsCenterBell').addEventListener('click', () => NewsCenter.open());
  backdrop.addEventListener('click', () => NewsCenter.close());
  modal.querySelector('#ncenterCloseBtn').addEventListener('click', () => NewsCenter.close());
  modal.querySelector('#ncenterChipAll').addEventListener('click', () => NewsCenter._setFilter('all'));
  modal.querySelector('#ncenterChipUnread').addEventListener('click', () => NewsCenter._setFilter('unread'));
  modal.querySelector('#ncenterMarkAll').addEventListener('click', () => NewsCenter.markAllRead());
  modal.querySelector('#ncenterList').addEventListener('click', (e) => {
    const itemEl = e.target.closest('.ncenter-item');
    if (!itemEl) return;
    NewsCenter._onItemClick(itemEl.dataset.id);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _state.opened) NewsCenter.close();
  });

  // Lucide icons
  if (window.lucide) requestAnimationFrame(() => lucide.createIcons({ attrs: { 'stroke-width': '2' } }));
}

function _getUnread() {
  return _state.items.filter(i => !i.isRead);
}

function _renderList() {
  const els = _els();
  if (!els.list) return;

  const unreadArr = _getUnread();
  const visible = _state.filter === 'unread' ? unreadArr : _state.items;

  // Actualizar contadores
  const unreadCount = unreadArr.length;
  els.badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
  els.badge.classList.toggle('hidden', unreadCount === 0);
  els.emptyCount.textContent = unreadCount;
  els.markAll.classList.toggle('hidden', unreadCount === 0);
  els.chipAll.classList.toggle('active', _state.filter === 'all');
  els.chipUnread.classList.toggle('active', _state.filter === 'unread');

  // Chips agrupados (solo con no leídas)
  const grouped = new Map();
  for (const item of unreadArr) {
    const g = TYPE_CONFIG[item.type] || TYPE_CONFIG.default;
    if (!grouped.has(g.label)) grouped.set(g.label, { icon: g.icon, label: g.label, count: 0 });
    grouped.get(g.label).count++;
  }
  els.grouped.innerHTML = '';
  for (const g of grouped.values()) {
    const chip = document.createElement('span');
    chip.className = 'ncenter-group-chip';
    chip.innerHTML = g.icon + ' ' + g.label.toLowerCase() + ' <b>' + g.count + '</b>';
    els.grouped.appendChild(chip);
  }

  // Lista
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'ncenter-empty';
    empty.innerHTML = _state.filter === 'unread'
      ? '<div style="font-size:2rem">✅</div><div class="ncenter-empty-title">No tienes novedades pendientes</div><p style="font-size:.72rem;margin-top:4px">Genial, estás al día</p>'
      : '<div style="font-size:2rem">🔔</div><div class="ncenter-empty-title">Aún no hay eventos</div><p style="font-size:.72rem;margin-top:4px">Los avisos de tu panel aparecerán aquí</p>';
    els.list.innerHTML = '';
    els.list.appendChild(empty);
    return;
  }

  const totalLine = document.createElement('div');
  totalLine.className = 'ncenter-total-line';
  totalLine.textContent = _state.items.length + ' eventos en tu panel';
  if (_state.filter === 'unread' && visible.length !== _state.items.length) {
    totalLine.textContent = unreadCount + ' de ' + _state.items.length + ' sin leer';
  }

  els.list.innerHTML = '';
  els.list.appendChild(totalLine);
  for (const item of visible) {
    els.list.appendChild(_renderItem(item));
  }
}

function _renderItem(item) {
  const cfg = _cfg(item.type);
  const el = document.createElement('div');
  el.className = 'ncenter-item' + (item.isRead ? ' is-read' : ' unread');
  el.dataset.id = String(item.id);
  el.style.setProperty('--nc-accent', cfg.accent);
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');

  const prioBadge = (item.priority === 'critical' || item.priority === 6 || cfg.priority >= 6)
    ? '<span class="ncenter-prio" style="background:#FEE2E2;color:#B91C1C">Urgente</span>'
    : (item.priority === 'important' || cfg.priority >= 4)
      ? '<span class="ncenter-prio" style="background:#FEF3C7;color:#B45309">Importante</span>'
      : '';

  const title = escapeHtml(item.title || _cfg(item.type).label);
  const msg = escapeHtml(item.message || '');

  el.innerHTML = `
    <div class="ncenter-item-icon" style="background:${cfg.accent}22;color:${cfg.accent}">${cfg.icon}</div>
    <div class="ncenter-item-main">
      <div class="ncenter-item-top">
        ${item.isRead ? '' : '<span class="ncenter-unread-dot"></span>'}
        <span class="ncenter-item-type" style="color:${cfg.accent}">${escapeHtml(cfg.label)}</span>
        ${prioBadge}
      </div>
      <div class="ncenter-item-title${item.isRead ? ' is-read' : ''}">${title}</div>
      ${msg ? `<p class="ncenter-item-msg">${msg}</p>` : ''}
    </div>
    <span class="ncenter-item-time">${timeAgo(item.createdAt)}</span>`;

  return el;
}

function _skeletonHTML() {
  const sk = [];
  for (let i = 0; i < 5; i++) {
    sk.push(`
      <div class="ncenter-skeleton">
        <div class="sk" style="width:38px;height:38px;border-radius:12px;flex-shrink:0"></div>
        <div class="flex-1" style="flex:1;min-width:0">
          <div class="sk" style="width:35%;height:9px;margin-bottom:6px"></div>
          <div class="sk" style="width:75%;height:10px"></div>
        </div>
        <div class="sk" style="width:34px;height:9px;flex-shrink:0"></div>
      </div>`);
  }
  return sk.join('');
}

function _sortItems() {
  _state.items.sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    const pa = _cfg(a.type).priority;
    const pb = _cfg(b.type).priority;
    if (pb !== pa) return pb - pa;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function _extractSection(link, target) {
  if (target && typeof target === 'string' && target !== 'home') return target;
  if (!link) return null;
  if (link.startsWith('http') || link.startsWith('/')) {
    const m = String(link).match(/[?&]section=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  return link;
}

function _navigate(section, link) {
  if (!section) {
    if (link) { window.location.href = link; return true; }
    return false;
  }
  const goTo = window.App?.navigation?.goTo;
  const goTo2 = window.App?.navigateTo;
  if (typeof goTo === 'function') {
    try { goTo(section); return true; } catch (_) {}
  }
  if (typeof goTo2 === 'function') {
    try { goTo2(section); return true; } catch (_) {}
  }
  const targetEl = document.getElementById(section);
  if (targetEl) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    targetEl.classList.add('active');
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }
  if (link) { window.location.href = link; return true; }
  return false;
}

export const NewsCenter = {
  _setFilter(f) {
    _state.filter = f;
    _renderList();
  },
  async init(userId) {
    if (!userId) return;
    // Re-inicialización segura si cambia el usuario
    if (_state.userId && _state.userId !== userId) {
      _state.items = [];
      _state.channelName = null;
    }
    _state.userId = userId;

    _injectStyles();
    _buildDOM();

    const els = _els();
    els.badge.textContent = '0';

    // Carga inicial
    this.refresh();

    // Realtime
    const channelName = 'news-center_' + userId;
    if (_state.channelName !== channelName) {
      _state.channelName = channelName;
      try {
        const { RealtimeManager } = await import('./realtime-manager.js');
        RealtimeManager.subscribe(channelName, (channel) => {
          channel.on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: 'user_id=eq.' + userId
          }, (payload) => {
            const n = payload.new;
            if (!n || !n.title) return;
            const item = {
              id: n.id,
              type: n.type || 'info',
              title: n.title,
              message: n.message || '',
              isRead: false,
              createdAt: n.created_at,
              link: n.link || null
            };
            _state.items.unshift(item);
            _renderList();
            // Animación de campana
            const wrap = document.getElementById('newsCenterBellWrap');
            if (wrap) {
              wrap.classList.remove('attention');
              void wrap.offsetWidth;
              wrap.classList.add('attention');
              setTimeout(() => wrap.classList.remove('attention'), 1800);
            }
          });
        });
      } catch (_) {}
    }
  },

  async refresh() {
    if (!_state.userId) return;
    const els = _els();
    if (els.list) {
      els.list.innerHTML = _skeletonHTML();
      // Ocultar chips hasta cargar
      els.grouped.innerHTML = '';
    }
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id,type,title,message,is_read,created_at,link')
        .eq('user_id', _state.userId)
        .order('created_at', { ascending: false })
        .limit(60);
      _state.items = (data || []).map(n => ({
        id: n.id,
        type: n.type || 'info',
        title: n.title || _cfg(n.type || 'info').label,
        message: n.message || '',
        isRead: !!n.is_read,
        createdAt: n.created_at,
        link: n.link || null
      }));
      _sortItems();
      _renderList();
    } catch (err) {
      if (els.list) {
        els.list.innerHTML = '<div class="ncenter-empty"><div style="font-size:2rem">😕</div><div class="ncenter-empty-title">No se pudieron cargar los eventos</div></div>';
      }
    }
  },

  open() {
    _state.opened = true;
    const els = _els();
    els.modal.classList.add('show');
    els.backdrop.classList.add('show');
    this.refresh();
  },

  close() {
    _state.opened = false;
    const els = _els();
    els.modal.classList.remove('show');
    els.backdrop.classList.remove('show');
  },

  async _onItemClick(id) {
    const item = _state.items.find(i => String(i.id) === String(id));
    if (!item) return;
    const section = _extractSection(item.link, TYPE_CONFIG[item.type]?.target);
    const resolved = _navigate(section, item.link);
    if (resolved) _state.opened = false;
    if (!item.isRead) {
      item.isRead = true;
      _renderList();
      try {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      } catch (_) {}
    }
  },

  async markAllRead() {
    const unreadArr = _getUnread();
    if (!unreadArr.length) return;
    const ids = unreadArr.map(i => i.id);
    for (const item of unreadArr) item.isRead = true;
    _renderList();
    try {
      await supabase.from('notifications')
        .update({ is_read: true })
        .eq('user_id', _state.userId)
        .in('id', ids);
    } catch (_) {}
  },

  toggle() {
    if (_state.opened) this.close();
    else this.open();
  }
};

window.NewsCenter = NewsCenter;