-- ============================================================
-- 14_admision_completa.sql — Cierra el flujo de admisión
-- ------------------------------------------------------------
-- Problema 1: `students` solo tiene ~30 columnas, pero el modal
--   de admisión (js/shared/student-record-modal.js) envía ~70.
--   Los INSERT fallan con PGRST204/42703 "column not found", por
--   lo que la preinscripción NUNCA se convierte en estudiante.
--
-- Problema 2: `student_preregistrations.reviewer_note` se usa en
--   el paso 3 de admitStudent() pero la columna no existe. El
--   UPDATE a status='admitted' falla entero y la preinscripción
--   se queda en 'pending' para siempre.
--
-- Problema 3: no hay columna para separar el correo de LOGIN
--   (fijo @sonrisacreativas.com) del correo de NOTIFICACIONES
--   del padre (el que él da en el formulario).
--
-- Uso: pegar TODO en el SQL Editor de Supabase (proyecto
--   yswizaskeftxpcphixiy) y ejecutar. Es idempotente.
-- ============================================================


-- ── 1) Función auxiliar idempotente ─────────────────────────
CREATE OR REPLACE FUNCTION public.add_column_if_missing(
  tbl        text,
  col        text,
  definition text
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s',
    tbl, col, definition
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'add_column_if_missing(%, %) omitido: %', tbl, col, SQLERRM;
END $$;


-- ── 2) students: identidad y contacto ───────────────────────
SELECT public.add_column_if_missing('students', 'student_name',          'text');
SELECT public.add_column_if_missing('students', 'student_last_name',     'text');
SELECT public.add_column_if_missing('students', 'birth_date',            'date');
SELECT public.add_column_if_missing('students', 'gender',                'text');
SELECT public.add_column_if_missing('students', 'nationality',           'text');
SELECT public.add_column_if_missing('students', 'birth_place',           'text');


-- ── 3) students: ubicación ──────────────────────────────────
SELECT public.add_column_if_missing('students', 'address',      'text');
SELECT public.add_column_if_missing('students', 'province',     'text');
SELECT public.add_column_if_missing('students', 'municipality', 'text');
SELECT public.add_column_if_missing('students', 'sector',       'text');


-- ── 4) students: académico ──────────────────────────────────
-- level_requested conserva el valor crudo del formulario de
-- preinscripción (ej. 'Kínder – Línea Gris'), que NO coincide con
-- classroom.level. Se guarda aparte para auditoría.
SELECT public.add_column_if_missing('students', 'level_requested', 'text');
SELECT public.add_column_if_missing('students', 'suggested_level', 'text');
SELECT public.add_column_if_missing('students', 'observations',    'text');
-- Trazabilidad con la preinscripción de origen.
SELECT public.add_column_if_missing('students', 'pre_registration_id', 'bigint');


-- ── 5) students: tutor principal ────────────────────────────
SELECT public.add_column_if_missing('students', 'p1_relationship', 'text');
SELECT public.add_column_if_missing('students', 'p1_cedula',      'text');
SELECT public.add_column_if_missing('students', 'p1_whatsapp',    'text');
SELECT public.add_column_if_missing('students', 'p1_profession',  'text');
SELECT public.add_column_if_missing('students', 'p1_workplace',   'text');
SELECT public.add_column_if_missing('students', 'p1_occupation',  'text');


-- ── 6) students: tutor secundario ───────────────────────────
SELECT public.add_column_if_missing('students', 'p2_relationship', 'text');
SELECT public.add_column_if_missing('students', 'p2_cedula',      'text');
SELECT public.add_column_if_missing('students', 'p2_whatsapp',    'text');
SELECT public.add_column_if_missing('students', 'p2_profession',  'text');
SELECT public.add_column_if_missing('students', 'p2_workplace',   'text');


-- ── 7) students: contacto de emergencia ─────────────────────
SELECT public.add_column_if_missing('students', 'emergency_name',         'text');
SELECT public.add_column_if_missing('students', 'emergency_relationship', 'text');
SELECT public.add_column_if_missing('students', 'emergency_cedula',       'text');
SELECT public.add_column_if_missing('students', 'emergency_phone',        'text');
SELECT public.add_column_if_missing('students', 'authorized_persons',     'jsonb DEFAULT ''[]''::jsonb');


