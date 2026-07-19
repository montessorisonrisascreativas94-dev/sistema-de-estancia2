// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Falta cabecera de Authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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
      return new Response(JSON.stringify({ error: 'No autorizado', details: userError?.message }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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
      return new Response(JSON.stringify({ error: 'Solo la directora puede ejecutar migraciones' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[run-migration] Iniciando migración para usuario:', user.id);

    // ✅ Ejecutar migraciones de columnas faltantes
    const migrations = [
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

    const results: any[] = [];

    for (const migration of migrations) {
      try {
        console.log(`[run-migration] Ejecutando migración: ${migration.name}`);

        // Usar la RPC segura o ejecutar directamente via SQL
        const { error } = await admin.rpc('run_ddl_migration', { 
          ddl: migration.sql 
        }).catch(() => {
          // Si la RPC no existe, reportar pero continuar
          console.warn(`RPC run_ddl_migration no disponible, usando fallback`);
          return { error: { message: 'RPC no disponible' } };
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

    return new Response(JSON.stringify({
      success: overallSuccess,
      message: overallSuccess ? 'Migraciones procesadas' : 'Algunas migraciones fallaron',
      results,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('[run-migration] Error global:', e);
    return new Response(JSON.stringify({ 
      error: 'Error en migración',
      details: String(e)
    }), {
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

