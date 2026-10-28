-- NOTA: este archivo contiene ademas bloques CONSOLIDADOS de los antiguos sql/11-30 (buscar "BLOQUE CONSOLIDADO" al final).
-- ============================================================
-- 09_seed.sql — Colegio Montessori Sonrisas Creativas
-- Contenido: sección 11 (CONFIGURACION INICIAL) + sección 12 (DATOS INICIALES - Ano Escolar 2026-2027)
-- ============================================================
-- ============================================================
-- 11. CONFIGURACION INICIAL
-- ============================================================

-- Perfil admin
-- ON CONFLICT (email): profiles tiene UNIQUE en email Y en id; usar (id) con
-- DO UPDATE que reescribe email provocaba el 21000 "cannot affect row a second
-- time" si el email ya vivía en otra fila (registro previo por auth).
INSERT INTO public.profiles (id, email, name, role, accepted_terms, created_at)
VALUES ('5b6e8359-1a65-4d26-aba4-ca48b6b66409', 'impulsodigital@gmail.com', 'Administrador', 'admin', true, now())
ON CONFLICT (email) DO UPDATE SET role = 'admin', name = 'Administrador', accepted_terms = true;

-- Perfil directora
INSERT INTO public.profiles (id, email, name, role, accepted_terms, created_at)
VALUES ('3ce39f30-0447-4b3a-a639-20e9a34e5fb8', 'directora@sonrisacreativas.com', 'Directora', 'directora', true, now())
ON CONFLICT (email) DO UPDATE SET role = 'directora', name = 'Directora', accepted_terms = true;


-- ============================================================
-- 12. DATOS INICIALES - Ano Escolar 2026-2027
-- ============================================================

INSERT INTO public.school_years(name, start_date, end_date, status, is_current)
VALUES ('2026-2027', '2026-08-01', '2027-06-30', 'active', true)
ON CONFLICT (name) DO UPDATE SET is_current = true, status = 'active';

DO $$
DECLARE
  v_sy_id bigint; v_plan_id bigint;
BEGIN
  SELECT id INTO v_sy_id FROM public.school_years WHERE name = '2026-2027';
  IF v_sy_id IS NULL THEN RETURN; END IF;

  -- INICIAL 8:00-12:00
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-12:00','Plan A (Anual)',118188.00,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-12:00' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',118188.00,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-12:00','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-12:00' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',60016.95,5,0,true),(v_plan_id,'colegiatura',2,'Enero',60016.95,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-12:00','Plan C (Mensual)',24622.50,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-12:00' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',24622.50,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',9850.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',9850.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',9850.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',9850.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',9850.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',9850.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',9850.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',9850.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',9850.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',9850.00,5,10,false)
  ON CONFLICT DO NOTHING;

  -- INICIAL 8:00-15:00
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-15:00','Plan A (Anual)',139356.00,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-15:00' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',139356.00,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-15:00','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-15:00' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',70766.85,5,0,true),(v_plan_id,'colegiatura',2,'Enero',70766.85,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-15:00','Plan C (Mensual)',29032.50,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-15:00' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',29032.50,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',11613.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',11613.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',11613.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',11613.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',11613.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',11613.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',11613.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',11613.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',11613.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',11613.00,5,10,false)
  ON CONFLICT DO NOTHING;

  -- INICIAL 8:00-17:00
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-17:00','Plan A (Anual)',169585.50,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-17:00' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',169585.50,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-17:00','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-17:00' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',86117.85,5,0,true),(v_plan_id,'colegiatura',2,'Enero',86117.85,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Inicial','8:00-17:00','Plan C (Mensual)',26497.80,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Inicial' AND schedule='8:00-17:00' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',26497.80,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',15015.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',15015.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',15015.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',15015.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',15015.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',15015.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',15015.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',15015.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',15015.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',15015.00,5,10,false)
  ON CONFLICT DO NOTHING;

  -- PRIMARIA 8:00-13:30
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-13:30','Plan A (Anual)',132294.75,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-13:30' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',132294.75,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-13:30','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-13:30' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',67181.10,5,0,true),(v_plan_id,'colegiatura',2,'Enero',67181.10,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-13:30','Plan C (Mensual)',27561.45,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-13:30' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',27561.45,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',11025.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',11025.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',11025.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',11025.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',11025.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',11025.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',11025.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',11025.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',11025.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',11025.00,5,10,false)
  ON CONFLICT DO NOTHING;

  -- PRIMARIA 8:00-15:00
  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-15:00','Plan A (Anual)',139356.00,'Pago anual') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-15:00' AND name LIKE 'Plan A%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',139356.00,5,0,true) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-15:00','Plan B (Semestral)',0,'Dos pagos') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-15:00' AND name LIKE 'Plan B%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES(v_plan_id,'inscripcion',1,'Agosto',71566.85,5,0,true),(v_plan_id,'colegiatura',2,'Enero',70766.85,5,5,false) ON CONFLICT DO NOTHING;

  INSERT INTO public.payment_plans(school_year_id,level,schedule,name,registration_fee,description) VALUES(v_sy_id,'Primaria','8:00-15:00','Plan C (Mensual)',30000.00,'11 cuotas') ON CONFLICT DO NOTHING;
  SELECT id INTO v_plan_id FROM public.payment_plans WHERE school_year_id=v_sy_id AND level='Primaria' AND schedule='8:00-15:00' AND name LIKE 'Plan C%';
  INSERT INTO public.plan_installments(payment_plan_id,type,month_number,month_name,amount,due_day,due_month_offset,is_registration) VALUES
    (v_plan_id,'inscripcion',1,'Agosto',30000.00,5,0,true),
    (v_plan_id,'colegiatura',2,'Septiembre',11825.00,5,1,false),(v_plan_id,'colegiatura',3,'Octubre',11825.00,5,2,false),
    (v_plan_id,'colegiatura',4,'Noviembre',11613.00,5,3,false),(v_plan_id,'colegiatura',5,'Diciembre',11825.00,5,4,false),
    (v_plan_id,'colegiatura',6,'Enero',11825.00,5,5,false),(v_plan_id,'colegiatura',7,'Febrero',11825.00,5,6,false),
    (v_plan_id,'colegiatura',8,'Marzo',11825.00,5,7,false),(v_plan_id,'colegiatura',9,'Abril',11825.00,5,8,false),
    (v_plan_id,'colegiatura',10,'Mayo',11825.00,5,9,false),(v_plan_id,'colegiatura',11,'Junio',11825.00,5,10,false)
  ON CONFLICT DO NOTHING;

END $$;

-- Conceptos de pago iniciales
INSERT INTO public.payment_concepts (name, description, amount) VALUES
  ('Inscripcion', 'Pago de inscripcion', 500.00),
  ('Uniforme', 'Uniforme escolar completo', 300.00),
  ('Libros', 'Material didactico y libros', 250.00),
  ('Materiales', 'Materiales escolares', 150.00),
  ('Actividades Extra', 'Actividades extra curriculares', 100.00)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FIN DEL SCHEMA CONSOLIDADO v4.0
-- ============================================================

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- CONSOLIDADO DESDE migrations\ (historial) â€” aÃ±adido automÃ¡ticamente
-- Fecha: 2026-09-12 21:41
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

INSERT INTO public.payment_concepts (name, description, amount) VALUES
  ('Inscripción', 'Pago de inscripción', 500.00),
  ('Uniforme', 'Uniforme escolar completo', 300.00),
  ('Libros', 'Material didáctico y libros', 250.00),
  ('Materiales', 'Materiales escolares', 150.00),
  ('Actividades Extra', 'Actividades extra curriculares', 100.00)
ON CONFLICT DO NOTHING;

UPDATE public.grades g
SET school_year_id = p.school_year_id
FROM public.periods p
WHERE g.period_id = p.id AND g.school_year_id IS NULL AND p.school_year_id IS NOT NULL;

UPDATE public.report_cards rc
SET school_year_id = p.school_year_id
FROM public.periods p
WHERE rc.period_id = p.id AND rc.school_year_id IS NULL AND p.school_year_id IS NOT NULL;

INSERT INTO public.academic_areas (name, description, icon, sort_order) VALUES
  ('Lenguaje', 'Reconocimiento de letras, vocabulario, expresión oral y comprensión', 'languages', 1),
  ('Matemática', 'Números, formas, colores, relaciones espaciales y lógica', 'calculator', 2),
  ('Desarrollo Infantil', 'Social, emocional, cognitivo y autonomía', 'heart', 3),
  ('Psicomotricidad', 'Control motriz, coordinación, equilibrio y lateralidad', 'activity', 4),
  ('Arte y Creatividad', 'Expresión artística, música, pintura y manualidades', 'palette', 5),
  ('Ciencias Naturales', 'Exploración del entorno, naturaleza y cuidado del cuerpo', 'leaf', 6),
  ('Formación Valores', 'Valores, normas, convivencia y respeto', 'star', 7)
ON CONFLICT DO NOTHING;

