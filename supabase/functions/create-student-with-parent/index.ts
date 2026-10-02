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
    const rawBody = await req.json();
    // Robustez: aceptar tanto formato nuevo {studentData,parentData} como
    // formato antiguo {student,parent} y también pre_registration_id.
    const studentData = rawBody?.studentData ?? rawBody?.student ?? {};
    const parentData  = rawBody?.parentData  ?? rawBody?.parent  ?? {};
    const preRegistrationId = rawBody?.pre_registration_id
      ?? rawBody?.pre_registration_id
      ?? studentData?.pre_registration_id
      ?? null;

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
    if (preRegistrationId) {
      (finalStudentData as any).pre_registration_id = preRegistrationId;
    }
    // Limpiar campos nulos/undefined que rompan columnas inexistentes
    const cleanStudent: Record<string, any> = {};
    const STUDENT_ALLOWED = new Set([
      'name','student_name','student_last_name','birth_date','gender','nationality',
      'birth_place','address','province','municipality','sector','matricula',
      'level_requested','school_year_requested','classroom_id','schedule','start_date',
      'is_active','observations','p1_name','p1_relationship','p1_cedula','p1_phone',
      'p1_whatsapp','p1_email','p1_address','p1_profession','p1_workplace','p1_occupation',
      'p1_emergency_contact','p2_name','p2_relationship','p2_cedula','p2_phone',
      'p2_whatsapp','p2_email','p2_address','p2_profession','p2_workplace',
      'emergency_name','emergency_relationship','emergency_cedula','emergency_phone',
      'blood_type','allergies','medications','medical_conditions','disability',
      'food_restrictions','medical_notes','insurance','pediatrician','pediatrician_phone',
      'vaccines_complete','payment_plan','monthly_fee','prolonged_fee','registration_fee',
      'discount','due_day','authorized_persons','parent_id','pre_registration_id',
      'photo_url','birth_certificate_url','cedula_front_url','cedula_back_url',
      'p1_cedula_front_url','p1_cedula_back_url','p2_cedula_front_url','p2_cedula_back_url',
      'vaccine_card_url','contract_signed_url',
    ]);
    Object.entries(finalStudentData).forEach(([k, v]) => {
      if (STUDENT_ALLOWED.has(k) && v !== undefined && v !== null) {
        cleanStudent[k] = v;
      }
    });

    // Si el insert falla porque la tabla no tiene alguna columna, se identifica
    // la culpable y se reintenta sin ella. Sin esto, UNA columna faltante
    // (fue `prolonged_fee`) tumbaba la admisión completa con 400.
    const missingColumnOf = (msg: string): string | null => {
      const m =
        msg.match(/Could not find the '([^']+)' column/i) ||
        msg.match(/column "?([a-z0-9_]+)"? (?:of|does not exist)/i) ||
        msg.match(/column\s+students\.([a-z0-9_]+)/i);
      return m ? m[1] : null;
    };

    const droppedColumns: string[] = [];
    let newStudent: any = null;
    let studentError: any = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await supabaseAdmin
        .from("students")
        .insert(cleanStudent)
        .select()
        .single();
      newStudent = res.data ?? null;
      studentError = res.error ?? null;
      if (!studentError) break;
      const bad = missingColumnOf(String(studentError.message ?? ""));
      if (!bad || !(bad in cleanStudent)) break;
      delete cleanStudent[bad];
      droppedColumns.push(bad);
      console.warn(`[create-student-with-parent] columna "${bad}" no existe en students; se omite`);
    }

    if (studentError) throw studentError;

    return json({
      student: newStudent,
      parent: { id: user.id, email: loginEmail },
      ...(droppedColumns.length ? { dropped_columns: droppedColumns } : {}),
    }, 201, origin);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error creando estudiante:", msg);
    return json({ error: "Error al crear estudiante", detail: msg }, 400, origin);
  }
});
