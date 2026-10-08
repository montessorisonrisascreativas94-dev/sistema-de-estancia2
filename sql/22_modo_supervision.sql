-- ============================================================
-- 21 MODO SUPERVISIÓN DE AULA — ARQUITECTURA DE INTERVENCIÓN
-- ============================================================
-- Auditoría e Identidad (No-repudio). La Directora/Asistente/Encargada
-- conserva su rol y su identidad pero opera en el contexto de un aula.

SET client_min_messages = WARNING;

-- ============================================================
-- TABLA #1: supervision_sessions  (Sesiones de supervisión activa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supervision_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('directora','asistente','encargada','maestra')),
    classroom_id    BIGINT NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    teacher_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    module_origin   TEXT NOT NULL DEFAULT 'centro-escolar',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    context_json    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_supervision_sessions_user
    ON public.supervision_sessions(usuario_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_sessions_classroom
    ON public.supervision_sessions(classroom_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_sessions_active
    ON public.supervision_sessions(usuario_id) WHERE ended_at IS NULL;

COMMENT ON TABLE  public.supervision_sessions IS 'Sesiones activas/pasadas de supervisión de aula. Cada entrada del director/encargado al panel maestra se audita aquí.';
COMMENT ON COLUMN public.supervision_sessions.module_origin IS 'Módulo desde donde se inició: centro-escolar, alerta-sem-aforo, listado-maestros...';
COMMENT ON COLUMN public.supervision_sessions.context_json IS 'Snapshot inicial: submodulo de llegada, tipo de alerta, semaforo, etc.';

-- ============================================================
-- TABLA #2: supervision_audit_log  (Registro de acciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supervision_audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    session_id          UUID REFERENCES public.supervision_sessions(id) ON DELETE SET NULL,
    usuario_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role                TEXT NOT NULL,
    classroom_id        BIGINT NOT NULL,
    teacher_id          UUID,
    modulo_afectado     TEXT NOT NULL,
    accion_realizada    TEXT NOT NULL,
    motivo_administrativo TEXT,
    student_id          BIGINT REFERENCES public.students(id) ON DELETE SET NULL,
    table_name          TEXT,
    record_id           TEXT,
    metadata_jsonb      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervision_audit_lookup
    ON public.supervision_audit_log(usuario_id, classroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_audit_session
    ON public.supervision_audit_log(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_audit_modulo
    ON public.supervision_audit_log(modulo_afectado, created_at DESC);

COMMENT ON TABLE  public.supervision_audit_log IS 'Rastro de auditoría inmutable. Toda intervención o modificación hecha durante una sesión de supervisión queda aquí registrada (por trigger server-side + interceptor JS).';
COMMENT ON COLUMN public.supervision_audit_log.modulo_afectado IS 'asistencia, rutinas, muro, tareas, calificaciones, incidencias, comunicacion...';
COMMENT ON COLUMN public.supervision_audit_log.accion_realizada IS 'update_attendance, create_task, modify_daily_log, reply_family, delete_task…';
COMMENT ON COLUMN public.supervision_audit_log.metadata_jsonb  IS 'Campo flexible: antes/después, payload del cambio, IP, user-agent, etc.';

-- ============================================================
-- TABLA #3: interventions  (Tickets de intervención administrativa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.interventions (
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    created_by      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    classroom_id    BIGINT NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    teacher_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    student_id      BIGINT REFERENCES public.students(id) ON DELETE SET NULL,
    modulo          TEXT NOT NULL,
    submodulo       TEXT,
    situacion       TEXT NOT NULL,
    prioridad       TEXT NOT NULL CHECK (prioridad IN ('baja','media','alta','critica')),
    observacion     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
    assigned_to     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at     TIMESTAMPTZ,
    closed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    closed_at       TIMESTAMPTZ,
    session_id      UUID REFERENCES public.supervision_sessions(id) ON DELETE SET NULL,
    metadata_jsonb  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interventions_status
    ON public.interventions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_classroom
    ON public.interventions(classroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_teacher
    ON public.interventions(teacher_id) WHERE teacher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interventions_student
    ON public.interventions(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interventions_priority
    ON public.interventions(prioridad, status) WHERE status IN ('open','in_progress');

COMMENT ON TABLE  public.interventions IS 'Tickets formales de intervención administrativa. La directora/encargada los levanta durante la supervisión y quedan asignados a la maestra responsable.';
COMMENT ON COLUMN public.interventions.code       IS 'Identificador legible: INT-YYYY-NNNN (ej. INT-2026-0014)';
COMMENT ON COLUMN public.interventions.modulo     IS 'Módulo donde se detectó la incidencia: asistencia, rutinas, muro, tareas, comunicacion, estudiantes.';
COMMENT ON COLUMN public.interventions.submodulo  IS 'Sub-sección: almuerzo, baño, siesta, asistencia-mañana, tarea-matematicas...';
COMMENT ON COLUMN public.interventions.situacion  IS 'Frase corta de situación, ej: "Registro de almuerzo incompleto (4/12)"';
COMMENT ON COLUMN public.interventions.observacion IS 'Texto libre del motivo y la acción requerida';

-- ============================================================
-- 🔐 RLS — POLÍTICAS GRANULARES (EVITAR FOR ALL PARA INSERT)
-- ============================================================
ALTER TABLE public.supervision_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interventions         ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────
-- supervision_sessions
-- ───────────────────────────────────────────
-- SELECT: Mi propia sesión o soy rol staff/director
CREATE POLICY supervision_sessions_select_self_staff
    ON public.supervision_sessions FOR SELECT USING (
      usuario_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada'))
    );

-- INSERT: Solo usuarios autenticados staff o maestra crean SU sesión
CREATE POLICY supervision_sessions_insert_staff
    ON public.supervision_sessions FOR INSERT WITH CHECK (
      auth.uid() IS NOT NULL
      AND usuario_id = auth.uid()
      AND role IN (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    );

-- UPDATE: Solo dueño de sesión marca ended_at
CREATE POLICY supervision_sessions_update_self
    ON public.supervision_sessions FOR UPDATE USING (usuario_id = auth.uid())
    WITH CHECK (usuario_id = auth.uid());

-- ───────────────────────────────────────────
-- supervision_audit_log (append-only)
-- ───────────────────────────────────────────
CREATE POLICY supervision_audit_select_staff
    ON public.supervision_audit_log FOR SELECT USING (
      usuario_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada'))
    );

CREATE POLICY supervision_audit_insert_self
    ON public.supervision_audit_log FOR INSERT WITH CHECK (
      auth.uid() IS NOT NULL
      AND usuario_id = auth.uid()
    );

-- audit log append-only. NO FOR UPDATE DELETE policies (bloqueadas)

-- ───────────────────────────────────────────
-- interventions
-- ───────────────────────────────────────────
CREATE POLICY interventions_select_staff
    ON public.interventions FOR SELECT USING (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR teacher_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada'))
    );

CREATE POLICY interventions_insert_staff
    ON public.interventions FOR INSERT WITH CHECK (
      auth.uid() IS NOT NULL
      AND created_by = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada','maestra'))
    );

CREATE POLICY interventions_update_assigned
    ON public.interventions FOR UPDATE USING (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'directora')
    )
    WITH CHECK (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'directora')
    );

-- ============================================================
-- ⚙️ TRIGGER SERVER-SIDE — AUDITORÍA AUTOMÁTICA SI FLAG ACTIVO
-- ============================================================
-- Se activa cuando el cliente envía current_setting('app.supervision_active') = 'true'.
-- Captura INSERT/UPDATE/DELETE en attendance, daily_logs, tasks, task_evidences
-- y escribe fila en supervision_audit_log automáticamente.

CREATE OR REPLACE FUNCTION public.fn_supervision_auto_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $auto_audit_body$
DECLARE
    v_user_id       UUID := auth.uid();
    v_role          TEXT;
    v_classroom_id  BIGINT;
    v_teacher_id    UUID;
    v_student_id    BIGINT;
    v_session_id    UUID;
    v_table         TEXT := TG_TABLE_NAME;
    v_action        TEXT;
    v_old_json      JSONB := NULL;
    v_new_json      JSONB := NULL;
    v_record_id     TEXT;
BEGIN
    IF v_user_id IS NULL THEN RETURN NULL; END IF;
    IF current_setting('app.supervision_active', true) IS DISTINCT FROM 'true' THEN
        RETURN NULL;
    END IF;

    SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_user_id LIMIT 1;
    IF v_role IS NULL OR v_role NOT IN ('directora','asistente','encargada') THEN
        RETURN NULL;
    END IF;

    v_session_id := NULLIF(current_setting('app.supervision_session_id', true), '')::UUID;
    v_teacher_id := NULLIF(current_setting('app.supervision_teacher_id', true), '')::UUID;
    BEGIN
        v_classroom_id := current_setting('app.supervision_classroom_id', true)::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        v_classroom_id := NULL;
    END;
    IF v_classroom_id IS NULL THEN RETURN NULL; END IF;

    CASE TG_OP
      WHEN 'INSERT' THEN v_action := 'INSERT ' || v_table; v_new_json := to_jsonb(NEW);
      WHEN 'UPDATE' THEN v_action := 'UPDATE ' || v_table; v_old_json := to_jsonb(OLD); v_new_json := to_jsonb(NEW);
      WHEN 'DELETE' THEN v_action := 'DELETE ' || v_table; v_old_json := to_jsonb(OLD);
      ELSE v_action := TG_OP || ' ' || v_table;
    END CASE;

    IF    v_table = 'attendance'     THEN v_student_id := COALESCE(NEW.student_id, OLD.student_id);
    ELSIF v_table = 'daily_logs'     THEN v_student_id := COALESCE(NEW.student_id, OLD.student_id);
    ELSIF v_table = 'task_evidences' THEN v_student_id := COALESCE(NEW.student_id, OLD.student_id);
    END IF;

    v_record_id := CASE v_table
      WHEN 'attendance'     THEN COALESCE(NEW.id::TEXT, OLD.id::TEXT)
      WHEN 'daily_logs'     THEN COALESCE(NEW.id::TEXT, OLD.id::TEXT)
      WHEN 'tasks'          THEN COALESCE(NEW.id::TEXT, OLD.id::TEXT)
      WHEN 'task_evidences' THEN COALESCE(NEW.id::TEXT, OLD.id::TEXT)
      ELSE NULL
    END;

    INSERT INTO public.supervision_audit_log (
        session_id, usuario_id, role, classroom_id, teacher_id,
        modulo_afectado, accion_realizada, student_id, table_name, record_id, metadata_jsonb
    ) VALUES (
        v_session_id, v_user_id, v_role, v_classroom_id, v_teacher_id,
        CASE v_table
            WHEN 'attendance'     THEN 'asistencia'
            WHEN 'daily_logs'     THEN 'rutinas'
            WHEN 'tasks'          THEN 'tareas'
            WHEN 'task_evidences' THEN 'calificaciones'
            ELSE v_table
        END,
        v_action,
        v_student_id,
        v_table,
        v_record_id,
        jsonb_build_object(
            'before', v_old_json,
            'after',  v_new_json,
            'trigger_op', TG_OP,
            'recorded_by', 'server_trigger'
        )
    );

    RETURN NULL;
END;
$auto_audit_body$;

DROP TRIGGER IF EXISTS trg_supervision_auto_audit_attendance ON public.attendance;
CREATE TRIGGER trg_supervision_auto_audit_attendance
AFTER INSERT OR UPDATE OR DELETE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();

DROP TRIGGER IF EXISTS trg_supervision_auto_audit_dailylogs ON public.daily_logs;
CREATE TRIGGER trg_supervision_auto_audit_dailylogs
AFTER INSERT OR UPDATE OR DELETE ON public.daily_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();

DROP TRIGGER IF EXISTS trg_supervision_auto_audit_tasks ON public.tasks;
CREATE TRIGGER trg_supervision_auto_audit_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();

DROP TRIGGER IF EXISTS trg_supervision_auto_audit_tasksevidences ON public.task_evidences;
CREATE TRIGGER trg_supervision_auto_audit_tasksevidences
AFTER INSERT OR UPDATE OR DELETE ON public.task_evidences
FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();

-- ============================================================
-- 🔁 TRIGGER: updated_at en interventions
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_interventions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $interv_upd$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$interv_upd$;

DROP TRIGGER IF EXISTS trg_interventions_updated_at ON public.interventions;
CREATE TRIGGER trg_interventions_updated_at
BEFORE UPDATE ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.fn_interventions_updated_at();

-- ============================================================
-- ⭐ GENERADOR CÓDIGO INTERVENCIÓN: INT-YYYY-NNNN
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_interventions_code_gen()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $int_code$
DECLARE
  v_year  TEXT := to_char(now(), 'YYYY');
  v_n     BIGINT;
BEGIN
  IF NEW.code IS NOT NULL AND char_length(NEW.code) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(COUNT(*), 0) + 1 INTO STRICT v_n
    FROM public.interventions i
    WHERE i.code LIKE 'INT-' || v_year || '-%';
  NEW.code := 'INT-' || v_year || '-' || lpad(v_n::TEXT, 4, '0');
  RETURN NEW;
END;
$int_code$;

DROP TRIGGER IF EXISTS trg_interventions_code_gen ON public.interventions;
CREATE TRIGGER trg_interventions_code_gen
BEFORE INSERT ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.fn_interventions_code_gen();

-- ============================================================
-- 📞 RPC: close_intervention(id, motivo_cierre)
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_intervention(p_id BIGINT, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rpc_ci$
DECLARE
  v_uid     UUID := auth.uid();
  v_role    TEXT;
  v_owner   UUID;
  v_assig   UUID;
  v_status  TEXT;
  v_result  JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  IF v_role NOT IN ('directora','asistente','encargada','maestra') THEN
    RAISE EXCEPTION 'Rol no autorizado';
  END IF;

  SELECT created_by, assigned_to, status
    INTO STRICT v_owner, v_assig, v_status
    FROM public.interventions i WHERE i.id = p_id;

  IF v_role <> 'directora' AND v_uid <> v_owner AND v_uid <> v_assig THEN
    RAISE EXCEPTION 'No autorizado a cerrar esta intervención';
  END IF;

  IF v_status = 'closed' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'message', 'Ya estaba cerrada');
  END IF;

  UPDATE public.interventions i
     SET status      = 'closed',
         closed_by   = v_uid,
         closed_at   = now(),
         resolved_by = COALESCE(NULLIF(resolved_by, v_uid), v_uid),
         resolved_at = COALESCE(resolved_at, now()),
         metadata_jsonb = jsonb_set(
           COALESCE(i.metadata_jsonb, '{}'),
           '{close_motivo}',
           to_jsonb(COALESCE(p_motivo, 'Cierre administrativo'))
         )
   WHERE i.id = p_id
  RETURNING jsonb_build_object(
    'ok', true,
    'id', p_id,
    'code', i.code,
    'status', i.status,
    'closed_at', i.closed_at,
    'closed_by', i.closed_by
  ) INTO v_result;

  RETURN v_result;
END;
$rpc_ci$;

GRANT EXECUTE ON FUNCTION public.close_intervention(BIGINT, TEXT) TO authenticated, anon;

RESET client_min_messages;