INSERT INTO public.competencies (area_id, name, description, level_order) VALUES
  ((SELECT id FROM public.academic_areas WHERE name='Lenguaje' LIMIT 1), 'Reconoce vocales y consonantes', 'Identifica y diferencia letras del abecedario', 1),
  ((SELECT id FROM public.academic_areas WHERE name='Lenguaje' LIMIT 1), 'Pronuncia palabras correctamente', 'Articula sonidos con claridad', 2),
  ((SELECT id FROM public.academic_areas WHERE name='Lenguaje' LIMIT 1), 'Escucha y sigue instrucciones', 'Comprende y ejecuta indicaciones de 2-3 pasos', 3),
  ((SELECT id FROM public.academic_areas WHERE name='Lenguaje' LIMIT 1), 'Cuenta historias con coherencia', 'Narra eventos con inicio, desarrollo y cierre', 4),
  ((SELECT id FROM public.academic_areas WHERE name='Lenguaje' LIMIT 1), 'Identifica su nombre escrito', 'Reconoce su nombre en papel', 5),
  ((SELECT id FROM public.academic_areas WHERE name='Matemática' LIMIT 1), 'Cuenta del 1 al 20', 'Conteo progresivo y regresivo', 1),
  ((SELECT id FROM public.academic_areas WHERE name='Matemática' LIMIT 1), 'Reconoce figuras geométricas', 'Identifica círculo, cuadrado, triángulo, rectángulo', 2),
  ((SELECT id FROM public.academic_areas WHERE name='Matemática' LIMIT 1), 'Identifica y nombra colores', 'Reconoce colores primarios y secundarios', 3),
  ((SELECT id FROM public.academic_areas WHERE name='Matemática' LIMIT 1), 'Clasifica por tamaño y forma', 'Ordena de grande a pequeño, agrupa por características', 4),
  ((SELECT id FROM public.academic_areas WHERE name='Matemática' LIMIT 1), 'Relaciones de cantidad', 'Comprende conceptos de más, menos, igual', 5),
  ((SELECT id FROM public.academic_areas WHERE name='Desarrollo Infantil' LIMIT 1), 'Social: Comparte y coopera', 'Interactúa positivamente con sus compañeros', 1),
  ((SELECT id FROM public.academic_areas WHERE name='Desarrollo Infantil' LIMIT 1), 'Emocional: Identifica sus emociones', 'Nombra cómo se siente y reconoce emociones en otros', 2),
  ((SELECT id FROM public.academic_areas WHERE name='Desarrollo Infantil' LIMIT 1), 'Cognitivo: Resuelve problemas simples', 'Busca soluciones ante situaciones cotidianas', 3),
  ((SELECT id FROM public.academic_areas WHERE name='Desarrollo Infantil' LIMIT 1), 'Autonomía: Realiza tareas solo', 'Se viste, come y se asea con independencia', 4),
  ((SELECT id FROM public.academic_areas WHERE name='Psicomotricidad' LIMIT 1), 'Control motriz grueso', 'Corre, salta, camina en línea recta', 1),
  ((SELECT id FROM public.academic_areas WHERE name='Psicomotricidad' LIMIT 1), 'Coordinación mano-ojo', 'Traza, corta, pega con precisión', 2),
  ((SELECT id FROM public.academic_areas WHERE name='Psicomotricidad' LIMIT 1), 'Equilibrio y lateralidad', 'Se mantiene en un pie, distingue derecha e izquierda', 3),
  ((SELECT id FROM public.academic_areas WHERE name='Arte y Creatividad' LIMIT 1), 'Expresión artística libre', 'Dibuja, pinta y crea con imaginación', 1),
  ((SELECT id FROM public.academic_areas WHERE name='Arte y Creatividad' LIMIT 1), 'Expresión musical', 'Canta canciones, sigue ritmos, toca instrumentos', 2),
  ((SELECT id FROM public.academic_areas WHERE name='Arte y Creatividad' LIMIT 1), 'Manualidades y construcción', 'Arma figuras con plastilina, papel y otros materiales', 3)
ON CONFLICT DO NOTHING;

DELETE FROM public.payment_concepts
WHERE (
    (name = 'Inscripcion'   AND amount = 500)
    OR (name = 'Uniforme'   AND amount = 300)
    OR (name = 'Libros'     AND amount = 250)
    OR (name = 'Materiales' AND amount = 150)
    OR (name = 'Actividades Extra' AND amount = 100)
  );

INSERT INTO public.routine_categories (name, emoji, color, sort_order) VALUES
  ('Ánimo',       '😊', '#3B82F6', 0),
  ('Salud',       '❤️', '#EF4444', 1),
  ('Alimentación','🍽️', '#FF8A00', 2),
  ('Descanso',    '😴', '#8B5CF6', 3),
  ('Higiene',     '🚽', '#0B63C7', 4),
  ('Actividades', '🧩', '#7C3AED', 5),
  ('Arte',        '🎨', '#EC4899', 6),
  ('Aprendizaje', '📚', '#6366F1', 7),
  ('Social',      '🤝', '#F59E0B', 8),
  ('Juego',       '🎮', '#16A34A', 9),
  ('Exterior',    '🌳', '#28B54D', 10),
  ('Momentos',    '📸', '#06B6D4', 11),
  ('Incidentes',  '⚠️', '#EF4444', 12),
  ('Personalizados','⭐', '#64748B', 13)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, legacy_key, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.legacy_key, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Feliz',           '😊', 0, 'mood:feliz'),
  ('Muy feliz',       '😄', 1, NULL),
  ('Tranquilo',       '🙂', 2, 'mood:tranquilo'),
  ('Normal',          '😐', 3, 'mood:normal'),
  ('Participativo',   '🙋', 4, NULL),
  ('Activo',          '⚡', 5, NULL),
  ('Muy activo',      '🔥', 6, NULL),
  ('Somnoliento',     '😴', 7, 'mood:somnoliento'),
  ('Triste',          '😢', 8, 'mood:triste'),
  ('Irritable',       '😤', 9, 'mood:irritable'),
  ('Ansioso',         '😰', 10, NULL),
  ('Lloró',           '😭', 11, 'mood:llanto'),
  ('Enfermo',         '🤒', 12, 'mood:enfermo'),
  ('Se calmó',        '🧘', 13, NULL),
  ('Compartió',       '🤝', 14, NULL),
  ('Necesitó consuelo','💛', 15, NULL),
  ('Excelente actitud','⭐', 16, NULL)
) AS v(name, emoji, sort_order, legacy_key)
WHERE c.name = 'Ánimo'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, legacy_key, requires_comment, requires_temp, notify_parents, sort_order)
SELECT c.id, v.name, v.emoji, c.color, v.kind, v.legacy_key, v.requires_comment, v.requires_temp, v.notify_parents, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Temperatura',   '🌡️', 'temp',    'infant:temp',            false, true,  false, 0),
  ('Fiebre',        '🤒', 'temp',    'incident:fever',         false, true,  true,  1),
  ('Medicamento',   '💊', 'comment', 'infant:med',             true,  false, false, 2),
  ('Golpe',         '🤕', 'comment', 'incident:hit',           true,  false, true,  3),
  ('Rasguño',       '🩹', 'comment', NULL,                     true,  false, true,  4),
  ('Tos',           '😷', 'toggle',  'health:cough',           false, false, false, 5),
  ('Congestión',    '🤧', 'toggle',  NULL,                     false, false, false, 6),
  ('Dolor',         '😖', 'toggle',  NULL,                     false, false, false, 7),
  ('Vomitó',        '🤮', 'toggle',  'health:vomit',           false, false, true,  8),
  ('Caída',         '🦵', 'comment', NULL,                     true,  false, true,  9),
  ('Enfermería',    '🏥', 'toggle',  NULL,                     false, false, true,  10),
  ('Llamada a padres','📞', 'toggle', 'incident:parent_call',  false, false, true,  11)
) AS v(name, emoji, kind, legacy_key, requires_comment, requires_temp, notify_parents, sort_order)
WHERE c.name = 'Salud'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, value_options, legacy_key, requires_quantity, sort_order)
SELECT c.id, v.name, v.emoji, c.color, v.kind, v.value_options, v.legacy_key, v.requires_quantity, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Desayuno',    '🍞', 'value',    '["Todo","Poco","No quiso","Ayuda"]'::jsonb, 'food:breakfast', false, 0),
  ('Almuerzo',    '🥗', 'value',    '["Todo","Poco","No quiso","Ayuda"]'::jsonb, 'food:lunch',     false, 1),
  ('Merienda',    '🍪', 'value',    '["Todo","Poco","No quiso","Ayuda"]'::jsonb, 'food:snack',     false, 2),
  ('Refrigerio',  '🍎', 'value',    '["Todo","Poco","No quiso","Ayuda"]'::jsonb, 'food:snack',     false, 3),
  ('Agua',        '💧', 'quantity', NULL,                                         'infant:water',   false, 4),
  ('Leche',       '🥛', 'quantity', NULL,                                         'infant:milk',    false, 5),
  ('Biberón',     '🍼', 'quantity', NULL,                                         'infant:milk',    true,  6),
  ('Frutas',      '🍌', 'toggle',   NULL,                                         NULL,             false, 7),
  ('Vegetales',   '🥦', 'toggle',   NULL,                                         NULL,             false, 8),
  ('Todo',        '✅', 'value',    '["Todo"]'::jsonb,                             NULL,             false, 9),
  ('Poco',        '⚠️', 'value',    '["Poco"]'::jsonb,                             NULL,             false, 10),
  ('Nada',        '❌', 'value',    '["Nada"]'::jsonb,                             NULL,             false, 11),
  ('Necesitó ayuda','🆘', 'value',  '["Ayuda"]'::jsonb,                            NULL,             false, 12)
) AS v(name, emoji, kind, value_options, legacy_key, requires_quantity, sort_order)
WHERE c.name = 'Alimentación'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, legacy_key, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.legacy_key, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Siesta',            '😴', 'infant:sleep',     0),
  ('Durmió',            '💤', NULL,               1),
  ('No durmió',         '☀️', NULL,               2),
  ('Despertó',          '⏰', 'infant:sleep_end', 3),
  ('Descansó bien',     '🌙', NULL,               4),
  ('Se despertó llorando','🌧️', NULL,            5),
  ('Siesta corta',      '⏳', NULL,               6),
  ('Siesta larga',      '🛏️', NULL,              7)
) AS v(name, emoji, legacy_key, sort_order)
WHERE c.name = 'Descanso'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, legacy_key, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.legacy_key, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Lavado manos', '🧼', 'infant:handwash',       0),
  ('Cepillado',    '🪥', 'infant:toothbrush',     1),
  ('Pipí',         '💧', 'infant:diaper:wet',     2),
  ('Popó',         '💩', 'infant:diaper:soiled',  3),
  ('Cambio pañal', '🧻', 'infant:diaper_change',  4),
  ('Inodoro',      '🚽', 'infant:toilet',         5),
  ('Baño',         '🛁', 'infant:bath',           6),
  ('Lavado cara',  '🫧', NULL,                    7)
) AS v(name, emoji, legacy_key, sort_order)
WHERE c.name = 'Higiene'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, legacy_key, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.legacy_key, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Actividad educativa','🎨', 'infant:activity',    0),
  ('Pintura',      '🖌️', NULL,                       1),
  ('Dibujo',       '✏️', NULL,                        2),
  ('Colorear',     '🖍️', NULL,                        3),
  ('Manualidades', '✂️', NULL,                        4),
  ('Música',       '🎵', NULL,                        5),
  ('Danza',        '💃', NULL,                        6),
  ('Lectura',      '📖', NULL,                        7),
  ('Rompecabezas', '🧩', NULL,                        8),
  ('Sensorial',    '🔬', 'infant:sensorial',          9),
  ('Montessori',   '🏗️', NULL,                        10),
  ('Matemáticas',  '🔢', NULL,                        11),
  ('Lenguaje',     '💬', NULL,                        12),
  ('Ciencia',      '🔭', NULL,                        13)
) AS v(name, emoji, legacy_key, sort_order)
WHERE c.name = 'Actividades'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Canto',       '🎤', 0),
  ('Plastilina',  '🟠', 1),
  ('Collage',     '🖼️', 2),
  ('Teatro',      '🎭', 3),
  ('Origami',     '🎏', 4),
  ('Instrumentos','🥁', 5)
) AS v(name, emoji, sort_order)
WHERE c.name = 'Arte'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Reconoció colores','🎨', 0),
  ('Reconoció letras', '🔤', 1),
  ('Reconoció números','🔢', 2),
  ('Conteo',           '🧮', 3),
  ('Trazos',           '✍️', 4),
  ('Memoria',          '🧠', 5),
  ('Atención',         '👂', 6),
  ('Concentración',    '🎯', 7)
) AS v(name, emoji, sort_order)
WHERE c.name = 'Aprendizaje'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Compartió',              '🤝', 0),
  ('Esperó turno',           '⏸️', 1),
  ('Ayudó',                  '🫶', 2),
  ('Trabajó en equipo',      '👥', 3),
  ('Resolución de conflictos','🕊️', 4),
  ('Lideró actividad',       '🚀', 5)
) AS v(name, emoji, sort_order)
WHERE c.name = 'Social'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, legacy_key, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.legacy_key, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Juego libre',     '🎮', NULL,        0),
  ('Juego exterior',  '🌳', NULL,        1),
  ('Juego grupal',    '🧑‍🤝‍🧑', NULL,  2),
  ('Juego individual', '🧍', NULL,       3),
  ('Patio',           '🏞️', 'infant:playground', 4),
  ('Columpio',        '🛝', NULL,        5),
  ('Arena',           '🏖️', NULL,       6),
  ('Pelotas',         '⚽', NULL,        7),
  ('Bloques',         '🧱', NULL,        8)
) AS v(name, emoji, legacy_key, sort_order)
WHERE c.name = 'Juego'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, legacy_key, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.legacy_key, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Patio',                '🌳', 'infant:playground', 0),
  ('Jardín',               '🌻', NULL,                1),
  ('Huerto',               '🌱', NULL,                2),
  ('Educación física',     '🏃', NULL,                3),
  ('Caminata',             '🚶', NULL,                4),
  ('Observación naturaleza','🔍', NULL,               5)
) AS v(name, emoji, legacy_key, sort_order)
WHERE c.name = 'Exterior'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, legacy_key, requires_photo, sort_order)
SELECT c.id, v.name, v.emoji, c.color, v.kind, v.legacy_key, v.requires_photo, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Llegada',         '🖐️', 'toggle', 'group:welcome',      false, 0),
  ('Pase de Lista',   '📋', 'toggle', 'group:roll_call',    false, 1),
  ('Entrega de niños','👋', 'toggle', 'group:departure',    false, 2),
  ('Foto',            '📷', 'photo',  'photo',              true,  3),
  ('Canción',         '🎶', 'toggle', 'infant:welcome_song', false, 4)
) AS v(name, emoji, kind, legacy_key, requires_photo, sort_order)
WHERE c.name = 'Momentos'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, legacy_key, requires_comment, notify_parents, notify_email, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'comment', v.legacy_key, true, true, v.notify_email, v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Caída',          '🤕', 'incident:hit',           false, 0),
  ('Mordida',        '🦷', NULL,                     false, 1),
  ('Arañazo',        '🐾', NULL,                     false, 2),
  ('Empujón',        '👊', NULL,                     false, 3),
  ('Llamada a padres','📞', 'incident:parent_call',  false, 4),
  ('Accidente leve', '🩹', 'incident:accident',      false, 5),
  ('Accidente mayor','🚑', NULL,                     true,  6)
) AS v(name, emoji, legacy_key, notify_email, sort_order)
WHERE c.name = 'Incidentes'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.routine_events (category_id, name, emoji, color, kind, sort_order)
SELECT c.id, v.name, v.emoji, c.color, 'toggle', v.sort_order
FROM public.routine_categories c
CROSS JOIN (VALUES
  ('Festival Patrio',    '🎆', 0),
  ('Huerto Escolar',     '🌽', 1),
  ('Piscina',            '🏊', 2),
  ('Excursión',          '🚌', 3),
  ('Día del Libro',      '📚', 4),
  ('Cumpleaños',         '🎂', 5),
  ('Proyecto Montessori','🧩', 6),
  ('Actividad STEM',     '🤖', 7)
) AS v(name, emoji, sort_order)
WHERE c.name = 'Personalizados'
ON CONFLICT (name, category_id) DO NOTHING;

