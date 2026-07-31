import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, checkCors, json } from "../_shared/cors.ts";
import { bearerToken, getUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const optionsResp = handleOptions(req);
  if (optionsResp) return optionsResp;
  const { origin, denied } = checkCors(req);
  if (denied) return json({ error: 'Forbidden' }, 403, origin);

  try {
    const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')              ?? '';
    const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: 'Missing env vars' }, 500, origin);
    }

    // Verify caller is admin
    const caller = await getUser(req);
    if (!caller) return json({ error: 'No autenticado' }, 401, origin);

    // Check admin role
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();

    if (!['admin', 'directora'].includes(profile?.role)) {
      return json({ error: 'Acceso denegado. Solo administradores.' }, 403, origin);
    }

    const { user_id, new_password } = await req.json();
    if (!user_id || !new_password) {
      return json({ error: 'Faltan parámetros: user_id, new_password' }, 400, origin);
    }
    if (new_password.length < 8) {
      return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400, origin);
    }

    // Update password using service role (admin API)
    const { error } = await adminClient.auth.admin.updateUserById(user_id, {
      password: new_password
    });

    if (error) return json({ error: 'Error al actualizar la contraseña' }, 400, origin);

    return json({ ok: true, message: 'Contraseña actualizada correctamente' }, 200, origin);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: 'Unexpected error' }, 500, origin);
  }
});
