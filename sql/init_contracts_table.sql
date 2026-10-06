-- Contrats de prestation YoTech
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  contract_number VARCHAR(50) UNIQUE,
  template_id VARCHAR(80) NOT NULL DEFAULT 'prestation_services',
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  quote_id INTEGER,
  client_name VARCHAR(255),
  client_type VARCHAR(20) DEFAULT 'particulier',
  client_address TEXT,
  client_nif VARCHAR(20),
  client_stat VARCHAR(20),
  client_email VARCHAR(100),
  client_phone VARCHAR(20),
  start_date DATE,
  end_date DATE,
  amount DECIMAL(15, 2) DEFAULT 0,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'MGA',
  category VARCHAR(100),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);
