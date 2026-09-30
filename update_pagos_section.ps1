# Script para reemplazar la sección de pagos en panel_directora.html

$filePath = "c:\Users\usuario\Documents\Nueva carpeta\sistema\panel_directora.html"
$content = Get-Content -Path $filePath -Raw

# Patrón para encontrar la sección de pagos (incluyendo todo el contenido entre los comentarios <!-- PAGOS --> y <!-- COMUNICACION tipo Teams -->)
$startMarker = "      <!-- PAGOS -->"
$endMarker = "      <!-- COMUNICACION tipo Teams -->"

# Encontrar las posiciones
$startIndex = $content.IndexOf($startMarker)
$endIndex = $content.IndexOf($endMarker)

if ($startIndex -ne -1 -and $endIndex -ne -1) {
    # Contenido nuevo de la sección de pagos
    $newSection = @"
      <!-- PAGOS - NUEVO FLUJO -->
      <section id="pagos" class="section">
        <!-- Header Pagos -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <div class="w-1 h-8 bg-[#0B63C7] rounded-full"></div>
              <h1 class="text-2xl font-black text-slate-800 tracking-tight">Gestión de Pagos</h1>
            </div>
            <p class="text-slate-500 font-medium ml-4">Busca un estudiante y gestiona sus pagos en un solo flujo</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- Columna Izquierda: Buscador y Lista de Estudiantes -->
          <div class="lg:col-span-4">
            <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div class="p-5 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
                <h3 class="font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <i data-lucide="users" class="w-5 h-5 text-[#0B63C7]"></i>
                  Buscar Estudiante
                </h3>
                <div class="relative">
                  <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                  <input 
                    id="newPaymentSearch" 
                    placeholder="Buscar por nombre, matrícula, teléfono o código QR..." 
                    class="w-full pl-11 pr-5 py-3.5 border border-slate-200 rounded-2xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-[#0B63C7] focus:border-transparent transition-all">
                </div>
              </div>
              <div id="studentSearchResults" class="max-h-[450px] overflow-y-auto">
                <div class="p-10 text-center text-slate-400">
                  <i data-lucide="user-search" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
                  <p class="text-sm font-medium">Busca un estudiante para comenzar</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Columna Derecha: Expediente Financiero -->
          <div class="lg:col-span-8">
            <div id="financialFileContainer" class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <!-- Estado: Sin Estudiante Seleccionado -->
              <div id="noStudentSelected" class="p-12 text-center text-slate-400">
                <div class="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <i data-lucide="file-user" class="w-10 h-10 text-slate-300"></i>
                </div>
                <p class="text-lg font-bold text-slate-600 mb-2">Selecciona un estudiante</p>
                <p class="text-sm text-slate-500">Busca y selecciona un estudiante para ver su expediente financiero</p>
              </div>

              <!-- Estado: Estudiante Seleccionado -->
              <div id="studentFinancialFile" class="hidden">
                <!-- Encabezado del Estudiante -->
                <div class="p-6 border-b border-slate-100 bg-gradient-to-br from-blue-50 to-white">
                  <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div class="flex items-center gap-3">
                      <div id="studentAvatar" class="w-16 h-16 bg-gradient-to-br from-[#0B63C7] to-blue-600 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-lg">
                        ?
                      </div>
                      <div>
                        <h3 id="studentName" class="text-xl font-black text-slate-800 mb-1">—</h3>
                        <div class="flex flex-wrap items-center gap-2 text-xs">
                          <span id="studentClassroom" class="bg-[#E8F2FF] text-[#0B63C7] px-3 py-1 rounded-full font-bold uppercase tracking-wide">—</span>
                          <span id="studentSchoolYear" class="bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold uppercase tracking-wide">—</span>
                          <span id="studentPlan" class="bg-orange-50 text-orange-600 px-3 py-1 rounded-full font-bold uppercase tracking-wide">—</span>
                        </div>
                      </div>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                      <span class="text-xs font-bold text-slate-400 uppercase tracking-wide">Balance General</span>
                      <span id="studentBalance" class="text-3xl font-black text-slate-800">$0.00</span>
                    </div>
                  </div>
                </div>

                <!-- Tabs: Pendientes vs Historial -->
                <div class="flex border-b border-slate-100 bg-slate-50">
                  <button id="tabPending" class="flex-1 py-4 px-6 font-bold text-sm uppercase tracking-wide border-b-2 border-[#0B63C7] text-[#0B63C7] bg-white">
                    Pendientes
                  </button>
                  <button id="tabHistory" class="flex-1 py-4 px-6 font-bold text-sm uppercase tracking-wide text-slate-500 hover:text-slate-700 transition-colors">
                    Historial
                  </button>
                </div>

                <!-- Contenido de los Tabs -->
                <div class="p-6">
                  <!-- Tab: Pendientes -->
                  <div id="pendingItemsContainer" class="space-y-3">
                    <!-- Items de pago pendiente -->
                  </div>

                  <!-- Tab: Historial -->
                  <div id="historyContainer" class="hidden space-y-3">
                    <!-- Historial de pagos -->
                  </div>
                </div>

                <!-- Carrito de Pagos -->
                <div id="cartContainer" class="hidden border-t border-slate-100 bg-gradient-to-br from-orange-50 to-white">
                  <div class="p-6">
                    <div class="flex items-center justify-between mb-4">
                      <h4 class="text-lg font-black text-slate-800 flex items-center gap-2">
                        <i data-lucide="shopping-cart" class="w-5 h-5 text-orange-500"></i>
                        Carrito de Pagos
                      </h4>
                      <button id="clearCartBtn" class="text-sm font-bold text-slate-400 hover:text-rose-500 transition-colors">
                        Limpiar
                      </button>
                    </div>
                    <div id="cartItems" class="space-y-2 mb-4 max-h-60 overflow-y-auto">
                      <!-- Items del carrito -->
                    </div>
                    <div class="border-t border-slate-200 pt-4 mb-4">
                      <div class="flex flex-col gap-3 mb-4">
                        <!-- Subtotal -->
                        <div class="flex justify-between items-center text-sm">
                          <span class="text-slate-600 font-medium">Subtotal</span>
                          <span id="cartSubtotal" class="font-bold text-slate-800">$0.00</span>
                        </div>
                        <!-- Descuento -->
                        <div id="cartDiscountRow" class="hidden flex justify-between items-center text-sm">
                          <span class="text-emerald-600 font-medium">Descuento</span>
                          <span id="cartDiscount" class="font-bold text-emerald-600">-$0.00</span>
                        </div>
                        <!-- Mora -->
                        <div id="cartMoraRow" class="hidden flex justify-between items-center text-sm">
                          <span class="text-rose-600 font-medium">Mora</span>
                          <span id="cartMora" class="font-bold text-rose-600">$0.00</span>
                        </div>
                        <!-- Total -->
                        <div class="flex justify-between items-center pt-3 border-t border-slate-200">
                          <span class="text-base font-black text-slate-800 uppercase tracking-wide">Total</span>
                          <span id="cartTotal" class="text-3xl font-black text-[#0B63C7]">$0.00</span>
                        </div>
                      </div>
                      <button id="continueToPaymentBtn" class="w-full py-4 bg-gradient-to-r from-[#0B63C7] to-blue-600 text-white font-black text-sm uppercase tracking-wide rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98]">
                        Continuar al Pago
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- MODAL: Método de Pago -->
      <div id="paymentMethodModal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div class="p-6 border-b border-slate-100 bg-gradient-to-br from-[#0B63C7] to-blue-600">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-xl font-black text-white">Confirmar Pago</h3>
                <p class="text-blue-100 text-sm font-medium mt-1">Selecciona el método de pago</p>
              </div>
              <button id="closePaymentModalBtn" class="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors">
                <i data-lucide="x" class="w-5 h-5"></i>
              </button>
            </div>
          </div>
          
          <div class="p-6">
            <!-- Resumen -->
            <div class="mb-6 p-5 bg-slate-50 rounded-2xl border border-slate-100">
              <h4 class="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <i data-lucide="receipt" class="w-4 h-4 text-[#0B63C7]"></i>
                Resumen del Pago
              </h4>
              <div id="paymentSummaryItems" class="space-y-2 mb-3">
                <!-- Items del resumen -->
              </div>
              <div class="flex justify-between items-center pt-3 border-t border-slate-200">
                <span class="font-bold text-slate-800">Total a Pagar</span>
                <span id="paymentSummaryTotal" class="text-3xl font-black text-[#0B63C7]">$0.00</span>
              </div>
            </div>

            <!-- Métodos de Pago -->
            <div class="mb-6">
              <h4 class="font-bold text-slate-800 mb-3">Método de Pago</h4>
              <div class="grid grid-cols-2 gap-3">
                <label class="relative cursor-pointer">
                  <input type="radio" name="paymentMethod" value="efectivo" class="peer sr-only" checked>
                  <div class="p-4 border-2 border-slate-200 rounded-2xl flex items-center gap-3 bg-white hover:border-[#0B63C7] transition-colors peer-checked:border-[#0B63C7] peer-checked:bg-blue-50">
                    <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                      <i data-lucide="banknote" class="w-6 h-6"></i>
                    </div>
                    <span class="font-bold text-slate-800">Efectivo</span>
                  </div>
                </label>

                <label class="relative cursor-pointer">
                  <input type="radio" name="paymentMethod" value="tarjeta" class="peer sr-only">
                  <div class="p-4 border-2 border-slate-200 rounded-2xl flex items-center gap-3 bg-white hover:border-[#0B63C7] transition-colors peer-checked:border-[#0B63C7] peer-checked:bg-blue-50">
                    <div class="w-12 h-12 bg-violet-50 text-violet-600 rounded-xl flex items-center justify-center">
                      <i data-lucide="credit-card" class="w-6 h-6"></i>
                    </div>
                    <span class="font-bold text-slate-800">Tarjeta</span>
                  </div>
                </label>

                <label class="relative cursor-pointer">
                  <input type="radio" name="paymentMethod" value="transferencia" class="peer sr-only">
                  <div class="p-4 border-2 border-slate-200 rounded-2xl flex items-center gap-3 bg-white hover:border-[#0B63C7] transition-colors peer-checked:border-[#0B63C7] peer-checked:bg-blue-50">
                    <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <i data-lucide="landmark" class="w-6 h-6"></i>
                    </div>
                    <span class="font-bold text-slate-800">Transferencia</span>
                  </div>
                </label>

                <label class="relative cursor-pointer">
                  <input type="radio" name="paymentMethod" value="mixto" class="peer sr-only">
                  <div class="p-4 border-2 border-orange-200 rounded-2xl flex items-center gap-3 bg-white hover:border-[#FF8A00] transition-colors peer-checked:border-[#FF8A00] peer-checked:bg-orange-50">
                    <div class="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
                      <i data-lucide="plus-circle" class="w-6 h-6"></i>
                    </div>
                    <span class="font-bold text-slate-800">Pago Mixto ⭐</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- Detalles del Método -->
            <div id="methodDetailsContainer" class="mb-6">
              <!-- Efectivo -->
              <div id="efectivoDetails" class="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <p class="text-sm text-emerald-700 font-medium flex items-center gap-2">
                  <i data-lucide="check-circle" class="w-4 h-4"></i>
                  Pago en efectivo listo para registrar
                </p>
              </div>

              <!-- Tarjeta -->
              <div id="tarjetaDetails" class="hidden space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Banco</label>
                    <select id="cardBank" class="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-[#0B63C7]">
                      <option value="">Seleccionar</option>
                      <option value="Banreservas">Banreservas</option>
                      <option value="Banco Popular">Banco Popular</option>
                      <option value="Scotiabank">Scotiabank</option>
                      <option value="BHD León">BHD León</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Últimos 4 dígitos</label>
                    <input id="cardLast4" type="text" maxlength="4" class="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-[#0B63C7]">
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Autorización</label>
                  <input id="cardAuth" type="text" class="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-[#0B63C7]">
                </div>
              </div>

              <!-- Transferencia -->
              <div id="transferenciaDetails" class="hidden space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Banco</label>
                    <select id="transferBank" class="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-[#0B63C7]">
                      <option value="">Seleccionar</option>
                      <option value="Banreservas">Banreservas</option>
                      <option value="Banco Popular">Banco Popular</option>
                      <option value="Scotiabank">Scotiabank</option>
                      <option value="BHD León">BHD León</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Número de Referencia</label>
                    <input id="transferRef" type="text" class="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-[#0B63C7]">
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
                    <input id="transferDate" type="date" class="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-[#0B63C7]">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Comprobante (opcional)</label>
                    <input id="transferProof" type="file" accept="image/*,.pdf" class="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm font-medium bg-white">
                  </div>
                </div>
              </div>

              <!-- Pago Mixto -->
              <div id="mixtoDetails" class="hidden space-y-4">
                <p class="text-sm text-slate-600 font-medium">Combina múltiples métodos de pago</p>
                <div class="space-y-3" id="mixedPaymentItems">
                  <!-- Items de pago mixto -->
                </div>
                <button id="addMixedMethodBtn" class="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold text-sm hover:border-[#0B63C7] hover:text-[#0B63C7] transition-colors">
                  + Agregar Método
                </button>
              </div>
            </div>

            <!-- Opción de e-CF -->
            <div class="mb-6 p-4 bg-violet-50 border border-violet-100 rounded-2xl">
              <div class="flex items-start gap-3">
                <input type="checkbox" id="needsEcf" class="mt-1 w-5 h-5 text-violet-600 rounded border-violet-300 focus:ring-violet-500">
                <div class="flex-1">
                  <label for="needsEcf" class="font-bold text-violet-800 cursor-pointer">
                    Solicitar e-CF (Comprobante Fiscal)
                  </label>
                  <p class="text-xs text-violet-600 mt-1">Genera y envía el comprobante fiscal a la DGII</p>
                </div>
              </div>
            </div>

            <!-- Botones -->
            <div class="flex flex-col gap-3">
              <button id="confirmPaymentBtn" class="w-full py-4 bg-gradient-to-r from-[#28B54D] to-emerald-600 text-white font-black text-sm uppercase tracking-wide rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98]">
                <i data-lucide="check-circle" class="w-5 h-5 inline mr-2"></i>
                Confirmar Pago
              </button>
              <button id="cancelPaymentModalBtn" class="w-full py-3 bg-slate-100 text-slate-700 font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- MODAL: Pago Exitoso -->
      <div id="paymentSuccessModal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md text-center p-8">
          <div class="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="check-circle" class="w-10 h-10"></i>
          </div>
          <h3 class="text-2xl font-black text-slate-800 mb-2">¡Pago Registrado!</h3>
          <p class="text-slate-600 mb-6">El pago se ha registrado exitosamente</p>
          <div class="flex flex-col gap-3">
            <button id="downloadInvoiceBtn" class="w-full py-3 bg-[#0B63C7] text-white font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-blue-700 transition-colors">
              <i data-lucide="download" class="w-4 h-4 inline mr-2"></i>
              Descargar Factura
            </button>
            <button id="sendInvoiceEmailBtn" class="w-full py-3 bg-slate-100 text-slate-700 font-bold text-sm uppercase tracking-wide rounded-xl hover:bg-slate-200 transition-colors">
              <i data-lucide="mail" class="w-4 h-4 inline mr-2"></i>
              Enviar por Email
            </button>
            <button id="closeSuccessModalBtn" class="w-full py-3 text-slate-500 font-bold text-sm uppercase tracking-wide hover:text-slate-700 transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      </div>

      <!-- COMUNICACION tipo Teams -->
"@

    # Reemplazar la sección
    $beforeSection = $content.Substring(0, $startIndex)
    $afterSection = $content.Substring($endIndex)
    $newContent = $beforeSection + $newSection + $afterSection

    # Guardar el archivo
    Set-Content -Path $filePath -Value $newContent -NoNewline
    Write-Host "✅ Sección de pagos actualizada exitosamente!"
} else {
    Write-Host "❌ No se encontraron los marcadores en el archivo"
}
