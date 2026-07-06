/**
 * Componentes UI para Facturación Electrónica DGII
 */

export class DGIIDashboard {
  constructor() {
    this.invoices = [];
    this.products = [];
    this.fiscalConfig = null;
    this.ncfSequences = [];
  }

  // ===========================
  // RENDERIZAR TABLERO PRINCIPAL
  // ===========================

  renderDashboard() {
    return `
      <section class="section active" id="dgii-facturacion">
        <div class="section-shell">
          <div class="section-header">
            <h1 class="section-title">Facturación Electrónica DGII</h1>
            <p class="section-subtitle">Sistema completo de facturación conforme a los estándares de la DGII</p>
          </div>

          <!-- Tarjetas de resumen -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="metric-card metric-card--blue">
              <div class="metric-icon"><i data-lucide="file-text"></i></div>
              <div class="metric-label">Facturas Emitidas</div>
              <div class="metric-value" id="stat-invoices">0</div>
            </div>
            <div class="metric-card metric-card--green">
              <div class="metric-icon"><i data-lucide="check-circle"></i></div>
              <div class="metric-label">Aceptadas por DGII</div>
              <div class="metric-value" id="stat-accepted">0</div>
            </div>
            <div class="metric-card metric-card--amber">
              <div class="metric-icon"><i data-lucide="alert-circle"></i></div>
              <div class="metric-label">Pendientes</div>
              <div class="metric-value" id="stat-pending">0</div>
            </div>
            <div class="metric-card metric-card--orange">
              <div class="metric-icon"><i data-lucide="dollar-sign"></i></div>
              <div class="metric-label">Total Facturado</div>
              <div class="metric-value" id="stat-total">RD$ 0.00</div>
            </div>
          </div>

          <!-- Pestañas -->
          <div class="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-2">
            <button class="tab-pill active px-4 py-2" data-tab="invoices">
              <i data-lucide="file-text"></i> Facturas
            </button>
            <button class="tab-pill px-4 py-2" data-tab="products">
              <i data-lucide="package"></i> Productos
            </button>
            <button class="tab-pill px-4 py-2" data-tab="config">
              <i data-lucide="settings"></i> Configuración Fiscal
            </button>
            <button class="tab-pill px-4 py-2" data-tab="ncf">
              <i data-lucide="hash"></i> E-NCF
            </button>
          </div>

          <!-- Contenedor de contenido de pestañas -->
          <div id="tab-content">
            ${this.renderInvoicesTab()}
          </div>
        </div>
      </section>
    `;
  }

  // ===========================
  // PESTAÑA DE FACTURAS
  // ===========================

