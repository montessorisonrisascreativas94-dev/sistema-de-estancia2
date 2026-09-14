-- ============================================================
-- 03_seguridad.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 6 (HABILITAR ROW LEVEL SECURITY (RLS))
-- ============================================================
-- ============================================================
-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Las funciones se crean en 04_funciones.sql, que se ejecuta DESPUÉS de
-- este archivo. Para evitar el error 42883 ("function ... does not exist"),
-- los GRANT/REVOKE sobre funciones se hacen de forma condicional.
CREATE OR REPLACE FUNCTION public._secure_grant(p_sig text, p_roles text, p_revoke boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regprocedure('public.' || p_sig) IS NOT NULL THEN
    IF p_revoke THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %s', p_sig, p_roles);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', p_sig, p_roles);
    END IF;
  END IF;
END $$;

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

SELECT public._secure_grant('generate_invoice_hash(bigint)', 'authenticated, service_role');

SELECT public._secure_grant('mark_invoice_email_sent(bigint)', 'authenticated, service_role');

ALTER TABLE caja_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE accounting_journal ENABLE ROW LEVEL SECURITY;

ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

SELECT public._secure_grant('close_period(bigint)', 'authenticated');

SELECT public._secure_grant('get_student_history(bigint)', 'authenticated');

SELECT public._secure_grant('create_school_year_with_periods(text, date, date, bigint[], int)', 'authenticated');

ALTER TABLE public.teacher_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.schedule_event_logs ENABLE ROW LEVEL SECURITY;

SELECT public._secure_grant('get_school_year_dashboard(bigint)', 'authenticated');

SELECT public._secure_grant('create_new_school_year_with_promotion(text, date, date, text, int, boolean, bigint)', 'authenticated');

SELECT public._secure_grant('get_pending_transfer_payments()', 'authenticated');

SELECT public._secure_grant('review_transfer_payment(bigint, text, text)', 'authenticated');

SELECT public._secure_grant('get_student_competencies(bigint, bigint)', 'authenticated');

SELECT public._secure_grant('get_classroom_area_averages(bigint, bigint)', 'authenticated');

SELECT public._secure_grant('get_institutional_averages(bigint)', 'authenticated');

SELECT public._secure_grant('get_student_academic_record(bigint)', 'authenticated');

SELECT public._secure_grant('create_new_school_year_with_promotion(text, date, date, boolean, boolean, boolean, int, text)', 'authenticated');

SELECT public._secure_grant('close_school_year(bigint)', 'authenticated');

SELECT public._secure_grant('set_active_school_year(bigint)', 'authenticated');

SELECT public._secure_grant('get_school_year_history(bigint)', 'authenticated');

SELECT public._secure_grant('is_period_writable(bigint)', 'authenticated');

SELECT public._secure_grant('get_active_period(bigint)', 'authenticated');

SELECT public._secure_grant('get_current_period()', 'authenticated');

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payroll_invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE meeting_attendance ENABLE ROW LEVEL SECURITY;

SELECT public._secure_grant('find_or_create_private_conversation(uuid, uuid)', 'authenticated');

SELECT public._secure_grant('get_tasks_for_period(bigint, bigint)', 'authenticated');

SELECT public._secure_grant('get_posts_for_period(bigint, bigint, int)', 'authenticated');

SELECT public._secure_grant('get_dashboard_kpis()', 'authenticated');

REVOKE ALL ON public.profiles, public.students, public.payments, public.audit_logs,
  public.system_errors, public.login_attempts, public.data_snapshots,
  public.accounting_journal, public.payroll_records, public.caja_sessions,
  public.invoices, public.messages, public.conversations, public.conversation_participants,
  public.grades, public.report_cards, public.task_evidences, public.door_punches,
  public.attendance, public.teacher_schedules, public.schedule_event_logs
  FROM anon;

SELECT public._secure_grant('generate_receipt_number()', 'authenticated');

SELECT public._secure_grant('convert_preregistration(bigint, bigint, bigint, bigint, text)', 'authenticated');

SELECT public._secure_grant('convert_preregistration(bigint, bigint, bigint, bigint, text)', 'anon', true);

SELECT public._secure_grant('get_posts_for_parent(bigint)', 'authenticated, anon');

SELECT public._secure_grant('mark_messages_read(bigint)', 'authenticated');

SELECT public._secure_grant('get_direct_messages(uuid)', 'authenticated');

SELECT public._secure_grant('check_rate_limit(text, int, int)', 'service_role');

SELECT public._secure_grant('record_login_attempt(text, text, boolean)', 'service_role');

SELECT public._secure_grant('prune_login_attempts()', 'service_role');

SELECT public._secure_grant('activate_period(bigint)', 'anon', true);

SELECT public._secure_grant('close_period(bigint)', 'anon', true);

SELECT public._secure_grant('generate_receipt_number()', 'anon', true);

SELECT public._secure_grant('process_door_punch(text)', 'anon', true);

SELECT public._secure_grant('mark_invoice_email_sent(bigint)', 'anon', true);

SELECT public._secure_grant('update_updated_at_column()', 'anon', true);

SELECT public._secure_grant('set_event_time()', 'anon', true);

SELECT public._secure_grant('calculate_nap_duration()', 'anon', true);

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

SELECT public._secure_grant('get_active_school_year_id()', 'authenticated');

SELECT public._secure_grant('activate_period(bigint)', 'authenticated');

SELECT public._secure_grant('activate_period(bigint)', 'anon', true);

SELECT public._secure_grant('create_school_year_with_periods(text, date, date, bigint[], int)', 'anon', true);

SELECT public._secure_grant('create_new_school_year_with_promotion(text, date, date, boolean, boolean, boolean, int, text)', 'anon', true);

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

SELECT public._secure_grant('boletin_ensure_structure(bigint)', 'authenticated');

ALTER TABLE public.school_year_processes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.school_year_processes TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.school_year_processes TO service_role;

SELECT public._secure_grant('get_active_period(bigint)', 'anon', true);

SELECT public._secure_grant('get_current_period()', 'anon', true);

SELECT public._secure_grant('get_unread_counts()', 'authenticated');

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_reactions    ENABLE ROW LEVEL SECURITY;

SELECT public._secure_grant('generate_ascii_receipt(bigint)', 'authenticated');

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

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'convert_preregistration') THEN
    GRANT EXECUTE ON FUNCTION public.convert_preregistration TO authenticated;
  END IF;
END $do$;
