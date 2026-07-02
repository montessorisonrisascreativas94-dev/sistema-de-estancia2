-- Migration: Add RNC column to school_settings
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS rnc text;

-- Ensure we have the default row
INSERT INTO public.school_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
