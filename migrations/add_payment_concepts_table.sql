
-- Create the payment_concepts table
CREATE TABLE IF NOT EXISTS payment_concepts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  amount NUMERIC(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default concepts
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
