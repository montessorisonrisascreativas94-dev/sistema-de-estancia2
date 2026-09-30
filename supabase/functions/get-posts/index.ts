/**
 * get-posts — Edge Function
 * Retorna posts para el panel padre, bypaseando RLS.
 * Incluye posts generales (classroom_id IS NULL) + posts del aula del estudiante.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, checkCors, json } from "../_shared/cors.ts";
import { getUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const optionsResp = handleOptions(req);
  if (optionsResp) return optionsResp;
  const { origin, denied } = checkCors(req);
  if (denied) return json({ error: 'Forbidden' }, 403, origin);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500, origin);
    }

    // Usar service role para leer sin RLS
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false }
    });

    // Verificar que el JWT es válido
    const user = await getUser(req);
    if (!user) {
      return json({ error: 'Token inválido' }, 401, origin);
    }

    // Verificar rol y pertenencia
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const role = profile?.role ?? '';

    const STAFF = ['directora', 'asistente', 'admin', 'encargada', 'maestra'];

    // Parsear classroom_id del body
    let classroomId: number | null = null;
    try {
      const body = await req.json();
      classroomId = body.classroom_id ? Number(body.classroom_id) : null;
    } catch (_) {}

    if (!STAFF.includes(role)) {
      if (classroomId) {
        // Padre/maestra: solo su propio salón (estudiante vinculado)
        const { data: owned, error: ownErr } = await admin
          .from('students')
          .select('id')
          .eq('classroom_id', classroomId)
          .eq('parent_id', user.id)
          .maybeSingle();
        if (ownErr || !owned) {
          return json({ error: 'Acceso denegado al aula' }, 403, origin);
        }
      } else if (role !== 'padre') {
        return json({ error: 'Acceso denegado' }, 403, origin);
      }
    }

    // Fetch posts con service role (sin RLS)
    let query = admin
      .from('posts')
      .select(`
        id, content, media_url, media_type, image_url, created_at, classroom_id, teacher_id,
        teacher:profiles!posts_teacher_id_fkey(name, avatar_url, role),
        likes(id, user_id),
        comments(id, content, user_name, user_id, created_at)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (classroomId) {
      query = (query as any).or(`classroom_id.is.null,classroom_id.eq.${classroomId}`);
    } else {
      query = (query as any).is('classroom_id', null);
    }

    const { data: posts, error } = await query;
    if (error) {
      console.error('[get-posts] DB error:', error.message);
      return json({ error: 'Database error' }, 400, origin);
    }

    // Resolver URLs de media relativas a URLs públicas de Supabase Storage
    const resolvedPosts = (posts || []).map((p: Record<string, unknown>) => {
      const mediaUrl = p.media_url as string | null;
      if (mediaUrl && !mediaUrl.startsWith('http')) {
        // Es un path relativo — construir URL pública
        const bucket = mediaUrl.startsWith('posts/') ? 'posts' : 'classroom_media';
        const path   = mediaUrl.replace(/^(posts|classroom_media)\//, '');
        p = {
          ...p,
          media_url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
        };
      }
      return p;
    });

    console.log(`[get-posts] user=${user.id} classroom=${classroomId} posts=${resolvedPosts.length}`);
    return json({ posts: resolvedPosts }, 200, origin);

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[get-posts] Fatal:', msg);
    return json({ error: 'Unexpected error' }, 500, origin);
  }
});
