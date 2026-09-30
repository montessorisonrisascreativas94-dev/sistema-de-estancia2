/**
 * _shared/cors.ts — CORS estricto para Edge Functions.
 * Reemplaza el '*':
 *  - Solo permite orígenes en ALLOWED_ORIGINS (env).
 *  - Responde 403 en OPTIONS si el origen no está permitido.
 *  - Incluye Vary: Origin y Max-Age.
 */

const DEFAULT_ALLOWED = [
  'https://montessorisonrisascreativas.com',
  'https://www.montessorisonrisascreativas.com',
  'http://localhost:5800',
  'http://127.0.0.1:5800',
];

const ALLOWED_ORIGINS: string[] = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  .concat(DEFAULT_ALLOWED.map(o => o.toLowerCase()));

export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin');
  if (!origin) return '';
  const o = origin.toLowerCase();
  return ALLOWED_ORIGINS.includes(o) ? origin : '';
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-application-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

/** Devuelve un Response 403 si el origen no es permitido, o el header a usar. */
export function checkCors(req: Request): { origin: string; denied: boolean } {
  const origin = getAllowedOrigin(req);
  if (req.headers.get('Origin') && !origin) {
    return { origin: '', denied: true };
  }
  return { origin, denied: false };
}

export function handleOptions(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  const { origin, denied } = checkCors(req);
  if (denied) return new Response('Forbidden', { status: 403 });
  return new Response('ok', { headers: corsHeaders(origin) });
}

export function json(data: unknown, status = 200, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}