INSERT INTO public.classroom_routine_settings (classroom_id, event_id, sort_order)
  SELECT c.id, e.id, e.sort_order
  FROM public.classrooms c
  CROSS JOIN public.routine_events e
  WHERE c.deleted_at IS NULL AND e.is_active = true
  ON CONFLICT (classroom_id, event_id) DO NOTHING;

INSERT INTO public.classroom_schedule_blocks
    (classroom_id, days, start_time, duration_min, label, emoji, color, sort_order)
  SELECT c.id, b.days, b.start_time, b.duration_min, b.label, b.emoji, b.color, b.sort_order
  FROM public.classrooms c
  CROSS JOIN (VALUES
    ('{1,2,3,4,5,6}'::smallint[], '07:30'::time, 15, 'Bienvenida',        '🖐️', '#FF8A00', 0),
    ('{1,2,3,4,5,6}'::smallint[], '07:45'::time, 15, 'Pase de Lista',     '📋', '#0B63C7', 1),
    ('{1,2,3,4,5,6}'::smallint[], '08:00'::time, 30, 'Desayuno',          '🍞', '#FF8A00', 2),
    ('{1,2,3,4,5,6}'::smallint[], '08:30'::time, 10, 'Lavado de manos',   '🧼', '#0B63C7', 3),
    ('{1,2,3,4,5,6}'::smallint[], '09:00'::time, 45, 'Actividad educativa','🎨', '#7C3AED', 4),
    ('{1,2,3,4,5,6}'::smallint[], '09:45'::time, 30, 'Salida al Patio',   '🌳', '#16A34A', 5),
    ('{1,2,3,4,5,6}'::smallint[], '10:15'::time, 30, 'Refrigerio',        '🍎', '#28B54D', 6),
    ('{1,2,3,4,5,6}'::smallint[], '11:00'::time, 45, 'Actividad sensorial','🔬', '#6366F1', 7),
    ('{1,2,3,4,5,6}'::smallint[], '11:45'::time, 30, 'Almuerzo',          '🍽️', '#28B54D', 8),
    ('{1,2,3,4,5,6}'::smallint[], '12:15'::time, 15, 'Cepillado',         '🪥', '#06B6D4', 9),
    ('{1,2,3,4,5,6}'::smallint[], '12:30'::time, 120,'Siesta',            '😴', '#8B5CF6', 10),
    ('{1,2,3,4,5,6}'::smallint[], '14:30'::time, 15, 'Despertar',         '😊', '#FFD43B', 11),
    ('{1,2,3,4,5,6}'::smallint[], '15:00'::time, 30, 'Merienda',          '🍪', '#F59E0B', 12),
    ('{1,2,3,4,5,6}'::smallint[], '15:30'::time, 30, 'Juego libre',       '🎮', '#EC4899', 13),
    ('{1,2,3,4,5,6}'::smallint[], '16:00'::time, 60, 'Entrega de niños',  '👋', '#EF4444', 14)
  ) AS b(days, start_time, duration_min, label, emoji, color, sort_order)
  WHERE c.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.classroom_schedule_blocks x WHERE x.classroom_id = c.id);

INSERT INTO public.classroom_schedule_block_events (block_id, event_id, sort_order)
  SELECT b.id, e.id, m.sort_order
  FROM public.classroom_schedule_blocks b
  JOIN (VALUES
    ('Bienvenida',         'Momentos',    'Llegada',           0),
    ('Pase de Lista',      'Momentos',    'Pase de Lista',     0),
    ('Desayuno',           'Alimentación','Desayuno',          1),
    ('Desayuno',           'Alimentación','Agua',              2),
    ('Lavado de manos',    'Higiene',     'Lavado manos',      0),
    ('Actividad educativa','Actividades', 'Actividad educativa',0),
    ('Salida al Patio',    'Exterior',    'Patio',             0),
    ('Refrigerio',         'Alimentación','Refrigerio',        0),
    ('Refrigerio',         'Alimentación','Frutas',            1),
    ('Actividad sensorial','Actividades', 'Sensorial',         0),
    ('Almuerzo',           'Alimentación','Almuerzo',          0),
    ('Almuerzo',           'Alimentación','Agua',              1),
    ('Cepillado',          'Higiene',     'Cepillado',         0),
    ('Siesta',             'Descanso',    'Siesta',            0),
    ('Despertar',          'Descanso',    'Despertar',         0),
    ('Merienda',           'Alimentación','Merienda',          0),
    ('Merienda',           'Alimentación','Agua',              1),
    ('Juego libre',        'Juego',       'Juego libre',       0),
    ('Entrega de niños',   'Momentos',    'Entrega de niños',  0)
  ) AS m(block_label, cat_name, event_name, sort_order)
    ON b.label = m.block_label
  JOIN public.routine_categories c ON c.name = m.cat_name
  JOIN public.routine_events e ON e.category_id = c.id AND e.name = m.event_name
  WHERE NOT EXISTS (
    SELECT 1 FROM public.classroom_schedule_block_events x
    WHERE x.block_id = b.id AND x.event_id = e.id
  );

