/**
 * Motor de Ciclo Escolar
 * Maneja toda la lógica de inscripción, planes de pago y cobros
 */
class EnrollmentCycle {
  constructor() {
    this.currentUser = null;
    this.currentSchoolYear = null;
  }

  // ===========================
  // 1. Preinscripción
  // ===========================
  async submitPreEnrollment(data) {
    try {
      // 1. Create student profile
      const { data: student, error: studentError } = await window.supabase
        .from('students')
        .insert([{
          name: data.studentName,
          birth_date: data.birthDate,
          gender: data.gender,
          allergies: data.allergies,
          parent_id: this.currentUser?.id,
          is_active: false
        }])
        .select()
        .single();

      if (studentError) throw studentError;

      // 2. Get current school year
      const sy = await this.getCurrentSchoolYear();

      // 3. Create student_enrollment with status "preinscrito"
      const { data: enrollment, error: enrollError } = await window.supabase
        .from('student_enrollments')
        .insert([{
          student_id: student.id,
          school_year_id: sy.id,
          status: 'preinscrito',
          preinscription_date: new Date().toISOString(),
          notes: data.notes
        }])
        .select()
        .single();

      if (enrollError) throw enrollError;

      // 4. Save parent/guardian info
      await window.supabase
        .from('students')
        .update({
          p1_name: data.parentName,
          p1_relationship: data.parentRelationship,
          p1_phone: data.parentPhone,
          p1_email: data.parentEmail,
          p1_address: data.parentAddress
        })
        .eq('id', student.id);

      return { success: true, student, enrollment };
    } catch (error) {
      console.error('Pre-enrollment error:', error);
      throw error;
    }
  }

  // ===========================
  // 2. Admisión (Directora/Asistente)
  // ===========================
  async admitStudent(enrollmentId, classroomId, paymentPlanId) {
    try {
      // 1. Update enrollment status
      const { data: enrollment, error: updateError } = await window.supabase
        .from('student_enrollments')
        .update({
          status: 'admitido',
          classroom_id: classroomId,
          payment_plan_id: paymentPlanId,
          admission_date: new Date().toISOString()
        })
        .eq('id', enrollmentId)
        .select()
        .single();

      if (updateError) throw updateError;

      return { success: true, enrollment };
    } catch (error) {
      console.error('Admission error:', error);
      throw error;
    }
  }

  // ===========================
  // 3. Inscripción (Generar cargos)
  // ===========================
  async enrollStudent(enrollmentId) {
    try {
      // 1. Llamar a la función de la BD para generar cargos
      const { data, error } = await window.supabase
        .rpc('generate_student_charges', {
          p_enrollment_id: enrollmentId
        });

      if (error) throw error;

      // 2. Actualizar estado
      const { data: enrollment, error: updateError } = await window.supabase
        .from('student_enrollments')
        .update({
          status: 'inscrito',
          registration_date: new Date().toISOString()
        })
        .eq('id', enrollmentId)
        .select()
        .single();

      if (updateError) throw updateError;

      return { success: true, enrollment, chargesData: data };
    } catch (error) {
      console.error('Enrollment error:', error);
      throw error;
    }
  }

  // ===========================
  // 4. Reinscripción
  // ===========================
  async reEnrollStudent(studentId, newSchoolYearId, paymentPlanId) {
    try {
      // 1. Get last enrollment
      const { data: lastEnrollment } = await window.supabase
        .from('student_enrollments')
        .select('*')
        .eq('student_id', studentId)
        .order('school_year_id', { ascending: false })
        .limit(1)
        .single();

      // 2. Create new enrollment for next year
      const { data: newEnrollment, error: enrollError } = await window.supabase
        .from('student_enrollments')
        .insert([{
          student_id: studentId,
          school_year_id: newSchoolYearId,
          classroom_id: lastEnrollment.classroom_id,
          payment_plan_id: paymentPlanId,
          status: 'reinscrito',
          preinscription_date: new Date().toISOString()
        }])
        .select()
        .single();

      if (enrollError) throw enrollError;

      // 3. Generate charges
      await this.enrollStudent(newEnrollment.id);

      return { success: true, enrollment: newEnrollment };
    } catch (error) {
      console.error('Re-enrollment error:', error);
      throw error;
    }
  }

  // ===========================
  // 5. Obtener Planes de Pago
  // ===========================
  async getPaymentPlans(level, schedule) {
    try {
      const sy = await this.getCurrentSchoolYear();
      
      let query = window.supabase
        .from('payment_plans')
        .select('*, plan_installments(*)')
        .eq('school_year_id', sy.id)
        .eq('is_active', true);

      if (level) query = query.eq('level', level);
      if (schedule) query = query.eq('schedule', schedule);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get plans error:', error);
      throw error;
    }
  }

  // ===========================
  // 6. Obtener Cargos del Estudiante
  // ===========================
  async getStudentCharges(enrollmentId) {
    try {
      const { data, error } = await window.supabase
        .from('student_charges')
        .select('*, plan_installments(*)')
        .eq('student_enrollment_id', enrollmentId)
        .order('due_date');

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get charges error:', error);
      throw error;
    }
  }

