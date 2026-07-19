/**
 * Sistema de Facturación Profesional v2
 * Rediseño completo estilo ERP (Stripe/SAP/QuickBooks)
 * Delega renderizado, PDF y email al InvoiceModule centralizado
 */

import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';
import { InvoiceModule } from '../shared/invoice.js';

export const InvoicingModule = {
  settings: null,

  async loadSettings() {
    if (this.settings) return this.settings;
    const { data } = await supabase
      .from('school_settings')
      .select('*')
      .eq('id', 1)
      .single();
    this.settings = data;
    return data;
  },

  async generateInvoice(paymentId, userId) {
    try {
      const { data: result, error } = await supabase.functions.invoke('generate-invoice', {
        body: { payment_id: paymentId, send_email: false }
      });
      if (error) throw error;
      if (!result?.success) throw new Error(result?.error || 'Error al generar factura');

      // Generar PDF, subir y enviar email
      try {
        const pdfBlob = await InvoiceModule.generatePDF(result);
        if (pdfBlob && result.invoice?.id) {
          const pdfUrl = await InvoiceModule.uploadPDF(pdfBlob, result.invoice.id);
          if (pdfUrl) result.invoice.pdf_url = pdfUrl;
          await InvoiceModule.sendInvoiceEmail(result, pdfBlob);
        }
      } catch (pdfErr) {
        console.warn('[InvoicingModule] PDF pipeline error:', pdfErr);
      }

      Helpers.toast('Factura generada exitosamente!', 'success');
      return result;
    } catch (error) {
      console.error('Error generating invoice:', error);
      Helpers.toast(error.message || 'Error al generar factura', 'error');
      return null;
    }
  },

  async getInvoice(invoiceId) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting invoice:', error);
      return null;
    }
  },

  async getStudentInvoices(studentId) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting student invoices:', error);
      return [];
    }
  },

  async assignNCF(invoiceId, ncf, userId) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .update({
          ncf, ncf_assigned_by: userId, ncf_assigned_at: new Date().toISOString(), updated_at: new Date().toISOString()
        })
        .eq('id', invoiceId)
        .select();
      if (error) throw error;
      Helpers.toast('NCF asignado exitosamente!', 'success');
      return data;
    } catch (error) {
      console.error('Error assigning NCF:', error);
      Helpers.toast(error.message || 'Error al asignar NCF', 'error');
      return null;
    }
  },

  async getAllInvoices(filters = {}) {
    try {
      let query = supabase
        .from('invoices')
        .select('*, student:student_id(name, matricula), parent:student_id(parent_id(name, fiscal_rnc, fiscal_company_name, fiscal_address))')
        .order('created_at', { ascending: false });
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.has_ncf === true) query = query.not('ncf', 'is', null);
      else if (filters.has_ncf === false) query = query.is('ncf', null);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting invoices:', error);
      return [];
    }
  },

  async getPaymentInvoices(paymentId) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('payment_id', paymentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting payment invoices:', error);
      return [];
    }
  },

  async cancelInvoice(invoiceId, reason) {
    try {
      const { data: result, error } = await supabase.rpc('cancel_invoice', {
        p_invoice_id: invoiceId, p_reason: reason
      });
      if (error) throw error;
      if (result?.success) {
        Helpers.toast('Factura cancelada exitosamente!', 'success');
        return true;
      }
      throw new Error(result?.error || 'Error al cancelar');
    } catch (error) {
      console.error('Error canceling invoice:', error);
      Helpers.toast(error.message || 'Error al cancelar factura', 'error');
      return false;
    }
  },

  formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });
  },

  formatCurrency(amount, currency = 'RD$') {
    return `${currency} ${Number(amount||0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  renderInvoiceHTML(invoice) {
    return InvoiceModule.renderInvoiceHTML({ invoice, student: invoice, school: invoice, payment: invoice });
  },

  async downloadInvoicePDF(invoice) {
    try {
      Helpers.toast('Generando PDF...', 'info');
      const data = {
        invoice,
        student: { name: invoice.student_name, matricula: invoice.student_matricula, p1_name: invoice.parent_name, p1_phone: invoice.parent_phone, classroom: invoice.classroom_name },
        school: { school_name: invoice.school_name, address: invoice.school_address, phone: invoice.school_phone, email: invoice.school_email, rnc: invoice.school_rnc, website: invoice.school_website, logo_url: invoice.school_logo_url },
        payment: { method: invoice.payment_method, paid_date: invoice.payment_date, month_paid: invoice.period }
      };
      const blob = await InvoiceModule.generatePDF(data);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `Factura_${invoice.invoice_number}.pdf`;
        a.click(); URL.revokeObjectURL(url);
        Helpers.toast('Factura descargada!', 'success');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      Helpers.toast('Error al generar el PDF', 'error');
    }
  },

  async openAssignNCFModal(invoiceId) {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) return;
    const modalHTML = `
      <div style="padding:24px;max-width:480px;margin:0 auto">
        <h3 style="font-weight:900;color:#1a2340;margin-bottom:16px">Asignar NCF — ${invoice.invoice_number}</h3>
        <input type="text" id="ncfInput" value="${invoice.ncf || ''}" placeholder="Ej: B0100000001"
          style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:12px;font-size:1rem;font-weight:700;outline:none;margin-bottom:16px">
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button onclick="App.ui.closeModal()" style="padding:10px 20px;border:2px solid #e2e8f0;background:white;border-radius:10px;font-weight:800;cursor:pointer">Cancelar</button>
          <button onclick="window.InvoicingModule.saveNCF(${invoiceId})" style="padding:10px 20px;background:#0B63C7;color:white;border:none;border-radius:10px;font-weight:800;cursor:pointer">Asignar</button>
        </div>
      </div>`;
    window.openGlobalModal(modalHTML);
  },

  async saveNCF(invoiceId) {
    const ncf = document.getElementById('ncfInput')?.value?.trim();
    if (!ncf) { Helpers.toast('Ingrese el NCF', 'warning'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Helpers.toast('Usuario no autenticado', 'error'); return; }
    const result = await this.assignNCF(invoiceId, ncf, user.id);
    if (result) { App.ui.closeModal(); if (window.App?.invoices?.refresh) App.invoices.refresh(); }
  },

  async openInvoiceModal(invoiceId) {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) return;
    const data = {
      invoice,
      student: { name: invoice.student_name, matricula: invoice.student_matricula, p1_name: invoice.parent_name, p1_phone: invoice.parent_phone, classroom: invoice.classroom_name, photo_url: invoice.student_photo_url },
      school: { school_name: invoice.school_name || this.settings?.school_name, address: invoice.school_address || this.settings?.address, phone: invoice.school_phone || this.settings?.phone, email: invoice.school_email || this.settings?.email, rnc: invoice.school_rnc || this.settings?.rnc, website: invoice.school_website || this.settings?.website, logo_url: invoice.school_logo_url || this.settings?.logo_url },
      payment: { method: invoice.payment_method, paid_date: invoice.payment_date, month_paid: invoice.period, bank: invoice.payment_reference }
    };
    InvoiceModule.openInvoiceModal(data);
  },

  async resendInvoiceEmail(invoiceId) {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) return;
    Helpers.toast('Reenviando correo...', 'info');
    const data = {
      invoice,
      student: { name: invoice.student_name, p1_email: null, p2_email: null, classroom: invoice.classroom_name },
      school: { school_name: invoice.school_name, address: invoice.school_address, phone: invoice.school_phone, email: invoice.school_email, rnc: invoice.school_rnc, website: invoice.school_website, logo_url: invoice.school_logo_url },
      payment: { method: invoice.payment_method, paid_date: invoice.payment_date, month_paid: invoice.period }
    };
    // Buscar emails del estudiante
    if (invoice.student_id) {
      const { data: stu } = await supabase.from('students').select('p1_email,p2_email').eq('id', invoice.student_id).single();
      if (stu) { data.student.p1_email = stu.p1_email; data.student.p2_email = stu.p2_email; }
    }
    const result = await InvoiceModule.sendInvoiceEmail(data);
    if (result?.error) Helpers.toast('Error: ' + result.error, 'error');
    else Helpers.toast('Correo reenviado exitosamente', 'success');
  },
};

window.InvoicingModule = InvoicingModule;