-- ── 8) students: salud ──────────────────────────────────────
SELECT public.add_column_if_missing('students', 'medications',        'text');
SELECT public.add_column_if_missing('students', 'medical_conditions', 'text');
SELECT public.add_column_if_missing('students', 'disability',         'text');
SELECT public.add_column_if_missing('students', 'food_restrictions',  'text');
SELECT public.add_column_if_missing('students', 'medical_notes',      'text');
SELECT public.add_column_if_missing('students', 'insurance',          'text');
SELECT public.add_column_if_missing('students', 'pediatrician',       'text');
SELECT public.add_column_if_missing('students', 'pediatrician_phone', 'text');
SELECT public.add_column_if_missing('students', 'vaccines_complete',  'boolean DEFAULT false');


-- ── 9) students: documentos (data URLs o URLs de Storage) ───
SELECT public.add_column_if_missing('students', 'photo_url',              'text');
SELECT public.add_column_if_missing('students', 'birth_certificate_url',  'text');
SELECT public.add_column_if_missing('students', 'cedula_front_url',       'text');
SELECT public.add_column_if_missing('students', 'cedula_back_url',        'text');
SELECT public.add_column_if_missing('students', 'p1_cedula_front_url',    'text');
SELECT public.add_column_if_missing('students', 'p1_cedula_back_url',     'text');
SELECT public.add_column_if_missing('students', 'p2_cedula_front_url',    'text');
SELECT public.add_column_if_missing('students', 'p2_cedula_back_url',     'text');
SELECT public.add_column_if_missing('students', 'vaccine_card_url',       'text');
SELECT public.add_column_if_missing('students', 'contract_signed_url',    'text');
SELECT public.add_column_if_missing('students', 'digital_signature',      'text');


-- ── 10) students: montos adicionales ────────────────────────
SELECT public.add_column_if_missing('students', 'registration_fee', 'numeric(10,2) DEFAULT 0');
SELECT public.add_column_if_missing('students', 'discount',         'numeric(10,2) DEFAULT 0');
SELECT public.add_column_if_missing('students', 'discount_percent', 'numeric(5,2)  DEFAULT 0');


-- ── 11) student_preregistrations: nota de revisión ──────────
-- Sin esta columna el UPDATE a status='admitted' de admitStudent()
-- revienta y la preinscripción nunca cambia de estado.
SELECT public.add_column_if_missing('student_preregistrations', 'reviewer_note', 'text');

-- Columns que solo existen si se aplicó FIX_PREINSCRIPCION_AGE_CONTROL.sql.
-- Se crean aquí para que el INSERT público de preinscripcion.html
-- nunca tenga que recurrir al reintento "degraded".
SELECT public.add_column_if_missing('student_preregistrations', 'suggested_level',                    'text');
SELECT public.add_column_if_missing('student_preregistrations', 'age_match',                         'boolean DEFAULT true');
SELECT public.add_column_if_missing('student_preregistrations', 'director_authorization_requested', 'boolean DEFAULT false');
SELECT public.add_column_if_missing('student_preregistrations', 'director_authorization_note',      'text');
SELECT public.add_column_if_missing('student_preregistrations', 'director_authorization_approved', 'boolean');

-- Acuse de recibo: la Edge Function prereg-notify marca aquí que
-- ya se notificó al padre, para no reenviar en duplicado.
SELECT public.add_column_if_missing('student_preregistrations', 'ack_sent_at',       'timestamp with time zone');
SELECT public.add_column_if_missing('student_preregistrations', 'ack_email_sent_to','text');

-- Credenciales entregadas al aceptar la admisión.
SELECT public.add_column_if_missing('student_preregistrations', 'admitted_at',        'timestamp with time zone');
SELECT public.add_column_if_missing('student_preregistrations', 'credentials_sent_at','timestamp with time zone');