  renderInvoicesTab() {
    return `
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div class="flex flex-wrap gap-2">
          <select id="filter-status" class="px-3 py-2 border border-gray-200 rounded-lg">
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="issued">Emitida</option>
            <option value="sent">Enviada</option>
            <option value="accepted">Aceptada</option>
            <option value="rejected">Rechazada</option>
            <option value="cancelled">Anulada</option>
          </select>
          <select id="filter-type" class="px-3 py-2 border border-gray-200 rounded-lg">
            <option value="">Todos los tipos</option>
            <option value="E31">Factura Crédito Fiscal</option>
            <option value="E32">Factura Consumo</option>
            <option value="E34">Nota de Crédito</option>
            <option value="E35">Nota de Débito</option>
          </select>
        </div>
        <div class="flex gap-2">
          <button id="btn-new-invoice" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-bold flex items-center gap-2">
            <i data-lucide="plus"></i> Nueva Factura
          </button>
        </div>
      </div>

      <div class="table-panel">
        <div class="table-scroll-wrap">
          <table class="data-table w-full text-left">
            <thead>
              <tr>
                <th>No.</th>
                <th>e-NCF</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Total</th>
                <th>Estado</th>
                <th class="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody id="invoices-table-body">
              <tr><td colspan="7" class="text-center py-8 text-gray-500">Cargando facturas...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ===========================
  // PESTAÑA DE PRODUCTOS
  // ===========================

  renderProductsTab() {
    return `
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div class="flex flex-wrap gap-2">
          <select id="filter-category" class="px-3 py-2 border border-gray-200 rounded-lg">
            <option value="">Todas las categorías</option>
            <option value="mensualidad">Mensualidad</option>
            <option value="uniforme">Uniforme</option>
            <option value="libro">Libro</option>
            <option value="material">Material</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <button id="btn-new-product" class="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg font-bold flex items-center gap-2">
          <i data-lucide="plus"></i> Nuevo Producto
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="products-grid">
        <div class="col-span-full text-center py-8 text-gray-500">Cargando productos...</div>
      </div>
    `;
  }

  // ===========================
  // PESTAÑA DE CONFIGURACIÓN
  // ===========================

  renderConfigTab() {
    return `
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 class="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i data-lucide="settings"></i> Datos Fiscales de la Empresa
          </h3>

          <form id="fiscal-config-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Nombre de la Empresa</label>
              <input type="text" id="school-name" class="w-full px-4 py-2 border border-gray-200 rounded-lg" required>
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Nombre Comercial</label>
              <input type="text" id="commercial-name" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">RNC</label>
              <input type="text" id="rnc" class="w-full px-4 py-2 border border-gray-200 rounded-lg" required>
            </div>

            <div class="md:col-span-2">
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Dirección</label>
              <textarea id="address" class="w-full px-4 py-2 border border-gray-200 rounded-lg" rows="2" required></textarea>
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Teléfono</label>
              <input type="text" id="phone" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Email</label>
              <input type="email" id="email" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Actividad Económica</label>
              <input type="text" id="economic-activity" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Tipo de Contribuyente</label>
              <select id="taxpayer-type" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
                <option value="juridica">Persona Jurídica</option>
                <option value="natural">Persona Natural</option>
                <option value="gubernamental">Gubernamental</option>
                <option value="especial">Régimen Especial</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Régimen Tributario</label>
              <select id="tax-regime" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
                <option value="general">General</option>
                <option value="simplificado">Simplificado</option>
                <option value="especial">Especial</option>
              </select>
            </div>

            <div class="md:col-span-2">
              <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Logo de la Empresa</label>
              <input type="file" id="logo-file" accept="image/*" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
            </div>

            <div class="md:col-span-2 flex justify-end gap-2 pt-4">
              <button type="submit" class="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-bold">
                Guardar Configuración
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // ===========================
  // PESTAÑA DE E-NCF
  // ===========================

  renderNCFTab() {
    return `
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 class="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i data-lucide="hash"></i> Secuencias de e-NCF
          </h3>

          <div class="table-panel">
            <table class="data-table w-full text-left">
              <thead>
                <tr>
                  <th>Tipo de Comprobante</th>
                  <th>Prefijo</th>
                  <th>Consecutivo Actual</th>
                  <th>Último Uso</th>
                  <th class="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody id="ncf-table-body">
                <tr><td colspan="5" class="text-center py-8 text-gray-500">Cargando secuencias...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // ===========================
  // RENDERIZAR MODAL DE FACTURA
  // ===========================

  renderInvoiceModal(invoice = null) {
    const isEdit = !!invoice;
    return `
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" id="invoice-modal">
        <div class="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl">
          <div class="modal-header bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <i data-lucide="file-text" class="w-8 h-8"></i>
              <div>
                <h3 class="text-xl font-bold">${isEdit ? 'Editar' : 'Nueva'} Factura</h3>
                <p class="text-sm opacity-80">Facturación Electrónica DGII</p>
              </div>
            </div>
            <button onclick="document.getElementById('invoice-modal').remove()" class="p-2 bg-white/20 rounded-lg hover:bg-white/30">
              <i data-lucide="x"></i>
            </button>
          </div>

          <div class="p-6 overflow-y-auto max-h-[60vh]">
            <form id="invoice-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Tipo de Comprobante</label>
                <select id="invoice-type" class="w-full px-4 py-2 border border-gray-200 rounded-lg" required>
                  <option value="E32">E32 - Factura Consumo</option>
                  <option value="E31">E31 - Factura Crédito Fiscal</option>
                  <option value="E33">E33 - Factura Gubernamental</option>
                  <option value="E34">E34 - Nota de Crédito</option>
                  <option value="E35">E35 - Nota de Débito</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Método de Pago</label>
                <select id="payment-method" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div class="md:col-span-2 pt-4">
                <h4 class="font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <i data-lucide="user"></i> Datos del Cliente
                </h4>
              </div>

              <div>
                <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Nombre</label>
                <input type="text" id="client-name" class="w-full px-4 py-2 border border-gray-200 rounded-lg" required>
              </div>

              <div>
                <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">RNC / Cédula</label>
                <input type="text" id="client-rnc" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
              </div>

              <div class="md:col-span-2">
                <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Dirección</label>
                <input type="text" id="client-address" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
              </div>

              <div>
                <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Teléfono</label>
                <input type="text" id="client-phone" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
              </div>

              <div>
                <label class="block text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Email</label>
                <input type="email" id="client-email" class="w-full px-4 py-2 border border-gray-200 rounded-lg">
              </div>

              <div class="md:col-span-2 pt-4">
                <h4 class="font-bold text-gray-700 mb-2 flex items-center justify-between">
                  <span class="flex items-center gap-2">
                    <i data-lucide="package"></i> Items de la Factura
                  </span>
                  <button type="button" id="btn-add-item" class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-bold flex items-center gap-1">
                    <i data-lucide="plus" class="w-4 h-4"></i> Agregar Item
                  </button>
                </h4>
              </div>

              <div class="md:col-span-2">
                <div class="table-panel">
                  <table class="data-table w-full text-left">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Descripción</th>
                        <th>Cantidad</th>
                        <th>Precio</th>
                        <th>ITBIS</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="invoice-items-body">
                      ${this.renderEmptyInvoiceRow()}
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="md:col-span-2 pt-4">
                <div class="bg-gray-50 rounded-xl p-4 flex flex-col items-end gap-2">
                  <div class="flex justify-between w-full max-w-xs">
                    <span class="text-gray-500 font-bold">Subtotal:</span>
                    <span class="font-bold" id="invoice-subtotal">RD$ 0.00</span>
                  </div>
                  <div class="flex justify-between w-full max-w-xs">
                    <span class="text-gray-500 font-bold">Descuento:</span>
                    <input type="number" id="invoice-discount" class="w-24 px-2 py-1 border border-gray-200 rounded text-right" value="0">
                  </div>
                  <div class="flex justify-between w-full max-w-xs">
                    <span class="text-gray-500 font-bold">ITBIS:</span>
                    <span class="font-bold" id="invoice-itbis">RD$ 0.00</span>
                  </div>
                  <div class="flex justify-between w-full max-w-xs border-t border-gray-200 pt-2 mt-2">
                    <span class="text-blue-600 font-bold text-lg">Total:</span>
                    <span class="text-blue-600 font-bold text-lg" id="invoice-total">RD$ 0.00</span>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <div class="modal-footer bg-gray-50 p-6 flex justify-end gap-3 border-t border-gray-100">
            <button onclick="document.getElementById('invoice-modal').remove()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-bold">
              Cancelar
            </button>
            <button id="btn-save-invoice" class="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-bold">
              Guardar Factura
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderEmptyInvoiceRow() {
    return `
      <tr id="empty-invoice-row">
        <td colspan="7" class="text-center py-6 text-gray-500">
          <button type="button" onclick="DGIIDashboard.addInvoiceItem()" class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-bold flex items-center gap-2 mx-auto">
            <i data-lucide="plus"></i> Agregar primer item
          </button>
        </td>
      </tr>
    `;
  }

  renderInvoiceItemRow(item = null) {
    return `
      <tr class="invoice-item-row">
        <td>
          <select class="item-product w-full px-2 py-1 border border-gray-200 rounded">
            <option value="">Seleccionar...</option>
            ${this.products.map(p => `<option value="${p.id}" ${item?.product_id === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </td>
        <td><input type="text" class="item-description w-full px-2 py-1 border border-gray-200 rounded" value="${item?.description || ''}"></td>
        <td><input type="number" class="item-quantity w-20 px-2 py-1 border border-gray-200 rounded text-right" value="${item?.quantity || 1}" min="1"></td>
        <td><input type="number" class="item-price w-24 px-2 py-1 border border-gray-200 rounded text-right" value="${item?.unit_price || 0}" step="0.01"></td>
        <td><input type="number" class="item-itbis w-20 px-2 py-1 border border-gray-200 rounded text-right" value="${item?.itbis_rate || 18}" step="0.01"></td>
        <td class="item-total font-bold">RD$ 0.00</td>
        <td class="text-right">
          <button type="button" onclick="this.closest('tr').remove(); DGIIDashboard.calculateInvoiceTotals();" class="p-1 text-red-600 hover:bg-red-50 rounded">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `;
  }

  // ===========================
  // UTILIDADES
  // ===========================

  async calculateInvoiceTotals() {
    let subtotal = 0;
    let itbisTotal = 0;
    const rows = document.querySelectorAll('.invoice-item-row');
    
    rows.forEach(row => {
      const quantity = parseFloat(row.querySelector('.item-quantity').value) || 0;
      const price = parseFloat(row.querySelector('.item-price').value) || 0;
      const itbisRate = parseFloat(row.querySelector('.item-itbis').value) || 0;
      
      const itemSubtotal = quantity * price;
      const itemItbis = itemSubtotal * (itbisRate / 100);
      
      subtotal += itemSubtotal;
      itbisTotal += itemItbis;
      
      row.querySelector('.item-total').textContent = this.formatCurrency(itemSubtotal + itemItbis);
    });
    
    const discount = parseFloat(document.getElementById('invoice-discount').value) || 0;
    const total = subtotal + itbisTotal - discount;
    
    document.getElementById('invoice-subtotal').textContent = this.formatCurrency(subtotal);
    document.getElementById('invoice-itbis').textContent = this.formatCurrency(itbisTotal);
    document.getElementById('invoice-total').textContent = this.formatCurrency(total);
  }

  addInvoiceItem(item = null) {
    const tbody = document.getElementById('invoice-items-body');
    const emptyRow = document.getElementById('empty-invoice-row');
    
    if (emptyRow) {
      emptyRow.remove();
    }
    
    tbody.insertAdjacentHTML('beforeend', this.renderInvoiceItemRow(item));
    
    // Agregar eventos de cambio a los nuevos inputs
    const newRow = tbody.lastElementChild;
    const inputs = newRow.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('change', () => this.calculateInvoiceTotals());
      input.addEventListener('input', () => this.calculateInvoiceTotals());
    });
    
    this.calculateInvoiceTotals();
    
    // Cargar datos de producto seleccionado
    const productSelect = newRow.querySelector('.item-product');
    productSelect.addEventListener('change', (e) => {
      const product = this.products.find(p => p.id === parseInt(e.target.value));
      if (product) {
        newRow.querySelector('.item-description').value = product.description || product.name;
        newRow.querySelector('.item-price').value = product.price;
        newRow.querySelector('.item-itbis').value = product.is_itbis_exempt ? 0 : (product.itbis_rate || 18);
        this.calculateInvoiceTotals();
      }
    });
  }

  formatCurrency(amount, currency = 'RD$') {
    const num = Number(amount) || 0;
    return `${currency} ${num.toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }
}

// Instancia global
window.DGIIDashboard = new DGIIDashboard();
