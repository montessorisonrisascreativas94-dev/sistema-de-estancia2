const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;

// Cliente de datos: SIEMPRE con anon key (respeta RLS). Nunca service_role.
const anonKey = process.env.SUPABASE_ANON_KEY;
// Cliente admin: SOLO para verificación de JWT y operaciones privilegiadas
// (updateUserById). Solo se crea si la service_role key está presente.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const useSupabase = !!(url && anonKey);
const supabase = useSupabase
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

const adminClient = (useSupabase && serviceKey)
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;

module.exports = { useSupabase, supabase, adminClient };