INSERT INTO public.classroom_routine_settings (classroom_id, event_id, sort_order)
  SELECT DISTINCT b.classroom_id, be.event_id, e.sort_order
  FROM public.classroom_schedule_blocks b
  JOIN public.classroom_schedule_block_events be ON be.block_id = b.id
  JOIN public.routine_events e ON e.id = be.event_id
  WHERE e.is_active = true
  ON CONFLICT (classroom_id, event_id)
  DO UPDATE SET is_active = true;

INSERT INTO public.eval_formulas (name, parts, total_percent, is_template, template_name, level) VALUES
('Promedio por Competencias', jsonb_build_array(
  jsonb_build_object('type','area','name','Observaciones','percent',30,'placeholder',true),
  jsonb_build_object('type','module','name','Proyecto','percent',20,'placeholder',true),
  jsonb_build_object('type','module','name','Participación','percent',20,'placeholder',true),
  jsonb_build_object('type','period','name','Evaluación','percent',30,'placeholder',true)
), 100, true, 'Competencias', NULL),
('Montessori', jsonb_build_array(
  jsonb_build_object('type','area','name','Vida Práctica','percent',40,'placeholder',true),
  jsonb_build_object('type','area','name','Sensorial','percent',30,'placeholder',true),
  jsonb_build_object('type','area','name','Lenguaje','percent',30,'placeholder',true)
), 100, true, 'Montessori', NULL),
('Inicial', jsonb_build_array(
  jsonb_build_object('type','period','name','Primer Período','percent',20,'placeholder',true),
  jsonb_build_object('type','period','name','Segundo Período','percent',30,'placeholder',true),
  jsonb_build_object('type','period','name','Tercer Período','percent',50,'placeholder',true)
), 100, true, 'Inicial', NULL),
('Primaria', jsonb_build_array(
  jsonb_build_object('type','area','name','Motricidad','percent',40,'placeholder',true),
  jsonb_build_object('type','area','name','Lenguaje','percent',35,'placeholder',true),
  jsonb_build_object('type','area','name','Autonomía','percent',25,'placeholder',true)
), 100, true, 'Primaria', NULL),
('Tradicional', jsonb_build_array(
  jsonb_build_object('type','module','name','Participación','percent',30,'placeholder',true),
  jsonb_build_object('type','module','name','Proyecto','percent',20,'placeholder',true),
  jsonb_build_object('type','module','name','Examen','percent',20,'placeholder',true),
  jsonb_build_object('type','module','name','Evaluación','percent',30,'placeholder',true)
), 100, true, 'Tradicional', NULL),
('Rúbricas', jsonb_build_array(
  jsonb_build_object('type','module','name','Rúbrica 1','percent',50,'placeholder',true),
  jsonb_build_object('type','module','name','Rúbrica 2','percent',50,'placeholder',true)
), 100, true, 'Rúbricas', NULL)
ON CONFLICT DO NOTHING;

UPDATE public.periods SET status = 'open'
WHERE status IS NULL;

UPDATE public.periods SET status = 'open', is_blocked = false
WHERE is_active = true AND status = 'closed';

ALTER TABLE public.eval_periods ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.eval_periods ep
SET status = CASE WHEN gp.status = 'open' THEN 'open' ELSE 'closed' END,
    start_date = gp.start_date,
    end_date = gp.end_date,
    sort_order = COALESCE(gp.sort_order, ep.sort_order),
    updated_at = now()
FROM public.periods gp
WHERE ep.deleted_at IS NULL
  AND ep.name = gp.name
  AND (ep.status IS DISTINCT FROM (CASE WHEN gp.status = 'open' THEN 'open' ELSE 'closed' END)
       OR ep.start_date IS DISTINCT FROM gp.start_date
       OR ep.end_date IS DISTINCT FROM gp.end_date);

INSERT INTO payment_concepts (name, amount) VALUES
  ('Uniforme Escolar', 3200),
  ('Transporte', 1500),
  ('Libros', 2500),
  ('Materiales', 800),
  ('Actividades Extra', 1200),
  ('Excursiones', 3500),
  ('Comedor', 2000),
  ('Tutorías', 1800),
  ('Certificados', 500),
  ('Otros', 0);

INSERT INTO public.payment_concepts (name, category, amount, description, is_active)
SELECT name, category, amount, description, is_active FROM (VALUES
  ('Colegiatura Mensual',   'colegiatura',   3000.00, 'Mensualidad estándar del período escolar',     true),
  ('Inscripción',           'inscripcion',   5000.00, 'Pago único de inscripción al inicio del ciclo',true),
  ('Reinscripción',         'reinscripcion', 3500.00, 'Renovación de matrícula para el próximo ciclo',true),
  ('Uniforme Escolar',      'uniforme',      3200.00, 'Uniforme completo (camisa, pantalón/falda)',    true),
  ('Libros y Útiles',       'libros',        2500.00, 'Kit de libros y materiales del nivel',          true),
  ('Materiales Didácticos', 'materiales',     800.00, 'Materiales de uso mensual en clase',            true),
  ('Actividades Extra',     'actividades',   1200.00, 'Actividades extracurriculares opcionales',      true),
  ('Excursión',             'excursiones',   3500.00, 'Salida pedagógica programada',                  true),
  ('Comedor',               'comedor',       2000.00, 'Servicio de alimentación mensual',              true),
  ('Tutorías',              'tutorias',      1800.00, 'Apoyo académico individual',                    true),
  ('Certificados',          'certificados',   500.00, 'Emisión de certificados y constancias',         true),
  ('Transporte',            'transporte',    1500.00, 'Servicio de ruta escolar',                      true),
  ('Otro',                  'otros',            0.00, 'Concepto personalizado (monto variable)',        true)
) AS v(name, category, amount, description, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_concepts LIMIT 1);

INSERT INTO public.payment_concepts (name, category, amount, description, is_active)
SELECT name, category, amount, description, is_active FROM (VALUES
  ('Colegiatura Mensual',   'colegiatura',   3000.00, 'Mensualidad estándar',              true),
  ('Inscripción',           'inscripcion',   5000.00, 'Pago único al inicio del ciclo',    true),
  ('Reinscripción',         'reinscripcion', 3500.00, 'Renovación para el próximo ciclo',  true),
  ('Uniforme Escolar',      'uniforme',      3200.00, 'Uniforme completo',                 true),
  ('Libros y Útiles',       'libros',        2500.00, 'Kit de libros y materiales',        true),
  ('Materiales Didácticos', 'materiales',     800.00, 'Materiales mensuales',              true),
  ('Actividades Extra',     'actividades',   1200.00, 'Actividades extracurriculares',     true),
  ('Excursión',             'excursiones',   3500.00, 'Salida pedagógica',                 true),
  ('Comedor',               'comedor',       2000.00, 'Servicio de alimentación mensual',  true),
  ('Transporte',            'transporte',    1500.00, 'Servicio de ruta escolar',          true),
  ('Otro',                  'otros',            0.00, 'Monto variable',                    true)
) AS v(name, category, amount, description, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_concepts LIMIT 1);

INSERT INTO public.school_settings (id, school_name, due_day, generation_day)
VALUES (1, 'Colegio Montessori Sonrisas Creativas', 5, 25)
ON CONFLICT (id) DO NOTHING;

UPDATE public.school_settings
SET city = COALESCE(city, 'San Cristóbal'),
    state = COALESCE(state, 'Rep. Dom.'),
    zip_code = COALESCE(zip_code, '91000'),
    country = COALESCE(country, 'República Dominicana')
WHERE id = 1;

INSERT INTO public.school_years(name, start_date, end_date, status, is_current)
VALUES('2026-2027', '2026-08-01', '2027-06-30', 'active', true)
ON CONFLICT(name) DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-12:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-12:00', 'Plan C (Mensual)', 24622.50, '11 pagos mensuales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-15:00', 'Plan A (Anual)', 139356.00, 'Pago anual completo'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-15:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-15:00', 'Plan C (Mensual)', 29032.50, '11 pagos mensuales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-17:00', 'Plan A (Anual)', 169585.50, 'Pago anual completo'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-17:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-17:00', 'Plan C (Mensual)', 26497.80, '11 pagos mensuales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-13:30', 'Plan A (Anual)', 132294.75, 'Pago anual completo'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-13:30', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-13:30', 'Plan C (Mensual)', 27561.45, '11 pagos mensuales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-15:00', 'Plan A (Anual)', 139356.00, 'Pago anual completo'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-15:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-15:00', 'Plan C (Mensual)', 30000.00, '11 pagos mensuales'
FROM (SELECT id FROM public.school_years WHERE name = '2026-2027' LIMIT 1) sy
ON CONFLICT DO NOTHING;


-- #################################################################
-- BLOQUE CONSOLIDADO DESDE los antiguos sql/11-30
-- (integrado el 2026-10-19; idempotente y re-ejecutable)
-- #################################################################
-- ================================================================
-- SECCIÓN 10 — LIMPIEZA FINAL DE AULAS             [original 20 > 15]
-- ================================================================
-- Reemplaza al bloque de limpieza de 15_CANONICAL_CLASSROOMS_SYNC.sql
-- (que usaba LIKE '%parvalo%' y podía reasignar estudiantes al aula
-- equivocada). Aquí el match con el catálogo es ESTRICTO: igualdad
-- exacta tras normalizar, NUNCA LIKE '%patron%'.
-- Orden corregido respecto al 15: PRIMERO se upertea el catálogo
-- oficial (para que exista la fila a la que fusionar) y DESPUÉS se
-- fusiona/renombra; el 15 al revés.
-- Se puede re-ejecutar varias veces sin provocar daños.

BEGIN;

-- ----------------------------------------------------------------
-- 0a. Columnas de seguridad
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='classrooms' AND column_name='level'
  ) THEN
    ALTER TABLE public.classrooms ADD COLUMN level text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='classrooms' AND column_name='is_special'
  ) THEN
    ALTER TABLE public.classrooms ADD COLUMN is_special boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='classrooms' AND column_name='deleted_at'
  ) THEN
    ALTER TABLE public.classrooms ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 0b. Helper _repoint_classroom(p_old, p_new): mueve TODAS las filas
