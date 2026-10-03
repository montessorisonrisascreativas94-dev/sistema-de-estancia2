-- =============================================================
-- 19_submit_preregistration_rpc.sql
-- Proyecto: yswizaskeftxpcphixiy
-- Dónde:  https://supabase.com/dashboard/project/yswizaskeftxpcphixiy/sql
--         SQL Editor → New query → Run
--
-- ── POR QUÉ ESTE ARCHIVO EXISTE ───────────────────────────────
-- El formulario público fallaba con HTTP 401 y en el cuerpo un 42501
-- ("new row violates row-level security policy for table
--  student_preregistrations"). La causa NO era la clave pública ni que
-- faltara la política de INSERT. Era esta:
--
--   1. El INSERT sí se permitía (política prereg_anon_insert_only).
--      De hecho la preinscripción SE GUARDABA.
--   2. El formulario pedía `Prefer: return=representation`. PostgREST,
--      tras insertar, ejecuta un SELECT para devolver la fila creada.
--   3. Ese SELECT lo rechazaba RLS: no existe ninguna política SELECT
--      para el rol `anon` (solo hay prereg_staff_select, que es TO
--      authenticated). RLS filtra la fila recién creada → 42501.
--
-- Resultado: la solicitud se guardaba pero el navegador receive 401, el
-- padre veía un error y volvía a enviar, generando duplicados.
--
-- ── LA SOLUCIÓN ───────────────────────────────────────────────
-- Que el INSERT pase por una función SECURITY DEFINER que devuelve
-- ÚNICAMENTE el id generado. La función corre como propietario (no le
-- aplica RLS), así que puede leer su propio resultado sin que RLS lo
-- bloquee. El navegador recibe un número y nunca necesita SELECT.
--
-- De paso se corrige un agujero de seguridad real: con la política
-- anterior (WITH CHECK (true)) cualquier visitante podía mandar
-- director_authorization_approved = true y saltarse la revisión de
-- Dirección. Aquí ese campo se descarta siempre, igual que `status`.
--
-- Ejecutar DESPUÉS de FIX_FINAL_PREINSCRIPCION_RLS.sql
-- =============================================================


-- #################################################################
--  PASO 1 — QUITAR EL INSERT PÚBLICO DIRECTO A LA TABLA
--
-- A partir de aquí el rol `anon` ya NO puede insertar en la tabla
-- directamente: solo puede llamar a esta función. Así el campo de
-- estado y el de aprobación quedan siempre bajo control del servidor.
-- #################################################################
REVOKE INSERT ON public.student_preregistrations FROM anon;

-- La política de INSERT para anon sobra. Se deja la de authenticated
-- porque el panel de Dirección también inserta filas directamente.
-- El DROP es necesario: si ya venías de ejecutar
-- FIX_FINAL_PREINSCRIPCION_RLS.sql, esta política existe y el CREATE
-- fallaría con 42710 "policy already exists".
DROP POLICY IF EXISTS "prereg_anon_insert_only" ON public.student_preregistrations;
DROP POLICY IF EXISTS "prereg_authenticated_insert_only" ON public.student_preregistrations;
CREATE POLICY "prereg_authenticated_insert_only"
  ON public.student_preregistrations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- #################################################################
--  PASO 2 — LA FUNCIÓN
-- #################################################################
CREATE OR REPLACE FUNCTION public.submit_preregistration(p_data jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row   jsonb;
  v_cols  text;
  v_vals  text;
  v_id    bigint;
  v_faltan text;
BEGIN
  IF p_data IS NULL OR p_data = '{}'::jsonb THEN
    RAISE EXCEPTION 'No se recibieron datos de la preinscripción.';
  END IF;

  -- ── 2a. Campos que el público NUNCA puede fijar ──────────────
  -- `status` lo pone el servidor. `director_authorization_approved` es
  -- la revisión de Dirección: si un visitante pudiera mandarlo, se
  -- saltaría el proceso de admisión. `id` y las marcas de tiempo las
  -- genera la base de datos.
  v_row := p_data
    - 'id'
    - 'status'
    - 'director_authorization_approved'
    - 'created_at'
    - 'updated_at';

  -- ── 2b. Descartar claves que no son columnas reales ─────────
  -- Si el formulario gana un campo nuevo antes de que se aplique la
  -- migración, no debe reventar con "column does not exist".
  SELECT coalesce(jsonb_object_agg(e.k, e.v), '{}'::jsonb)
    INTO v_row
    FROM jsonb_each(v_row) AS e(k, v)
   WHERE EXISTS (
           SELECT 1
             FROM information_schema.columns c
            WHERE c.table_schema   = 'public'
              AND c.table_name     = 'student_preregistrations'
              AND c.column_name    = e.k
         );

  -- ── 2c. Revisar las columnas obligatorias ───────────────────
  -- Se consulta el esquema real en vez de escribir una lista a mano,
  -- para que siga siendo correcto si la tabla cambia. Es preferible a
  -- dejar que Postgres lance un 23502 crudo ("null value in column
  -- p1_name..."), que no dice nada útil a quien rellena el formulario.
  SELECT string_agg(c.column_name, ', ')
    INTO v_faltan
    FROM information_schema.columns c
   WHERE c.table_schema   = 'public'
     AND c.table_name     = 'student_preregistrations'
     AND c.is_nullable    = 'NO'
     AND c.column_default IS NULL
     AND c.column_name   <> 'id'
     AND btrim(coalesce(v_row ->> c.column_name, '')) = '';

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION
      'Faltan datos obligatorios de la preinscripción: %. Revisa el formulario e inténtalo de nuevo.',
      v_faltan;
  END IF;

  -- Toda solicitud entra como PENDIENTE, siempre.
  v_row := v_row || jsonb_build_object('status', 'pending');

  -- ── 2d. INSERT dinámico solo con las columnas presentes ───────
  -- Se arma la lista de columnas a partir de las claves que llegaron,
  -- de modo que las columnas ausentes conservan su DEFAULT en vez de
  -- insertarse como NULL.
  v_cols := (SELECT string_agg(quote_ident(k), ', ')
               FROM jsonb_object_keys(v_row) AS k);
  v_vals := (SELECT string_agg(quote_nullable(v_row ->> k), ', ')
               FROM jsonb_object_keys(v_row) AS k);

  EXECUTE format(
    'INSERT INTO public.student_preregistrations (%s) VALUES (%s) RETURNING id',
    v_cols, v_vals
  ) INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.submit_preregistration(jsonb) IS
  'Alta publica de preinscripcion. Devuelve solo el id generado para que el '
  'navegador no necesite SELECT sobre la tabla (RLS lo bloquearia). Descarta '
  'status y director_authorization_approved.';


-- #################################################################
--  PASO 3 — PERMISOS
-- Cerrar a public/anon primero, y solo después abrir a quien corresponde.
-- #################################################################
REVOKE ALL ON FUNCTION public.submit_preregistration(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_preregistration(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_preregistration(jsonb) TO authenticated;


-- #################################################################
--  PASO 4 — COMPROBACIÓN
-- #################################################################
DO $check$
DECLARE
  v_id    bigint;
  v_estado text;
  v_aprob text;
BEGIN
  -- Debe insertar y devolver un id (esta fila hay que borrarla después).
  -- Incluye las cuatro columnas NOT NULL (student_name, p1_name,
  -- p1_phone, p1_email) y a propósito `status: aprobado` +
  -- `director_authorization_approved: true` para comprobar que la
  -- función los descarta y no los deja pasar.
  v_id := public.submit_preregistration(
    '{"student_name":"PRUEBA TECNICA - BORRAR",
      "student_last_name":"AUTOMATICA",
      "p1_name":"PRUEBA TECNICA",
      "p1_phone":"0000000000",
      "p1_email":"prueba-tecnica@borrar.invalid",
      "status":"aprobado",
      "director_authorization_approved":true}'::jsonb
  );

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'La función no devolvió id. Revisa los permisos de la tabla.';
  END IF;

  SELECT status::text,
         coalesce(director_authorization_approved::text, 'NULL')
    INTO v_estado, v_aprob
    FROM public.student_preregistrations
   WHERE id = v_id;

  IF v_estado <> 'pending' THEN
    RAISE EXCEPTION 'Seguridad: la función dejó status = %, debería ser pending.', v_estado;
  END IF;

  IF v_aprob <> 'NULL' THEN
    RAISE EXCEPTION 'Seguridad: la función dejó director_authorization_approved = %, debería ser NULL.', v_aprob;
  END IF;

  RAISE NOTICE
    'OK: id=%  status=%  director_authorization_approved=%', v_id, v_estado, v_aprob;

  DELETE FROM public.student_preregistrations WHERE id = v_id;
  RAISE NOTICE 'Fila de prueba borrada. Ya puedes usar preinscripcion.html.';
END
$check$;