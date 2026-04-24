import { query } from '../config/db.js';

const initDb = async () => {
  try {
    console.log('Initializing database...');
    
    // Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create enum for priority if it doesn't exist
    await query(`
      DO $$ BEGIN
          CREATE TYPE priority_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH');
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create todos table
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
    
    // Create finances table if it handles generic transactions
    await query(`
      CREATE TABLE IF NOT EXISTS finances (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        type_transaction VARCHAR(20) NOT NULL, -- 'revenu', 'dépense'
        date_transaction DATE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        -- Invoice fields
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
        -- Quote fields
        is_quote BOOLEAN DEFAULT FALSE,
        quote_number VARCHAR(50),
        prestations_details TEXT,
        general_conditions TEXT,
        currency VARCHAR(3) DEFAULT 'MGA'
      )
    `);

    // Create employees table
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
        contract_type VARCHAR(10) DEFAULT 'CDI', -- 'CDI', 'CDD'
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

    // Create freelancers table
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

    // Create hr_transactions table (advances, bonuses)
    await query(`
      CREATE TABLE IF NOT EXISTS hr_transactions (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL, -- 'AVANCE', 'PRIME'
        amount DECIMAL(15, 2) NOT NULL,
        date_transaction DATE DEFAULT CURRENT_TIMESTAMP,
        description TEXT,
        is_processed BOOLEAN DEFAULT FALSE, -- Set to true once included in a payroll
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create payrolls table
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

    // Create settings table for company information
    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255),
        company_address TEXT,
        company_nif VARCHAR(20),
        company_stat VARCHAR(20),
        company_email VARCHAR(100),
        company_phone VARCHAR(20),
        tax_rate DECIMAL(5, 2) DEFAULT 20.00, -- Default TVA Madagascar
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default settings if not exists
    await query(`
      INSERT INTO settings (company_name, company_address, company_nif, company_stat, company_email, company_phone, tax_rate)
      VALUES ('Votre Entreprise', 'Adresse de l''entreprise', '', '', '', '', 20.00)
      ON CONFLICT DO NOTHING
    `);
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

initDb();