-- ── 12) profiles: separar login de notificaciones ───────────
-- login_email    → fijo, @sonrisacreativas.com (es el Auth user)
-- notification_email → el correo personal que dio la familia
SELECT public.add_column_if_missing('profiles', 'notification_email', 'text');


-- ── 13) payments: vínculo con el plan de pagos ──────────────
-- admitStudent() insertaba en `payments` una columna `payment_plan`
-- que no existe, y `description` en vez de `concept`.
SELECT public.add_column_if_missing('payments', 'payment_plan_id', 'bigint REFERENCES public.payment_plans(id) ON DELETE SET NULL');
SELECT public.add_column_if_missing('payments', 'description',    'text');


-- ── 14) Índices de apoyo ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_pre_registration_id
  ON public.students(pre_registration_id) WHERE pre_registration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_matricula_lower
  ON public.students(lower(matricula)) WHERE matricula IS NOT NULL;

-- Una preinscripción no puede generar dos expedientes. El modal ya
-- avisa antes de insertar, pero esto cierra la puerta por si falla el
-- chequeo del cliente o llegan dos aprobaciones a la vez.
-- Si el índice no se puede crear porque ya hay duplicados, se avisa en
-- lugar de abortar todo el script.
DO $$
DECLARE dups bigint;
BEGIN
  SELECT count(*) INTO dups
  FROM (SELECT pre_registration_id
        FROM public.students
        WHERE pre_registration_id IS NOT NULL
        GROUP BY pre_registration_id
        HAVING count(*) > 1) t;

  IF dups > 0 THEN
    RAISE NOTICE 'ATENCIÓN: % preinscripciones ya tienen más de un estudiante. No se creó el índice único; revísalas a mano.', dups;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_students_pre_registration_id
      ON public.students(pre_registration_id)
      WHERE pre_registration_id IS NOT NULL;
  END IF;
END $$;


-- ── 15) Verificación ────────────────────────────────────────
-- Debe listar 0 filas en la primera consulta.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'students'
  AND column_name IN (
    'student_name','student_last_name','birth_date','gender','nationality','birth_place',
    'address','province','municipality','sector','level_requested','suggested_level',
    'observations','pre_registration_id',
    'p1_relationship','p1_cedula','p1_whatsapp','p1_profession','p1_workplace','p1_occupation',
    'p2_relationship','p2_cedula','p2_whatsapp','p2_profession','p2_workplace',
    'emergency_name','emergency_relationship','emergency_cedula','emergency_phone','authorized_persons',
    'medications','medical_conditions','disability','food_restrictions','medical_notes',
    'insurance','pediatrician','pediatrician_phone','vaccines_complete',
    'photo_url','birth_certificate_url','cedula_front_url','cedula_back_url',
    'p1_cedula_front_url','p1_cedula_back_url','p2_cedula_front_url','p2_cedula_back_url',
    'vaccine_card_url','contract_signed_url','digital_signature',
    'registration_fee','discount'
  )
ORDER BY column_name;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'student_preregistrations'
  AND column_name IN (
    'reviewer_note','suggested_level','age_match',
    'director_authorization_requested','director_authorization_note',
    'director_authorization_approved',
    'ack_sent_at','ack_email_sent_to','admitted_at','credentials_sent_at'
  )
ORDER BY column_name;

-- ============================================================
-- MIGRACIÓN 16 — Flag de contraseña temporal + notification_email
-- Fecha: 2026-10-01
-- Propósito:
--   * Detectar cuando un padre/madre inicia sesión por primera vez
--     con la contraseña temporal (sonrisa123) para forzar el cambio
--     por una contraseña segura propia.
--   * Almacenar el correo personal de notificaciones separado del
--     correo institucional de login (@sonrisacreativas.com).
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_temporary_password boolean DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_email text;

-- Comentarios de documentación
COMMENT ON COLUMN public.profiles.is_temporary_password
  IS 'TRUE cuando el usuario aún usa la contraseña temporal "sonrisa123" y debe cambiarla en su próximo login.';

COMMENT ON COLUMN public.profiles.notification_email
  IS 'Correo personal de la familia donde llegan acuses, cuotas y avisos (distinto del login institucional @sonrisacreativas.com).';