--     que referencian el aula vieja hacia la nueva. Descubre en
--     runtime todas las columnas con FK a classrooms(id) (students,
--     student_enrollments, attendance, tasks, periods, posts, grades,
--     report_cards, …) → nada queda huérfano al fusionar. Si una tabla
--     tiene clave única que chocaría, esa fila se omite y se avisa.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._repoint_classroom(p_old bigint, p_new bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  fk  RECORD;
  r   RECORD;
  cur REFCURSOR;
  n   int := 0;
BEGIN
  IF p_old IS NULL OR p_new IS NULL OR p_old = p_new THEN
    RETURN;
  END IF;
  FOR fk IN
    SELECT a.attrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.classrooms'::regclass
     ORDER BY a.attrelid::regclass::text, a.attname
  LOOP
    OPEN cur FOR EXECUTE
      format('SELECT ctid FROM %s WHERE %I = $1 FOR UPDATE', fk.tbl, fk.col)
      USING p_old;
    LOOP
      FETCH cur INTO r;
      EXIT WHEN NOT FOUND;
      BEGIN
        EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', fk.tbl, fk.col)
          USING p_new, r.ctid;
        n := n + 1;
      EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE '  %: fila con clave única duplicada en destino → NO movida', fk.tbl;
      END;
    END LOOP;
    CLOSE cur;
  END LOOP;
  IF n > 0 THEN
    RAISE NOTICE '  % fila(s) re-apuntadas de aula id=% → id=% (todas las tablas con FK)', n, p_old, p_new;
  END IF;
END;
$$;

-- ----------------------------------------------------------------
-- 0c. Dedupe de nombres EXACTOS activos (conservar la de menor id)
-- ----------------------------------------------------------------
DO $$
DECLARE
  dup RECORD;
  keep bigint;
  d bigint;
BEGIN
  FOR dup IN
    SELECT name, MIN(id) AS keep_id, ARRAY_AGG(id ORDER BY id) AS ids
    FROM public.classrooms
    WHERE deleted_at IS NULL AND name IS NOT NULL
    GROUP BY name
    HAVING COUNT(*) > 1
  LOOP
    keep := dup.keep_id;
    FOREACH d IN ARRAY dup.ids LOOP
      IF d <> keep THEN
        PERFORM public._repoint_classroom(d, keep);
      END IF;
    END LOOP;
    UPDATE public.classrooms
       SET deleted_at = now()
     WHERE id = ANY(dup.ids) AND id <> keep AND deleted_at IS NULL;
    RAISE NOTICE 'DEDUPE EXACTO: % activas llamadas "%" → se conserva la id %',
      array_length(dup.ids, 1), dup.name, keep;
  END LOOP;
END $$;

-- ----------------------------------------------------------------
-- 0d. Índice único parcial (requerido por los ON CONFLICT de abajo)
-- ----------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_classrooms_name_active
  ON public.classrooms(name)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------
-- 1. Diagnóstico inicial (NOTICE)
-- ----------------------------------------------------------------
DO $$
DECLARE
  n int;
  r RECORD;
BEGIN
  RAISE NOTICE '================ DIAGNÓSTICO INICIAL ================';

  SELECT COUNT(*) INTO n FROM public.classrooms WHERE deleted_at IS NULL;
  RAISE NOTICE 'Aulas activas: %', n;

  RAISE NOTICE '-- Activas SUCIAS (sufijo variante/duplicado o "parvalo"):';
  FOR r IN
    SELECT id, name, level, teacher_id
    FROM public.classrooms
    WHERE deleted_at IS NULL
      AND (
        name ~* '\((variante|duplicado|duplicada|copia|fusion|fusión)'
        OR name ~* 'parvalo'
        OR COALESCE(level,'') ~* '\((variante|duplicado|duplicada|copia|fusion|fusión)'
        OR COALESCE(level,'') ~* 'parvalo'
      )
    ORDER BY id
  LOOP
    RAISE NOTICE '  id=% name=% level=% teacher=%', r.id, r.name, COALESCE(r.level,'<null>'), COALESCE(r.teacher_id::text,'<sin>');
  END LOOP;

  RAISE NOTICE '-- Activas con name <> level (regulares mal sincronizadas):';
  FOR r IN
    SELECT id, name, level FROM public.classrooms
    WHERE deleted_at IS NULL
      AND COALESCE(is_special, false) = false
      AND COALESCE(level,'') <> name
    ORDER BY id
  LOOP
    RAISE NOTICE '  id=% name=% level=%', r.id, r.name, COALESCE(r.level,'<null>');
  END LOOP;

  SELECT COUNT(*) INTO n
  FROM public.students s JOIN public.classrooms c ON c.id = s.classroom_id
  WHERE c.deleted_at IS NOT NULL;
  RAISE NOTICE 'Estudiantes apuntando a aulas BORRADAS: %', n;

  SELECT COUNT(*) INTO n
  FROM public.classrooms WHERE deleted_at IS NOT NULL AND teacher_id IS NOT NULL;
  RAISE NOTICE 'Aulas borradas que AÚN tienen maestra: %', n;

  SELECT COUNT(*) INTO n FROM public.classrooms WHERE deleted_at IS NOT NULL;
  RAISE NOTICE 'Aulas borradas (histórico): %', n;
  RAISE NOTICE '======================================================';
END $$;

-- ----------------------------------------------------------------
-- 2. Upsert de las 18 AULAS OFICIALES (PRIMERO, para poder fusionar)
--    12 regulares: name = level (sin "Línea [Color]"; eso es metadata
--    visual de constants.js, no parte del nombre).
-- ----------------------------------------------------------------
INSERT INTO public.classrooms (name, level, capacity, is_special, created_at) VALUES
  ('Párvulos I',    'Párvulos I',    15, false, now()),
  ('Párvulos II',   'Párvulos II',   15, false, now()),
  ('Párvulos III',  'Párvulos III',  15, false, now()),
  ('Pre-Kínder',    'Pre-Kínder',    18, false, now()),
  ('Kínder',        'Kínder',        20, false, now()),
  ('Pre-Primario',  'Pre-Primario',  22, false, now()),
  ('1° Primero',    '1° Primero',    25, false, now()),
  ('2° Segundo',    '2° Segundo',    25, false, now()),
  ('3° Tercero',    '3° Tercero',    25, false, now()),
  ('4° Cuarto',     '4° Cuarto',     25, false, now()),
  ('5° Quinto',     '5° Quinto',     25, false, now()),
  ('6° Sexto',      '6° Sexto',      25, false, now()),
  ('Campamento de Verano', 'Verano',             20, true, now()),
  ('Inglés Afterschool',   'Inglés Afterschool', 25, true, now()),
  ('Ballet y Danza',       'Ballet / Danza',     20, true, now()),
  ('Taekwondo',            'Taekwondo',          20, true, now()),
  ('Sala de Tarea',        'Sala de Tarea',      25, true, now()),
  ('Cuido Infantil',       'Cuido',              20, true, now())
ON CONFLICT (name) WHERE deleted_at IS NULL DO UPDATE
  SET level      = EXCLUDED.level,
      is_special = EXCLUDED.is_special
  WHERE public.classrooms.level      IS DISTINCT FROM EXCLUDED.level
     OR COALESCE(public.classrooms.is_special,false) IS DISTINCT FROM COALESCE(EXCLUDED.is_special,false);
-- Nota: capacity NO se toca en filas existentes (el docente pudo
-- ajustarlo a mano); solo se usa el default al INSERTAR una nueva.

-- ----------------------------------------------------------------
-- 3. Helpers: normalización ESTRICTA
-- ----------------------------------------------------------------

-- 3a) _aula_strip_suffix: quita el sufijo sucio "(variante…)"/
--     "(duplicado #…)" conservando caja y tildes ORIGINALES.
CREATE OR REPLACE FUNCTION public._aula_strip_suffix(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(btrim(regexp_replace(COALESCE(t, ''),
    '\s*[\(\[]?\s*(variante|duplicado|duplicada|dup|copia|fusion|fusión)\b[^\)\]]*\)?\s*$',
    '', 'i')), '');
$$;

-- 3b) _aula_norm: minúsculas → quita sufijo sucio → quita
--     tildes/ñ/grados/guiones y "/" (→ espacio) → colapsa espacios.
CREATE OR REPLACE FUNCTION public._aula_norm(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(btrim(
    regexp_replace(
      translate(
        public._aula_strip_suffix(lower(COALESCE(t, ''))),
        'áéíóúñäëïöüàèìòùâêîôûãõ–—−-°ºª/',
        'aeiounaeiouaeiouaeiouao        '),
      '\s+', ' ', 'g')
  ), '');
$$;

-- 3c) _aula_catalog: devuelve (nombre_oficial, nivel_oficial,
--     es_especial) si — y SOLO SI — el texto normalizado es IGUAL a
--     una entrada del catálogo.
CREATE OR REPLACE FUNCTION public._aula_catalog(p text)
RETURNS TABLE (official_name text, official_level text, is_special_aula boolean)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH n AS (SELECT public._aula_norm(p) AS v),
  cat(norm, oname, olevel, sp) AS (
    VALUES
      ('parvulos i',     'Párvulos I',    'Párvulos I',    false),
      ('parvulos ii',    'Párvulos II',   'Párvulos II',   false),
      ('parvulos iii',   'Párvulos III',  'Párvulos III',  false),
      ('pre kinder',     'Pre-Kínder',    'Pre-Kínder',    false),
      ('kinder',         'Kínder',        'Kínder',        false),
      ('pre primario',   'Pre-Primario',  'Pre-Primario',  false),
      ('1 primero',      '1° Primero',    '1° Primero',    false),
      ('2 segundo',      '2° Segundo',    '2° Segundo',    false),
      ('3 tercero',      '3° Tercero',    '3° Tercero',    false),
      ('4 cuarto',       '4° Cuarto',     '4° Cuarto',     false),
      ('5 quinto',       '5° Quinto',     '5° Quinto',     false),
      ('6 sexto',        '6° Sexto',      '6° Sexto',      false),
      ('campamento de verano', 'Campamento de Verano', 'Verano',             true),
      ('campamento',           'Campamento de Verano', 'Verano',             true),
      ('verano',               'Campamento de Verano', 'Verano',             true),
      ('ingles afterschool',   'Inglés Afterschool',   'Inglés Afterschool', true),
      ('ingles',               'Inglés Afterschool',   'Inglés Afterschool', true),
      ('ballet y danza',       'Ballet y Danza',       'Ballet / Danza',     true),
      ('ballet danza',         'Ballet y Danza',       'Ballet / Danza',     true),
      ('ballet',               'Ballet y Danza',       'Ballet / Danza',     true),
      ('taekwondo',            'Taekwondo',            'Taekwondo',          true),
      ('sala de tarea',        'Sala de Tarea',        'Sala de Tarea',      true),
      ('tarea',                'Sala de Tarea',        'Sala de Tarea',      true),
      ('cuido infantil',       'Cuido Infantil',       'Cuido',              true),
      ('cuido',                'Cuido Infantil',       'Cuido',              true),
      ('parvalo i',    'Párvulos I',    'Párvulos I',    false),
      ('parvalo 1',    'Párvulos I',    'Párvulos I',    false),
      ('parvulo i',    'Párvulos I',    'Párvulos I',    false),
      ('parvulo 1',    'Párvulos I',    'Párvulos I',    false),
      ('maternal i',   'Párvulos I',    'Párvulos I',    false),
      ('maternal 1',   'Párvulos I',    'Párvulos I',    false),
      ('manternal',    'Párvulos I',    'Párvulos I',    false),
      ('parvalo ii',   'Párvulos II',   'Párvulos II',   false),
      ('parvalo 2',    'Párvulos II',   'Párvulos II',   false),
      ('parvulo ii',   'Párvulos II',   'Párvulos II',   false),
      ('parvulo 2',    'Párvulos II',   'Párvulos II',   false),
      ('maternal ii',  'Párvulos II',   'Párvulos II',   false),
      ('maternal 2',   'Párvulos II',   'Párvulos II',   false),
      ('parvalo iii',  'Párvulos III',  'Párvulos III',  false),
      ('parvalo 3',    'Párvulos III',  'Párvulos III',  false),
      ('parvulo iii',  'Párvulos III',  'Párvulos III',  false),
      ('parvulo 3',    'Párvulos III',  'Párvulos III',  false),
      ('maternal iii', 'Párvulos III',  'Párvulos III',  false),
      ('maternal 3',   'Párvulos III',  'Párvulos III',  false),
      ('parrulos i',   'Párvulos I',    'Párvulos I',    false),
      ('parrulos ii',  'Párvulos II',   'Párvulos II',   false),
      ('parrulos iii', 'Párvulos III',  'Párvulos III',  false),
      ('parvullos i',  'Párvulos I',    'Párvulos I',    false),
      ('parvullos ii', 'Párvulos II',   'Párvulos II',   false),
      ('parvullos iii','Párvulos III',  'Párvulos III',  false),
      ('prekinder',          'Pre-Kínder',   'Pre-Kínder',   false),
      ('pre kinder blanca',  'Pre-Kínder',   'Pre-Kínder',   false),
      ('prekinder blanca',   'Pre-Kínder',   'Pre-Kínder',   false),
      ('kinder gris',        'Kínder',       'Kínder',       false),
      ('kinder 1',           'Kínder',       'Kínder',       false),
      ('kinder general',     'Kínder',       'Kínder',       false),
      ('pre primario',       'Pre-Primario', 'Pre-Primario', false),
      ('preprimario',        'Pre-Primario', 'Pre-Primario', false),
      ('pre primario negra', 'Pre-Primario', 'Pre-Primario', false),
      ('preprimario negra',  'Pre-Primario', 'Pre-Primario', false),
      ('pre primaria',       'Pre-Primario', 'Pre-Primario', false),
      ('preprimaria',        'Pre-Primario', 'Pre-Primario', false),
      ('1ro',            '1° Primero', '1° Primero', false),
      ('1ro linea roja', '1° Primero', '1° Primero', false),
      ('1ro primero',    '1° Primero', '1° Primero', false),
      ('1ro roja',       '1° Primero', '1° Primero', false),
      ('1 roja',         '1° Primero', '1° Primero', false),
      ('1 primaria',     '1° Primero', '1° Primero', false),
      ('1 primer ano',   '1° Primero', '1° Primero', false),
      ('primero',        '1° Primero', '1° Primero', false),
      ('1 grado',        '1° Primero', '1° Primero', false),
      ('1 primario',     '1° Primero', '1° Primero', false),
      ('2do',             '2° Segundo', '2° Segundo', false),
      ('2do linea amarilla', '2° Segundo', '2° Segundo', false),
      ('2do segundo',     '2° Segundo', '2° Segundo', false),
      ('2do amarilla',    '2° Segundo', '2° Segundo', false),
      ('2 amarilla',      '2° Segundo', '2° Segundo', false),
      ('2 primaria',      '2° Segundo', '2° Segundo', false),
      ('segundo',         '2° Segundo', '2° Segundo', false),
      ('2 grado',         '2° Segundo', '2° Segundo', false),
      ('2 primario',      '2° Segundo', '2° Segundo', false),
      ('3ro',             '3° Tercero', '3° Tercero', false),
      ('3ro linea azul',  '3° Tercero', '3° Tercero', false),
      ('3ro tercero',     '3° Tercero', '3° Tercero', false),
      ('3ro azul',        '3° Tercero', '3° Tercero', false),
      ('3 azul',          '3° Tercero', '3° Tercero', false),
      ('3 primaria',      '3° Tercero', '3° Tercero', false),
      ('tercero',         '3° Tercero', '3° Tercero', false),
      ('3 grado',         '3° Tercero', '3° Tercero', false),
      ('3 primario',      '3° Tercero', '3° Tercero', false),
      ('4to',             '4° Cuarto',  '4° Cuarto',  false),
      ('4to linea verde', '4° Cuarto',  '4° Cuarto',  false),
      ('4to cuarto',      '4° Cuarto',  '4° Cuarto',  false),
      ('4to verde',       '4° Cuarto',  '4° Cuarto',  false),
      ('4 verde',         '4° Cuarto',  '4° Cuarto',  false),
      ('4 primaria',      '4° Cuarto',  '4° Cuarto',  false),
      ('cuarto',          '4° Cuarto',  '4° Cuarto',  false),
      ('4 grado',         '4° Cuarto',  '4° Cuarto',  false),
      ('4 primario',      '4° Cuarto',  '4° Cuarto',  false),
      ('5to',             '5° Quinto',  '5° Quinto',  false),
      ('5to linea naranja','5° Quinto', '5° Quinto',  false),
      ('5to quinto',      '5° Quinto',  '5° Quinto',  false),
      ('5to naranja',     '5° Quinto',  '5° Quinto',  false),
      ('5 naranja',       '5° Quinto',  '5° Quinto',  false),
      ('5 primaria',      '5° Quinto',  '5° Quinto',  false),
      ('quinto',          '5° Quinto',  '5° Quinto',  false),
      ('5 grado',         '5° Quinto',  '5° Quinto',  false),
      ('5 primario',      '5° Quinto',  '5° Quinto',  false),
      ('6to',             '6° Sexto',   '6° Sexto',   false),
      ('6to linea morado','6° Sexto',   '6° Sexto',   false),
      ('6to sexto',       '6° Sexto',   '6° Sexto',   false),
      ('6to morado',      '6° Sexto',   '6° Sexto',   false),
      ('6 morado',        '6° Sexto',   '6° Sexto',   false),
      ('6 primaria',      '6° Sexto',   '6° Sexto',   false),
      ('sexto',           '6° Sexto',   '6° Sexto',   false),
      ('6 grado',         '6° Sexto',   '6° Sexto',   false),
      ('6 primario',      '6° Sexto',   '6° Sexto',   false),
      ('6to purpura',     '6° Sexto',   '6° Sexto',   false),
      ('6to morada',      '6° Sexto',   '6° Sexto',   false)
  )
  SELECT cat.oname, cat.olevel, cat.sp
  FROM n, cat
  WHERE n.v IS NOT NULL
    AND cat.norm = n.v
  LIMIT 1;
