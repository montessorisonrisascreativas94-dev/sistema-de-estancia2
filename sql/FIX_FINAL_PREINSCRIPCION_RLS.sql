-- =============================================================
-- FIX_FINAL_PREINSCRIPCION_RLS.sql  (ERROR 401 / 42501 DEFINITIVO)
-- =============================================================
-- PROYECTO: yswizaskeftxpcphixiy  (Montessori Sonrisas Creativas)
-- PEGAR Y EJECUTAR EN:
--   https://supabase.com/dashboard/project/yswizaskeftxpcphixiy/sql
--   SQL Editor → New query → Seleccionar TODO este texto → Run
--
-- ── MOTIVO DE QUE LOS FIXES ANTERIORES NO FUNCIONARAN ───────────
-- PostgreSQL RLS, para comandos INSERT, evalúa en MODO "AND" todas
-- las policies WITH CHECK que existen sobre la tabla. NO ES OR.
--
-- Tenías ~15 policies antiguas sobre public.student_preregistrations
-- (prereg_insert, prereg_all, preregistrations_insert_anon,
--  "Permitir insercion anonima de preinscripciones", etc.) creadas
-- en 07_politicas.sql. Algunas tienen WITH CHECK basado en
-- public.get_my_role() = 'directora' que, para el rol anon, NO se
-- cumple. Como todas se evalúan con AND, el resultado siempre era
-- false → 42501.
--
-- Además, MUY A MENUDO falta "GRANT USAGE ON SCHEMA public TO anon".
-- Sin eso, el rol anon ni siquiera puede "VER" la tabla aunque
-- tenga GRANT INSERT. Es el error #1 olvidado en Supabase.
--
-- SOLUCIÓN EN ESTE ARCHIVO:
--   1. GRANT USAGE SCHEMA (EL MÁS IMPORTANTE, SIEMPRE)
--   2. GRANT INSERT / SELECT tabla + secuencia a anon
--   3. GRANT CRUD + secuencia a authenticated
--   4. *** BORRAR TODAS LAS POLICIES EXISTENTES (cualquier nombre) ***
--   5. CREAR ÚNICAMENTE 5 POLICIES (1 comando = 1 policy, SIN ANDs)
--   6. Comprobación EXAHUSTIVA (si algo falla → EXCEPTION roja)
-- =============================================================


-- #################################################################
--  PASO 0 — GRANTs DE SCHEMA (IMPRESCINDIBLES, #1 olvidado)
-- #################################################################
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- #################################################################
--  PASO 1 — GRANTs DE TABLA Y SECUENCIA
-- #################################################################
-- 1a. anon = SOLO insertar y consultar id/status (NUNCA más)
GRANT INSERT ON public.student_preregistrations TO anon;
GRANT SELECT (id, status) ON public.student_preregistrations TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.student_preregistrations_id_seq TO anon;

-- 1b. authenticated = CRUD completo (lo usan directora/asistente)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_preregistrations TO authenticated;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.student_preregistrations_id_seq TO authenticated;

-- 1c. service_role = todo (por si hay edge functions)
GRANT ALL ON public.student_preregistrations TO service_role;
GRANT ALL ON SEQUENCE public.student_preregistrations_id_seq TO service_role;


-- #################################################################
--  PASO 2 — ASEGURAR RLS ACTIVO
-- #################################################################
ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;


-- #################################################################
--  PASO 3 — BORRAR TODAS LAS POLICIES DE student_preregistrations
--           (sin importar el nombre — evita conflicto AND)
-- #################################################################
DO $drop_all_policies$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'student_preregistrations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.student_preregistrations;', r.policyname);
    RAISE NOTICE 'Policy BORRADA OK: %', r.policyname;
  END LOOP;
END
$drop_all_policies$;


