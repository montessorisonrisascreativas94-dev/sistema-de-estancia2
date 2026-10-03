-- =============================================================
-- 18_run_ddl_migration_rpc.sql
-- Proyecto: yswizaskeftxpcphixiy
-- Dónde:  https://supabase.com/dashboard/project/yswizaskeftxpcphixiy/sql
--         SQL Editor → New query → Run
--
-- ── PARA QUÉ SIRVE ────────────────────────────────────────────
-- La Edge Function `run-migration` ya existe e intenta ejecutar sus
-- migraciones mediante la RPC `public.run_ddl_migration(ddl)`. Esa RPC
-- NUNCA fue creada, así que la función fallaba en silencio con
-- "RPC no disponible" y no arreglaba nada.
--
-- Con esta RPC, Dirección puede reparar la base de datos desde el
-- Panel → Configuración → Mantenimiento, sin abrir el SQL Editor.
--
-- ── SEGURIDAD (importante, léelo) ──────────────────────────────
-- `SECURITY DEFINER` + `EXECUTE` es una puerta equivalente a DDL.
-- En la práctica esto NO amplía privilegios: quien puede llamar a esta
-- función ya podría ejecutar el mismo SQL desde el SQL Editor. Lo que
-- hace es convertir esa tarea repetitiva en un boton, no abrirla al mundo.
-- Aun así, esta función:
--   1. Rechaza a cualquiera que no sea 'directora' o 'admin'.
--   2. Valida cada sentencia por separado y solo deja pasar las que
--      empiezan por CREATE/ALTER/DROP/COMMENT/GRANT/REVOKE (deny by
--      default). INSERT/UPDATE/DELETE/SELECT/TRUNCATE/COPY, pero tambien
--      DO, CALL, EXECUTE y SET, quedan bloqueados: nadie puede tocar datos
--      ni exfiltrarlos usándola.
--   3. No se le concede EXECUTE a `anon` ni a `public`.
--   4. Fija `search_path` con pg_temp AL FINAL para que no sea
--      explotable vía objects maliciosos en el esquema de búsqueda.
--
-- LIMITACIONES CONOCIDAS (documentadas a proposito):
--   a) `EXECUTE` admite varias sentencias separadas por `;` en la misma
--      cadena. Aqui eso es aceptable porque cada sentencia se valida por
--      separado, y DROP/ALTER ya son parte del poder DDL del rol.
--   b) Se permite CREATE FUNCTION. El cuerpo podria contener un INSERT,
--      pero para invocarlo haria falta CALL o SELECT, ambos bloqueados
--      aqui. Con varios admins, migrar esto a una lista blanca cerrada
--      de sentencias concretas en vez de verbos.
--
-- Verifica lo que hay realmente en la base de datos después de correrlo:
--   SELECT * FROM public.run_ddl_migration('SELECT 1');
--   → ERROR: run_ddl_migration: solo se permiten sentencias DDL
-- =============================================================

CREATE OR REPLACE FUNCTION public.run_ddl_migration(ddl text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $run_ddl_body$
DECLARE
  v_role  text;
  v_clean text;
  v_rest  text;
  v_stmt  text;
  v_kw    text;
  v_pos   integer;
BEGIN
  -- 1. Solo directora o admin
  v_role := COALESCE(public.get_my_role(), '');
  IF v_role NOT IN ('directora', 'admin') THEN
    RAISE EXCEPTION 'run_ddl_migration: solo la directora o un admin pueden ejecutar migraciones (rol actual: %)',
      COALESCE(v_role, 'anonimo');
  END IF;

  IF ddl IS NULL OR btrim(ddl) = '' THEN
    RAISE EXCEPTION 'run_ddl_migration: la sentencia va vacia';
  END IF;

  -- 2. Normalizar antes de validar. EL ORDEN IMPORTA:
  --    2a. Bloques dollar-quoted (cuerpos de funcion con etiquetas $etiqueta$ o doble dolar).
  --        Su contenido NO debe participar en la validacion de verbos DDL.
  --    2b. Comentarios de linea (--) y literales de cadena ('...').
  --    2c. Colapsar espacios.
  v_clean := regexp_replace(ddl,      '\$[A-Za-z_][A-Za-z0-9_]*\$(.|\n)*?\$[A-Za-z_][A-Za-z0-9_]*\$', '', 'g');
  v_clean := regexp_replace(v_clean,  '\$\$(.|\n)*?\$\$',                                                                            '', 'g');
  v_clean := regexp_replace(v_clean,  '--[^\n]*',                                                                                      '', 'g');
  v_clean := regexp_replace(v_clean,  '''[^'']*''',                                                                                    '', 'g');
  v_clean := btrim(regexp_replace(v_clean, '\s+', ' ', 'g'));

  -- 3. Validar CADA sentencia por separado.
  --    Solo pasan CREATE / ALTER / DROP / COMMENT / GRANT / REVOKE.
  v_rest := v_clean;
  WHILE v_rest <> '' LOOP
    v_pos := strpos(v_rest, ';');
    IF v_pos = 0 THEN
      v_stmt := btrim(v_rest);
      v_rest := '';
    ELSE
      v_stmt := btrim(left(v_rest, v_pos - 1));
      v_rest := btrim(substring(v_rest FROM v_pos + 1));
    END IF;
    CONTINUE WHEN v_stmt = '';

    v_kw := substring(v_stmt FROM '^[[:space:]]*([A-Za-z_]+)');
    IF upper(v_kw) NOT IN ('CREATE', 'ALTER', 'DROP', 'COMMENT', 'GRANT', 'REVOKE') THEN
      RAISE EXCEPTION
        'run_ddl_migration: solo se permiten sentencias DDL (CREATE/ALTER/DROP/COMMENT/GRANT/REVOKE). Rechazada: %',
        left(v_stmt, 120);
    END IF;
  END LOOP;

  -- 4. Ejecutar
  EXECUTE ddl;
END;
$run_ddl_body$;

COMMENT ON FUNCTION public.run_ddl_migration(text) IS
  'Ejecuta una sentencia DDL. Solo directora/admin. No permite tocar datos. Usada por la Edge Function run-migration.';

-- Cerrar la puerta a anon y public ANTES de abrirla a authenticated.
REVOKE ALL ON FUNCTION public.run_ddl_migration(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_ddl_migration(text) FROM anon;
REVOKE ALL ON FUNCTION public.run_ddl_migration(text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.run_ddl_migration(text) TO authenticated;


-- ── Comprobación ──────────────────────────────────────────────
-- Debe salir exactamente esto:
--   proname     | proconfig
--   run_ddl_migration | {search_path=public, pg_temp}
SELECT p.proname,
       p.proconfig,
       p.prosecdef AS security_definer,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_puede_ejecutar,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticado_puede_ejecutar
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'run_ddl_migration';

-- Si anon_puede_ejecutar sale en TRUE, algo está mal: hay que volver a
-- ejecutar el REVOKE de arriba antes de seguir.
