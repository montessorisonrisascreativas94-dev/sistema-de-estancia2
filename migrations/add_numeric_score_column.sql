-- Add numeric_score column to task_evidences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'task_evidences' 
      AND column_name = 'numeric_score'
  ) THEN
    ALTER TABLE public.task_evidences ADD COLUMN numeric_score numeric(5,2) CHECK (numeric_score >= 0 AND numeric_score <= 100);
  END IF;
END $$;

-- Add numeric_score column to grades
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'grades' 
      AND column_name = 'numeric_score'
  ) THEN
    ALTER TABLE public.grades ADD COLUMN numeric_score numeric(5,2) CHECK (numeric_score >= 0 AND numeric_score <= 100);
  END IF;
END $$;

-- Update grading_system default in tasks to numeric
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'tasks' 
      AND column_name = 'grading_system'
  ) THEN
    ALTER TABLE public.tasks ALTER COLUMN grading_system SET DEFAULT 'numeric';
  END IF;
END $$;
