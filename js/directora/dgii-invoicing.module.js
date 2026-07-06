/**
 * Módulo de Facturación Electrónica DGII
 * Cumplimiento con los estándares de la Dirección General de Impuestos Internos (RD)
 */

import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

export const DGIIInvoicingModule = {
  fiscalConfig: null,

  // ===========================
  // CONFIGURACIÓN FISCAL
  // ===========================
  
  async loadFiscalConfig() {
    try {
      const { data, error } = await supabase
        .from('fiscal_config')
        .select('*')
        .eq('is_active', true)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      this.fiscalConfig = data;
      return data;
    } catch (error) {
      console.error('Error loading fiscal config:', error);
      return null;
    }
  },

  async saveFiscalConfig(configData) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let result;
      
      if (configData.id) {
        const { data, error } = await supabase
          .from('fiscal_config')
          .update({
            ...configData,
            updated_by: user?.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', configData.id)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from('fiscal_config')
          .insert({
            ...configData,
            created_by: user?.id
          })
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      }
      
      this.fiscalConfig = result;
      Helpers.toast('Configuración fiscal guardada exitosamente!', 'success');
      return result;
    } catch (error) {
      console.error('Error saving fiscal config:', error);
      Helpers.toast(error.message || 'Error al guardar configuración fiscal', 'error');
      return null;
    }
  },

  // ===========================
  // GESTIÓN DE SECUENCIAS E-NCF
  // ===========================

  async getNCFSequences() {
    try {
      const { data, error } = await supabase
        .from('ncf_sequences')
        .select('*')
        .order('receipt_type');
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error loading NCF sequences:', error);
      return [];
    }
  },

  async updateNCFSequence(sequenceId, updates) {
    try {
      const { data, error } = await supabase
        .from('ncf_sequences')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', sequenceId)
        .select()
        .single();
      
      if (error) throw error;
      Helpers.toast('Secuencia actualizada!', 'success');
      return data;
    } catch (error) {
      console.error('Error updating NCF sequence:', error);
      Helpers.toast(error.message || 'Error al actualizar secuencia', 'error');
      return null;
    }
  },

  // ===========================
  // GESTIÓN DE PRODUCTOS
  // ===========================

  async getProducts(filters = {}) {
    try {
      let query = supabase
        .from('products')
        .select('*')
        .order('name');
      
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error loading products:', error);
      return [];
    }
  },

  async saveProduct(productData, productId = null) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let result;
      
      if (productId) {
        const { data, error } = await supabase
          .from('products')
          .update({
            ...productData,
            updated_by: user?.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', productId)
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert({
            ...productData,
            created_by: user?.id
          })
          .select()
          .single();
        
        if (error) throw error;
        result = data;
      }
      
      Helpers.toast('Producto guardado exitosamente!', 'success');
      return result;
    } catch (error) {
      console.error('Error saving product:', error);
      Helpers.toast(error.message || 'Error al guardar producto', 'error');
      return null;
    }
  },

  async deleteProduct(productId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('products')
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
          updated_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId);
      
      if (error) throw error;
      
      Helpers.toast('Producto eliminado!', 'success');
      return true;
    } catch (error) {
      console.error('Error deleting product:', error);
      Helpers.toast(error.message || 'Error al eliminar producto', 'error');
      return false;
    }
  },

  // ===========================
  // MORA INTELIGENTE
  // ===========================

  async calculateMora(paymentId) {
    try {
      const { data, error } = await supabase
        .rpc('calculate_intelligent_mora', { p_payment_id: paymentId });
      
      if (error) throw error;
      
      Helpers.toast(`Mora calculada: RD$ ${data}`, 'success');
      return data;
    } catch (error) {
      console.error('Error calculating mora:', error);
      Helpers.toast(error.message || 'Error al calcular mora', 'error');
      return null;
    }
  },

  // ===========================
  // FACTURAS ELECTRÓNICAS
  // ===========================

  async getElectronicInvoices(filters = {}) {
    try {
      let query = supabase
        .from('electronic_invoices')
        .select('*, client:client_id(name, email, fiscal_rnc, fiscal_company_name)')
        .order('created_at', { ascending: false });
      
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.receipt_type) {
        query = query.eq('receipt_type', filters.receipt_type);
      }
      if (filters.date_from) {
        query = query.gte('date', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('date', filters.date_to);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error loading electronic invoices:', error);
      return [];
    }
  },

  async getElectronicInvoice(invoiceId) {
    try {
      const { data, error } = await supabase
        .from('electronic_invoices')
        .select('*, items:electronic_invoice_items(*), client:client_id(name, email, fiscal_rnc, fiscal_company_name, fiscal_address)')
        .eq('id', invoiceId)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error loading electronic invoice:', error);
      return null;
    }
  },

  async createElectronicInvoice(invoiceData) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const config = await this.loadFiscalConfig();
      
      if (!config) {
        throw new Error('Primero configura los datos fiscales de la empresa');
      }
      
      // Generar E-NCF
      const { data: ncfData, error: ncfError } = await supabase
        .rpc('generate_e_ncf', { p_receipt_type: invoiceData.receipt_type });
      
      if (ncfError) throw ncfError;
      
      // Generar número interno de factura
      const invoiceNumber = `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;
      
      // Crear factura
      const { data: invoice, error } = await supabase
        .from('electronic_invoices')
        .insert({
          invoice_number: invoiceNumber,
          e_ncf: ncfData,
          receipt_type: invoiceData.receipt_type,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().split(' ')[0],
          client_id: invoiceData.client_id,
          client_name: invoiceData.client_name,
          client_rnc: invoiceData.client_rnc,
          client_address: invoiceData.client_address,
          client_phone: invoiceData.client_phone,
          client_email: invoiceData.client_email,
          payment_method: invoiceData.payment_method || 'efectivo',
          currency: 'RD$',
          exchange_rate: 1,
          subtotal: invoiceData.subtotal,
          discount_total: invoiceData.discount_total || 0,
          itbis_total: invoiceData.itbis_total,
          other_taxes: 0,
          total_amount: invoiceData.total_amount,
          status: 'draft',
          school_name: config.school_name,
          school_rnc: config.rnc,
          school_address: config.address,
          school_phone: config.phone,
          school_email: config.email,
          school_logo_url: config.logo_url,
          issued_by: user?.id,
          related_invoice_id: invoiceData.related_invoice_id,
          credit_note_reason: invoiceData.credit_note_reason,
          debit_note_reason: invoiceData.debit_note_reason
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Insertar items
      if (invoiceData.items && invoiceData.items.length > 0) {
        const itemsToInsert = invoiceData.items.map(item => ({
          invoice_id: invoice.id,
          product_id: item.product_id,
          product_code: item.product_code,
          product_name: item.product_name,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount || 0,
          discount_percent: item.discount_percent || 0,
          itbis_rate: item.itbis_rate || 18,
          itbis_amount: item.itbis_amount,
          subtotal: item.subtotal,
          total: item.total
        }));
        
        await supabase.from('electronic_invoice_items').insert(itemsToInsert);
      }
      
      // Registrar en auditoría
      await this.logInvoiceAudit(invoice.id, 'created', { user_id: user?.id });
      
      Helpers.toast('Factura creada exitosamente!', 'success');
      return invoice;
    } catch (error) {
      console.error('Error creating electronic invoice:', error);
      Helpers.toast(error.message || 'Error al crear factura', 'error');
      return null;
    }
  },

  async updateInvoiceStatus(invoiceId, status, extraData = {}) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const updates = {
        status: status,
        updated_at: new Date().toISOString(),
        ...extraData
      };
      
      const { data, error } = await supabase
        .from('electronic_invoices')
        .update(updates)
        .eq('id', invoiceId)
        .select()
        .single();
      
      if (error) throw error;
      
      // Registrar en auditoría
      await this.logInvoiceAudit(invoiceId, `status_${status}`, { user_id: user?.id, ...extraData });
      
      Helpers.toast('Estado actualizado!', 'success');
      return data;
    } catch (error) {
      console.error('Error updating invoice status:', error);
      Helpers.toast(error.message || 'Error al actualizar estado', 'error');
      return null;
    }
  },

  async cancelInvoice(invoiceId, reason) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('electronic_invoices')
        .update({
          status: 'cancelled',
          cancelled_by: user?.id,
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', invoiceId)
        .select()
        .single();
      
      if (error) throw error;
      
      // Registrar en auditoría
      await this.logInvoiceAudit(invoiceId, 'cancelled', { user_id: user?.id, reason });
      
      Helpers.toast('Factura anulada!', 'success');
      return data;
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      Helpers.toast(error.message || 'Error al anular factura', 'error');
      return null;
    }
  },

  // ===========================
  // GENERACIÓN DE XML DGII
  // ===========================

  generateDGIIXML(invoice) {
    if (!this.fiscalConfig) {
      throw new Error('Configuración fiscal no cargada');
    }

    const now = new Date();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica xmlns="http://www.dgii.gov.do/facturaElectronica/v1">
  <Encabezado>
    <Version>1.0</Version>
    <TipoCF>${invoice.receipt_type}</TipoCF>
    <eNCF>${invoice.e_ncf}</eNCF>
    <FechaEmision>${invoice.date}</FechaEmision>
    <HoraEmision>${invoice.time}</HoraEmision>
    <RNCEmisor>${this.fiscalConfig.rnc}</RNCEmisor>
    <NombreEmisor>${this.escapeXML(this.fiscalConfig.school_name)}</NombreEmisor>
    <NombreComercial>${this.escapeXML(this.fiscalConfig.commercial_name || this.fiscalConfig.school_name)}</NombreComercial>
    <DireccionEmisor>${this.escapeXML(this.fiscalConfig.address)}</DireccionEmisor>
    <TipoContribuyente>${this.fiscalConfig.taxpayer_type}</TipoContribuyente>
    <RegimenTributario>${this.fiscalConfig.tax_regime}</RegimenTributario>
    <RNCComprador>${invoice.client_rnc || ''}</RNCComprador>
    <NombreComprador>${this.escapeXML(invoice.client_name)}</NombreComprador>
    <DireccionComprador>${this.escapeXML(invoice.client_address || '')}</DireccionComprador>
    <TipoPago>${invoice.payment_method || '01'}</TipoPago>
    <Moneda>${invoice.currency || 'DOP'}</Moneda>
    <TipoCambio>${invoice.exchange_rate || 1}</TipoCambio>
  </Encabezado>
  <Detalle>
    ${invoice.items?.map(item => `
    <Item>
      <ItemNum>${invoice.items.indexOf(item) + 1}</ItemNum>
      <CodProducto>${item.product_code || item.product_id}</CodProducto>
      <Descripcion>${this.escapeXML(item.product_name)}</Descripcion>
      <Cantidad>${item.quantity}</Cantidad>
      <PrecioUnitario>${item.unit_price.toFixed(2)}</PrecioUnitario>
      <DescuentoMonto>${(item.discount_amount || 0).toFixed(2)}</DescuentoMonto>
      <ITBISporItem>${(item.itbis_rate || 18)}</ITBISporItem>
      <ITBISMonto>${item.itbis_amount.toFixed(2)}</ITBISMonto>
      <MontoItem>${item.total.toFixed(2)}</MontoItem>
    </Item>`).join('') || ''}
  </Detalle>
  <Totales>
    <MontoGravado>${invoice.subtotal.toFixed(2)}</MontoGravado>
    <MontoDescuento>${(invoice.discount_total || 0).toFixed(2)}</MontoDescuento>
    <ITBISTotal>${invoice.itbis_total.toFixed(2)}</ITBISTotal>
    <MontoTotal>${invoice.total_amount.toFixed(2)}</MontoTotal>
  </Totales>
</FacturaElectronica>`;

    return xml;
  },

  escapeXML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  generateQRData(invoice) {
    const qrData = {
      eNCF: invoice.e_ncf,
      RNCEmisor: this.fiscalConfig?.rnc,
      RNCComprador: invoice.client_rnc,
      FechaEmision: invoice.date,
      MontoTotal: invoice.total_amount,
      CodigoSeguridad: invoice.id
    };
    return JSON.stringify(qrData);
  },

  // ===========================
  // AUDITORÍA
  // ===========================

  async logInvoiceAudit(invoiceId, action, details = {}) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from('electronic_invoice_audit').insert({
        invoice_id: invoiceId,
        action: action,
        user_id: user?.id,
        user_ip: await this.getUserIP(),
        details: details
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  },

  async getUserIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return null;
    }
  },

  async getInvoiceAudit(invoiceId) {
    try {
      const { data, error } = await supabase
        .from('electronic_invoice_audit')
        .select('*, user:user_id(name, email)')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error loading audit:', error);
      return [];
    }
  },

  // ===========================
  // UTILIDADES
  // ===========================

  formatCurrency(amount, currency = 'RD$') {
    const num = Number(amount) || 0;
    return `${currency} ${num.toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  },

  getReceiptTypeName(type) {
    const names = {
      'E31': 'Factura Crédito Fiscal',
      'E32': 'Factura Consumo',
      'E33': 'Factura Gubernamental',
      'E34': 'Nota de Crédito',
      'E35': 'Nota de Débito',
      'E36': 'Régimen Especial'
    };
    return names[type] || type;
  },

  getInvoiceStatusName(status) {
    const names = {
      'draft': 'Borrador',
      'issued': 'Emitida',
      'sent': 'Enviada',
      'accepted': 'Aceptada',
      'rejected': 'Rechazada',
      'cancelled': 'Anulada'
    };
    return names[status] || status;
  },

  getCategoryName(category) {
    const names = {
      'uniforme': 'Uniforme',
      'libro': 'Libro',
      'material': 'Material',
      'otro': 'Otro',
      'mensualidad': 'Mensualidad',
      'inscripcion': 'Inscripción'
    };
    return names[category] || category;
  },

  // ===========================
  // INICIALIZACIÓN
  // ===========================

  async init() {
    await this.loadFiscalConfig();
  }
};

// Hacer módulo disponible globalmente
window.DGIIInvoicingModule = DGIIInvoicingModule;
