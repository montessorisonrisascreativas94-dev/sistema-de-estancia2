/**
 * _shared/cors.ts — CORS para Edge Functions.
 *
 * Reglas:
 *  - Orígenes de producción: lista explícita (DEFAULT_ALLOWED + env ALLOWED_ORIGINS).
 *  - Loopback (localhost / 127.0.0.1 / [::1]) con CUALQUIER puerto: permitido.
 *    El servidor local de desarrollo cambia de puerto según el puerto ocupado
 *    (Live Server usa 5500..5510, Vite 5173/5174, etc.) y hardcodear puertos
 *    producía "blocked by CORS policy" en cada arranque distinto. Esto NO
 *    abre un hueco de seguridad: la autorización real la hace requireStaff()
 *    validando el JWT, nunca el Origin.
 *  - Toda respuesta (incluido el 403 por origen no permitido) devuelve los
 *    headers de CORS, para que el navegador pueda leer el error en vez de
 *    reportar un fallo de CORS genérico.
 */

const DEFAULT_ALLOWED = [
  'https://montessorisonrisascreativas.com',
  'https://www.montessorisonrisascreativas.com',
  'https://colegiosonrisas.com',
  'https://www.colegiosonrisas.com',
  'https://sonrisacreativas.com',
  'https://www.sonrisacreativas.com',
  // Servidor local (puerto explícito; cualquier otro puerto se cubre con isLoopback)
  'http://localhost:5800',
  'http://127.0.0.1:5800',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

/** Origenes de loopback en cualquier puerto: http://localhost:5503, 127.0.0.1:…, [::1]:… */
const LOOPBACK_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

export function isLoopback(origin: string): boolean {
  return LOOPBACK_RE.test(origin.toLowerCase());
}

const ALLOWED_ORIGINS: string[] = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  .concat(DEFAULT_ALLOWED.map(o => o.toLowerCase()));

export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin');
  if (!origin) return '';
  const o = origin.toLowerCase();
  if (isLoopback(o)) return origin;
  return ALLOWED_ORIGINS.includes(o) ? origin : '';
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-application-name, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

/** Devuelve un Response si el origen no está permitido, o el header a usar. */
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
  if (denied) {
    // Se reflejan headers de CORS también en el 403: sin ellos el navegador
    // muestra "No 'Access-Control-Allow-Origin' header is present" en vez del
    // 403 real, que es imposible de depurar desde el cliente.
    return new Response('Forbidden', {
      status: 403,
      headers: { ...corsHeaders(origin), 'Content-Type': 'text/plain' },
    });
  }
  return new Response('ok', { headers: corsHeaders(origin) });
}

export function json(data: unknown, status = 200, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}
