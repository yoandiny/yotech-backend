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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    // Migration: Ajout de fmfp si déjà existant sans cette colonne
    await query('ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS fmfp DECIMAL(15, 2) DEFAULT 0');

    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

initDb();
