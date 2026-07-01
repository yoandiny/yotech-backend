-- Script de création / migration pour l'extension du module de trésorerie
-- Ajout des colonnes de facturation dans la table finances
-- Création de la table des paramètres d'entreprise

ALTER TABLE finances
  ADD COLUMN IF NOT EXISTS is_invoice BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS client_address TEXT,
  ADD COLUMN IF NOT EXISTS client_nif VARCHAR(20),
  ADD COLUMN IF NOT EXISTS client_stat VARCHAR(20),
  ADD COLUMN IF NOT EXISTS client_email VARCHAR(100),
  ADD COLUMN IF NOT EXISTS client_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_quote BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quote_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS quote_status VARCHAR(20) DEFAULT 'final',
  ADD COLUMN IF NOT EXISTS prestations_details TEXT,
  ADD COLUMN IF NOT EXISTS general_conditions TEXT,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MGA';

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  company_name VARCHAR(255),
  company_address TEXT,
  company_nif VARCHAR(20),
  company_stat VARCHAR(20),
  company_email VARCHAR(100),
  company_phone VARCHAR(20),
  tax_rate DECIMAL(5, 2) DEFAULT 20.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (company_name, company_address, company_nif, company_stat, company_email, company_phone, tax_rate)
SELECT 'Votre Entreprise', 'Adresse de l''entreprise', '', '', '', '', 20.00
WHERE NOT EXISTS (SELECT 1 FROM settings);