$$;

-- 3d) _aula_canon: versión ESCALAR (segura para usar en WHERE).
CREATE OR REPLACE FUNCTION public._aula_canon(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT c.official_name
  FROM public._aula_catalog(p) c
  LIMIT 1;
$$;

-- ================================================================
-- 4) FUSIÓN / RENOMBRE de activas sucias → oficial
--     * Si YA existe una activa con el nombre oficial → fusionar
--       (estudiantes + maestra + tablas relacionadas van a la oficial;
--        la sucia se soft-deleta)
--     * Si NO existe → renombrar la sucia a la oficial
--     * Sin match estricto → NO se toca (se reporta en el paso final)
-- ================================================================
DO $$
DECLARE
  v RECORD;
  canon text;
  canon_lvl text;
  sp boolean;
  occupant bigint;
  stripped text;
BEGIN
  RAISE NOTICE '================ PASO 4: FUSIÓN/RENOMBRE ================';
  FOR v IN
    SELECT id, name, level, teacher_id, is_special
    FROM public.classrooms
    WHERE deleted_at IS NULL
    ORDER BY id
  LOOP
    SELECT c.official_name, c.official_level, c.is_special_aula
      INTO canon, canon_lvl, sp
      FROM public._aula_catalog(v.name) c;
    IF canon IS NULL THEN
      SELECT c.official_name, c.official_level, c.is_special_aula
        INTO canon, canon_lvl, sp
        FROM public._aula_catalog(v.level) c;
    END IF;

    -- Sin match estricto: es un aula "custom" (no del catálogo).
    -- Solo quitamos el sufijo sucio si lo trae (conservando caja y
    -- tildes originales); NO la renombramos a minúsculas ni adivinamos
    -- nivel.
    IF canon IS NULL THEN
      stripped := public._aula_strip_suffix(v.name);
      IF stripped IS NOT NULL AND stripped IS DISTINCT FROM v.name THEN
        SELECT id INTO occupant FROM public.classrooms
         WHERE name = stripped AND deleted_at IS NULL;
        IF occupant IS NULL THEN
          UPDATE public.classrooms
             SET name = stripped
           WHERE id = v.id;
          RAISE NOTICE '  id=% → nombre limpio "%"', v.id, stripped;
        END IF;
      END IF;
      CONTINUE;
    END IF;

    SELECT id INTO occupant FROM public.classrooms
     WHERE name = canon AND deleted_at IS NULL;

    IF occupant IS NULL THEN
      -- Nadie tiene el nombre oficial: renombrar esta fila a la oficial
      UPDATE public.classrooms
         SET name = canon,
             level = canon_lvl,
             is_special = sp
       WHERE id = v.id;
      RAISE NOTICE '  RENOMBRE: id=% "%" → "%" (nivel "%")', v.id, v.name, canon, canon_lvl;
    ELSIF occupant <> v.id THEN
      -- La oficial ya existe: fusionar v.id → occupant (los estudiantes
      -- y la maestra van A la oficial, nunca al revés)
      RAISE NOTICE '  FUSIÓN: id=% "%" → id=% "%"', v.id, v.name, occupant, canon;

      -- Mueve estudiantes, matrículas, asistencias, tareas, periodos,
      -- publicaciones… (TODA tabla con FK a classrooms)
      PERFORM public._repoint_classroom(v.id, occupant);

      IF v.teacher_id IS NOT NULL THEN
        UPDATE public.classrooms
           SET teacher_id = v.teacher_id
         WHERE id = occupant AND teacher_id IS NULL;
        IF NOT FOUND THEN
          RAISE NOTICE '  MAESTRA HUÉRFANA: % (aula borrada id=% no pudo ceder su maestra: la oficial id=% ya tiene una)',
            v.teacher_id, v.id, occupant;
        END IF;
      END IF;

      UPDATE public.classrooms
         SET deleted_at = now()
       WHERE id = v.id AND deleted_at IS NULL;
    ELSE
      -- Esta fila YA es la oficial: solo alinear level/is_special
      UPDATE public.classrooms
         SET level = canon_lvl,
             is_special = sp
       WHERE id = v.id
         AND (level IS DISTINCT FROM canon_lvl
              OR COALESCE(is_special,false) IS DISTINCT FROM COALESCE(sp,false));
    END IF;
  END LOOP;
