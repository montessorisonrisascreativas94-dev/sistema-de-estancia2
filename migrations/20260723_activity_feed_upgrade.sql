-- ============================================================
-- Migración: Actualizar tabla notifications para Centro de Actividad
-- Fecha: 2026-07-23
-- ============================================================

-- Agregar columnas nuevas de forma segura
DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority text DEFAULT 'informative';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_id bigint REFERENCES public.students(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_id bigint;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_table text;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority) WHERE priority IN ('critical', 'important');
CREATE INDEX IF NOT EXISTS idx_notifications_pinned ON public.notifications(is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_notifications_student ON public.notifications(student_id);

-- Comentarios
COMMENT ON COLUMN public.notifications.priority IS 'Nivel de prioridad: critical, important, informative';
COMMENT ON COLUMN public.notifications.expires_at IS 'Fecha de expiración — actividades que nunca expiran se quedan';
COMMENT ON COLUMN public.notifications.is_pinned IS 'Actividad fijada que no desaparece automáticamente al leerse';
COMMENT ON COLUMN public.notifications.student_id IS 'ID del estudiante asociado a la notificación';
COMMENT ON COLUMN public.notifications.reference_id IS 'ID del registro fuente (task_id, post_id, payment_id, etc.)';
COMMENT ON COLUMN public.notifications.reference_table IS 'Tabla fuente del evento (tasks, posts, payments, etc.)';
