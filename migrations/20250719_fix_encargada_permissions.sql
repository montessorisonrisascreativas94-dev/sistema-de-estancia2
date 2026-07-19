-- ============================================================
-- Fix Encargada Permissions
-- ============================================================

-- Fix staff_permits policy to include 'encargada'
DROP POLICY IF EXISTS "staff_permits_all" ON public.staff_permits;
CREATE POLICY "staff_permits_all" ON public.staff_permits FOR ALL
  USING (staff_id = auth.uid() OR COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));

-- Check and fix parent_ratings policies if they exist
DO $$
BEGIN
  -- Check if parent_ratings table exists
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'parent_ratings') THEN
    DROP POLICY IF EXISTS "parent_ratings_all" ON public.parent_ratings;
    CREATE POLICY "parent_ratings_all" ON public.parent_ratings FOR ALL
      USING (parent_id = auth.uid() OR COALESCE(get_my_role(), '') IN ('directora','admin','encargada'));
  END IF;
END $$;