-- #################################################################
--  PASO 4 — CREAR EXACTAMENTE 5 POLICIES (SIN AND ACCIDENTAL)
--
-- ⚠️  REGLA INQUEBRANTABLE de PostgreSQL RLS:
--     SI dos o más policies aplican al MISMO rol Y al MISMO comando
--     (ambas FOR INSERT TO authenticated, p. ej.), sus WITH CHECK
--     se combinan con AND. Por eso NUNCA usamos "FOR ALL" + una
--     segunda policy INSERT para el mismo rol: el AND mata el INSERT
--     si el usuario no tiene perfil / role NULL.
--
--     AQUÍ separamos CRUD en comandos EXPLÍCITOS. Así para INSERT
--     authenticated SÓLO existe 1 policy (WITH CHECK true). Para
--     SELECT/UPDATE/DELETE cada una tiene su propia policy con
--     chequeo de rol. Ninguna coincide en (rol + comando) → 0 ANDs.
-- #################################################################

-- 4A. SÓLO para anon → INSERT sin restricciones (formulario público).
CREATE POLICY "prereg_anon_insert_only"
  ON public.student_preregistrations
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 4B. SÓLO para authenticated → INSERT sin restricciones.
--     (Incluso si aun no tiene perfil / role es NULL: puede insertar.)
CREATE POLICY "prereg_authenticated_insert_only"
  ON public.student_preregistrations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 4C. SÓLO para authenticated → SELECT con chequeo de rol (staff).
