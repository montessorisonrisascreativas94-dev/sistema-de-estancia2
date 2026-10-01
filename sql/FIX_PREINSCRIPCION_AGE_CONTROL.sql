-- =============================================================
-- FIX_PREINSCRIPCION_AGE_CONTROL.sql
-- Control de edades por aula (según pre.md) + autorización Directora
-- Aplicar en Supabase Dashboard SQL Editor (project: yswizaskeftxpcphixiy)
-- ANTES de hacer deploy del nuevo preinscripcion.html
-- =============================================================

ALTER TABLE public.student_preregistrations
  ADD COLUMN IF NOT EXISTS suggested_level text,
  ADD COLUMN IF NOT EXISTS age_match boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS director_authorization_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS director_authorization_note text,
  ADD COLUMN IF NOT EXISTS director_authorization_approved boolean DEFAULT null;

COMMENT ON COLUMN public.student_preregistrations.suggested_level
  IS 'Nivel sugerido por edad calculada por el formulario (12 aulas oficiales segun pre.md).';

COMMENT ON COLUMN public.student_preregistrations.age_match
  IS 'TRUE si la edad del menor cae dentro del rango oficial del aula solicitada; FALSE si requiere revision de directora.';

COMMENT ON COLUMN public.student_preregistrations.director_authorization_requested
  IS 'El padre/madre/tutor acepto que la preinscripcion se envie fuera de rango de edad para revisión de Dirección.';

COMMENT ON COLUMN public.student_preregistrations.director_authorization_note
  IS 'Motivo por el cual se solicita la autorizacion (ej: hermanos en aula, ingreso tardío, valoración de madurez, etc.).';

COMMENT ON COLUMN public.student_preregistrations.director_authorization_approved
  IS 'Revisión final de la Directora: NULL = pendiente, TRUE = aprobada, FALSE = rechazada.';

CREATE INDEX IF NOT EXISTS idx_student_prereg_age_match
  ON public.student_preregistrations(age_match) WHERE age_match = false;

CREATE INDEX IF NOT EXISTS idx_student_prereg_director_auth_pending
  ON public.student_preregistrations(director_authorization_requested, director_authorization_approved)
  WHERE director_authorization_requested = true;
