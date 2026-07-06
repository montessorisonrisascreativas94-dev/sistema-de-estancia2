$b = "c:\Users\digitacionlab\Documents\SISTEMA\sistema-de-estancia2-main\panel_directora.html"
$c = [System.IO.File]::ReadAllText($b)

# Find nav start and end
$navStart = $c.IndexOf('<nav class="flex-1 overflow-y-auto kk-scroll')
$navEnd   = $c.IndexOf("</nav>", $navStart) + "</nav>".Length

Write-Output "Nav start: $navStart  End: $navEnd  Valid: $($navStart -ge 0 -and $navEnd -gt $navStart)"

if ($navStart -lt 0 -or $navEnd -le $navStart) { Write-Output "NOT FOUND"; exit }

$newNav = @'
<nav class="flex-1 overflow-y-auto kk-scroll px-2 py-2 space-y-1 relative z-10">

        <!-- Dashboard -->
        <button data-section="dashboard" class="kk-nav-item" data-tooltip="Dashboard">
          <i data-lucide="layout-dashboard" class="text-blue-300"></i>
          <span class="label">Dashboard</span>
        </button>

        <!-- FINANZAS -->
        <div class="kk-nav-group">
          <button class="kk-nav-item kk-nav-group-toggle w-full" data-group="finanzas" data-tooltip="Finanzas">
            <i data-lucide="banknote" class="text-yellow-300 shrink-0"></i>
            <span class="label flex-1 text-left">Finanzas</span>
            <i data-lucide="chevron-down" class="kk-nav-chevron w-3.5 h-3.5 label opacity-60 shrink-0"></i>
            <span id="badge-pagos" class="hidden kk-badge">0</span>
          </button>
          <div class="kk-nav-sub" id="group-finanzas" style="display:none">
            <button data-section="pagos" class="kk-nav-sub-item">
              <i data-lucide="credit-card" class="w-3.5 h-3.5 text-yellow-200 shrink-0"></i>
              <span>Pagos</span>
            </button>
            <button data-section="contabilidad" class="kk-nav-sub-item">
              <i data-lucide="bar-chart-3" class="w-3.5 h-3.5 text-orange-200 shrink-0"></i>
              <span>Contabilidad</span>
            </button>
          </div>
        </div>

        <!-- GESTION ACADEMICA -->
        <div class="kk-nav-group">
          <button class="kk-nav-item kk-nav-group-toggle w-full" data-group="academica" data-tooltip="Gestion Academica">
            <i data-lucide="graduation-cap" class="text-green-300 shrink-0"></i>
            <span class="label flex-1 text-left">Gestion Academica</span>
            <i data-lucide="chevron-down" class="kk-nav-chevron w-3.5 h-3.5 label opacity-60 shrink-0"></i>
            <span id="badge-gestion" class="hidden kk-badge">0</span>
          </button>
          <div class="kk-nav-sub" id="group-academica" style="display:none">
            <button data-section="maestros" class="kk-nav-sub-item">
              <i data-lucide="user-cog" class="w-3.5 h-3.5 text-green-200 shrink-0"></i>
              <span>Maestros</span>
              <span id="badge-maestros" class="hidden kk-badge ml-auto">0</span>
            </button>
            <button data-section="staff-permits" class="kk-nav-sub-item">
              <i data-lucide="calendar-check" class="w-3.5 h-3.5 text-emerald-200 shrink-0"></i>
              <span>Permisos Staff</span>
            </button>
            <button data-section="accesos" class="kk-nav-sub-item">
              <i data-lucide="scan-line" class="w-3.5 h-3.5 text-lime-200 shrink-0"></i>
              <span>Accesos QR</span>
            </button>
            <button data-section="estudiantes" class="kk-nav-sub-item">
              <i data-lucide="users" class="w-3.5 h-3.5 text-sky-200 shrink-0"></i>
              <span>Estudiantes</span>
              <span id="badge-estudiantes" class="hidden kk-badge ml-auto">0</span>
            </button>
            <button data-section="aulas" class="kk-nav-sub-item">
              <i data-lucide="school" class="w-3.5 h-3.5 text-blue-200 shrink-0"></i>
              <span>Aulas</span>
            </button>
            <button data-section="asistencia" class="kk-nav-sub-item">
              <i data-lucide="calendar-check-2" class="w-3.5 h-3.5 text-pink-200 shrink-0"></i>
              <span>Asistencia</span>
              <span id="badge-asistencia" class="hidden kk-badge ml-auto">0</span>
            </button>
            <button data-section="calificaciones" class="kk-nav-sub-item">
              <i data-lucide="star" class="w-3.5 h-3.5 text-amber-200 shrink-0"></i>
              <span>Calificaciones</span>
              <span id="badge-calificaciones" class="hidden kk-badge ml-auto">0</span>
            </button>
            <button data-section="videoconferencia" class="kk-nav-sub-item">
              <i data-lucide="video" class="w-3.5 h-3.5 text-rose-200 shrink-0"></i>
              <span>Videoconferencia</span>
            </button>
          </div>
        </div>

        <!-- CICLO ESCOLAR -->
        <div class="kk-nav-group">
          <button class="kk-nav-item kk-nav-group-toggle w-full" data-group="ciclo" data-tooltip="Ciclo Escolar">
            <i data-lucide="calendar-range" class="text-teal-300 shrink-0"></i>
            <span class="label flex-1 text-left">Ciclo Escolar</span>
            <i data-lucide="chevron-down" class="kk-nav-chevron w-3.5 h-3.5 label opacity-60 shrink-0"></i>
          </button>
          <div class="kk-nav-sub" id="group-ciclo" style="display:none">
            <button data-section="inscripciones" class="kk-nav-sub-item">
              <i data-lucide="clipboard-list" class="w-3.5 h-3.5 text-teal-200 shrink-0"></i>
              <span>Inscripciones</span>
            </button>
          </div>
        </div>

        <!-- COMUNICACION -->
        <div class="kk-nav-group">
          <button class="kk-nav-item kk-nav-group-toggle w-full" data-group="comunicacion" data-tooltip="Comunicacion">
            <i data-lucide="messages-square" class="text-sky-300 shrink-0"></i>
            <span class="label flex-1 text-left">Comunicacion</span>
            <i data-lucide="chevron-down" class="kk-nav-chevron w-3.5 h-3.5 label opacity-60 shrink-0"></i>
            <span id="badge-comunicacion" class="hidden kk-badge">0</span>
          </button>
          <div class="kk-nav-sub" id="group-comunicacion" style="display:none">
            <button data-section="comunicacion" class="kk-nav-sub-item">
              <i data-lucide="message-square" class="w-3.5 h-3.5 text-sky-200 shrink-0"></i>
              <span>Chat</span>
            </button>
            <button data-section="muro" class="kk-nav-sub-item">
              <i data-lucide="layout" class="w-3.5 h-3.5 text-blue-200 shrink-0"></i>
              <span>Muro Escolar</span>
              <span id="badge-muro" class="hidden kk-badge ml-auto">0</span>
            </button>
            <button data-section="reportes" class="kk-nav-sub-item">
              <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-200 shrink-0"></i>
              <span>Incidencias</span>
            </button>
          </div>
        </div>

        <!-- Configuracion -->
        <button data-section="configuracion" class="kk-nav-item" data-tooltip="Configuracion">
          <i data-lucide="sliders-horizontal" class="text-slate-300 shrink-0"></i>
          <span class="label">Configuracion</span>
        </button>

      </nav>
'@

$newC = $c.Substring(0, $navStart) + $newNav + $c.Substring($navEnd)
[System.IO.File]::WriteAllText($b, $newC)

$nc = [System.IO.File]::ReadAllText($b)
Write-Output "kk-nav-group found: " + $nc.Contains("kk-nav-group")
Write-Output "kk-nav-sub found: " + $nc.Contains("kk-nav-sub")
Write-Output "Done."
