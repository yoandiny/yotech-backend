-- Assemblées générales YoTech — préparation mise en société
CREATE TABLE IF NOT EXISTS general_assemblies (
  id SERIAL PRIMARY KEY,
  assembly_number VARCHAR(50) UNIQUE,
  assembly_type VARCHAR(30) NOT NULL DEFAULT 'ago',
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  held_on DATE,
  location TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assemblies_status ON general_assemblies(status);
CREATE INDEX IF NOT EXISTS idx_assemblies_type ON general_assemblies(assembly_type);
