// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleOptions, checkCors } from '../_shared/cors.ts';

const json = (data: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const optionsResp = handleOptions(req);
  if (optionsResp) return optionsResp;
  const { origin, denied } = checkCors(req);
  if (denied) return json({ error: 'Forbidden' }, 403, origin);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Falta cabecera de Authorization' }, 401, origin);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Cliente para verificar al usuario que llama mediante el SDK de Supabase
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[run-migration] Error de autenticación:', userError);
      return json({ error: 'No autorizado' }, 401, origin);
    }

    // Cliente admin para ejecutar DDL
    const admin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    // Verificar que sea directora
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileErr || profile?.role !== 'directora') {
      return json({ error: 'Solo la directora puede ejecutar migraciones' }, 403, origin);
    }

    console.log('[run-migration] Iniciando migración para usuario:', user.id);

    // ✅ Ejecutar migraciones de columnas faltantes
    const migrations = [
      {
        // Sin esta política el formulario público de preinscripción devuelve
        // 401 / 42501 ("new row violates row-level security policy") y NO se
        // guarda ninguna solicitud. Es idempotente.
        name: 'prereg_public_insert_rls',
        sql: `ALTER TABLE public.student_preregistrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prereg_public_insert" ON public.student_preregistrations;
CREATE POLICY "prereg_public_insert" ON public.student_preregistrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);`
      },
      {
        // Las columnas de control de edad / autorización de Dirección.
        name: 'prereg_age_control_columns',
        sql: `ALTER TABLE public.student_preregistrations
  ADD COLUMN IF NOT EXISTS suggested_level text,
  ADD COLUMN IF NOT EXISTS age_match boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS director_authorization_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS director_authorization_note text,
  ADD COLUMN IF NOT EXISTS director_authorization_approved boolean DEFAULT null;`
      },
      {
        name: 'classroom_id',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS classroom_id bigint REFERENCES public.classrooms(id) ON DELETE SET NULL;'
      },
      {
        name: 'age',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS age integer;'
      },
      {
        name: 'schedule',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS schedule text;'
      },
      {
        name: 'deleted_at',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;'
      },
      {
        name: 'p1_job',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS p1_job text;'
      },
      {
        name: 'p1_address',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS p1_address text;'
      },
      {
        name: 'p1_emergency_contact',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS p1_emergency_contact text;'
      },
      {
        name: 'p2_job',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS p2_job text;'
      },
      {
        name: 'p2_address',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS p2_address text;'
      },
      {
        name: 'blood_type',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS blood_type text;'
      },
      {
        name: 'authorized_pickup',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS authorized_pickup text;'
      },
      {
        name: 'monthly_fee',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS monthly_fee numeric DEFAULT 0;'
      },
      {
        name: 'due_day',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS due_day integer DEFAULT 5;'
      },
      {
        name: 'matricula',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS matricula text;'
      },
      {
        name: 'start_date',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS start_date date;'
      },
      {
        name: 'avatar_url',
        sql: 'ALTER TABLE public.students ADD COLUMN IF NOT EXISTS avatar_url text;'
      },
      {
        name: 'recreate_assign_students_bulk',
        sql: `DROP FUNCTION IF EXISTS public.assign_students_bulk(bigint[], bigint);
create or replace function public.assign_students_bulk(p_student_ids bigint[], p_classroom_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() not in ('directora', 'asistente', 'maestra') then
    raise exception 'No autorizado';
  end if;

  execute 'UPDATE public.students SET classroom_id = \$1 WHERE id = ANY(\$2)'
    using p_classroom_id, p_student_ids;
end;
$$;
grant execute on function public.assign_students_bulk(bigint[], bigint) to authenticated;`
      },
      {
        name: 'invoices_table',
        sql: `CREATE TABLE IF NOT EXISTS public.invoices (
          id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          invoice_number   text UNIQUE NOT NULL,
          payment_id       bigint REFERENCES public.payments(id) ON DELETE SET NULL,
          student_id       bigint REFERENCES public.students(id) ON DELETE CASCADE,
          student_name     text,
          student_matricula text,
          classroom_name   text,
          parent_name      text,
          parent_phone     text,
          concept          text,
          amount           numeric(10,2) NOT NULL,
          subtotal         numeric(10,2) DEFAULT 0,
          tax_amount       numeric(10,2) DEFAULT 0,
          total            numeric(10,2) NOT NULL,
          status           text DEFAULT 'issued',
          payment_method   text,
          payment_date     timestamp with time zone,
          issued_date      timestamp with time zone DEFAULT now(),
          created_at       timestamp with time zone DEFAULT now() NOT NULL,
          updated_at       timestamp with time zone DEFAULT now()
        );`
      },
      {
        name: 'invoices_extra_columns',
        sql: `ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS receipt_number TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS attended_by TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ascii_receipt TEXT;`
      },
      {
        name: 'invoice_items_table',
        sql: `CREATE TABLE IF NOT EXISTS public.invoice_items (
          id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          invoice_id BIGINT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
          concept TEXT NOT NULL,
          quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
          unit_price NUMERIC(10, 2) NOT NULL,
          total NUMERIC(10, 2) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );`
      },
      {
        name: 'invoices_rls',
        sql: `ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_staff_all ON public.invoices;
CREATE POLICY invoices_staff_all ON public.invoices FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));`
      },
      {
        name: 'invoice_items_rls',
        sql: `ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_items_staff_all ON public.invoice_items;
CREATE POLICY invoice_items_staff_all ON public.invoice_items FOR ALL
  USING (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'))
  WITH CHECK (COALESCE(get_my_role(), '') IN ('directora','asistente','admin'));`
      },
      // ============================================================
      // MIGRACIÓN #21: MODO SUPERVISIÓN DE AULA (SUPERVISE.MD)
      // Sesiones + auditoría inmutable + tickets de intervención
      // Aplicación: panel_directora.html → Configuración → Mantenimiento
      // ============================================================
      {
        name: 'supervision_tables_rpc',
        sql: `SET client_min_messages = WARNING;

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
CREATE INDEX IF NOT EXISTS idx_supervision_sessions_user ON public.supervision_sessions(usuario_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_sessions_classroom ON public.supervision_sessions(classroom_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_sessions_active ON public.supervision_sessions(usuario_id) WHERE ended_at IS NULL;
COMMENT ON TABLE public.supervision_sessions IS 'Sesiones activas/pasadas de supervisión de aula. Cada entrada del director al panel maestra se audita aquí.';

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
CREATE INDEX IF NOT EXISTS idx_supervision_audit_lookup ON public.supervision_audit_log(usuario_id, classroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_audit_session ON public.supervision_audit_log(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_audit_modulo ON public.supervision_audit_log(modulo_afectado, created_at DESC) WHERE created_at > now() - INTERVAL '30 days';
COMMENT ON TABLE public.supervision_audit_log IS 'Rastro de auditoría inmutable. Toda intervención o modificación hecha durante una sesión de supervisión queda aquí registrada.';

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
CREATE INDEX IF NOT EXISTS idx_interventions_status ON public.interventions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_classroom ON public.interventions(classroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_teacher ON public.interventions(teacher_id) WHERE teacher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interventions_student ON public.interventions(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interventions_priority ON public.interventions(prioridad, status) WHERE status IN ('open','in_progress');
COMMENT ON TABLE public.interventions IS 'Tickets formales de intervención administrativa. La directora los levanta durante la supervisión y quedan asignados a la maestra responsable.';

ALTER TABLE public.supervision_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interventions         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supervision_sessions_select_self_staff ON public.supervision_sessions;
CREATE POLICY supervision_sessions_select_self_staff ON public.supervision_sessions FOR SELECT USING (
  usuario_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada'))
);
DROP POLICY IF EXISTS supervision_sessions_insert_staff ON public.supervision_sessions;
CREATE POLICY supervision_sessions_insert_staff ON public.supervision_sessions FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND usuario_id = auth.uid()
  AND role IN (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
);
DROP POLICY IF EXISTS supervision_sessions_update_self ON public.supervision_sessions;
CREATE POLICY supervision_sessions_update_self ON public.supervision_sessions FOR UPDATE USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS supervision_audit_select_staff ON public.supervision_audit_log;
CREATE POLICY supervision_audit_select_staff ON public.supervision_audit_log FOR SELECT USING (
  usuario_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada'))
);
DROP POLICY IF EXISTS supervision_audit_insert_self ON public.supervision_audit_log;
CREATE POLICY supervision_audit_insert_self ON public.supervision_audit_log FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND usuario_id = auth.uid()
);

DROP POLICY IF EXISTS interventions_select_staff ON public.interventions;
CREATE POLICY interventions_select_staff ON public.interventions FOR SELECT USING (
  created_by = auth.uid() OR assigned_to = auth.uid() OR teacher_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada'))
);
DROP POLICY IF EXISTS interventions_insert_staff ON public.interventions;
CREATE POLICY interventions_insert_staff ON public.interventions FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('directora','asistente','encargada','maestra'))
);
DROP POLICY IF EXISTS interventions_update_assigned ON public.interventions;
CREATE POLICY interventions_update_assigned ON public.interventions FOR UPDATE USING (
  created_by = auth.uid() OR assigned_to = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'directora')
) WITH CHECK (
  created_by = auth.uid() OR assigned_to = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'directora')
);

CREATE OR REPLACE FUNCTION public.fn_supervision_auto_audit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $auto_audit_body$
DECLARE
    v_user_id       UUID := auth.uid();
    v_role          TEXT;
    v_classroom_id  BIGINT;
    v_teacher_id    UUID;
    v_teacher_id_placeholder UUID;
    v_student_id    BIGINT;
    v_session_id    UUID;
    v_table         TEXT := TG_TABLE_NAME;
    v_action        TEXT;
    v_old_json      JSONB := NULL;
    v_new_json      JSONB := NULL;
    v_record_id     TEXT;
BEGIN
    IF v_user_id IS NULL THEN RETURN NULL; END IF;
    IF current_setting('app.supervision_active', true) IS DISTINCT FROM 'true' THEN RETURN NULL; END IF;
    SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_user_id LIMIT 1;
    IF v_role IS NULL OR v_role NOT IN ('directora','asistente','encargada') THEN RETURN NULL; END IF;
    v_session_id   := NULLIF(current_setting('app.supervision_session_id', true), '')::UUID;
    v_teacher_id   := NULLIF(current_setting('app.supervision_teacher_id', true), '')::UUID;
    BEGIN v_classroom_id := current_setting('app.supervision_classroom_id', true)::BIGINT; EXCEPTION WHEN OTHERS THEN v_classroom_id := NULL; END;
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
      ELSE NULL END;
    INSERT INTO public.supervision_audit_log (session_id, usuario_id, role, classroom_id, teacher_id, modulo_afectado, accion_realizada, student_id, table_name, record_id, metadata_jsonb)
    VALUES (v_session_id, v_user_id, v_role, v_classroom_id, v_teacher_id,
      CASE v_table
        WHEN 'attendance'     THEN 'asistencia'
        WHEN 'daily_logs'     THEN 'rutinas'
        WHEN 'tasks'          THEN 'tareas'
        WHEN 'task_evidences' THEN 'calificaciones'
        ELSE v_table END,
      v_action, v_student_id, v_table, v_record_id,
      jsonb_build_object('before',v_old_json,'after',v_new_json,'trigger_op',TG_OP,'recorded_by','server_trigger'));
    RETURN NULL;
END;
$auto_audit_body$;

DROP TRIGGER IF EXISTS trg_supervision_auto_audit_attendance ON public.attendance;
CREATE TRIGGER trg_supervision_auto_audit_attendance AFTER INSERT OR UPDATE OR DELETE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();
DROP TRIGGER IF EXISTS trg_supervision_auto_audit_dailylogs ON public.daily_logs;
CREATE TRIGGER trg_supervision_auto_audit_dailylogs AFTER INSERT OR UPDATE OR DELETE ON public.daily_logs FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();
DROP TRIGGER IF EXISTS trg_supervision_auto_audit_tasks ON public.tasks;
CREATE TRIGGER trg_supervision_auto_audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();
DROP TRIGGER IF EXISTS trg_supervision_auto_audit_tasksevidences ON public.task_evidences;
CREATE TRIGGER trg_supervision_auto_audit_tasksevidences AFTER INSERT OR UPDATE OR DELETE ON public.task_evidences FOR EACH ROW EXECUTE FUNCTION public.fn_supervision_auto_audit();

CREATE OR REPLACE FUNCTION public.fn_interventions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $interv_upd$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $interv_upd$;
DROP TRIGGER IF EXISTS trg_interventions_updated_at ON public.interventions;
CREATE TRIGGER trg_interventions_updated_at BEFORE UPDATE ON public.interventions FOR EACH ROW EXECUTE FUNCTION public.fn_interventions_updated_at();

CREATE OR REPLACE FUNCTION public.fn_interventions_code_gen()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $int_code$
DECLARE v_year TEXT := to_char(now(), 'YYYY'); v_n BIGINT;
BEGIN
  IF NEW.code IS NOT NULL AND char_length(NEW.code) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(COUNT(*), 0) + 1 INTO STRICT v_n FROM public.interventions i WHERE i.code LIKE 'INT-' || v_year || '-%';
  NEW.code := 'INT-' || v_year || '-' || lpad(v_n::TEXT, 4, '0');
  RETURN NEW;
END; $int_code$;
DROP TRIGGER IF EXISTS trg_interventions_code_gen ON public.interventions;
CREATE TRIGGER trg_interventions_code_gen BEFORE INSERT ON public.interventions FOR EACH ROW EXECUTE FUNCTION public.fn_interventions_code_gen();

CREATE OR REPLACE FUNCTION public.close_intervention(p_id BIGINT, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $rpc_ci$
DECLARE v_uid UUID := auth.uid(); v_role TEXT; v_owner UUID; v_assig UUID; v_status TEXT; v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  IF v_role NOT IN ('directora','asistente','encargada','maestra') THEN RAISE EXCEPTION 'Rol no autorizado'; END IF;
  SELECT created_by, assigned_to, status INTO STRICT v_owner, v_assig, v_status FROM public.interventions i WHERE i.id = p_id;
  IF v_role <> 'directora' AND v_uid <> v_owner AND v_uid <> v_assig THEN RAISE EXCEPTION 'No autorizado a cerrar esta intervención'; END IF;
  IF v_status = 'closed' THEN RETURN jsonb_build_object('ok', true, 'skipped', true, 'message', 'Ya estaba cerrada'); END IF;
  UPDATE public.interventions i
     SET status = 'closed', closed_by = v_uid, closed_at = now(),
         resolved_by = COALESCE(NULLIF(resolved_by, v_uid), v_uid),
         resolved_at = COALESCE(resolved_at, now()),
         metadata_jsonb = jsonb_set(COALESCE(i.metadata_jsonb, '{}'), '{close_motivo}', to_jsonb(COALESCE(p_motivo, 'Cierre administrativo')))
   WHERE i.id = p_id
  RETURNING jsonb_build_object('ok',true,'id',p_id,'code',i.code,'status',i.status,'closed_at',i.closed_at,'closed_by',i.closed_by) INTO v_result;
  RETURN v_result;
END;
$rpc_ci$;
GRANT EXECUTE ON FUNCTION public.close_intervention(BIGINT, TEXT) TO authenticated, anon;

RESET client_min_messages;`
      }
    ];

    // ── Sonda previa: ¿existe la RPC y me deja usarla? ──────────
    // Antes esta función iteraba las migraciones y, si la RPC faltaba,
    // registraba un "usando fallback" que NO existía: las 18 migraciones
    // fallaban y la función devolvía 200 como si nada. Se comprueba antes
    // de tocar nada y se devuelve un mensaje accionable.
    // El COMMENT es idempotente: no cambia nada y aun así falla si la
    // función no existe o si el rol no es directora/admin.
    const { error: probeError } = await admin.rpc('run_ddl_migration', {
      ddl: "COMMENT ON FUNCTION public.run_ddl_migration(text) IS 'Ejecuta una sentencia DDL. Solo directora/admin. No permite tocar datos. Usada por la Edge Function run-migration.';"
    });

    if (probeError) {
      const missing = /PGRST202|does not exist|schema cache/i.test(probeError.message || '');
      console.error('[run-migration] Sonda RPC falló:', probeError.message);

      if (missing) {
        return json({
          success: false,
          needs_bootstrap: true,
          error: 'Falta crear la RPC public.run_ddl_migration(text) en la base de datos.',
          hint: 'Ejecuta sql/18_run_ddl_migration_rpc.sql una sola vez en el SQL Editor de Supabase. ' +
                'Es el unico paso que no se puede hacer desde el panel, porque hace falta DDL para poder ejecutar DDL.',
          detail: probeError.message
        }, 501, origin);
      }

      return json({
        success: false,
        error: 'La RPC public.run_ddl_migration respondio con error.',
        hint: 'Revisa que la RPC exista y que tu rol en profiles sea "directora" o "admin".',
        detail: probeError.message
      }, 500, origin);
    }

    const results: any[] = [];

    for (const migration of migrations) {
      try {
        console.log(`[run-migration] Ejecutando migración: ${migration.name}`);

        const { error } = await admin.rpc('run_ddl_migration', {
          ddl: migration.sql
        });

        if (error) {
          console.error(`Error en ${migration.name}:`, error);
          results.push({ column: migration.name, status: 'error', message: error.message });
        } else {
          console.log(`✅ ${migration.name} completado`);
          results.push({ column: migration.name, status: 'success' });
        }
      } catch (e) {
        console.error(`Excepción en ${migration.name}:`, e);
        results.push({ column: migration.name, status: 'error', message: String(e) });
      }
    }

    console.log('[run-migration] Migraciones completadas:', results);
    const overallSuccess = results.every(result => result.status === 'success');

    return json({
      success: overallSuccess,
      message: overallSuccess ? 'Migraciones procesadas' : 'Algunas migraciones fallaron',
      results,
      timestamp: new Date().toISOString()
    }, 200, origin);

  } catch (e) {
    console.error('[run-migration] Error global:', e);
    return json({
      error: 'Error en migración'
    }, 500, origin);
  }
});

