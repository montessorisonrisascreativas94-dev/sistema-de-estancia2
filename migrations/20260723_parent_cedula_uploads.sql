-- Migration: Add parent cédula upload columns to student_preregistrations
-- Date: 2026-07-23

-- Add parent cédula URL columns (idempotent)
ALTER TABLE student_preregistrations ADD COLUMN IF NOT EXISTS p1_cedula_front_url text;
ALTER TABLE student_preregistrations ADD COLUMN IF NOT EXISTS p1_cedula_back_url text;
ALTER TABLE student_preregistrations ADD COLUMN IF NOT EXISTS p2_cedula_front_url text;
ALTER TABLE student_preregistrations ADD COLUMN IF NOT EXISTS p2_cedula_back_url text;

-- Create muro_escolar / posts table improvements if not exists
-- posts table should already exist (id, classroom_id, teacher_id, content, media_url, media_type, created_at)
-- Ensure indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_classroom_id ON posts (classroom_id);
CREATE INDEX IF NOT EXISTS idx_student_preregistrations_status ON student_preregistrations (status);
CREATE INDEX IF NOT EXISTS idx_student_preregistrations_created_at ON student_preregistrations (created_at DESC);
