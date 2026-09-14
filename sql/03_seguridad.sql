-- ============================================================
-- 03_seguridad.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 6 (HABILITAR ROW LEVEL SECURITY (RLS))
-- ============================================================
-- ============================================================
-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_evidences          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_gallery       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_chat          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_errors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms_acceptance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_punches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_routines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nap_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_schedules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_event_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_concepts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records         ENABLE ROW LEVEL SECURITY;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.generate_invoice_hash(BIGINT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mark_invoice_email_sent(BIGINT) TO authenticated, service_role;

ALTER TABLE caja_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE accounting_journal ENABLE ROW LEVEL SECURITY;

ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.close_period(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_student_history(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_school_year_with_periods(text, date, date, bigint[], int) TO authenticated;

ALTER TABLE public.teacher_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.schedule_event_logs ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.get_school_year_dashboard(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_new_school_year_with_promotion(text,date,date,text,int,boolean,bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_pending_transfer_payments() TO authenticated;

GRANT EXECUTE ON FUNCTION public.review_transfer_payment(bigint,text,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_student_competencies(bigint, bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_classroom_area_averages(bigint, bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_institutional_averages(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_student_academic_record(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_new_school_year_with_promotion(text,date,date,boolean,boolean,boolean,int,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.close_school_year(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_active_school_year(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_school_year_history(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_period_writable(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_active_period(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_current_period() TO authenticated;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payroll_invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE meeting_attendance ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.find_or_create_private_conversation(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_tasks_for_period(bigint, bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_posts_for_period(bigint, bigint, int) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis() TO authenticated;

REVOKE ALL ON public.profiles, public.students, public.payments, public.audit_logs,
  public.system_errors, public.login_attempts, public.data_snapshots,
  public.accounting_journal, public.payroll_records, public.caja_sessions,
  public.invoices, public.messages, public.conversations, public.conversation_participants,
  public.grades, public.report_cards, public.task_evidences, public.door_punches,
  public.attendance, public.teacher_schedules, public.schedule_event_logs
  FROM anon;

GRANT EXECUTE ON FUNCTION public.generate_receipt_number() TO authenticated;

GRANT EXECUTE ON FUNCTION public.convert_preregistration(bigint, bigint, bigint, bigint, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.convert_preregistration(bigint, bigint, bigint, bigint, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_posts_for_parent(bigint) TO authenticated, anon;

GRANT EXECUTE ON FUNCTION public.mark_messages_read(bigint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_direct_messages(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, text, boolean) TO service_role;

GRANT EXECUTE ON FUNCTION public.prune_login_attempts() TO service_role;

REVOKE EXECUTE ON FUNCTION public.activate_period(bigint) FROM anon;

REVOKE EXECUTE ON FUNCTION public.close_period(bigint) FROM anon;

REVOKE EXECUTE ON FUNCTION public.generate_receipt_number() FROM anon;

REVOKE EXECUTE ON FUNCTION public.process_door_punch(text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.mark_invoice_email_sent(bigint) FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;

REVOKE EXECUTE ON FUNCTION public.set_event_time() FROM anon;

REVOKE EXECUTE ON FUNCTION public.calculate_nap_duration() FROM anon;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.data_snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.door_punches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.get_active_school_year_id() TO authenticated;

GRANT EXECUTE ON FUNCTION public.activate_period(bigint) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.activate_period(bigint) FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_school_year_with_periods(text, date, date, bigint[], int) FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_new_school_year_with_promotion(text,date,date,boolean,boolean,boolean,int,text) FROM anon;

ALTER TABLE public.routine_categories           ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.routine_events               ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.classroom_routine_settings   ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.classroom_schedule_blocks    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.classroom_schedule_block_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.classroom_daily_schedule ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_boleta_notes   ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_score_history   ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

ALTER TABLE public.eval_evaluations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_areas        ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_competencies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_periods      ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_modules      ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_activities   ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_evidences    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_scores       ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.eval_formulas     ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

ALTER TABLE public.eval_area_notes ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.boletin_ensure_structure(bigint) TO authenticated;

ALTER TABLE public.school_year_processes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.school_year_processes TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.school_year_processes TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_active_period(bigint) FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_current_period() FROM anon;

GRANT EXECUTE ON FUNCTION public.get_unread_counts() TO authenticated;

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_reactions    ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.generate_ascii_receipt(BIGINT) TO authenticated;

ALTER TABLE public.payment_concepts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.school_years             ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_plans            ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_installments        ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_enrollments     ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_charges         ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.parent_ratings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.convert_preregistration TO authenticated;
