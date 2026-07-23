/**
 * 🧰 Helpers PRO - Nivel Empresa
 */

export const Helpers = {

  /**
   * 🛡️ Escapar HTML
   */
  escapeHTML(str = '') {

    return String(str)

      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  },


  /**
   * 🔔 Toast moderno con microinteracciones
   */
  toast(msg, type = 'success', duration = 4000) {
    if (!msg) return;

    document.querySelectorAll('.app-toast').forEach(t => t.remove());

    const el = document.createElement('div');

    const _icons = { success: '✅', error: '⚠️', warning: '⚡', info: '💬', created: '🎉', deleted: '🗑', saved: '✓', published: '📢' };
    const _colors = {
      success: 'bg-emerald-500 text-white border-emerald-400',
      error: 'bg-rose-500 text-white border-rose-400',
      warning: 'bg-amber-500 text-white border-amber-400',
      info: 'bg-indigo-500 text-white border-indigo-400',
      created: 'bg-emerald-500 text-white border-emerald-400',
      deleted: 'bg-slate-700 text-white border-slate-600',
      saved: 'bg-emerald-500 text-white border-emerald-400',
      published: 'bg-indigo-500 text-white border-indigo-400'
    };

    el.className = `app-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border text-sm font-bold transition-all duration-300 ${_colors[type] || _colors.success}`;
    el.innerHTML = `<span class="text-base">${_icons[type] || '✅'}</span> ${Helpers.escapeHTML(msg)}`;

    document.body.appendChild(el);

    setTimeout(() => {
      el.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => el.remove(), 300);
    }, duration);
  },


  /**
   * ❌ Error state con botón de reintentar
   * @param {string} msg — mensaje de error
   */
  errorState(msg) {
    return `
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <div class="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-4">
          <i data-lucide="alert-circle" class="w-8 h-8"></i>
        </div>
        <h4 class="text-sm font-black text-slate-800 uppercase tracking-widest">${Helpers.escapeHTML(msg)}</h4>
        <button onclick="location.reload()" class="mt-4 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase transition-all">Reintentar</button>
      </div>
    `;
  },

  /**
   * 📳 Haptic Feedback (Vibración sutil para móvil)
   */
  vibrate(style = 'light') {
    if (!('vibrate' in navigator)) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    
    try {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 40,
        success: [10, 40, 10],
        error: [60, 100, 60]
      };
      navigator.vibrate(patterns[style] || 10);
    } catch (e) {
      // Silenciar error de navegador por falta de interacción
    }
  },

  /**
   * 📅 Obtener fecha local en formato YYYY-MM-DD
   * Evita el error de cambio de día prematuro (UTC vs Local)
   */
  getYYYYMMDD(date = new Date()) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Plantilla profesional de carnet de una sola cara (split 50/50) para impresion
   * @param {string} qrImg - data URL del QR
   * @param {string} name - nombre del estudiante
   * @param {string} matricula - matricula (se muestra con prefijo MSC-)
   * @param {object} opts - { classroom, schedule, year, logoUrl }
   */
  getQRPrintTemplate(qrImg, name, matricula, opts = {}) {
    const mat = (matricula || '').startsWith('MSC-') ? matricula : 'MSC-' + (matricula || '');
    const classroom = opts.classroom || '';
    const schedule  = opts.schedule  || '08:00 AM - 12:30 PM';
    const year      = opts.year      || new Date().getFullYear();
    const school    = 'Colegio Montessori Sonrisas Creativas';

    // SVG Pentagon mascot (green)
    const pentagon = `<svg width="28" height="32" viewBox="0 0 180 210" style="display:block">
      <ellipse cx="90" cy="22" rx="46" ry="16" fill="#0B63C7"/>
      <path d="M 52 28 Q 40 42 48 56 L 132 56 Q 140 42 128 28 Z" fill="#0B63C7"/>
      <polygon points="90,56 168,112 140,198 40,198 12,112" fill="#28B54D" stroke="#1A8035" stroke-width="4"/>
      <circle cx="75" cy="128" r="13" fill="white"/><circle cx="105" cy="128" r="13" fill="white"/>
      <circle cx="76" cy="129" r="6" fill="#1A2340"/><circle cx="106" cy="129" r="6" fill="#1A2340"/>
      <circle cx="79" cy="126" r="2.5" fill="white"/><circle cx="109" cy="126" r="2.5" fill="white"/>
      <path d="M 66 155 Q 90 170 114 155" stroke="#1A2340" stroke-width="5" fill="none" stroke-linecap="round"/>
    </svg>`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Carnet ${mat}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Nunito',sans-serif;background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{width:210mm;min-height:297mm;margin:0 auto;padding:10mm;background:#f1f5f9}
    .card-wrap{display:inline-flex;gap:0;margin:4mm;vertical-align:top}
    /* Card dimensions: 85.6mm x 54mm (credit card size) */
    .card-single{width:85.6mm;height:54mm;border-radius:4mm;overflow:hidden;position:relative;border:1.5pt solid #28B54D;background:white;box-shadow:0 4px 12px rgba(40,181,77,.15);display:flex;flex-direction:column}
    /* Cabecera del carnet */
    .card-header{background:linear-gradient(135deg,#28B54D 0%,#1A8035 100%);width:100%;height:9mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
    .school-title{color:white;font-size:5pt;font-weight:900;letter-spacing:.2pt;text-transform:uppercase}
    /* Cuerpo dividido en 2 mitades (50 / 50) */
    .card-body-split{flex:1;display:flex;width:100%;height:calc(100% - 15mm)}
    /* Mitad Izquierda - QR */
    .split-left-qr{width:50%;border-right:1px dashed #e2e8f0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fafafb;padding:1.5mm}
    .qr-container{width:28mm;height:28mm;background:white;border:1pt solid #28B54D;border-radius:1.5mm;padding:1mm;display:flex;align-items:center;justify-content:center}
    .qr-container img{width:100%;height:100%;display:block}
    .qr-helper-text{font-size:4.5pt;font-weight:900;color:#718096;margin-top:1mm;text-transform:uppercase;letter-spacing:.3pt}
    /* Mitad Derecha - Información y Foto del Estudiante */
    .split-right-info{width:50%;display:flex;flex-direction:column;justify-content:space-between;padding:2mm 3mm}
    .student-badge-row{display:flex;align-items:center;gap:2mm}
    /* Foto del estudiante redondeada */
    .student-avatar{width:11mm;height:11mm;border-radius:2mm;border:1pt solid #FF8A00;background:#fff8f0;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}
    .student-avatar img{width:100%;height:100%;object-fit:cover}
    .student-avatar-placeholder{font-size:12pt;color:#FF8A00}
    /* Bloque de datos */
    .student-data{display:flex;flex-direction:column}
    .student-name{font-size:6.5pt;font-weight:900;color:#1A2340;line-height:1.1;margin-bottom:.5mm}
    .student-id{font-size:5.5pt;font-weight:900;color:#FF8A00;font-family:monospace}
    .academic-details{display:flex;flex-direction:column;gap:.5mm;margin-top:1mm}
    .detail-item{display:flex;flex-direction:column}
    .detail-label{font-size:4pt;font-weight:900;color:#a0aec0;text-transform:uppercase;letter-spacing:.2pt}
    .detail-value{font-size:5.2pt;font-weight:700;color:#2d3748}
    /* Pie de carnet */
    .card-footer{background:#1A2340;height:6mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
    .footer-text{color:rgba(255,255,255,.8);font-size:4.5pt;font-weight:800;letter-spacing:.5pt;text-transform:uppercase}
    /* Print layout: 2 cols x 5 rows = 10 per page */
    .cards-grid{display:flex;flex-wrap:wrap;gap:4mm}
    @media print{
      body{background:white}
      .page{padding:8mm;background:white}
      .card-single{box-shadow:none}
      @page{size:A4;margin:0}
    }
  </style>
</head>
<body>
<div class="page">
  <div class="cards-grid">

    <!-- Tarjeta Single Split -->
    <div class="card-single">
      <!-- Cabecera -->
      <div class="card-header">
        <span class="school-title">${school}</span>
        ${pentagon}
      </div>

      <!-- Cuerpo Dividido en Dos (Left QR / Right Info) -->
      <div class="card-body-split">
        <!-- Izquierda: Código QR -->
        <div class="split-left-qr">
          <div class="qr-container">
            <img src="${qrImg}" alt="QR Acceso">
          </div>
          <span class="qr-helper-text">Escanear para entrada/salida</span>
        </div>

        <!-- Derecha: Datos y Foto -->
        <div class="split-right-info">
          <div class="student-badge-row">
            <!-- Avatar del Estudiante -->
            <div class="student-avatar">
              <span class="student-avatar-placeholder">👶</span>
            </div>
            <!-- Nombre e ID -->
            <div class="student-data">
              <h4 class="student-name">${Helpers.escapeHTML(name || 'Estudiante')}</h4>
              <span class="student-id">${mat}</span>
            </div>
          </div>

          <!-- Detalles Académicos -->
          <div class="academic-details">
            ${classroom ? `<div class="detail-item">
              <span class="detail-label">Aula</span>
              <span class="detail-value">${Helpers.escapeHTML(classroom)}</span>
            </div>` : ''}
            <div class="detail-item">
              <span class="detail-label">Horario escolar</span>
              <span class="detail-value">${Helpers.escapeHTML(schedule)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Pie de Tarjeta -->
      <div class="card-footer">
        <span class="footer-text">Seguridad & Control de Acceso</span>
        <span class="footer-text" style="color:#FF8A00">Curso ${year}</span>
      </div>
    </div>

  </div>
</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),600)},600)}</script>
</body>
</html>`;
  },

  /**
   * Imprime todos los carnets de una lista de estudiantes en un solo PDF (single-sided split design)
   * @param {Array} students - [{name, matricula, classroom, schedule, avatarUrl}]
   */
  async printAllCarnets(students = []) {
    if (!students.length) { this.toast('Sin estudiantes para imprimir', 'warning'); return; }

    // Load QR lib
    await new Promise(resolve => {
      if (window.QRCode) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'js/shared/qrcode.min.js';
      s.onload = resolve;
      document.head.appendChild(s);
    });

    // Generate QR images for all students
    const qrImages = await Promise.all(students.map(st => new Promise(res => {
      const tmp = document.createElement('div');
      tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:200px;height:200px';
      document.body.appendChild(tmp);
      const mat = (st.matricula || '').startsWith('MSC-') ? st.matricula : 'MSC-' + (st.matricula || '');
      try {
        new window.QRCode(tmp, { text: mat, width: 200, height: 200, colorDark:'#1e293b', colorLight:'#ffffff', correctLevel: window.QRCode.CorrectLevel.H });
        setTimeout(() => {
          const img = tmp.querySelector('img')?.src || tmp.querySelector('canvas')?.toDataURL() || '';
          document.body.removeChild(tmp);
          res({ ...st, qrImg: img, mat });
        }, 250);
      } catch (_) { document.body.removeChild(tmp); res({ ...st, qrImg: '', mat }); }
    })));

    // Pentagon SVG mascot
    const pentagon = `<svg width="26" height="30" viewBox="0 0 180 210" style="display:block">
      <ellipse cx="90" cy="22" rx="46" ry="16" fill="#0B63C7"/>
      <path d="M 52 28 Q 40 42 48 56 L 132 56 Q 140 42 128 28 Z" fill="#0B63C7"/>
      <polygon points="90,56 168,112 140,198 40,198 12,112" fill="#28B54D" stroke="#1A8035" stroke-width="4"/>
      <circle cx="75" cy="128" r="13" fill="white"/><circle cx="105" cy="128" r="13" fill="white"/>
      <circle cx="76" cy="129" r="6" fill="#1A2340"/><circle cx="106" cy="129" r="6" fill="#1A2340"/>
      <circle cx="79" cy="126" r="2.5" fill="white"/><circle cx="109" cy="126" r="2.5" fill="white"/>
      <path d="M 66 155 Q 90 170 114 155" stroke="#1A2340" stroke-width="5" fill="none" stroke-linecap="round"/>
    </svg>`;

    const year = new Date().getFullYear();
    const school = 'Colegio Montessori Sonrisas Creativas';
    const defaultSchedule = '08:00 AM - 12:30 PM';

    const cardsHTML = qrImages.map(st => `
      <!-- Tarjeta Single Split -->
      <div class="card-single">
        <!-- Cabecera -->
        <div class="card-header">
          <span class="school-title">${school}</span>
          ${pentagon}
        </div>

        <!-- Cuerpo Dividido en Dos (Left QR / Right Info) -->
        <div class="card-body-split">
          <!-- Izquierda: Código QR -->
          <div class="split-left-qr">
            <div class="qr-container">
              ${st.qrImg ? `<img src="${st.qrImg}" alt="QR Acceso">` : '<span style="font-size:8pt;color:#94a3b8">QR</span>'}
            </div>
            <span class="qr-helper-text">Escanear para entrada/salida</span>
          </div>

          <!-- Derecha: Datos y Foto -->
          <div class="split-right-info">
            <div class="student-badge-row">
              <!-- Avatar del Estudiante -->
              <div class="student-avatar">
                <span class="student-avatar-placeholder">👶</span>
              </div>
              <!-- Nombre e ID -->
              <div class="student-data">
                <h4 class="student-name">${Helpers.escapeHTML((st.name||'—').substring(0,26))}</h4>
                <span class="student-id">${st.mat}</span>
              </div>
            </div>

            <!-- Detalles Académicos -->
            <div class="academic-details">
              ${st.classroom ? `<div class="detail-item">
                <span class="detail-label">Aula</span>
                <span class="detail-value">${Helpers.escapeHTML(st.classroom)}</span>
              </div>` : ''}
              <div class="detail-item">
                <span class="detail-label">Horario escolar</span>
                <span class="detail-value">${Helpers.escapeHTML(st.schedule || defaultSchedule)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pie de Tarjeta -->
        <div class="card-footer">
          <span class="footer-text">Seguridad & Control de Acceso</span>
          <span class="footer-text" style="color:#FF8A00">Curso ${year}</span>
        </div>
      </div>`).join('\n');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Carnets Estudiantes</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Nunito',sans-serif;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;margin:0 auto;padding:8mm}
.cards-grid{display:flex;flex-wrap:wrap;gap:4mm;justify-content:flex-start}
.card-single{width:85.6mm;height:54mm;border-radius:4mm;overflow:hidden;position:relative;border:1.5pt solid #28B54D;background:white;flex-shrink:0;display:flex;flex-direction:column}
/* Cabecera del carnet */
.card-header{background:linear-gradient(135deg,#28B54D 0%,#1A8035 100%);width:100%;height:9mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
.school-title{color:white;font-size:5pt;font-weight:900;letter-spacing:.2pt;text-transform:uppercase}
/* Cuerpo dividido en 2 mitades (50 / 50) */
.card-body-split{flex:1;display:flex;width:100%;height:calc(100% - 15mm)}
/* Mitad Izquierda - QR */
.split-left-qr{width:50%;border-right:1px dashed #e2e8f0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fafafb;padding:1.5mm}
.qr-container{width:28mm;height:28mm;background:white;border:1pt solid #28B54D;border-radius:1.5mm;padding:1mm;display:flex;align-items:center;justify-content:center}
.qr-container img{width:100%;height:100%}
.qr-helper-text{font-size:4.5pt;font-weight:900;color:#718096;margin-top:1mm;text-transform:uppercase;letter-spacing:.3pt}
/* Mitad Derecha - Información y Foto del Estudiante */
.split-right-info{width:50%;display:flex;flex-direction:column;justify-content:space-between;padding:2mm 3mm}
.student-badge-row{display:flex;align-items:center;gap:2mm}
/* Foto del estudiante redondeada */
.student-avatar{width:11mm;height:11mm;border-radius:2mm;border:1pt solid #FF8A00;background:#fff8f0;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.student-avatar-placeholder{font-size:12pt;color:#FF8A00}
/* Bloque de datos */
.student-data{display:flex;flex-direction:column}
.student-name{font-size:6.5pt;font-weight:900;color:#1A2340;line-height:1.1;margin-bottom:.5mm}
.student-id{font-size:5.5pt;font-weight:900;color:#FF8A00;font-family:monospace}
.academic-details{display:flex;flex-direction:column;gap:.5mm;margin-top:1mm}
.detail-item{display:flex;flex-direction:column}
.detail-label{font-size:4pt;font-weight:900;color:#a0aec0;text-transform:uppercase;letter-spacing:.2pt}
.detail-value{font-size:5.2pt;font-weight:700;color:#2d3748}
/* Pie de carnet */
.card-footer{background:#1A2340;height:6mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;flex-shrink:0}
.footer-text{color:rgba(255,255,255,.8);font-size:4.5pt;font-weight:800;letter-spacing:.5pt;text-transform:uppercase}
@media print{@page{size:A4;margin:0}.page{padding:6mm}}
</style></head><body>
<div class="page"><div class="cards-grid">${cardsHTML}</div></div>
<script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),800)},800)}<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
    else this.toast('Permite ventanas emergentes para imprimir', 'warning');
  },

  /**
   * 🎭 Escape HTML
   */
  escapeHTML(str = '') {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  },

  /**
   * 🎭 Empty state
   */
  emptyState(msg = 'Sin datos', icon = 'smile') {

    return `

      <div class="

        flex flex-col
        items-center
        justify-center
        p-12
        text-center

        bg-slate-50/60

        rounded-[3rem]

        border-2
        border-dashed
        border-slate-200

      ">

        <div class="

          w-20 h-20
          bg-white
          rounded-full
          flex
          items-center
          justify-center
          mb-6
          shadow-xl

        ">

          <i
            data-lucide="${icon}"
            class="w-10 h-10 text-slate-300"
          ></i>

        </div>

        <h4 class="

          text-slate-800
          font-black
          text-lg
          mb-2

        ">

          Sin datos

        </h4>

        <p class="

          text-slate-400
          font-bold
          text-sm
          max-w-[260px]

        ">

          ${Helpers.escapeHTML(msg)}

        </p>

      </div>

    `;

  },


  /**
   * ❓ Confirmación nativa (wrapper)
   */
  async confirm(msg = '¿Estás seguro?') {
    return window.confirm(msg);
  },

  /**
   * 🦴 Skeleton lista
   */
  skeleton(rows = 3, height = 'h-24') {
    return Array(rows).fill(0).map(() => `
      <tr class="animate-pulse border-b border-slate-50">
        <td colspan="100%" class="px-6 py-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-slate-100 rounded-2xl"></div>
            <div class="flex-1 space-y-2">
              <div class="h-3 bg-slate-100 rounded-full w-1/3"></div>
              <div class="h-2 bg-slate-50 rounded-full w-1/4"></div>
            </div>
          </div>
        </td>
      </tr>
    `).join('');
  },


  /**
   * 🧱 Skeleton automático por ID
   */
  skeletonize(ids = []) {

    ids.forEach(id => {

      const el =
        document.getElementById(id);

      if (!el) return;


      // calendario
      if (
        id
        .toLowerCase()
        .includes('calendar')
      ) {

        el.innerHTML = `

          <div class="

            h-48
            bg-slate-100
            rounded-2xl
            animate-pulse

          "></div>

        `;

        return;

      }


      // listas
      if (
        id
        .toLowerCase()
        .includes('list')
      ) {

        el.innerHTML =
          Helpers.skeleton(
            3,
            'h-12'
          );

        return;

      }


      // KPI
      el.innerHTML = `

        <div class="

          h-8
          w-32

          bg-slate-200

          rounded-xl

          animate-pulse

        "></div>

      `;

    });

  },


  /**
   * 🪟 loading overlay global
   */
  showLoader(msg = 'Cargando...') {

    Helpers.hideLoader();

    const el =
      document.createElement('div');

    el.id = 'globalLoader';

    el.className = `

      fixed
      inset-0

      bg-white/70
      backdrop-blur-sm

      flex
      items-center
      justify-center

      z-[999]

    `;

    el.innerHTML = `

      <div class="

        flex
        flex-col
        items-center
        gap-4

        p-8

        bg-white

        rounded-3xl

        shadow-xl

      ">

        <div class="

          w-10
          h-10

          border-4
          border-slate-200
          border-t-indigo-500

          rounded-full

          animate-spin

        "></div>

        <p class="

          text-sm
          font-bold
          text-slate-600

        ">

          ${Helpers.escapeHTML(msg)}

        </p>

      </div>

    `;

    document.body.appendChild(el);

  },


  hideLoader() {

    document
      .getElementById(
        'globalLoader'
      )
      ?.remove();

  },


  /**
   * 🖼️ avatar fallback — con lazy loading
   */
  avatar(url, name = '') {
    if (url) {
      // Usar data-src para lazy loading via ImageLoader
      return `<img
        src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k="
        data-src="${url}"
        data-fallback="img/monte.jpg"
        class="karpus-img karpus-img-loading w-full h-full object-cover"
        loading="lazy"
        decoding="async">`;
    }
    const letter = name?.charAt(0)?.toUpperCase() || '?';
    return `<div class="w-full h-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-black">${letter}</div>`;
  },

  /**
   * ⏳ debounce pro
   */
  debounce(
    func,
    wait = 300
  ) {

    let timeout;

    const debounced =
      (...args) => {

        clearTimeout(timeout);

        timeout =
          setTimeout(
            () => func(...args),
            wait
          );

      };

    debounced.cancel =
      () =>
        clearTimeout(timeout);

    return debounced;

  },

  /**
   * 🛡️ try/catch global con logging a DB
   */
  async safe(fn, context = 'global') {
    try {
      return await fn();
    } catch (err) {
      console.error(`[Safe:${context}]`, err);
      
      // Registrar error en la tabla system_errors de forma silenciosa
      try {
        const { supabase } = await import('./supabase.js');
        const user = (await supabase.auth.getUser())?.data?.user;
        
        await supabase.from('system_errors').insert([{
          context,
          message: err.message,
          stack: err.stack,
          user_id: user?.id,
          url: window.location.href,
          user_agent: navigator.userAgent
        }]);
      } catch (logErr) {
        console.warn('Could not log error to DB:', logErr);
      }

      Helpers.toast('Algo no salió bien. El equipo técnico ha sido notificado.', 'error');
      return null;
    }
  },


  /**
   * 🆔 generar id
   */
  uid() {

    return crypto.randomUUID();

  },


  /**
   * ⏱️ sleep async
   */
  sleep(ms = 300) {

    return new Promise(

      resolve =>
        setTimeout(resolve, ms)

    );

  },


  /**
   * 📅 formato fecha RD
   */
  formatDate(date) {

    if (!date) return '';

    return new Date(date)

      .toLocaleDateString(

        'es-DO',

        {

          day: '2-digit',

          month: 'short',

          year: 'numeric'

        }

      );

  },


  /**
   * 📅 formato corto
   */
  formatShortDate(date) {

    if (!date) return '';

    return new Date(date)

      .toLocaleDateString(

        'es-DO',

        {

          day: 'numeric',

          month: 'short'

        }

      );

  },


  /**
   * 💰 formato moneda
   */
  formatCurrency(val = 0) {
    const num = Number(val || 0);
    return num.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },


  /**
   * 📉 exportar csv excel
   */
  exportToCSV(data, filename = `export_${new Date().getFullYear()}.csv`) {
    if (!data || !data.length) {
      Helpers.toast('No hay datos', 'warning');
      return;
    }

    const headers =
      Object.keys(data[0]);

    const csv = [

      headers.join(','),

      ...data.map(row =>

        headers

          .map(key => {

            let val =
              row[key] ?? '';

            val =
              String(val)
                .replace(/"/g, '""');

            if (
              val.match(
                /("|,|\n)/
              )
            ) {

              val =
                `"${val}"`;

            }

            return val;

          })

          .join(',')

      )

    ].join('\r\n');


    const blob =
      new Blob(

        [

          "\ufeff" + csv

        ],

        {

          type:
            'text/csv;charset=utf-8;'

        }

      );


    const link =
      document.createElement('a');

    link.href =
      URL.createObjectURL(blob);

    link.download =
      filename;

    link.click();

  },


  /**
   * 💰 Cálculo de Mora (Regla Unificada 5% Mensual)
   * Se aplica un 5% del monto base por cada mes o fracción de mes de retraso.
   */
  calculateMora(dueDate, baseAmount = 0) {
    if (!dueDate || !baseAmount) return 0;

    const dueDateStr = String(dueDate);
    const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)
      ? dueDateStr + 'T00:00:00'
      : dueDateStr;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const limit = new Date(normalizedDate);
    limit.setHours(0, 0, 0, 0);

    const diff = today.getTime() - limit.getTime();
    const daysLate = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (daysLate <= 0) return 0;

    const moraRate = 0.05; // 5% mensual
    const monthsLate = Math.ceil(daysLate / 30);
    const totalMora = Number(baseAmount) * moraRate * monthsLate;

    return Math.round(totalMora * 100) / 100;
  },

  /**
   * 💰 Desglose de Mora para UI
   */
  getMoraBreakdown(dueDate, baseAmount = 0) {
    const total = Helpers.calculateMora(dueDate, baseAmount);
    if (total === 0) return null;

    const dueDateStr = String(dueDate);
    const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)
      ? dueDateStr + 'T00:00:00'
      : dueDateStr;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const limit = new Date(normalizedDate); limit.setHours(0, 0, 0, 0);
    const daysLate = Math.floor((today.getTime() - limit.getTime()) / (1000 * 60 * 60 * 24));

    const monthsLate = Math.ceil(daysLate / 30);

    let text = daysLate === 1 ? '1 día' : `${daysLate} días`;
    if (monthsLate > 0) {
      text = `${monthsLate} mes${monthsLate > 1 ? 'es' : ''} (${daysLate} d)`;
    }

    return {
      total,
      daysLate,
      monthsLate,
      formattedText: text.trim()
    };
  },

  /**
   * Delegación de eventos segura
   */
  delegate(el, selector, event, handler) {
    el.addEventListener(event, (e) => {
      const target = e.target.closest(selector);
      if (target && el.contains(target)) {
        handler.call(target, e, target);
      }
    });
  },

  /**
   * Sanitize value for use in HTML attributes (src, href, onerror, etc.)
   * Only allows safe protocols (http, https, data for images).
   */
  sanitizeAttr(str = '') {
    if (typeof str !== 'string') return '';
    const s = str.trim();
    if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
    if (/^blob:/i.test(s)) return s;
    return '';
  }

};

// ── Compat exports (used by padre/ modules) ──────────────────────────────────
export const DATE_FORMAT = { locale: 'es-ES', options: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' } };
export const TOAST_DURATION = 2800;
export const escapeHtml = (str) => Helpers.escapeHTML(str);

// Exponer globalmente para que el listener karpus:db-error pueda usar toast
if (typeof window !== 'undefined') window.Helpers = Helpers;