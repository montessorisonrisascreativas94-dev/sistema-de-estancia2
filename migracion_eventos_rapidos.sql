-- ======================================================
-- SCHEMA DE EVENTOS ULTRA-RÁPIDOS KARPUS KIDS
-- ======================================================

-- Tipos de Eventos (los botones)
CREATE TYPE IF NOT EXISTS event_type AS ENUM (
  'desayuno',
  'merienda',
  'almuerzo',
  'biberon',
  'dormir',
  'despertar',
  'panal',
  'bano',
  'temperatura',
  'medicamento',
  'foto',
  'nota'
);

-- Tipos de Panal
CREATE TYPE IF NOT EXISTS diaper_type AS ENUM (
  'liquido',
  'solido',
  'ambos'
);

-- ======================================================
-- TABLA DE EVENTOS PRINCIPAL
-- ======================================================
CREATE TABLE IF NOT EXISTS classroom_events (
  id BIGSERIAL PRIMARY KEY,
  classroom_id BIGINT NOT NULL REFERENCES classrooms(id),
  teacher_id UUID NOT NULL REFERENCES auth.users(id),
  event_type event_type NOT NULL,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_classroom_events_classroom ON classroom_events(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_events_date ON classroom_events(event_date);
CREATE INDEX IF NOT EXISTS idx_classroom_events_type ON classroom_events(event_type);

-- ======================================================
-- TABLA DE PARTICIPANTES EN EVENTOS
-- ======================================================
CREATE TABLE IF NOT EXISTS event_participants (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES classroom_events(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id),
  status VARCHAR(50) NOT NULL DEFAULT 'present', -- present, absent, exception
  notes TEXT,
  extra_data JSONB, -- para detalles específicos: temp, oz, panal tipo, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_student ON event_participants(student_id);

-- ======================================================
-- TABLA DE RUTINAS POR AULA (Favoritos)
-- ======================================================
CREATE TABLE IF NOT EXISTS classroom_routines (
  id SERIAL PRIMARY KEY,
  classroom_id BIGINT NOT NULL REFERENCES classrooms(id),
  event_type event_type NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  is_favorite BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================================================
-- TABLA DE SUEÑOS ABIERTOS/CERRADOS
-- ======================================================
CREATE TABLE IF NOT EXISTS nap_sessions (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  classroom_id BIGINT NOT NULL REFERENCES classrooms(id),
  teacher_id UUID NOT NULL REFERENCES auth.users(id),
  nap_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nap_end TIMESTAMPTZ,
  duration_minutes INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nap_sessions_student ON nap_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_nap_sessions_open ON nap_sessions(nap_end) WHERE nap_end IS NULL;

-- ======================================================
-- FUNCIÓN: ACTUALIZAR HORA DE EVENTO AL CREAR (MANTENER PRECISIÓN DE SERVIDOR)
-- ======================================================
CREATE OR REPLACE FUNCTION set_event_time()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.event_time := NOW();
  RETURN NEW;
END;
$$;

-- Trigger para actualizar hora automáticamente
DROP TRIGGER IF EXISTS trigger_set_event_time ON classroom_events;
CREATE TRIGGER trigger_set_event_time
  BEFORE INSERT ON classroom_events
  FOR EACH ROW
  EXECUTE FUNCTION set_event_time();

-- ======================================================
-- FUNCIÓN: CALCULAR DURACIÓN DE SUEÑO AL CERRARLO
-- ======================================================
CREATE OR REPLACE FUNCTION calculate_nap_duration()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nap_end IS NOT NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.nap_end - NEW.nap_start)) / 60;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_calculate_nap_duration ON nap_sessions;
CREATE TRIGGER trigger_calculate_nap_duration
  BEFORE UPDATE OF nap_end ON nap_sessions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_nap_duration();

-- ======================================================
-- VISTA: RUTINA DEL DÍA POR AULA (LINEA DE TIEMPO)
-- ======================================================
CREATE OR REPLACE VIEW daily_routine AS
WITH routine_times AS (
  SELECT
    'desayuno' AS event_type, '08:00' AS ideal_time, '🍞' AS emoji, 'Desayuno' AS title, 'Desayuno' AS subtitle UNION ALL
  SELECT
    'merienda' AS event_type, '10:00' AS ideal_time, '🍎' AS emoji, 'Merienda' AS title, 'Merienda' AS subtitle UNION ALL
  SELECT
    'dormir' AS event_type, '10:30' AS ideal_time, '😴' AS emoji, 'Siesta' AS title, 'Hora de dormir' AS subtitle UNION ALL
  SELECT
    'despertar' AS event_type, '12:00' AS ideal_time, '😊' AS emoji, 'Despertar' AS title, 'Despertó' AS subtitle UNION ALL
  SELECT
    'almuerzo' AS event_type, '12:30' AS ideal_time, '🥗' AS emoji, 'Almuerzo' AS title, 'Almuerzo' AS subtitle UNION ALL
  SELECT
    'biberon' AS event_type, '14:00' AS ideal_time, '🍼' AS emoji, 'Biberón' AS title, 'Biberón' AS subtitle UNION ALL
  SELECT
    'panal' AS event_type, '10:15' AS ideal_time, '🚼' AS emoji, 'Pañal' AS title, 'Cambio de pañal' AS subtitle UNION ALL
  SELECT
    'bano' AS event_type, '09:00' AS ideal_time, '🚽' AS emoji, 'Baño' AS title, 'Baño' AS subtitle UNION ALL
  SELECT
    'temperatura' AS event_type, '07:45' AS ideal_time, '🌡' AS emoji, 'Temperatura' AS title, 'Tomar temperatura' AS subtitle UNION ALL
  SELECT
    'medicamento' AS event_type, NULL AS ideal_time, '💊' AS emoji, 'Medicamento' AS title, 'Medicamento' AS subtitle UNION ALL
  SELECT
    'foto' AS event_type, NULL AS ideal_time, '📷' AS emoji, 'Foto' AS title, 'Foto' AS subtitle UNION ALL
  SELECT
    'nota' AS event_type, NULL AS ideal_time, '📝' AS emoji, 'Nota' AS title, 'Nota' AS subtitle
)
SELECT * FROM routine_times;
