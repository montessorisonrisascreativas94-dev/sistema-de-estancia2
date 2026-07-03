/**
 * Sistema de Facturación Profesional
 * Genera facturas PDF corporativas con toda la información de la institución
 */

import { supabase } from '../shared/supabase.js';
import { Helpers } from '../shared/helpers.js';

export const InvoicingModule = {
  settings: null,
  
  /**
   * Cargar configuración de la institución
   */
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
  
  /**
   * Generar factura para un pago
   */
  async generateInvoice(paymentId, userId) {
    try {
      const { data: result, error } = await supabase.rpc('generate_invoice', {
        p_payment_id: paymentId,
        p_issued_by: userId
      });
      
      if (error) throw error;
      
      if (result && result.success) {
        Helpers.toast('Factura generada exitosamente!', 'success');
        return result;
      } else {
        throw new Error(result?.error || 'Error al generar factura');
      }
    } catch (error) {
      console.error('Error generating invoice:', error);
      Helpers.toast(error.message || 'Error al generar factura', 'error');
      return null;
    }
  },
  
  /**
   * Obtener factura por ID
   */
  async getInvoice(invoiceId) {
    try {
      const { data: result, error } = await supabase.rpc('get_invoice', {
        p_invoice_id: invoiceId
      });
      
      if (error) throw error;
      return result;
    } catch (error) {
      console.error('Error getting invoice:', error);
      return null;
    }
  },
  
  /**
   * Obtener facturas de un estudiante
   */
  async getStudentInvoices(studentId) {
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return invoices || [];
    } catch (error) {
      console.error('Error getting student invoices:', error);
      return [];
    }
  },
  
  /**
   * Obtener facturas de un pago
   */
  async getPaymentInvoices(paymentId) {
    try {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('payment_id', paymentId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return invoices || [];
    } catch (error) {
      console.error('Error getting payment invoices:', error);
      return [];
    }
  },
  
  /**
   * Cancelar una factura
   */
  async cancelInvoice(invoiceId, reason) {
    try {
      const { data: result, error } = await supabase.rpc('cancel_invoice', {
        p_invoice_id: invoiceId,
        p_reason: reason
      });
      
      if (error) throw error;
      
      if (result && result.success) {
        Helpers.toast('Factura cancelada exitosamente!', 'success');
        return true;
      } else {
        throw new Error(result?.error || 'Error al cancelar factura');
      }
    } catch (error) {
      console.error('Error canceling invoice:', error);
      Helpers.toast(error.message || 'Error al cancelar factura', 'error');
      return false;
    }
  },
  
  /**
   * Formatear fecha para mostrar en factura
   */
  formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  },
  
  /**
   * Formatear moneda
   */
  formatCurrency(amount, currency = 'RD$') {
    const num = Number(amount) || 0;
    return `${currency} ${num.toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  },
  
  /**
   * Renderizar factura como HTML (para vista previa)
   */
  renderInvoiceHTML(invoice) {
    const formatDate = this.formatDate;
    const formatCurrency = (amt) => this.formatCurrency(amt, invoice.currency);
    
    return `
      <div style="font-family: 'Arial', sans-serif; max-width: 850px; margin: 0 auto; padding: 30px; background: white;">
        <!-- Cabecera de la factura corporativa -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 4px solid #0B63C7; padding-bottom: 30px; background: linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%); padding: 20px; border-radius: 16px;">
          <div style="flex: 1;">
            ${invoice.school_logo_url ? `<img src="${invoice.school_logo_url}" alt="Logo" style="max-height: 90px; margin-bottom: 15px; border-radius: 8px;">` : ''}
            <h2 style="margin: 0; color: #0B63C7; font-size: 28px; font-weight: 900; letter-spacing: -0.5px;">${invoice.school_name || 'Institución Educativa'}</h2>
            ${invoice.school_rnc ? `<p style="margin: 8px 0 5px 0; color: #1e293b; font-size: 14px; font-weight: 600;">RNC: ${invoice.school_rnc}</p>` : ''}
            <p style="margin: 5px 0; color: #64748b; font-size: 14px; line-height: 1.6;">
              ${invoice.school_address ? invoice.school_address : ''}
            </p>
            <p style="margin: 8px 0; color: #64748b; font-size: 14px;">
              ${invoice.school_phone ? `<span style="display: inline-flex; align-items: center; gap: 6px;">📞 ${invoice.school_phone}</span>` : ''}
              ${invoice.school_email ? `<span style="display: inline-flex; align-items: center; gap: 6px; margin-left: 15px;">✉️ ${invoice.school_email}</span>` : ''}
            </p>
            ${invoice.school_website ? `<p style="margin: 5px 0; color: #0B63C7; font-size: 14px; font-weight: 600;">🌐 ${invoice.school_website}</p>` : ''}
          </div>
          <div style="text-align: right; flex: 0 0 280px; background: linear-gradient(135deg, #0B63C7 0%, #0850A0 100%); padding: 25px; border-radius: 16px; color: white; box-shadow: 0 10px 25px rgba(11, 99, 199, 0.2);">
            <h1 style="margin: 0; color: white; font-size: 36px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px;">Factura</h1>
            <p style="margin: 12px 0 0 0; font-size: 28px; font-weight: 900; color: #FFD43B; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">${invoice.invoice_number}</p>
            <div style="margin-top: 20px; text-align: left; background: rgba(255,255,255,0.15); padding: 15px; border-radius: 12px;">
              <p style="margin: 8px 0; font-size: 14px; color: rgba(255,255,255,0.95);"><strong style="color: #FFD43B;">Fecha Emisión:</strong> ${formatDate(invoice.issued_date)}</p>
              ${invoice.due_date ? `<p style="margin: 8px 0; font-size: 14px; color: rgba(255,255,255,0.95);"><strong style="color: #FFD43B;">Vencimiento:</strong> ${formatDate(invoice.due_date)}</p>` : ''}
              <p style="margin: 8px 0; font-size: 14px; color: rgba(255,255,255,0.95);">
                <strong style="color: #FFD43B;">Estado:</strong> 
                <span style="padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;
                  ${invoice.status === 'paid' ? 'background: #28B54D; color: white; box-shadow: 0 2px 8px rgba(40, 181, 77, 0.3);' : ''}
                  ${invoice.status === 'issued' ? 'background: #FF7A00; color: white; box-shadow: 0 2px 8px rgba(255, 122, 0, 0.3);' : ''}
                  ${invoice.status === 'cancelled' ? 'background: #ef4444; color: white; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);' : ''}
                ">
                  ${invoice.status === 'paid' ? 'Pagada' : invoice.status === 'issued' ? 'Emitida' : 'Cancelada'}
                </span>
              </p>
            </div>
          </div>
        </div>
        
        <!-- Información del cliente corporativa -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px;">
          <div style="background: linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%); padding: 25px; border-radius: 16px; border: 1px solid #e3ebf5;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
              <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #0B63C7 0%, #0850A0 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                👨‍🎓
              </div>
              <h3 style="margin: 0; color: #1e293b; font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">Estudiante</h3>
            </div>
            <p style="margin: 10px 0 5px 0; font-size: 16px; color: #14213d; font-weight: 700;">${invoice.student_name || 'Nombre no disponible'}</p>
            ${invoice.student_matricula ? `<p style="margin: 5px 0; font-size: 14px; color: #64748b; font-weight: 600;"><span style="color: #0B63C7; font-weight: 700;">Matrícula:</span> ${invoice.student_matricula}</p>` : ''}
            ${invoice.classroom_name ? `<p style="margin: 5px 0; font-size: 14px; color: #64748b; font-weight: 600;"><span style="color: #0B63C7; font-weight: 700;">Aula:</span> ${invoice.classroom_name}</p>` : ''}
          </div>
          <div style="background: linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%); padding: 25px; border-radius: 16px; border: 1px solid #e3ebf5;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
              <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #28B54D 0%, #1A8035 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                👨‍👩‍👧
              </div>
              <h3 style="margin: 0; color: #1e293b; font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">Padre/Tutor</h3>
            </div>
            ${invoice.parent_name ? `<p style="margin: 10px 0 5px 0; font-size: 16px; color: #14213d; font-weight: 700;">${invoice.parent_name}</p>` : ''}
            ${invoice.parent_phone ? `<p style="margin: 5px 0; font-size: 14px; color: #64748b; font-weight: 600;"><span style="color: #28B54D; font-weight: 700;">Teléfono:</span> ${invoice.parent_phone}</p>` : ''}
          </div>
        </div>
        
        <!-- Detalles de la factura corporativa -->
        <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(11, 99, 199, 0.08); margin-bottom: 40px;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: linear-gradient(135deg, #0B63C7 0%, #0850A0 100%); color: white;">
                <th style="padding: 20px 25px; text-align: left; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Descripción</th>
                <th style="padding: 20px 25px; text-align: right; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Monto</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #e3ebf5;">
                <td style="padding: 25px; font-size: 15px; color: #14213d;">
                  <div style="font-weight: 800; font-size: 16px; color: #1e293b; margin-bottom: 8px;">${invoice.concept || 'Servicio educativo'}</div>
                  ${invoice.notes ? `<div style="color: #64748b; font-size: 13px; line-height: 1.6; background: #F8FAFC; padding: 10px 15px; border-radius: 8px; border-left: 4px solid #FF7A00; margin-top: 10px;">${invoice.notes}</div>` : ''}
                </td>
                <td style="padding: 25px; text-align: right; font-size: 18px; color: #14213d; font-weight: 900;">
                  ${formatCurrency(invoice.amount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Totales corporativos -->
        <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
          <div style="width: 350px; background: linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%); padding: 30px; border-radius: 16px; border: 2px solid #e3ebf5;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e3ebf5;">
              <span style="font-size: 15px; color: #64748b; font-weight: 700;">Subtotal</span>
              <span style="font-size: 15px; color: #14213d; font-weight: 800;">${formatCurrency(invoice.subtotal || invoice.amount)}</span>
            </div>
            ${invoice.tax_rate > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e3ebf5;">
                <span style="font-size: 15px; color: #64748b; font-weight: 700;">ITBIS (${invoice.tax_rate}%)</span>
                <span style="font-size: 15px; color: #14213d; font-weight: 800;">${formatCurrency(invoice.tax_amount || 0)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding-top: 20px; border-top: 3px solid #0B63C7; margin-top: 10px;">
              <span style="font-size: 20px; color: #0B63C7; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">TOTAL</span>
              <span style="font-size: 28px; color: #0B63C7; font-weight: 900;">${formatCurrency(invoice.total || invoice.amount)}</span>
            </div>
          </div>
        </div>
        
        <!-- Información de pago corporativa -->
        ${invoice.payment_date ? `
          <div style="background: linear-gradient(135deg, #E6F7EB 0%, #D1FAE5 100%); border: 2px solid #28B54D; padding: 25px; border-radius: 16px; margin-bottom: 30px; display: flex; align-items: center; gap: 20px;">
            <div style="width: 50px; height: 50px; background: #28B54D; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ✅
            </div>
            <div style="flex: 1;">
              <p style="margin: 0; color: #1A8035; font-weight: 900; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">
                Pago Recibido
              </p>
              <p style="margin: 5px 0 0 0; color: #28B54D; font-weight: 600; font-size: 14px;">
                El ${formatDate(invoice.payment_date)}
                ${invoice.payment_method ? ` • Método: <strong>${invoice.payment_method}</strong>` : ''}
              </p>
            </div>
          </div>
        ` : ''}
        
        <!-- Notas y términos corporativos -->
        <div style="margin-top: 30px; padding: 25px; background: #F8FAFC; border-radius: 16px; border: 1px solid #e3ebf5;">
          ${invoice.footer_note ? `
            <p style="font-size: 14px; color: #64748b; margin-bottom: 15px; line-height: 1.8;"><strong style="color: #1e293b; font-weight: 700;">Nota:</strong> ${invoice.footer_note}</p>
          ` : ''}
          ${invoice.terms ? `
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.8;"><strong style="color: #64748b; font-weight: 700;">Términos y Condiciones:</strong> ${invoice.terms}</p>
          ` : ''}
        </div>
        
        <!-- Pie de página corporativo -->
        <div style="margin-top: 50px; padding-top: 30px; border-top: 2px solid #e3ebf5; text-align: center;">
          <div style="display: flex; justify-content: center; gap: 40px; margin-bottom: 20px; flex-wrap: wrap;">
            ${invoice.issued_by_name ? `
              <div style="text-align: center;">
                <div style="width: 150px; border-top: 2px solid #64748b; padding-top: 10px;">
                  <p style="font-size: 13px; color: #1e293b; font-weight: 800; margin: 0;">${invoice.issued_by_name}</p>
                  <p style="font-size: 12px; color: #64748b; margin: 5px 0 0 0; font-weight: 600;">Emitido Por</p>
                </div>
              </div>
            ` : ''}
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin: 15px 0 0 0; font-weight: 500;">
            ${invoice.school_name || 'Institución Educativa'} - Gracias por su confianza
          </p>
          <p style="font-size: 11px; color: #cbd5e1; margin: 10px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">
            Documento Generado: ${new Date().toLocaleDateString('es-DO')} • ${new Date().toLocaleTimeString('es-DO')}
          </p>
        </div>
      </div>
    `;
  },
  
  /**
   * Generar y descargar PDF de la factura
   */
  async downloadInvoicePDF(invoice) {
    try {
      // Verificar si jsPDF está disponible
      if (!window.jspdf || !window.jspdf.jsPDF) {
        Helpers.toast('Librería de PDF no disponible', 'error');
        return;
      }
      
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      // Configuración básica
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 20;
      let yPos = margin;
      
      // Colores corporativos
      const primaryColor = [11, 99, 199]; // #0B63C7
      const secondaryColor = [255, 122, 0]; // #FF7A00
      const textColor = [20, 33, 61]; // #14213d
      const lightGray = [100, 116, 139]; // #64748b
      
      // Logo (si existe)
      if (invoice.school_logo_url) {
        try {
          doc.addImage(invoice.school_logo_url, 'PNG', margin, yPos, 40, 40);
        } catch (e) {
          console.warn('Could not load logo');
        }
      }
      
      // Nombre de la institución
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text(invoice.school_name || 'Institución Educativa', margin + 50, yPos + 15);
      
      // Información de la institución
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...lightGray);
      yPos += 25;
      
      if (invoice.school_rnc) {
        doc.text(`RNC: ${invoice.school_rnc}`, margin + 50, yPos);
        yPos += 7;
      }
      if (invoice.school_address) {
        doc.text(invoice.school_address, margin + 50, yPos);
        yPos += 7;
      }
      if (invoice.school_phone) {
        doc.text(`Tel: ${invoice.school_phone}`, margin + 50, yPos);
        yPos += 7;
      }
      if (invoice.school_email) {
        doc.text(`Email: ${invoice.school_email}`, margin + 50, yPos);
        yPos += 7;
      }
      
      // Título de factura
      yPos = margin;
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text('FACTURA', pageWidth - margin - 60, yPos + 20, { align: 'right' });
      
      doc.setFontSize(16);
      doc.setTextColor(...textColor);
      doc.text(invoice.invoice_number, pageWidth - margin - 60, yPos + 32, { align: 'right' });
      
      // Fechas y estado
      doc.setFontSize(10);
      doc.setTextColor(...lightGray);
      yPos += 45;
      
      doc.text(`Fecha: ${this.formatDate(invoice.issued_date)}`, pageWidth - margin - 60, yPos, { align: 'right' });
      yPos += 7;
      
      if (invoice.due_date) {
        doc.text(`Vencimiento: ${this.formatDate(invoice.due_date)}`, pageWidth - margin - 60, yPos, { align: 'right' });
        yPos += 7;
      }
      
      // Estado
      doc.setFont('helvetica', 'bold');
      const statusText = invoice.status === 'paid' ? 'Pagada' : invoice.status === 'issued' ? 'Emitida' : 'Cancelada';
      doc.text(`Estado: ${statusText}`, pageWidth - margin - 60, yPos, { align: 'right' });
      
      // Línea separadora
      yPos += 15;
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(1);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      
      // Información del estudiante
      yPos += 20;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text('Estudiante', margin, yPos);
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textColor);
      yPos += 8;
      doc.text(invoice.student_name || 'Nombre no disponible', margin, yPos);
      
      if (invoice.student_matricula) {
        yPos += 6;
        doc.setFontSize(10);
        doc.setTextColor(...lightGray);
        doc.text(`Matrícula: ${invoice.student_matricula}`, margin, yPos);
      }
      
      if (invoice.classroom_name) {
        yPos += 6;
        doc.text(`Aula: ${invoice.classroom_name}`, margin, yPos);
      }
      
      // Información del padre (columna derecha)
      yPos -= 14;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text('Padre/Tutor', pageWidth / 2, yPos);
      
      if (invoice.parent_name) {
        yPos += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...textColor);
        doc.text(invoice.parent_name, pageWidth / 2, yPos);
      }
      
      if (invoice.parent_phone) {
        yPos += 6;
        doc.setFontSize(10);
        doc.setTextColor(...lightGray);
        doc.text(`Tel: ${invoice.parent_phone}`, pageWidth / 2, yPos);
      }
      
      // Tabla de conceptos
      yPos += 25;
      doc.setFillColor(...primaryColor);
      doc.roundedRect(margin, yPos - 5, pageWidth - margin * 2, 20, 3, 3, 'F');
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Descripción', margin + 5, yPos + 8);
      doc.text('Monto', pageWidth - margin - 20, yPos + 8, { align: 'right' });
      
      yPos += 25;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, yPos - 5, pageWidth - margin * 2, 25, 3, 3, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textColor);
      doc.text(invoice.concept || 'Servicio educativo', margin + 5, yPos + 10);
      doc.text(this.formatCurrency(invoice.amount, invoice.currency), pageWidth - margin - 20, yPos + 10, { align: 'right' });
      
      // Totales
      yPos += 35;
      doc.setFontSize(11);
      
      // Subtotal
      doc.setTextColor(...lightGray);
      doc.text('Subtotal', pageWidth - margin - 80, yPos);
      doc.setTextColor(...textColor);
      doc.text(this.formatCurrency(invoice.subtotal || invoice.amount, invoice.currency), pageWidth - margin - 20, yPos, { align: 'right' });
      yPos += 8;
      
      // Impuesto
      if (invoice.tax_rate > 0) {
        doc.setTextColor(...lightGray);
        doc.text(`ITBIS (${invoice.tax_rate}%)`, pageWidth - margin - 80, yPos);
        doc.setTextColor(...textColor);
        doc.text(this.formatCurrency(invoice.tax_amount || 0, invoice.currency), pageWidth - margin - 20, yPos, { align: 'right' });
        yPos += 8;
      }
      
      // Línea separadora
      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.5);
      doc.line(pageWidth - margin - 90, yPos - 2, pageWidth - margin, yPos - 2);
      
      // Total
      yPos += 5;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text('TOTAL', pageWidth - margin - 80, yPos);
      doc.text(this.formatCurrency(invoice.total || invoice.amount, invoice.currency), pageWidth - margin - 20, yPos, { align: 'right' });
      
      // Estado de pago
      if (invoice.payment_date) {
        yPos += 20;
        doc.setFillColor(230, 247, 235);
        doc.setDrawColor(40, 181, 77);
        doc.roundedRect(margin, yPos - 5, pageWidth - margin * 2, 20, 3, 3, 'FD');
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 181, 77);
        doc.text(`Pago recibido el ${this.formatDate(invoice.payment_date)}${invoice.payment_method ? ` vía ${invoice.payment_method}` : ''}`, margin + 10, yPos + 8);
      }
      
      // Notas
      if (invoice.footer_note || invoice.terms) {
        yPos += 30;
        doc.setFontSize(9);
        doc.setTextColor(...lightGray);
        
        if (invoice.footer_note) {
          doc.text(`Nota: ${invoice.footer_note}`, margin, yPos);
          yPos += 6;
        }
        
        if (invoice.terms) {
          const splitTerms = doc.splitTextToSize(invoice.terms, pageWidth - margin * 2);
          doc.text(splitTerms, margin, yPos);
        }
      }
      
      // Pie de página
      const footerY = pageHeight - margin - 10;
      doc.setFontSize(8);
      doc.setTextColor(...lightGray);
      doc.text(invoice.school_name || 'Institución Educativa', pageWidth / 2, footerY, { align: 'center' });
      
      if (invoice.issued_by_name) {
        doc.text(`Emitido por: ${invoice.issued_by_name}`, pageWidth / 2, footerY + 5, { align: 'center' });
      }
      
      // Descargar el PDF
      doc.save(`${invoice.invoice_number}.pdf`);
      Helpers.toast('Factura descargada exitosamente!', 'success');
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      Helpers.toast('Error al generar el PDF', 'error');
    }
  },
  
  /**
   * Abrir modal para ver/descargar factura
   */
  async openInvoiceModal(invoiceId) {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) return;
    
    const modalHTML = `
      <div style="max-height: 90vh; overflow-y: auto;">
        ${this.renderInvoiceHTML(invoice)}
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e3ebf5;">
          <button onclick="window.InvoicingModule.downloadInvoicePDF(window.currentInvoice)" class="px-6 py-2 bg-[#0B63C7] text-white rounded-xl font-bold hover:bg-[#0850A0] transition-all flex items-center gap-2">
            <span>📥</span>
            Descargar PDF
          </button>
          <button onclick="App.ui.closeModal()" class="px-6 py-2 border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all">
            Cerrar
          </button>
        </div>
      </div>
    `;
    
    window.currentInvoice = invoice;
    window.openGlobalModal(modalHTML);
    
    if (window.lucide) lucide.createIcons();
  }
};

// Hacer módulo disponible globalmente
window.InvoicingModule = InvoicingModule;
