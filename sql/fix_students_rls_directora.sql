-- ============================================================
-- FIX: Students RLS — Panel Directora showing 0 students
-- Run this in: Supabase Dashboard → SQL Editor
--
-- Root cause: get_my_role() may return NULL if the profile
-- query fails, causing RLS to block all rows silently.
-- Solution: ensure the function is SECURITY DEFINER (reads
-- profiles table without triggering circular RLS check),
-- and recreate the students policies cleanly.
-- ============================================================

-- 1. Recreate get_my_role as SECURITY DEFINER to avoid circular RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;

-- 2. Students RLS — drop all and recreate cleanly
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_staff_all"       ON public.students;
DROP POLICY IF EXISTS "students_padre_select"    ON public.students;
DROP POLICY IF EXISTS "students_select"          ON public.students;
DROP POLICY IF EXISTS "students_insert"          ON public.students;
DROP POLICY IF EXISTS "students_update"          ON public.students;
DROP POLICY IF EXISTS "students_delete"          ON public.students;
DROP POLICY IF EXISTS "students_read_all"        ON public.students;
DROP POLICY IF EXISTS "students_staff_read"      ON public.students;
DROP POLICY IF EXISTS "students_directora_all"   ON public.students;
DROP POLICY IF EXISTS "students_public_select"   ON public.students;

-- Staff (directora, asistente, maestra, encargada, admin) can do everything
CREATE POLICY "students_staff_all" ON public.students
  FOR ALL
  USING      (COALESCE(public.get_my_role(), '') IN ('directora','asistente','maestra','encargada','admin'))
  WITH CHECK (COALESCE(public.get_my_role(), '') IN ('directora','asistente','maestra','encargada','admin'));

-- Parents can only see their own children
CREATE POLICY "students_padre_select" ON public.students
  FOR SELECT
  USING (
    COALESCE(public.get_my_role(), '') = 'padre'
    AND parent_id = auth.uid()
  );

-- Service role bypass (for edge functions and admin tasks)
-- This is automatically handled by Supabase service_role key

SELECT 'students RLS fixed!' AS resultado;

-- 3. Verify: count students as current user
SELECT
  (SELECT count(*) FROM public.students) AS total_students,
  public.get_my_role() AS my_role;
