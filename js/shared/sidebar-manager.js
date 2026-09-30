/**
 * SIDEBAR MANAGER — Sistema Unificado v2
 * Aplica a: panel_directora, panel_asistente, panel-maestra, panel_padres
 *
 * - Colapso persistente via localStorage (body.sidebar-collapsed)
 * - Hover-expand en modo colapsado (overlay, no mueve el contenido)
 * - Mobile open/close con clase mobile-visible
 * - Panel padres: solo wires el toggle desktop (mobile ya lo maneja setupNavigation)
 */

const LS_KEY = 'karpus_sidebar_collapsed';

export function initSidebar() {
  const sidebar    = document.getElementById('sidebar');
  const overlay    = document.getElementById('sidebarOverlay');
  const toggleBtn  = document.getElementById('toggleSidebar');
  const toggleIcon = document.getElementById('toggleSidebarIcon');

  if (!sidebar) return;

  const isMobile      = () => window.innerWidth < 769;
  const isPadrePanel  = document.body.classList.contains('panel-padre-body');
  const _reIcons      = () => { if (window.lucide) requestAnimationFrame(() => lucide.createIcons()); };

  // ── Desktop collapse state ────────────────────────────────────────
  const _applyCollapsed = (collapsed) => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    sidebar.classList.toggle('collapsed', collapsed);
    if (toggleIcon) toggleIcon.style.transform = collapsed ? 'rotate(180deg)' : 'rotate(0deg)';
    if (toggleBtn)  toggleBtn.setAttribute('aria-expanded', String(!collapsed));
  };

  // Restore persisted desktop state
  if (!isMobile()) {
    const saved = localStorage.getItem(LS_KEY) === 'true';
    if (saved) _applyCollapsed(true);
  }

  // Desktop toggle click
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMobile()) return;
      const willCollapse = !sidebar.classList.contains('collapsed');
      _applyCollapsed(willCollapse);
      localStorage.setItem(LS_KEY, String(willCollapse));
      _reIcons();
    });
  }

  // ── Mobile open/close ─────────────────────────────────────────────
  // Padres panel handles its own mobile sidebar via setupNavigation() using
  // the 'open' class and animate-slide-in/out — skip mobile wiring for it.
  if (!isPadrePanel) {
    const _openMobile = () => {
      sidebar.classList.add('mobile-visible');
      if (overlay) { overlay.style.display = 'block'; requestAnimationFrame(() => overlay.classList.add('visible')); }
    };

    const _closeMobile = () => {
      sidebar.classList.remove('mobile-visible');
      if (overlay) { overlay.classList.remove('visible'); overlay.style.display = 'none'; }
    };

    // Hamburger buttons
    document.querySelectorAll('#menuBtn, .menu-btn-mobile, [aria-label="Abrir menú"]').forEach(btn => {
      if (btn._sidebarBound) return;
      btn._sidebarBound = true;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isMobile()) return;
        sidebar.classList.contains('mobile-visible') ? _closeMobile() : _openMobile();
      });
    });

    if (overlay) overlay.addEventListener('click', _closeMobile);

    // Auto-close on nav click (mobile)
    sidebar.querySelectorAll('button[data-section], .kk-nav-item, .nav-btn-toy, .sidebar-item').forEach(btn => {
      btn.addEventListener('click', () => { if (isMobile()) _closeMobile(); });
    });
  }

  // ── Resize handler ────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      // Going to desktop: clear mobile state, re-apply saved collapse
      sidebar.classList.remove('mobile-visible', 'open');
      if (overlay) { overlay.classList.remove('visible'); overlay.style.display = 'none'; }
      _applyCollapsed(localStorage.getItem(LS_KEY) === 'true');
    } else {
      // Going to mobile: remove desktop collapse
      _applyCollapsed(false);
    }
  }, { passive: true });
}

/**
 * Inicializar toggles de dropdowns del sidebar (acordeón)
 */
export function initSidebarDropdowns() {
  document.querySelectorAll('.kk-nav-group-toggle').forEach(btn => {
    if (btn._dropdownBound) return;
    btn._dropdownBound = true;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const group   = btn.closest('.kk-nav-group');
      const submenu = group?.querySelector('.kk-nav-sub');
      if (!group || !submenu) return;
      btn.classList.toggle('open');
      group.classList.toggle('open');
      submenu.style.display = (submenu.style.display === 'none' || submenu.style.display === '') ? 'block' : 'none';
    });
  });
}