END $$;

-- ================================================================
-- 5) RE-APUNTAR estudiantes (y todas las tablas con FK: asistencias,
--     tareas, periodos, …) que siguen en aulas borradas
--     Match ESTRICTO por catálogo; si no hay correspondencia se DEJAN
--     donde están y se reporta (el 15 los reasignaba al azar con
--     LIKE '%%' — eso ya no ocurre).
-- ================================================================
DO $$
DECLARE
  v RECORD;
  canon text;
  tgt bigint;
  moved int;
  pend int := 0;
BEGIN
  RAISE NOTICE '============= PASO 5: RE-APUNTE DE ESTUDIANTES =============';
  FOR v IN
    SELECT DISTINCT c.id AS cid, c.name AS cname, c.level AS clevel
    FROM public.students s
    JOIN public.classrooms c ON c.id = s.classroom_id
    WHERE c.deleted_at IS NOT NULL
  LOOP
    SELECT co.official_name INTO canon
      FROM public._aula_catalog(v.cname) co;
    IF canon IS NULL THEN
      SELECT co.official_name INTO canon
        FROM public._aula_catalog(v.clevel) co;
    END IF;

    tgt := NULL;
    IF canon IS NOT NULL THEN
      SELECT id INTO tgt FROM public.classrooms
       WHERE name = canon AND deleted_at IS NULL;
    END IF;

    IF tgt IS NULL THEN
      pend := pend + 1;
      RAISE NOTICE '  PENDIENTE: aula borrada id=% "%" → SIN correspondencia estricta; estudiantes NO se mueven',
        v.cid, v.cname;
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO moved
      FROM public.students WHERE classroom_id = v.cid;
    PERFORM public._repoint_classroom(v.cid, tgt);
    RAISE NOTICE '  id=% "%" → id=% "%": % estudiante(s) reasignados (y tablas relacionadas)',
      v.cid, v.cname, tgt, canon, moved;
  END LOOP;
  RAISE NOTICE 'Re-apunte: % aula(s) borrada(s) sin correspondencia (dejadas intactas)', pend;
END $$;

-- ================================================================
-- 6) RESTAURAR maestra: si una oficial quedó SIN maestra y sus
--     variantes borradas tenían una → devolvérsela (la más reciente).
-- ================================================================
DO $$
DECLARE
  a RECORD;
  tid uuid;
  cnt int;
  acanon text;
BEGIN
  RAISE NOTICE '=============== PASO 6: RESTAURAR MAESTRAS ===============';
  FOR a IN
    SELECT id, name, level FROM public.classrooms
    WHERE deleted_at IS NULL AND teacher_id IS NULL
  LOOP
    acanon := COALESCE(public._aula_canon(a.name), public._aula_canon(a.level));
    CONTINUE WHEN acanon IS NULL;

    SELECT COUNT(DISTINCT d.teacher_id) INTO cnt
      FROM public.classrooms d
     WHERE d.deleted_at IS NOT NULL
       AND d.teacher_id IS NOT NULL
       AND COALESCE(public._aula_canon(d.name), public._aula_canon(d.level)) = acanon;

    IF COALESCE(cnt, 0) > 0 THEN
      SELECT d.teacher_id INTO tid
        FROM public.classrooms d
       WHERE d.deleted_at IS NOT NULL
         AND d.teacher_id IS NOT NULL
         AND COALESCE(public._aula_canon(d.name), public._aula_canon(d.level)) = acanon
       ORDER BY d.deleted_at DESC, d.id DESC
       LIMIT 1;

      IF tid IS NOT NULL THEN
        UPDATE public.classrooms SET teacher_id = tid WHERE id = a.id AND teacher_id IS NULL;
        IF cnt > 1 THEN
          RAISE NOTICE '  VARIAS maestras candidatas para "%" (id=%): se tomó la más reciente (%)', a.name, a.id, tid;
        ELSE
          RAISE NOTICE '  Maestra % restaurada en aula "%" (id=%)', tid, a.name, a.id;
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ================================================================
-- 7) TOMBSTONE: TODA fila borrada pasa a llamarse con su nombre
--     canónico oficial (sufijos "(variante…)" / "(duplicado#)" fuera).
--     El índice único es parcial (WHERE deleted_at IS NULL) → no choca.
-- ================================================================
DO $$
DECLARE
  d RECORD;
  canon text;
  newname text;
BEGIN
  RAISE NOTICE '================== PASO 7: TOMBSTONES ==================';
  FOR d IN
    SELECT id, name, level FROM public.classrooms
    WHERE deleted_at IS NOT NULL
    ORDER BY id
  LOOP
    SELECT co.official_name INTO canon FROM public._aula_catalog(d.name) co;
    IF canon IS NULL THEN
      SELECT co.official_name INTO canon FROM public._aula_catalog(d.level) co;
    END IF;

    IF canon IS NOT NULL THEN
      newname := canon;
    ELSIF public._aula_strip_suffix(d.name) IS NOT NULL THEN
      -- Custom con sufijo sucio: se lo quitamos conservando la caja
      newname := public._aula_strip_suffix(d.name);
    ELSE
      newname := d.name;
    END IF;

    IF newname IS DISTINCT FROM d.name THEN
      RAISE NOTICE '  borrada id=%: "%" → "%"', d.id, d.name, newname;
      UPDATE public.classrooms SET name = newname WHERE id = d.id;
    END IF;
  END LOOP;
END $$;

-- ================================================================
-- 8) level = name en activas REGULARES (las especiales conservan su
--     clave corta de nivel: 'Verano', 'Ballet / Danza', 'Cuido'…,
--     que es como la usan la admisión y validateAgeForClassroom)
-- ================================================================
UPDATE public.classrooms
   SET level = name
 WHERE deleted_at IS NULL
   AND COALESCE(is_special, false) = false
   AND (level IS NULL OR level <> name);

-- ================================================================
-- 8b) resumen pre-commit
-- ================================================================
DO $$
DECLARE n int; s int;
BEGIN
  SELECT COUNT(*) INTO n FROM public.classrooms WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO s FROM public.classrooms
   WHERE deleted_at IS NULL
     AND COALESCE(is_special, false) = false
     AND (level IS NULL OR level <> name);
  RAISE NOTICE '================ RESUMEN ================';
  RAISE NOTICE 'Aulas activas: % (esperado: 18 = 12 regulares + 6 especiales; si hay aulas personalizadas, 18 + esas)', n;
  RAISE NOTICE 'Regulares con level <> name: % (esperado: 0)', s;
END $$;

COMMIT;

-- ================================================================
--  VERIFICACIÓN FINAL DE AULAS (ejecutar ya con el COMMIT hecho)
-- ================================================================

-- 1) Debe devolver 18 (12 regulares + 6 especiales; + aulas
--    personalizadas si el plantel las tiene)
SELECT COUNT(*) AS aulas_activas_esperado_18
FROM public.classrooms
WHERE deleted_at IS NULL;

-- 2) Listado completo de activas con su docente y estudiantes
SELECT c.id, c.name, c.level, c.capacity, c.is_special,
       p.name AS maestra,
       (SELECT COUNT(*) FROM public.students s
         WHERE s.classroom_id = c.id) AS estudiantes
FROM public.classrooms c
LEFT JOIN public.profiles p ON p.id = c.teacher_id
WHERE c.deleted_at IS NULL
ORDER BY c.is_special, c.id;

-- 3) Debe devolver 0 filas: activas con nombre sucio
--    (sufijo variante/duplicado/fusión o "parvalo").
--    Si aparece un "parvalo" SUETO (sin I/II/III): es ambiguo entre
--    niveles, el script NO lo adivina → renombrarlo a mano en la UI.
SELECT id, name, level
FROM public.classrooms
WHERE deleted_at IS NULL
  AND (
    name ~* '\((variante|duplicado|duplicada|copia|fusion|fusión)'
    OR name ~* 'parvalo'
    OR COALESCE(level,'') ~* '\((variante|duplicado|duplicada|copia|fusion|fusión)'
    OR COALESCE(level,'') ~* 'parvalo'
  );

-- 4) Debe devolver 0 filas: activas con level <> name (regulares)
SELECT id, name, level
FROM public.classrooms
WHERE deleted_at IS NULL
  AND COALESCE(is_special, false) = false
  AND COALESCE(level, '') <> name;

