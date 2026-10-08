-- ============================================================
-- 23 ACTIVIDADES ESCOLARES — Planificación Central Staff
-- ============================================================
-- Propósito:
--  ✅ Directora / Asistente / Encargada pueden CREAR, EDITAR, CERRAR actividades.
--  ✅ Maestra   → SOLO LECTURA de actividades asignadas a su aula
--                  + puede marcar "registro individual" de alumnos (adjuntar evidencia)
--  ✅ Padre     → SOLO LECTURA de actividades del aula de su hijo
--                  (NO puede crear, NO puede editar)
--
--  Ciclo de vida: draft → scheduled → published → in_progress → completed → archived
--
--  Tipos: academica | extracurricular | cierre_periodo |
--         evaluacion | reunion_padres | excursion | admin | otra

SET client_min_messages = WARNING;

-- ============================================================
-- TABLA PRINCIPAL: school_activities
-- ============================================================
CREATE TABLE IF NOT EXISTS public.school_activities (
    id                  BIGSERIAL PRIMARY KEY,
    code                TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    activity_type       TEXT NOT NULL DEFAULT 'academica'
        CHECK (activity_type IN (
            'academica','extracurricular','cierre_periodo',
            'evaluacion','reunion_padres','excursion','admin','otra'
        )),
    priority            TEXT NOT NULL DEFAULT 'media'
        CHECK (priority IN ('baja','media','alta','critica')),
    status              TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('draft','scheduled','published','in_progress','completed','archived')),
    classroom_id        BIGINT REFERENCES public.classrooms(id) ON DELETE SET NULL,
    target_audience     TEXT NOT NULL DEFAULT 'aula'
        CHECK (target_audience IN ('aula','nivel','todo_el_centro','estudiante','staff')),
    scheduled_date      DATE NOT NULL,
    scheduled_time      TIME,
    duration_minutes    INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    location            TEXT,
    created_by          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    assigned_to         UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- usu. maestra responsable
    published_at        TIMESTAMPTZ,
    starts_at           TIMESTAMPTZ,
    ends_at             TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    attachments_jsonb   JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata_jsonb      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_activities_class_date
    ON public.school_activities(classroom_id, scheduled_date DESC)
    WHERE classroom_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_status_date
    ON public.school_activities(status, scheduled_date DESC);

CREATE INDEX IF NOT EXISTS idx_activities_created
    ON public.school_activities(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_assigned
    ON public.school_activities(assigned_to)
    WHERE assigned_to IS NOT NULL AND status IN ('scheduled','published','in_progress');

CREATE INDEX IF NOT EXISTS idx_activities_range
    ON public.school_activities(scheduled_date, status)
    WHERE status IN ('published','scheduled','in_progress','completed');

-- ============================================================
--  🔐 RLS (una política por comando para evitar AND accidental)
-- ============================================================
ALTER TABLE public.school_activities ENABLE ROW LEVEL SECURITY;

/* 1. SELECT — roles staff / maestra / padre con filtros granulares */
CREATE POLICY school_activities_select_staff
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    );

-- Maestra → SOLO las actividades de su aula o asignadas a ella
CREATE POLICY school_activities_select_maestra
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'maestra'
            AND (
                 assigned_to = auth.uid()
              OR classroom_id IN (SELECT c.id FROM public.classrooms c WHERE c.teacher_id = auth.uid())
            )
        )
        AND status IN ('published','in_progress','completed')
    );

-- Padre → SOLO las actividades publicadas del aula de su hijo
CREATE POLICY school_activities_select_padre
    ON public.school_activities FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            JOIN public.students s ON s.parent_id = p.id
            WHERE p.id = auth.uid()
              AND p.role = 'padre'
              AND (
                   s.classroom_id = school_activities.classroom_id
                OR school_activities.target_audience IN ('todo_el_centro')
              )
        )
        AND status IN ('published','in_progress','completed')
    );

/* 2. INSERT — solo directora / asistente / encargada / admin */
CREATE POLICY school_activities_insert_staff
    ON public.school_activities FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
        AND created_by = auth.uid()
    );

/* 3. UPDATE — solo creadora / directora / admin pueden editar */
CREATE POLICY school_activities_update_staff
    ON public.school_activities FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
        AND (created_by = auth.uid()
             OR EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'directora'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','asistente','encargada','admin'))
    );

/* 4. DELETE — solo directora / admin */
CREATE POLICY school_activities_delete_staff
    ON public.school_activities FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('directora','admin'))
    );

-- ============================================================
--  TRIGGER 1: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_school_activities_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $act_upd_at$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$act_upd_at$;

DROP TRIGGER IF EXISTS trg_school_activities_updated_at ON public.school_activities;
CREATE TRIGGER trg_school_activities_updated_at
    BEFORE UPDATE ON public.school_activities
    FOR EACH ROW EXECUTE FUNCTION public.fn_school_activities_updated_at();

-- ============================================================
--  TRIGGER 2: Generador de código ACT-YYYY-MM-DD-NNN
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_school_activities_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $act_code$
DECLARE
    v_day   TEXT := to_char(COALESCE(NEW.scheduled_date::TIMESTAMPTZ, now()), 'YYYYMMDD');
    v_seq   BIGINT;
BEGIN
    IF NEW.code IS NOT NULL AND char_length(trim(NEW.code)) > 0 THEN RETURN NEW; END IF;
    SELECT COALESCE(COUNT(*), 0) + 1 INTO STRICT v_seq
        FROM public.school_activities a
        WHERE a.code LIKE 'ACT-' || v_day || '-%';
    NEW.code := 'ACT-' || v_day || '-' || lpad(v_seq::TEXT, 3, '0');
    RETURN NEW;
END;
$act_code$;

DROP TRIGGER IF EXISTS trg_school_activities_code ON public.school_activities;
CREATE TRIGGER trg_school_activities_code
    BEFORE INSERT ON public.school_activities
    FOR EACH ROW EXECUTE FUNCTION public.fn_school_activities_code();

-- ============================================================
--  TRIGGER 3: Al pasar status → published/archived, setear timestamps automáticos
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_school_activities_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $act_lc$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
            NEW.published_at = now();
        END IF;
        IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
            NEW.completed_at = now();
        END IF;
        IF NEW.status IN ('in_progress','published','scheduled') AND NEW.starts_at IS NULL
           AND NEW.scheduled_date IS NOT NULL AND NEW.scheduled_time IS NOT NULL THEN
            NEW.starts_at = NEW.scheduled_date + NEW.scheduled_time;
        END IF;
    END IF;
    RETURN NEW;
END;
$act_lc$;

DROP TRIGGER IF EXISTS trg_school_activities_lifecycle ON public.school_activities;
CREATE TRIGGER trg_school_activities_lifecycle
    BEFORE UPDATE ON public.school_activities
    FOR EACH ROW EXECUTE FUNCTION public.fn_school_activities_lifecycle();

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_activities TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.school_activities_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.school_activities_id_seq TO anon;

RESET client_min_messages;
