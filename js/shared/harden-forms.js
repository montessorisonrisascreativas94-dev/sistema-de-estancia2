/* Harden-forms: endurecimiento global de formularios de paneles.
   Classic script (no módulo). Se carga con defer en cada panel:
     <script src="js/shared/harden-forms.js" defer></script>
   Aplica:
     - autocomplete="off" a campos que no sean contraseña/correo/búsqueda.
     - maxlength razonable por tipo de campo (defensa en profundidad junto a
       las restricciones CHECK de la base de datos).
     - Añade noValidate() a formularios que no lo tengan (validación real en API/DB). */
(function () {
  'use strict';
  if (window.__karpus_harden_forms_done) return;
  window.__karpus_harden_forms_done = true;

  var MAX = {
    email: 320,
    tel: 40,
    url: 2083,
    number: 20,
    password: 200,
    text: 5000,
    textarea: 5000
  };

  function apply(root) {
    if (!root) root = document;
    var inputs = root.querySelectorAll('input, textarea');
    Array.prototype.forEach.call(inputs, function (el) {
      if (el.dataset.hardened) return;
      var type = (el.type || el.tagName.toLowerCase()).toLowerCase();

      // Password: mantener el gestor de contraseñas.
      if (type === 'password') {
        if (!el.maxLength || el.maxLength > 200) el.maxLength = 200;
        el.dataset.hardened = '1';
        return;
      }
      // Correo y búsqueda: permitir autocompletar para usabilidad.
      if (type === 'email' || type === 'search' || type === 'tel') {
        if (!el.maxLength) el.maxLength = MAX[type] || 320;
        el.dataset.hardened = '1';
        return;
      }
      if (type === 'hidden' || type === 'checkbox' || type === 'radio' ||
          type === 'file' || type === 'submit' || type === 'button' ||
          type === 'range' || type === 'color' || type === 'date' ||
          type === 'datetime-local' || type === 'month' || type === 'week' ||
          type === 'time') {
        el.dataset.hardened = '1';
        return;
      }

      if (el.autocomplete !== 'off') el.setAttribute('autocomplete', 'off');
      if (!el.maxLength) el.maxLength = MAX[type] || MAX.text;

      // textarea: aplicar límite si no lo tiene.
      if (type === 'textarea') {
        el.setAttribute('autocomplete', 'off');
        if (!el.maxLength) el.maxLength = MAX.textarea;
      }
      el.dataset.hardened = '1';
    });

    var forms = root.querySelectorAll('form');
    Array.prototype.forEach.call(forms, function (f) {
      if (!f.noValidate) {
        try { f.setAttribute('novalidate', ''); } catch (e) { /* noop */ }
      }
    });
  }

  function run() { apply(document); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // Re-aplicar a contenido inyectado dinámicamente.
  var mo = window.MutationObserver && new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (n) {
        if (n && n.nodeType === 1 && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'FORM')) apply(n);
        else if (n && n.querySelectorAll) {
          var found = n.querySelectorAll('input, textarea');
          if (found.length) apply(n);
        }
      });
    });
  });
  if (mo) mo.observe(document.documentElement, { childList: true, subtree: true });
})();
