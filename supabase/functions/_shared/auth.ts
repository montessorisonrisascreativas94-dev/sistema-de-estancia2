/**
 * _shared/auth.ts — Verificación de identidad y roles en Edge Functions.
 *
 *  - getUser(req): valida el JWT del usuario (Authorization: Bearer ...).
 *  - getRole(req): devuelve el rol desde profiles.
 *  - requireRole(req, roles): retorna { allowed, status, user, role }.
 *  - isServiceRole(req): true si se invoca con SUPABASE_SERVICE_ROLE_KEY
 *    (cron/triggers de la DB). NO permite operaciones expuestas al público.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STAFF = ['directora', 'asistente', 'admin', 'encargada', 'maestra'];

export function bearerToken(req: Request): string {
  const auth = req.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

export function isServiceRole(req: Request): boolean {
  const token = bearerToken(req);
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return !!svc && token === svc;
}

export async function getUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return null;
  try {
    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data || !data.user) return null;
    return { id: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

export async function getRole(req: Request): Promise<string> {
  const token = bearerToken(req);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!token || !url || !anon) return '';
  try {
    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data } = await supabase.from('profiles').select('role').eq('id', (await getUser(req))?.id).maybeSingle();
    return (data?.role as string) || '';
  } catch {
    return '';
  }
}

export interface RoleCheck {
  allowed: boolean;
  status: number;
  error?: string;
  user: { id: string; email?: string } | null;
  role: string;
}

export async function requireRole(req: Request, roles: string[]): Promise<RoleCheck> {
  if (isServiceRole(req)) {
    // El service role es aceptado solo para roles explícitos (cron interno).
    return { allowed: roles.includes('*') || roles.includes('service_role'), status: 403, error: 'Forbidden', user: null, role: 'service_role' };
  }
  const user = await getUser(req);
  if (!user) return { allowed: false, status: 401, error: 'No autorizado', user: null, role: '' };
  const role = await getRole(req);
  const allowed = roles.includes('*') || roles.includes(role);
  return { allowed, status: allowed ? 200 : 403, error: allowed ? undefined : 'Sin permisos', user, role };
}

export async function requireStaff(req: Request): Promise<RoleCheck> {
  return requireRole(req, STAFF);
}