CREATE POLICY "prereg_staff_select"
  ON public.student_preregistrations
  FOR SELECT
  TO authenticated
  USING (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin'));

-- 4D. SÓLO para authenticated → UPDATE con chequeo de rol (staff).
CREATE POLICY "prereg_staff_update"
  ON public.student_preregistrations
  FOR UPDATE
  TO authenticated
  USING       (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK  (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin'));

-- 4E. SÓLO para authenticated → DELETE con chequeo de rol (staff).
CREATE POLICY "prereg_staff_delete"
  ON public.student_preregistrations
  FOR DELETE
  TO authenticated
  USING (COALESCE(public.get_my_role(), '') IN ('directora','asistente','admin'));


-- #################################################################
--  PASO 5 — ASEGURAR COLUMNAS NUEVAS (Age Control + URLs cédulas)
-- #################################################################
ALTER TABLE public.student_preregistrations
  ADD COLUMN IF NOT EXISTS suggested_level                  text,
  ADD COLUMN IF NOT EXISTS age_match                        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS director_authorization_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS director_authorization_note      text,
  ADD COLUMN IF NOT EXISTS director_authorization_approved  boolean DEFAULT null,
  ADD COLUMN IF NOT EXISTS p1_cedula_front_url              text,
  ADD COLUMN IF NOT EXISTS p1_cedula_back_url               text,
  ADD COLUMN IF NOT EXISTS p2_cedula_front_url              text,
  ADD COLUMN IF NOT EXISTS p2_cedula_back_url               text;

COMMENT ON COLUMN public.student_preregistrations.suggested_level
  IS 'Nivel sugerido por edad calculada (12 aulas oficiales).';
COMMENT ON COLUMN public.student_preregistrations.age_match
  IS 'TRUE si la edad cae dentro del rango oficial del aula solicitada; FALSE requiere revision Directora.';
COMMENT ON COLUMN public.student_preregistrations.director_authorization_requested
  IS 'El tutor acepto enviar fuera de rango de edad para revision.';
COMMENT ON COLUMN public.student_preregistrations.director_authorization_note
  IS 'Motivo autorizacion (hermanos en aula, ingreso tardio, valoracion de madurez, etc.).';
COMMENT ON COLUMN public.student_preregistrations.director_authorization_approved
  IS 'Revision Directora: NULL = pendiente, TRUE = aprobada, FALSE = rechazada.';
COMMENT ON COLUMN public.student_preregistrations.p1_cedula_front_url
  IS 'URL storage foto frente cédula Padre/Madre/Tutor 1.';
COMMENT ON COLUMN public.student_preregistrations.p1_cedula_back_url
  IS 'URL storage foto reverso cédula Padre/Madre/Tutor 1.';
COMMENT ON COLUMN public.student_preregistrations.p2_cedula_front_url
  IS 'URL storage foto frente cédula Padre/Madre/Tutor 2 (si aplica).';
COMMENT ON COLUMN public.student_preregistrations.p2_cedula_back_url
  IS 'URL storage foto reverso cédula Padre/Madre/Tutor 2 (si aplica).';

CREATE INDEX IF NOT EXISTS idx_student_prereg_age_match
  ON public.student_preregistrations(age_match) WHERE age_match = false;
CREATE INDEX IF NOT EXISTS idx_student_prereg_director_auth_pending
  ON public.student_preregistrations(director_authorization_requested, director_authorization_approved)
  WHERE director_authorization_requested = true;


-- #################################################################
--  PASO 6 — COMPROBACIÓN ROJA / VERDE  (si algo falla, aborta)
-- #################################################################
-- NOTA: La comprobación usa has_*_privilege (funciones oficiales PostgreSQL)
-- en vez de information_schema.*_grants. Esta última es inconsistente
-- para roles heredados / esquemas y produce falsos negativos (P0001).
DO $final_check$
DECLARE
  v_anon_can_usage_schema   boolean := false;
  v_anon_can_insert         boolean := false;
  v_anon_can_select         boolean := false;
  v_rls_on                  boolean := false;
  v_cuantas_policies        integer := 0;
  v_policy_anon_insert      boolean := false;
  v_policy_authed_insert    boolean := false;
  v_policy_staff_select     boolean := false;
  v_policy_staff_update     boolean := false;
  v_policy_staff_delete     boolean := false;
  v_roles_in_policies       text    := '';
  v_col_sugg_level          boolean := false;
  v_col_age_match           boolean := false;
  v_col_p1_front            boolean := false;
  v_col_p1_back             boolean := false;
  v_col_p2_front            boolean := false;
  v_col_p2_back             boolean := false;
BEGIN
  -- 6a. Schema usage para anon (método infalible PostgreSQL).
  v_anon_can_usage_schema := has_schema_privilege('anon', 'public', 'USAGE');
  IF NOT v_anon_can_usage_schema THEN
    RAISE EXCEPTION '[PASO 0 FALLÓ] Falta GRANT USAGE ON SCHEMA public TO anon. Vuelve a ejecutar TODO el archivo desde el principio.';
  END IF;

  -- 6b. Grants de tabla para anon (método infalible PostgreSQL).
  v_anon_can_insert := has_table_privilege('anon', 'public.student_preregistrations', 'INSERT');
  v_anon_can_select := has_table_privilege('anon', 'public.student_preregistrations', 'SELECT');
  IF NOT v_anon_can_insert THEN
    RAISE EXCEPTION '[PASO 1 FALLÓ] Falta GRANT INSERT ON public.student_preregistrations TO anon.';
  END IF;
  IF NOT v_anon_can_select THEN
    RAISE EXCEPTION '[PASO 1 FALLÓ] Falta GRANT SELECT ON public.student_preregistrations TO anon.';
  END IF;

  -- 6c. RLS activo?
  SELECT relrowsecurity INTO v_rls_on
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'student_preregistrations';
  IF NOT v_rls_on THEN
    RAISE EXCEPTION '[PASO 2 FALLÓ] RLS sigue DESACTIVADO en student_preregistrations.';
  END IF;

  -- 6d. Deben existir EXACTAMENTE 5 policies (sin sobrantes, sin faltas).
  SELECT count(*) INTO v_cuantas_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'student_preregistrations';
  IF v_cuantas_policies <> 5 THEN
    RAISE EXCEPTION '[PASO 3/4 FALLÓ] Hay % policies activas, deberían ser EXACTAMENTE 5. Vuelve a ejecutar TODO el archivo (paso 3 borra todas y recrea 5).', v_cuantas_policies;
  END IF;

  -- 6e. Las 5 son las correctas + target roles correctos + comando correcto.
  SELECT bool_or(policyname = 'prereg_anon_insert_only'          AND cmd = 'INSERT' AND roles::text[] @> '{anon}'::text[]),
         bool_or(policyname = 'prereg_authenticated_insert_only' AND cmd = 'INSERT' AND roles::text[] @> '{authenticated}'::text[]),
         bool_or(policyname = 'prereg_staff_select'               AND cmd = 'SELECT' AND roles::text[] @> '{authenticated}'::text[]),
         bool_or(policyname = 'prereg_staff_update'               AND cmd = 'UPDATE' AND roles::text[] @> '{authenticated}'::text[]),
         bool_or(policyname = 'prereg_staff_delete'               AND cmd = 'DELETE' AND roles::text[] @> '{authenticated}'::text[]),
         string_agg(policyname || '[' || cmd || ']→' || array_to_string(roles::text[], ','), ' ; ')
    INTO v_policy_anon_insert,
         v_policy_authed_insert,
         v_policy_staff_select,
         v_policy_staff_update,
         v_policy_staff_delete,
         v_roles_in_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'student_preregistrations';

  IF NOT v_policy_anon_insert THEN
    RAISE EXCEPTION '[PASO 4A FALLÓ] prereg_anon_insert_only faltante o incorrecta. Policies actuales: %', v_roles_in_policies;
  END IF;
  IF NOT v_policy_authed_insert THEN
    RAISE EXCEPTION '[PASO 4B FALLÓ] prereg_authenticated_insert_only faltante o incorrecta. Policies actuales: %', v_roles_in_policies;
  END IF;
  IF NOT v_policy_staff_select THEN
    RAISE EXCEPTION '[PASO 4C FALLÓ] prereg_staff_select faltante o incorrecta. Policies actuales: %', v_roles_in_policies;
  END IF;
  IF NOT v_policy_staff_update THEN
    RAISE EXCEPTION '[PASO 4D FALLÓ] prereg_staff_update faltante o incorrecta. Policies actuales: %', v_roles_in_policies;
  END IF;
  IF NOT v_policy_staff_delete THEN
    RAISE EXCEPTION '[PASO 4E FALLÓ] prereg_staff_delete faltante o incorrecta. Policies actuales: %', v_roles_in_policies;
  END IF;

  -- 6f. Columnas nuevas (Age Control + URLs cédulas).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='student_preregistrations' AND column_name='suggested_level'
  ) INTO v_col_sugg_level;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='student_preregistrations' AND column_name='age_match'
  ) INTO v_col_age_match;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_preregistrations' AND column_name='p1_cedula_front_url') INTO v_col_p1_front;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_preregistrations' AND column_name='p1_cedula_back_url')  INTO v_col_p1_back;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_preregistrations' AND column_name='p2_cedula_front_url') INTO v_col_p2_front;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_preregistrations' AND column_name='p2_cedula_back_url')  INTO v_col_p2_back;

  IF NOT v_col_sugg_level OR NOT v_col_age_match THEN
    RAISE EXCEPTION '[PASO 5 FALLÓ] Faltan columnas Age Control (suggested_level / age_match).';
  END IF;
  IF NOT v_col_p1_front OR NOT v_col_p1_back OR NOT v_col_p2_front OR NOT v_col_p2_back THEN
    RAISE EXCEPTION '[PASO 5 FALLÓ] Faltan columnas URLs cédulas P1/P2 (p1_cedula_front_url, etc).';
  END IF;

  RAISE NOTICE