-- 5) Estudiantes aún en aulas borradas (esperado: 0;
--    si >0 son los "PENDIENTES" de NOTICE sin correspondencia estricta)
SELECT s.id, s.name AS estudiante, c.id AS aula_borrada_id, c.name AS aula_borrada
FROM public.students s
JOIN public.classrooms c ON c.id = s.classroom_id
WHERE c.deleted_at IS NOT NULL
ORDER BY c.id, s.name;

-- 6) Maestras huérfanas: dan clase (o daban) pero no en aula activa
SELECT p.id, p.name AS maestra,
       (SELECT COUNT(*) FROM public.classrooms d
         WHERE d.teacher_id = p.id AND d.deleted_at IS NOT NULL) AS aulas_borradas
FROM public.profiles p
WHERE p.role = 'maestra'
  AND NOT EXISTS (
    SELECT 1 FROM public.classrooms a
     WHERE a.teacher_id = p.id AND a.deleted_at IS NULL
  )
ORDER BY p.name;

-- 7) Aulas activas todavía sin maestra (pendientes de asignar en UI)
SELECT id, name, level
FROM public.classrooms
WHERE deleted_at IS NULL AND teacher_id IS NULL
ORDER BY is_special, id;

-- Notas de la limpieza de aulas:
--  * Si el paso 5 reporta "PENDIENTES", esos estudiantes quedaron en
--    su aula original (sin mover) y hay que reasignarlos a mano desde
--    el panel: nunca se reasignan al azar.
--  * Los NOTICE de arriba listan cada renombre/fusión realizada:
--    copiar esa salida y pegarla en el ticket como evidencia.
--  * Si un NOTICE dice "clave única duplicada en destino → NO movida",
--    esa fila (p.ej. un horario de la aula vieja) chocó con una ya
--    existente en la nueva: revisarla a mano.
--  * Este consolidado es seguro de re-ejecutar: el segundo pase no
--    encontrará nada que cambiar y los NOTICE quedarán vacíos.

-- ================================================================
-- SECCIÓN 11 — BACKFILLS                        [originales 26 y 30]
-- ================================================================

-- ----------------------------------------------------------------
-- 11a. Backfill año escolar                 [original 26_backfill]
--      `student_preregistrations.school_year_id` y
--      `payments.school_year_id` se agregaron después y los flujos
--      antiguos nunca los escribían → el dashboard filtraba por ese id
--      y devolvía siempre 0 ingresos / 0 pendientes.
--      IDEMPOTENTE: solo toca filas donde el id es NULL.
-- ----------------------------------------------------------------

-- Preinscripciones: cruzar por nombre de año escolar
UPDATE public.student_preregistrations pr
   SET school_year_id = sy.id
  FROM public.school_years sy
 WHERE pr.school_year_id IS NULL
   AND nullif(btrim(pr.school_year_requested), '') IS NOT NULL
   AND btrim(pr.school_year_requested) = btrim(sy.name);

-- Pagos: asignar al año escolar cuyo rango contiene la fecha del cobro
-- (se usa due_date, y en su defecto paid_date o created_at)
UPDATE public.payments p
   SET school_year_id = sy.id
  FROM public.school_years sy
 WHERE p.school_year_id IS NULL
   AND p.deleted_at IS NULL
   AND COALESCE(p.due_date, p.paid_date::date, p.created_at::date)
         BETWEEN sy.start_date AND sy.end_date;

-- Pagos sin fecha utilizable que corresponden al año vigente
UPDATE public.payments p
   SET school_year_id = sy.id
  FROM public.school_years sy
 WHERE p.school_year_id IS NULL
   AND sy.is_current = true
   AND COALESCE(p.due_date, p.paid_date::date, p.created_at::date) IS NULL;

-- Comprobaciones (26):
SELECT count(*) AS preregs_sin_anio
  FROM public.student_preregistrations
 WHERE status = 'pending'
   AND school_year_id IS NULL
   AND COALESCE(btrim(school_year_requested), '') <> ''
   AND btrim(school_year_requested) IN (SELECT btrim(name) FROM public.school_years);

-- Resumen por año escolar:
SELECT sy.name,
       count(DISTINCT pr.id) AS preinscripciones,
       count(DISTINCT p.id)  AS pagos
  FROM public.school_years sy
  LEFT JOIN public.student_preregistrations pr ON pr.school_year_id = sy.id
  LEFT JOIN public.payments p ON p.school_year_id = sy.id AND p.deleted_at IS NULL
 GROUP BY sy.name, sy.start_date
 ORDER BY sy.start_date DESC;

-- ----------------------------------------------------------------
-- 11b. Semilla del boletín (sólo §2-3 del 30; el §1 de lectura
--      abierta eval_* está cubierto por la SECCIÓN 7 / 27, que es
--      más completa: eval_competencies/eval_formulas/eval_scores…)
--      Crea evaluación + áreas + período + módulos + actividades por
--      defecto si faltan. El modal "Asignar Nueva Tarea" de la
--      maestra mostraba "— Sin áreas configuradas —" porque nadie
--      había creado la evaluación.
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_year_id   bigint;
  v_creator   uuid;
  v_eval_id   bigint;
  v_period_id bigint;
  v_module_id bigint;
  v_area      record;
  v_count     int;
  v_i         int;
BEGIN
  -- año escolar (actual si existe, si no el primero)
  SELECT id INTO v_year_id FROM public.school_years
   WHERE is_current = true AND deleted_at IS NULL ORDER BY id LIMIT 1;
  IF v_year_id IS NULL THEN
    SELECT id INTO v_year_id FROM public.school_years
     WHERE deleted_at IS NULL ORDER BY id LIMIT 1;
  END IF;

  -- creador preferente
  SELECT id INTO v_creator FROM public.profiles
   WHERE role IN ('directora','maestra','admin') AND is_active = true
   ORDER BY created_at LIMIT 1;

  -- evaluación existente
  SELECT id INTO v_eval_id FROM public.eval_evaluations
   WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1;

  IF v_eval_id IS NULL THEN
    INSERT INTO public.eval_evaluations (school_year_id, name, level, status, created_by)
    VALUES (v_year_id, 'Boletín General', NULL, 'active', v_creator)
    RETURNING id INTO v_eval_id;
    RAISE NOTICE 'Evaluación creada: id=%', v_eval_id;
  ELSE
    RAISE NOTICE 'Evaluación existente: id=%', v_eval_id;
  END IF;

  -- áreas por defecto
  SELECT count(*) INTO v_count FROM public.eval_areas
   WHERE evaluation_id = v_eval_id AND deleted_at IS NULL;
  IF v_count = 0 THEN
    INSERT INTO public.eval_areas (evaluation_id, name, description, color, icon, sort_order, created_by) VALUES
      (v_eval_id,'Lenguaje','Comunicación, lenguaje y lectoescritura.','#0EA5E9','message-circle',1,v_creator),
      (v_eval_id,'Matemática','Pensamiento lógico, conteo y nociones.','#6366F1','calculator',2,v_creator),
      (v_eval_id,'Motricidad','Desarrollo motor fino y grueso.','#F97316','activity',3,v_creator),
      (v_eval_id,'Socioemocional','Emociones, convivencia y autonomía.','#F43F5E','heart',4,v_creator),
      (v_eval_id,'Ciencias','Exploración del entorno y la naturaleza.','#22C55E','leaf',5,v_creator);
    RAISE NOTICE 'Áreas por defecto creadas.';
  END IF;

  -- período por defecto
  SELECT id INTO v_period_id FROM public.eval_periods
   WHERE evaluation_id = v_eval_id AND deleted_at IS NULL ORDER BY sort_order LIMIT 1;
  IF v_period_id IS NULL THEN
    INSERT INTO public.eval_periods (evaluation_id, name, period_type, weight, status, sort_order, created_by)
    VALUES (v_eval_id, 'Período 1', 'periodo', 100, 'open', 1, v_creator)
    RETURNING id INTO v_period_id;
  END IF;

  -- módulo por área + 5 actividades por módulo
  FOR v_area IN SELECT id FROM public.eval_areas WHERE evaluation_id = v_eval_id AND deleted_at IS NULL LOOP
    SELECT id INTO v_module_id FROM public.eval_modules
     WHERE area_id = v_area.id AND deleted_at IS NULL ORDER BY sort_order LIMIT 1;
    IF v_module_id IS NULL THEN
      INSERT INTO public.eval_modules (period_id, area_id, name, eval_type, weight, sort_order, created_by)
      VALUES (v_period_id, v_area.id, 'Módulo', 'numeric', 100, 1, v_creator)
      RETURNING id INTO v_module_id;
    END IF;

    SELECT count(*) INTO v_count FROM public.eval_activities
     WHERE module_id = v_module_id AND deleted_at IS NULL;
    IF v_count = 0 THEN
      FOR v_i IN 1..5 LOOP
        INSERT INTO public.eval_activities (module_id, name, sort_order, created_by)
        VALUES (v_module_id, 'Actividad ' || v_i, v_i, v_creator);
      END LOOP;
    END IF;
  END LOOP;

  RAISE NOTICE 'BOLETIN LISTO. evaluation_id=% areas=% periodos/modulos/actividades verificados.',
    v_eval_id,
    (SELECT count(*) FROM public.eval_areas WHERE evaluation_id = v_eval_id AND deleted_at IS NULL);
END $$;

-- Verificación del boletín (una tabla)
SELECT line FROM (
  SELECT 1 AS ord, 'evaluaciones=' || (SELECT count(*)::text FROM public.eval_evaluations WHERE deleted_at IS NULL) AS line
  UNION ALL SELECT 2, 'areas='        || (SELECT count(*)::text FROM public.eval_areas        WHERE deleted_at IS NULL)
  UNION ALL SELECT 3, 'periodos='     || (SELECT count(*)::text FROM public.eval_periods      WHERE deleted_at IS NULL)
  UNION ALL SELECT 4, 'modulos='      || (SELECT count(*)::text FROM public.eval_modules      WHERE deleted_at IS NULL)
  UNION ALL SELECT 5, 'actividades='  || (SELECT count(*)::text FROM public.eval_activities   WHERE deleted_at IS NULL)
) q
ORDER BY ord;
