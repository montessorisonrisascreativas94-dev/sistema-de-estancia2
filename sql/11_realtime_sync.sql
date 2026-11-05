-- #################################################################
-- RealtimeSync — habilita las tablas necesarias en la publicación
-- supabase_realtime para que los paneles se actualicen en vivo.
--
-- Idempotente: se puede ejecutar varias veces sin errores.
-- Ejecutar en Supabase → SQL Editor (o en tu base local).
-- #################################################################

DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    -- Personas / estructura
    'profiles', 'students', 'student_enrollments', 'student_preregistrations',
    'student_promotions', 'student_charges', 'classrooms', 'teacher_schedules',
    -- Asistencia / rutina
    'attendance', 'attendance_requests', 'door_punches', 'daily_logs',
    'nap_sessions', 'routine_events', 'classroom_routines', 'classroom_daily_schedule',
    -- Dinero
    'payments', 'invoices', 'invoice_items', 'payment_plans', 'payment_concepts',
    'plan_installments', 'expenses', 'orders', 'order_items', 'payroll_records',
    -- Comunicación
    'messages', 'message_attachments', 'message_reactions', 'conversations',
    'conversation_participants', 'classroom_chat', 'notifications',
    'posts', 'comments', 'likes',
    -- Académico
    'tasks', 'task_evidences', 'grades', 'eval_scores', 'eval_evaluations',
    'report_cards', 'reports', 'school_activities', 'school_activity_evidences',
    'classroom_events', 'classroom_gallery',
    -- Ciclo escolar / configuración
    'school_years', 'school_settings', 'school_month_configs',
    -- Gestión
    'staff_permits', 'inquiries', 'incidents', 'interventions', 'parent_ratings',
    'meetings', 'meeting_attendance'
  ];
BEGIN
  -- Asegura que la publicación exista (Supabase la crea por defecto).
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY tablas LOOP
    -- Ignora tablas que no existan en esta instalación.
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;