E'\n'
'╔══════════════════════════════════════════════════════════════╗\n'
'║  ✅ TODO CORRECTO — PREINSCRIPCIÓN YA FUNCIONA              ║\n'
'╠══════════════════════════════════════════════════════════════╣\n'
'║  1. USAGE SCHEMA public para anon ........  SI  (paso 0)    ║\n'
'║  2. GRANT INSERT para anon ...............  SI  (paso 1)    ║\n'
'║  3. GRANT SELECT para anon ...............  SI  (paso 1)    ║\n'
'║  4. RLS activo ...........................  SI  (paso 2)    ║\n'
'║  5. Policies activas .....................  5 (EXACTO)      ║\n'
'║     · prereg_anon_insert_only [INSERT→anon]       👥 PÚBLICO║\n'
'║     · prereg_authenticated_insert_only [INS→auth] ✍️ INSERC.║\n'
'║     · prereg_staff_select [SELECT→auth]          🔍 STAFF   ║\n'
'║     · prereg_staff_update [UPDATE→auth]          ✏️ STAFF   ║\n'
'║     · prereg_staff_delete [DELETE→auth]          �️ STAFF   ║\n'
'║  6. Columnas Age Control .................  SI  (paso 5)    ║\n'
'║  7. Columnas URL cédulas P1/P2 ...........  SI  (paso 5)    ║\n'
'╠══════════════════════════════════════════════════════════════╣\n'
'║ 👉 YA PUEDES VOLVER A PREINSCRIPCION.HTML Y PULSAR ENVIAR   ║\n'
'╚══════════════════════════════════════════════════════════════╝';
END
$final_check$;


