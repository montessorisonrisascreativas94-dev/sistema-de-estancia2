$b = "c:\Users\digitacionlab\Documents\SISTEMA\sistema-de-estancia2-main\panel_directora.html"
$c = [System.IO.File]::ReadAllText($b)

# 1. Inject the inscripciones section before </main>
$mainClose = $c.LastIndexOf("</main>")

$newSection = @'

      <!-- SECTION: INSCRIPCIONES -->
      <section id="inscripciones" class="section">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <div class="w-1 h-8 bg-[#FF7A00] rounded-full"></div>
              <h1 class="text-2xl font-black text-[#1A2340]">Inscripciones</h1>
            </div>
            <p class="text-slate-500 font-medium ml-4">Solicitudes de preinscripción y admisiones pendientes</p>
          </div>
          <button onclick="InscripcionesModule.load()"
            class="flex items-center gap-2 px-4 py-2.5 bg-[#E8F2FF] text-[#0B63C7] rounded-xl font-black text-sm hover:bg-[#0B63C7] hover:text-white transition-all">
            <i data-lucide="refresh-cw" class="w-4 h-4"></i> Actualizar
          </button>
        </div>
        <div id="inscripcionesContainer">
          <div class="text-center py-8 text-slate-400">Haz clic en Inscripciones para cargar...</div>
        </div>
      </section>

'@

$c = $c.Substring(0, $mainClose) + $newSection + $c.Substring($mainClose)
[System.IO.File]::WriteAllText($b, $c)
Write-Output "Section injected. Has inscripciones section: " + $c.Contains('id="inscripciones"')
