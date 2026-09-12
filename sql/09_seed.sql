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
