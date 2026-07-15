-- ============================================================
-- Script de création / migration de la table missions YoTech
-- Version 2 : acompte, paiement final, lien transactions finance
-- ============================================================

CREATE TABLE IF NOT EXISTS missions (
  id SERIAL PRIMARY KEY,

  -- Informations de base
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  client_name  VARCHAR(255) NOT NULL,
  client_contact VARCHAR(255),
  client_email VARCHAR(100),
  client_phone VARCHAR(30),

  -- Statut & avancement
  status VARCHAR(30) NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'en_cours', 'en_pause', 'terminee', 'annulee')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Priorité
  priority VARCHAR(20) NOT NULL DEFAULT 'normale'
    CHECK (priority IN ('basse', 'normale', 'haute', 'urgente')),

  -- Dates
  start_date DATE,
  end_date   DATE,
  deadline   DATE,

  -- Finance — montant total
  budget       DECIMAL(15, 2) DEFAULT 0,
  currency     VARCHAR(3)     DEFAULT 'MGA',

  -- Acompte (dépôt initial)
  acompte_percent  DECIMAL(5, 2)  DEFAULT 30,   -- pourcentage de l'acompte (ex: 30 %)
  acompte_amount   DECIMAL(15, 2) DEFAULT 0,    -- montant calculé de l'acompte
  acompte_paid     BOOLEAN        DEFAULT FALSE, -- acompte déjà versé ?
  acompte_date     DATE,                        -- date du versement
  acompte_finance_id INTEGER,                   -- lien vers la transaction finances

  -- Paiement final (solde)
  final_amount     DECIMAL(15, 2) DEFAULT 0,    -- budget - acompte_amount
  final_paid       BOOLEAN        DEFAULT FALSE,
  final_date       DATE,
  final_finance_id INTEGER,                     -- lien vers la transaction finances

  -- Tags / Catégorie
  category VARCHAR(100),
  tags     TEXT[],

  -- Notes internes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_missions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS missions_updated_at_trigger ON missions;
CREATE TRIGGER missions_updated_at_trigger
  BEFORE UPDATE ON missions
  FOR EACH ROW EXECUTE FUNCTION update_missions_updated_at();

-- ─── Migration si la table existe déjà ─────────────────────────────────────
ALTER TABLE missions DROP COLUMN IF EXISTS freelancer_id;
ALTER TABLE missions DROP COLUMN IF EXISTS amount_paid;

ALTER TABLE missions ADD COLUMN IF NOT EXISTS acompte_percent   DECIMAL(5,2)  DEFAULT 30;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS acompte_amount    DECIMAL(15,2) DEFAULT 0;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS acompte_paid      BOOLEAN       DEFAULT FALSE;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS acompte_date      DATE;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS acompte_finance_id INTEGER;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS final_amount      DECIMAL(15,2) DEFAULT 0;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS final_paid        BOOLEAN       DEFAULT FALSE;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS final_date        DATE;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS final_finance_id  INTEGER;

-- Table des mises à jour / jalons de mission
CREATE TABLE IF NOT EXISTS mission_updates (
  id               SERIAL PRIMARY KEY,
  mission_id       INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  author           VARCHAR(100) DEFAULT 'Admin',
  title            VARCHAR(255) NOT NULL,
  content          TEXT,
  progress_snapshot INTEGER,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX IF NOT EXISTS idx_missions_status     ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_priority   ON missions(priority);
CREATE INDEX IF NOT EXISTS idx_mission_updates_mid ON mission_updates(mission_id);
