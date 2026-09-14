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

INSERT INTO public.payment_concepts (name, category, amount, description, active)
SELECT name, category, amount, description, active FROM (VALUES
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
) AS v(name, category, amount, description, active)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_concepts LIMIT 1);

INSERT INTO public.payment_concepts (name, category, amount, description, active)
SELECT name, category, amount, description, active FROM (VALUES
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
) AS v(name, category, amount, description, active)
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
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-12:00', 'Plan C (Mensual)', 24622.50, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-15:00', 'Plan A (Anual)', 139356.00, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-15:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-15:00', 'Plan C (Mensual)', 29032.50, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-17:00', 'Plan A (Anual)', 169585.50, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-17:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Inicial', '8:00-17:00', 'Plan C (Mensual)', 26497.80, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-13:30', 'Plan A (Anual)', 132294.75, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-13:30', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-13:30', 'Plan C (Mensual)', 27561.45, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-15:00', 'Plan A (Anual)', 139356.00, 'Pago anual completo'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-15:00', 'Plan B (Semestral)', 0, 'Dos pagos semestrales'
FROM sy
ON CONFLICT DO NOTHING;

INSERT INTO public.payment_plans(school_year_id, level, schedule, name, registration_fee, description)
SELECT id, 'Primaria', '8:00-15:00', 'Plan C (Mensual)', 30000.00, '11 pagos mensuales'
FROM sy
ON CONFLICT DO NOTHING;