-- #################################################################
--  FINAL — 3 SELECTS INFORMATIVOS
-- #################################################################

-- (A) Policies ACTIVAS FINALES:
--     (pg_policies.roles es name[]; casteamos ::text[] para comparar)
SELECT policyname       AS "NOMBRE POLICY",
       cmd              AS "TIPO (CMD)",
       array_to_string(roles::text[], ', ') AS "APLICA A ROLES",
       CASE WHEN roles::text[] @> '{anon}'::text[] THEN '✅ FORMULARIO PÚBLICO'
            WHEN roles::text[] @> '{authenticated}'::text[] THEN '✅ DIRECTORA/ASISTENTE'
            ELSE '⚠️  DESCONOCIDO — ROL ERRÓNEO'
       END AS "STATUS"
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'student_preregistrations'
 ORDER BY 1;

-- (B) Grants reales (anon y authenticated y service_role):
-- NOTA: information_schema NO tiene role_sequence_grants (no standard SQL).
-- Para secuencias usamos pg_catalog (si existe), si no, se omiten sin error.
SELECT grantee         AS "ROL",
       privilege_type  AS "PRIVILEGIO",
       table_name      AS "OBJETO"
  FROM (
    -- (B1) Grants en TABLA student_preregistrations
    SELECT grantee,
           privilege_type,
           table_name,
           1 AS ord
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name   = 'student_preregistrations'
     UNION ALL
    -- (B2) Grants en SECUENCIA id_seq (método pg_catalog, compatible con todas versiones)
    SELECT u.rolname::text                          AS grantee,
           CASE
             WHEN has_sequence_privilege(u.rolname, c.oid, 'USAGE')   AND NOT has_sequence_privilege(u.rolname, c.oid, 'UPDATE') THEN 'USAGE'
             WHEN has_sequence_privilege(u.rolname, c.oid, 'UPDATE')  THEN 'USAGE+UPDATE+SELECT'
             ELSE NULL
           END::text                                   AS privilege_type,
           c.relname || ' (seq)'::text               AS table_name,
           2                                           AS ord
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_sequence  s ON s.seqrelid = c.oid
 CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS u(rolname)
     WHERE n.nspname = 'public'
       AND c.relname   = 'student_preregistrations_id_seq'
       AND c.relkind   = 'S'
  ) sub
 WHERE grantee IN ('anon','authenticated','service_role')
   AND privilege_type IS NOT NULL
 ORDER BY grantee, ord, privilege_type;

-- (C) Columnas nuevas de control:
SELECT column_name AS "COLUMNA NUEVA", data_type AS "TIPO", is_nullable AS "NULO?",
       CASE WHEN column_default IS NOT NULL THEN 'Sí → ' || column_default ELSE 'Sin default' END AS "VALOR DEFAULT"
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='student_preregistrations'
   AND column_name IN ('suggested_level','age_match','director_authorization_requested',
                       'director_authorization_note','director_authorization_approved',
                       'p1_cedula_front_url','p1_cedula_back_url',
                       'p2_cedula_front_url','p2_cedula_back_url')
 ORDER BY ordinal_position;
