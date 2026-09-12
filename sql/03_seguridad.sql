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

