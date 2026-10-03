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

