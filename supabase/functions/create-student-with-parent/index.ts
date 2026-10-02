import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, checkCors, json } from "../_shared/cors.ts";
import { requireStaff } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const optionsResp = handleOptions(req);
  if (optionsResp) return optionsResp;
  const { origin, denied } = checkCors(req);
  if (denied) return json({ error: 'Forbidden' }, 403, origin);

  const auth = await requireStaff(req);
  if (!auth.allowed) return json({ error: auth.error ?? 'Forbidden' }, auth.status, origin);

  try {
    const { studentData, parentData } = await req.json();

    // ✅ REGLA NUEVA (Oct 2026):
    // El usuario de Supabase Auth usa SIEMPRE el dominio institucional
    // (@sonrisacreativas.com) y se construye exclusivamente con:
    //   PRIMER NOMBRE del estudiante + '.' + PRIMER APELLIDO del estudiante
    // (nunca cédula del tutor, nunca nombre del tutor).
    // El correo personal de la familia se guarda aparte en
    // profiles.notification_email para que los avisos (cuotas, ausencias)
    // lleguen a donde el padre realmente lee el correo.
    //
    // ✅ CONTRASEÑA TEMPORAL SIEMPRE: sonrisa123 (toda minúscula).
    // Al primer login el panel padre detecta is_temporary_password=true
    // y fuerza el cambio por una contraseña segura.
    const LOGIN_DOMAIN = "sonrisacreativas.com";
    const STUDENT_DEFAULT_PASSWORD = "sonrisa123";
    const rawEmail = String(parentData?.email ?? "").trim();
    if (!rawEmail) throw new Error("Falta el correo de login del padre");
    if (!rawEmail.toLowerCase().endsWith("@" + LOGIN_DOMAIN)) {
      console.warn(`[create-student-with-parent] dominio fuera de política, se normaliza a ${LOGIN_DOMAIN}`);
    }
    const loginEmail = rawEmail.toLowerCase().endsWith("@" + LOGIN_DOMAIN)
      ? rawEmail.toLowerCase()
      : `${rawEmail.split("@")[0].replace(/[^a-zA-Z0-9.]+/g, ".").replace(/^\.+|\.+$/g, "") || "familia"}@${LOGIN_DOMAIN}`;

    // Forzamos SIEMPRE la contraseña temporal predeterminada.
    // El valor enviado por el cliente se ignora deliberadamente para
    // garantizar uniformidad en todo el flujo.
    const finalPassword = STUDENT_DEFAULT_PASSWORD;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Crear el usuario padre en Supabase Auth
    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password: finalPassword,
      email_confirm: true, // Auto-confirmar para simplificar
      user_metadata: {
        full_name: parentData.name,
        role: "padre",
        notification_email: parentData.notification_email ?? null,
        is_temporary_password: true,
      },
    });

    let user: { id: string } | null = created?.user ?? null;

    if (authError || !user) {
      const msg = authError?.message ?? "createUser no devolvió usuario";
      // Si el usuario ya existe, recuperarlo por el correo de login.
      if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
        console.warn("El padre ya existe, se reutilizará el usuario.");
        // listUsers() pagina: hay que recorrer hasta dar con el correo.
        let page = 1;
        let found: { id: string } | null = null;
        while (!found && page <= 20) {
          const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
          if (listError) throw new Error(`No se pudo verificar el usuario: ${listError.message}`);
          found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === loginEmail) ?? null;
          if (!list?.users?.length) break;
          page += 1;
        }
        if (!found) throw new Error("El correo de login ya está en uso pero no se encontró el usuario.");
        user = found;
      } else {
        throw authError ?? new Error(msg);
      }
    }

    if (!user) throw new Error("No se pudo obtener el usuario padre");

    // 2. Insertar el perfil del padre si no existe
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      name: parentData.name,
      email: loginEmail,
      notification_email: parentData.notification_email ?? null,
      phone: parentData.phone,
      role: "padre",
      is_temporary_password: true,
    }, { onConflict: "id" });

    if (profileError) throw profileError;

    // 3. Insertar el estudiante, vinculándolo al padre
    const finalStudentData = {
      ...studentData,
      parent_id: user.id,
    };

    const { data: newStudent, error: studentError } = await supabaseAdmin
      .from("students")
      .insert(finalStudentData)
      .select()
      .single();

    if (studentError) throw studentError;

    return json({ student: newStudent, parent: { id: user.id, email: loginEmail } }, 201, origin);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error creando estudiante:", msg);
    return json({ error: "Error al crear estudiante", detail: msg }, 400, origin);
  }
});
