ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS password;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin';
UPDATE users SET role = 'admin' WHERE role IS NULL;

CREATE TABLE IF NOT EXISTS company_associates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  shares DECIMAL(15, 4) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS company_associates_user_id_unique
  ON company_associates (user_id)
  WHERE user_id IS NOT NULL AND status = 'active';