  // ===========================
  // 7. Aplicar Pago
  // ===========================
  async applyPayment(chargeId, paymentData) {
    try {
      // 1. Insert payment
      const { data: payment, error: paymentError } = await window.supabase
        .from('payments')
        .insert([{
          student_charge_id: chargeId,
          student_id: paymentData.studentId,
          amount: paymentData.amount,
          concept: paymentData.concept,
          method: paymentData.method,
          reference: paymentData.reference,
          proof_url: paymentData.proofUrl,
          status: 'verified',
          paid_date: new Date().toISOString()
        }])
        .select()
        .single();

      if (paymentError) throw paymentError;

      // 2. Update charge status
      const { data: charge, error: chargeError } = await window.supabase
        .from('student_charges')
        .update({
          status: 'pagada',
          paid_date: new Date().toISOString()
        })
        .eq('id', chargeId)
        .select()
        .single();

      if (chargeError) throw chargeError;

      return { success: true, payment, charge };
    } catch (error) {
      console.error('Apply payment error:', error);
      throw error;
    }
  }

  // ===========================
  // 8. Cambiar Plan de Pago
  // ===========================
  async changePaymentPlan(enrollmentId, newPlanId) {
    try {
      // 1. Get current charges
      const currentCharges = await this.getStudentCharges(enrollmentId);

      // 2. Only delete pending charges
      const pendingChargeIds = currentCharges
        .filter(c => c.status === 'pending')
        .map(c => c.id);

      if (pendingChargeIds.length > 0) {
        await window.supabase
          .from('student_charges')
          .delete()
          .in('id', pendingChargeIds);
      }

      // 3. Update enrollment with new plan
      const { data: enrollment, error } = await window.supabase
        .from('student_enrollments')
        .update({
          payment_plan_id: newPlanId
        })
        .eq('id', enrollmentId)
        .select()
        .single();

      if (error) throw error;

      // 4. Generate new charges
      await window.supabase.rpc('generate_student_charges', {
        p_enrollment_id: enrollmentId
      });

      return { success: true, enrollment };
    } catch (error) {
      console.error('Change plan error:', error);
      throw error;
    }
  }

  // ===========================
  // 9. Obtener Año Escolar Actual
  // ===========================
  async getCurrentSchoolYear() {
    if (this.currentSchoolYear) return this.currentSchoolYear;
    
    try {
      const { data, error } = await window.supabase
        .from('school_years')
        .select('*')
        .eq('is_current', true)
        .single();

      if (error) throw error;
      this.currentSchoolYear = data;
      return data;
    } catch (error) {
      console.error('Get school year error:', error);
      throw error;
    }
  }

  // ===========================
  // 10. Obtener Inscripciones por Año
  // ===========================
  async getEnrollments(schoolYearId, status = null) {
    try {
      let query = window.supabase
        .from('student_enrollments')
        .select('*, students(*), classrooms(*), payment_plans(*)')
        .eq('school_year_id', schoolYearId);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get enrollments error:', error);
      throw error;
    }
  }

  // ===========================
  // 11. Cálculo de Trimestres
  // ===========================
  getTrimestres(charges) {
    const trimestres = [
      { name: 'Trimestre 1', months: ['Agosto', 'Septiembre', 'Octubre'] },
      { name: 'Trimestre 2', months: ['Noviembre', 'Diciembre', 'Enero'] },
      { name: 'Trimestre 3', months: ['Febrero', 'Marzo', 'Abril'] },
      { name: 'Trimestre 4', months: ['Mayo', 'Junio'] }
    ];

    return trimestres.map(t => {
      const trimCharges = charges.filter(c => t.months.includes(c.plan_installments?.month_name));
      const total = trimCharges.reduce((sum, c) => sum + c.amount, 0);
      const pagado = trimCharges.filter(c => c.status === 'pagada').reduce((sum, c) => sum + c.amount, 0);
      const pendiente = total - pagado;
      
      return {
        ...t,
        charges: trimCharges,
        total,
        pagado,
        pendiente
      };
    });
  }

  // ===========================
  // 12. Resumen Financiero
  // ===========================
  getFinancialSummary(charges) {
    const totalCharges = charges.length;
    const pagadas = charges.filter(c => c.status === 'pagada').length;
    const totalMonto = charges.reduce((sum, c) => sum + c.amount, 0);
    const totalPagado = charges.filter(c => c.status === 'pagada').reduce((sum, c) => sum + c.amount, 0);
    const balance = totalMonto - totalPagado;
    
    // Próximo pago
    const pendientes = charges
      .filter(c => c.status === 'pending' || c.status === 'vencida')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    
    const proximoPago = pendientes.length > 0 ? pendientes[0] : null;

    return {
      totalCharges,
      pagadas,
      pendientes: totalCharges - pagadas,
      porcentajePagado: totalCharges > 0 ? Math.round((pagadas / totalCharges) * 100) : 0,
      totalMonto,
      totalPagado,
      balance,
      proximoPago
    };
  }
}

// Instancia global
window.enrollmentCycle = new EnrollmentCycle();
