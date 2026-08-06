-- ============================================================
-- 🧾 BOLETA INTELLIGENTE — ACTIVIDADES ENRIQUECIDAS
-- Add-on del Constructor de Evaluaciones / Centro de Calificaciones.
--  - activity_date : fecha de realización de la actividad (Módulo 2 del diseño)
--  - max_value     : valor máximo / puntos (0-100) de la actividad
--  - activity_type : tipo de actividad (actividad, evaluación, trabajo, proyecto, otro)
-- Autor: Karpus Kids · Fecha: 2026-08-05
-- ============================================================

ALTER TABLE public.eval_activities
  ADD COLUMN IF NOT EXISTS activity_date date;

ALTER TABLE public.eval_activities
  ADD COLUMN IF NOT EXISTS max_value numeric(7,2) DEFAULT 100
  CHECK (max_value IS NULL OR (max_value > 0 AND max_value <= 100));

ALTER TABLE public.eval_activities
  ADD COLUMN IF NOT EXISTS activity_type text DEFAULT 'actividad'
  CHECK (activity_type IN ('actividad','evaluacion','trabajo','proyecto','otro'));

CREATE INDEX IF NOT EXISTS idx_eval_activities_date ON public.eval_activities (activity_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
