-- ================================================================
-- 16_fix_classroom_delete.sql
-- Corrige: "update or delete on table classrooms violates foreign key
--           constraint attendance_classroom_id_fkey on table attendance"
--
-- ESTA MIGRACION ES LA RED DE SEGURIDAD, NO EL FIX PRINCIPAL.
-- El fix principal ya esta en el codigo: rooms.module.js hace SOFT DELETE
-- (classrooms.deleted_at = now()), que es el patron que ya usa el resto del
-- proyecto (chat, gradebook, dgii). Con soft delete las filas de attendance /
-- grades / report_cards nunca se rompen porque el aula no se borra.
--
-- Esta migracion deja la base preparada para que un DELETE fisico (limpieza
-- manual, scripts, restauraciones) tambien funcione, en vez de reventar.
--
-- Causa raiz: varias tablas referencian public.classrooms(id) SIN
-- clausula ON DELETE, por lo que PostgreSQL usa NO ACTION y BLOQUEA
-- el borrado del aula aunque las columnas sean nullable.
--
-- Politica aplicada:
--   * Columnas NULLABLE (historico que debe conservarse)
--       -> ON DELETE SET NULL   (el registro se queda, pierde el aula)
--   * Columnas NOT NULL (hijos que solo existen por el aula)
--       -> ON DELETE CASCADE    (se van con el aula)
--
-- Es IDEMPOTENTE: se puede ejecutar varias veces sin efectos extra.
-- ================================================================
BEGIN;

-- ---------------------------------------------------------------
-- Helper: reconstruye la FK de una columna hacia classrooms con la
-- regla indicada. Descubre el nombre real del constraint en vez de
-- asumir el nombre por defecto de Postgres.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._tmp_repair_classroom_fk(
  p_table  text,
  p_column text,
  p_rule   text   -- 'SET NULL' | 'CASCADE'
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_constraint text;
BEGIN
  -- 1) Localizar constraint(s) FK sobre esa columna que apunten a classrooms
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
    JOIN pg_class ref ON ref.oid = con.confrelid
    WHERE rel.relname = p_table
      AND att.attname = p_column
      AND con.contype = 'f'
      AND ref.relname = 'classrooms'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, v_constraint
    );
  END LOOP;

  -- 2) Recrear con la regla de borrado deseada
  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I)
       REFERENCES public.classrooms(id) ON DELETE %s',
    p_table,
    p_table || '_' || p_column || '_fkey',
    p_column,
    p_rule
  );
END $$;

-- ---------------------------------------------------------------
-- 1) Columnas NULLABLE -> SET NULL (preserva el historial)
-- ---------------------------------------------------------------
SELECT public._tmp_repair_classroom_fk('attendance',          'classroom_id',         'SET NULL');
SELECT public._tmp_repair_classroom_fk('grades',              'classroom_id',         'SET NULL');
SELECT public._tmp_repair_classroom_fk('report_cards',        'classroom_id',         'SET NULL');
SELECT public._tmp_repair_classroom_fk('competency_scores',   'classroom_id',         'SET NULL');
SELECT public._tmp_repair_classroom_fk('student_promotions',  'from_classroom_id',    'SET NULL');
SELECT public._tmp_repair_classroom_fk('student_promotions',  'to_classroom_id',      'SET NULL');

-- Tablas opcionales (solo si existen en la base instalada)
DO $$
DECLARE
  v_nullables text[] := ARRAY[
    'classrooms_enrollments',
    'classroom_attendance',
    'schedules',
    'classroom_schedule',
    'daily_logs'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_nullables LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = v_table
           AND column_name = 'classroom_id' AND is_nullable = 'YES'
       )
    THEN
      PERFORM public._tmp_repair_classroom_fk(v_table, 'classroom_id', 'SET NULL');
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 2) Columnas NOT NULL -> CASCADE (los hijos mueren con el aula)
-- ---------------------------------------------------------------
DO $$
DECLARE
  v_cascade text[] := ARRAY[
    'classroom_events',
    'classroom_routines',
    'nap_sessions'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_cascade LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = v_table
           AND column_name = 'classroom_id' AND is_nullable = 'NO'
       )
    THEN
      PERFORM public._tmp_repair_classroom_fk(v_table, 'classroom_id', 'CASCADE');
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 3) students.classroom_id debe quedar en NULL al borrar el aula.
--    Ya es ON DELETE SET NULL en el esquema, pero lo garantizamos
--    aqui por si en la base viva quedo como NO ACTION.
-- ---------------------------------------------------------------
SELECT public._tmp_repair_classroom_fk('students', 'classroom_id', 'SET NULL');

-- ---------------------------------------------------------------
-- 4) Limpiar el helper temporal
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public._tmp_repair_classroom_fk(text, text, text);

COMMIT;

-- ===============================================================
-- FIX CORRECTIVO: Política RLS para login_attempts
-- ===============================================================
-- Problema: La política login_attempts_staff solo permite acceso a
-- roles 'directora' y 'admin'. Los inserts desde js/login.js (usuario
-- anónimo/padre sin rol staff) reciben 401 y no registran intentos.
-- Solución: Añadir política INSERT pública para anon y authenticated.
-- ===============================================================
BEGIN;

-- Asegurar que RLS esté habilitado
ALTER TABLE IF EXISTS public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Eliminar política si ya existe (idempotente)
DROP POLICY IF EXISTS login_attempts_self_insert ON public.login_attempts;

-- Permitir INSERT anónimo/autenticado sin restricción (para tasa de login)
CREATE POLICY login_attempts_self_insert ON public.login_attempts
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Lectura: solo staff autorizado (mantener política existente)
-- La política login_attempts_staff cubre SELECT/UPDATE/DELETE para directora/admin.
-- Añadimos una política de lectura propia si no existe.
DROP POLICY IF EXISTS login_attempts_staff_read ON public.login_attempts;
CREATE POLICY login_attempts_staff_read ON public.login_attempts
    FOR SELECT
    TO authenticated
    USING (COALESCE(get_my_role(), '') IN ('directora','admin','asistente'));

COMMIT;

-- ---------------------------------------------------------------
-- Verificacion (ejecutar despues del COMMIT):
--   SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'login_attempts'
--   ORDER BY policyname;
--
-- Debería aparecer al menos:
--   login_attempts_staff        | ALL  | {directora,admin}  | ...
--   login_attempts_self_insert  | INSERT| {anon,authenticated}| <empty> | true
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- Verificacion (ejecutar despues del COMMIT, debe listar las FKs):
--   SELECT conrelid::regclass AS tabla, conname, confdeltype
--   FROM pg_constraint
--   WHERE contype = 'f' AND confrelid = 'public.classrooms'::regclass
--   ORDER BY 1;
--   confdeltype: a = NO ACTION | r = RESTRICT | c = CASCADE | n = SET NULL
-- ---------------------------------------------------------------
