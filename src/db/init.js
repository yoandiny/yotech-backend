import { query } from '../config/db.js';

const migrateQuotesFromFinances = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      type_transaction VARCHAR(20) NOT NULL DEFAULT 'revenu',
      date_transaction DATE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      client_name VARCHAR(255),
      client_type VARCHAR(20) DEFAULT 'particulier',
      client_address TEXT,
      client_nif VARCHAR(20),
      client_stat VARCHAR(20),
      client_email VARCHAR(100),
      client_phone VARCHAR(20),
      due_date DATE,
      tax_rate DECIMAL(5, 2) DEFAULT 0,
      tax_amount DECIMAL(15, 2) DEFAULT 0,
      total_amount DECIMAL(15, 2) DEFAULT 0,
      quote_number VARCHAR(50) UNIQUE,
      quote_status VARCHAR(20) DEFAULT 'final',
      prestations_details TEXT,
      general_conditions TEXT,
      currency VARCHAR(3) DEFAULT 'MGA'
    )
  `);

  await query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) DEFAULT 'particulier'`);
  await query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_nif VARCHAR(20)`);
  await query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_stat VARCHAR(20)`);
  await query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_status VARCHAR(20) DEFAULT 'final'`);
  await query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number VARCHAR(50) UNIQUE`);
  await query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS prestations_details TEXT`);
  await query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS general_conditions TEXT`);
  await query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MGA'`);

  await query(`
    INSERT INTO quotes (
      description, amount, type_transaction, date_transaction, created_at,
      client_name, client_type, client_address, client_nif, client_stat,
      client_email, client_phone, due_date, tax_rate, tax_amount, total_amount,
      quote_number, quote_status, prestations_details, general_conditions, currency
    )
    SELECT
      description, amount, type_transaction, date_transaction, created_at,
      client_name,
      CASE
        WHEN COALESCE(client_nif, '') <> '' OR COALESCE(client_stat, '') <> '' THEN 'entreprise'
        ELSE 'particulier'
      END,
      client_address, client_nif, client_stat,
      client_email, client_phone, due_date, tax_rate, tax_amount, total_amount,
      quote_number, quote_status, prestations_details, general_conditions, currency
    FROM finances
    WHERE is_quote = TRUE
      AND (
        quote_number IS NULL OR NOT EXISTS (
          SELECT 1 FROM quotes q WHERE q.quote_number = finances.quote_number
        )
      )
  `);

  await query(`DELETE FROM finances WHERE is_quote = TRUE`);
};

export const initDb = async () => {
  try {
    console.log('Initializing database...');
    
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE,
        password VARCHAR(100),
        email VARCHAR(255),
        provider VARCHAR(50) DEFAULT 'local',
        casdoor_user_id VARCHAR(255) UNIQUE,
        display_name VARCHAR(255),
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email VARCHAR(255)
    `);

    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'local'
    `);

    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS casdoor_user_id VARCHAR(255) UNIQUE
    `);

    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)
    `);

    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_url TEXT
    `);

    await query(`
      DO $$ BEGIN
          CREATE TYPE priority_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH');
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS todos (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) NOT NULL,
          priority priority_enum NOT NULL DEFAULT 'MEDIUM',
          due_date DATE,
          client_name VARCHAR(255)
      )
    `);
    
    await query(`
      CREATE TABLE IF NOT EXISTS finances (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        type_transaction VARCHAR(20) NOT NULL,
        date_transaction DATE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_invoice BOOLEAN DEFAULT FALSE,
        invoice_number VARCHAR(50),
        client_name VARCHAR(255),
        client_address TEXT,
        client_nif VARCHAR(20),
        client_stat VARCHAR(20),
        client_email VARCHAR(100),
        client_phone VARCHAR(20),
        due_date DATE,
        tax_rate DECIMAL(5, 2) DEFAULT 0,
        tax_amount DECIMAL(15, 2) DEFAULT 0,
        total_amount DECIMAL(15, 2) DEFAULT 0,
        is_quote BOOLEAN DEFAULT FALSE,
        quote_number VARCHAR(50),
        quote_status VARCHAR(20) DEFAULT 'final',
        prestations_details TEXT,
        general_conditions TEXT,
        currency VARCHAR(3) DEFAULT 'MGA'
      )
    `);

    await query(`
      ALTER TABLE finances
      ADD COLUMN IF NOT EXISTS quote_status VARCHAR(20) DEFAULT 'final'
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        address TEXT,
        cin_number VARCHAR(20),
        cnaps_number VARCHAR(20),
        ostie_number VARCHAR(20),
        contract_type VARCHAR(10) DEFAULT 'CDI',
        is_social_subject BOOLEAN DEFAULT TRUE,
        children_count INTEGER DEFAULT 0,
        base_salary DECIMAL(15, 2) NOT NULL,
        job_title VARCHAR(100),
        hire_date DATE,
        end_date DATE,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS freelancers (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        nif VARCHAR(20),
        stat VARCHAR(20),
        daily_rate DECIMAL(15, 2),
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS hr_transactions (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        date_transaction DATE DEFAULT CURRENT_TIMESTAMP,
        description TEXT,
        is_processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS payrolls (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        base_salary DECIMAL(15, 2) NOT NULL,
        primes_total DECIMAL(15, 2) DEFAULT 0,
        cnaps_worker DECIMAL(15, 2) DEFAULT 0,
        cnaps_employer DECIMAL(15, 2) DEFAULT 0,
        ostie_worker DECIMAL(15, 2) DEFAULT 0,
        ostie_employer DECIMAL(15, 2) DEFAULT 0,
        irsa DECIMAL(15, 2) DEFAULT 0,
        advances_deduction DECIMAL(15, 2) DEFAULT 0,
        fmfp DECIMAL(15, 2) DEFAULT 0,
        net_to_pay DECIMAL(15, 2) NOT NULL,
        total_employer_cost DECIMAL(15, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, month, year)
      )
    `);

    await query(`
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
      )
    `);

    await query(`
      INSERT INTO settings (company_name, company_address, company_nif, company_stat, company_email, company_phone, tax_rate)
      VALUES ('Votre Entreprise', 'Adresse de l''entreprise', '', '', '', '', 20.00)
      ON CONFLICT DO NOTHING
    `);

    await migrateQuotesFromFinances();
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};
