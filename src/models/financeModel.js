import { query } from '../config/db.js';

const ensureQuotesTableExists = async () => {
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
};

export const FinanceModel = {
  getStats: async (year, startDate, endDate) => {
    let sql = `
      SELECT 
        SUM(CASE WHEN type_transaction = 'revenu' AND is_quote = FALSE THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type_transaction = 'dépense' AND is_quote = FALSE THEN amount ELSE 0 END) as total_expenses,
        SUM(CASE WHEN type_transaction = 'revenu' AND is_quote = FALSE THEN amount WHEN type_transaction = 'dépense' AND is_quote = FALSE THEN -amount ELSE 0 END) as net_profit
      FROM finances
    `;
    const params = [];
    let whereClause = [];

    if (year) {
      params.push(year);
      whereClause.push(`EXTRACT(YEAR FROM date_transaction) = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      whereClause.push(`date_transaction >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      whereClause.push(`date_transaction <= $${params.length}`);
    }

    if (whereClause.length > 0) {
      sql += ` WHERE ` + whereClause.join(' AND ');
    }

    const result = await query(sql, params);
    return result.rows[0];
  },

  getOverallStats: async () => {
    const sql = `
      SELECT 
        SUM(CASE WHEN type_transaction = 'revenu' AND is_quote = FALSE THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type_transaction = 'dépense' AND is_quote = FALSE THEN amount ELSE 0 END) as total_expenses,
        SUM(CASE WHEN type_transaction = 'revenu' AND is_quote = FALSE THEN amount WHEN type_transaction = 'dépense' AND is_quote = FALSE THEN -amount ELSE 0 END) as net_profit
      FROM finances
    `;
    const result = await query(sql);
    return result.rows[0];
  },

  getChartData: async (days = 30) => {
    const sql = `
      SELECT 
        date_trunc('day', date_transaction) as date,
        SUM(CASE WHEN type_transaction = 'revenu' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type_transaction = 'dépense' THEN amount ELSE 0 END) as expense
      FROM finances
      WHERE is_quote = FALSE AND date_transaction >= NOW() - INTERVAL '${days} days'
      GROUP BY date
      ORDER BY date ASC
    `;
    const result = await query(sql);
    return result.rows;
  },

  getRecentTransactions: async (limit = 10, year) => {
    let sql = `SELECT * FROM finances WHERE is_quote = FALSE`;
    const params = [limit];
    
    if (year) {
      sql += ` AND EXTRACT(YEAR FROM date_transaction) = $2`;
      params.push(year);
    }
    
    sql += ` ORDER BY date_transaction DESC LIMIT $1`;
    const result = await query(sql, params);
    return result.rows;
  },

  getExpensesByCategory: async (year) => {
    // Ensure the category column exists
    await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);

    const currentYear = year || new Date().getFullYear();
    const sql = `
      SELECT
        COALESCE(NULLIF(TRIM(category), ''), 'Autre') AS category,
        SUM(amount) AS total
      FROM finances
      WHERE type_transaction = 'dépense'
        AND is_quote = FALSE
        AND EXTRACT(YEAR FROM date_transaction) = $1
      GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Autre')
      ORDER BY total DESC
    `;
    const result = await query(sql, [currentYear]);
    return result.rows.map(row => ({
      category: row.category,
      total: parseFloat(row.total)
    }));
  },

  addTransaction: async (data) => {
    if (data?.is_quote) {
      return FinanceModel.createQuote(data);
    }

    // Ensure the category column exists
    await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);

    const { 
      description, 
      amount, 
      type, 
      date,
      category,
      is_invoice = false,
      invoice_number,
      client_name,
      client_address,
      client_nif,
      client_stat,
      client_email,
      client_phone,
      due_date,
      tax_rate = 0,
      is_quote = false,
      quote_number,
      quote_status = 'final',
      prestations_details,
      general_conditions,
      currency = 'MGA'
    } = data;
    
    const tax_amount = (is_invoice || is_quote) ? (amount * tax_rate / 100) : 0;
    const total_amount = (is_invoice || is_quote) ? (amount + tax_amount) : amount;
    
    const sql = `
      INSERT INTO finances (
        description, amount, type_transaction, date_transaction,
        category,
        is_invoice, invoice_number, client_name, client_address, 
        client_nif, client_stat, client_email, client_phone, 
        due_date, tax_rate, tax_amount, total_amount,
        is_quote, quote_number, quote_status, prestations_details, general_conditions, currency
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *
    `;
    const result = await query(sql, [
      description, amount, type, date || new Date(),
      category || null,
      is_invoice, invoice_number, client_name, client_address,
      client_nif, client_stat, client_email, client_phone,
      due_date || null, tax_rate, tax_amount, total_amount,
      is_quote, quote_number, quote_status, prestations_details, general_conditions, currency
    ]);
    return result.rows[0];
  },

  updateTransaction: async (id, data) => {
    if (data?.is_quote) {
      return FinanceModel.updateQuote(id, data);
    }

    // Ensure the category column exists
    await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);

    const { 
      description, 
      amount, 
      type, 
      date,
      category,
      is_invoice = false,
      invoice_number,
      client_name,
      client_address,
      client_nif,
      client_stat,
      client_email,
      client_phone,
      due_date,
      tax_rate = 0,
      is_quote = false,
      quote_number,
      quote_status = 'final',
      prestations_details,
      general_conditions,
      currency = 'MGA'
    } = data;

    const parsedAmount = parseFloat(amount) || 0;
    const parsedTaxRate = parseFloat(tax_rate) || 0;
    const tax_amount = (is_invoice || is_quote) ? (parsedAmount * parsedTaxRate / 100) : 0;
    const total_amount = (is_invoice || is_quote) ? (parsedAmount + tax_amount) : parsedAmount;

    const sql = `
      UPDATE finances SET
        description = $1,
        amount = $2,
        type_transaction = $3,
        date_transaction = $4,
        category = $5,
        is_invoice = $6,
        invoice_number = $7,
        client_name = $8,
        client_address = $9,
        client_nif = $10,
        client_stat = $11,
        client_email = $12,
        client_phone = $13,
        due_date = $14,
        tax_rate = $15,
        tax_amount = $16,
        total_amount = $17,
        is_quote = $18,
        quote_number = $19,
        quote_status = $20,
        prestations_details = $21,
        general_conditions = $22,
        currency = $23
      WHERE id = $24
      RETURNING *
    `;
    const result = await query(sql, [
      description, parsedAmount, type, date || new Date(),
      category || null,
      is_invoice, invoice_number, client_name, client_address,
      client_nif, client_stat, client_email, client_phone,
      due_date || null, parsedTaxRate, tax_amount, total_amount,
      is_quote, quote_number, quote_status, prestations_details, general_conditions, currency,
      id
    ]);
    return result.rows[0];
  },

  delete: async (id) => {
    const result = await query('DELETE FROM finances WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  getGoal: async (year) => {
    const result = await query('SELECT * FROM financial_goals WHERE year = $1', [year]);
    return result.rows[0];
  },

  setGoal: async (year, goal_amount) => {
    const sql = `
      INSERT INTO financial_goals (year, goal_amount)
      VALUES ($1, $2)
      ON CONFLICT (year) DO UPDATE SET goal_amount = EXCLUDED.goal_amount
      RETURNING *
    `;
    const result = await query(sql, [year, goal_amount]);
    return result.rows[0];
  },

  getHistory: async (month, year) => {
    await ensureQuotesTableExists();

    const params = [];
    let financeSql = `SELECT * FROM finances WHERE is_quote = FALSE`;
    let whereClause = [];

    if (month) {
      params.push(month);
      whereClause.push(`EXTRACT(MONTH FROM date_transaction) = $${params.length}`);
    }
    if (year) {
      params.push(year);
      whereClause.push(`EXTRACT(YEAR FROM date_transaction) = $${params.length}`);
    }

    if (whereClause.length > 0) {
      financeSql += ` AND ` + whereClause.join(' AND ');
    }

    financeSql += ` ORDER BY date_transaction DESC`;

    const [financeResult, quoteResult] = await Promise.all([
      query(financeSql, params),
      query(`SELECT * FROM quotes ${whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : ''} ORDER BY date_transaction DESC`, params)
    ]);

    const quotes = quoteResult.rows.map((row) => ({ ...row, is_quote: true, id_transaction: row.id }));
    const transactions = financeResult.rows.map((row) => ({ ...row, is_quote: false, id_transaction: row.id }));

    return [...transactions, ...quotes].sort((a, b) => new Date(b.date_transaction) - new Date(a.date_transaction));
  },

  getSettings: async () => {
    const result = await query('SELECT * FROM settings LIMIT 1');
    return result.rows[0];
  },

  updateSettings: async (data) => {
    const { 
      company_name, 
      company_address, 
      company_nif, 
      company_stat, 
      company_email, 
      company_phone, 
      tax_rate 
    } = data;
    
    const sql = `
      UPDATE settings SET 
        company_name = $1,
        company_address = $2,
        company_nif = $3,
        company_stat = $4,
        company_email = $5,
        company_phone = $6,
        tax_rate = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM settings LIMIT 1)
      RETURNING *
    `;
    const result = await query(sql, [
      company_name, company_address, company_nif, company_stat, 
      company_email, company_phone, tax_rate
    ]);
    return result.rows[0];
  },

  generateInvoiceNumber: async () => {
    const currentYear = new Date().getFullYear();
    const result = await query(`
      SELECT COUNT(*) as count FROM finances 
      WHERE is_invoice = true AND EXTRACT(YEAR FROM date_transaction) = $1
    `, [currentYear]);
    const count = parseInt(result.rows[0].count) + 1;
    return `INV-${currentYear}-${count.toString().padStart(4, '0')}`;
  },

  generateQuoteNumber: async () => {
    await ensureQuotesTableExists();
    const currentYear = new Date().getFullYear();
    const result = await query(`
      SELECT COUNT(*) as count FROM quotes 
      WHERE EXTRACT(YEAR FROM date_transaction) = $1
    `, [currentYear]);
    const count = parseInt(result.rows[0].count) + 1;
    return `DEV-${currentYear}-${count.toString().padStart(4, '0')}`;
  },

  getTransactionById: async (id) => {
    const result = await query('SELECT * FROM finances WHERE id = $1', [id]);
    return result.rows[0];
  },

  getQuoteById: async (id) => {
    await ensureQuotesTableExists();
    const result = await query('SELECT * FROM quotes WHERE id = $1', [id]);
    return result.rows[0];
  },

  getQuoteByNumber: async (quoteNumber) => {
    await ensureQuotesTableExists();
    const result = await query('SELECT * FROM quotes WHERE quote_number = $1', [quoteNumber]);
    return result.rows[0];
  },

  createQuote: async (data) => {
    await ensureQuotesTableExists();

    const { 
      description,
      amount,
      type = 'revenu',
      date,
      client_name,
      client_type = 'particulier',
      client_address,
      client_nif,
      client_stat,
      client_email,
      client_phone,
      due_date,
      tax_rate = 0,
      quote_number,
      quote_status = 'final',
      prestations_details,
      general_conditions,
      currency = 'MGA'
    } = data;

    const parsedAmount = parseFloat(amount) || 0;
    const parsedTaxRate = parseFloat(tax_rate) || 0;
    const tax_amount = parsedAmount * parsedTaxRate / 100;
    const total_amount = parsedAmount + tax_amount;

    const sql = `
      INSERT INTO quotes (
        description, amount, type_transaction, date_transaction,
        client_name, client_type, client_address, client_nif, client_stat,
        client_email, client_phone, due_date, tax_rate, tax_amount, total_amount,
        quote_number, quote_status, prestations_details, general_conditions, currency
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const result = await query(sql, [
      description, parsedAmount, type, date || new Date(),
      client_name, client_type, client_address, client_nif || null, client_stat || null,
      client_email, client_phone, due_date || null, parsedTaxRate, tax_amount, total_amount,
      quote_number, quote_status, prestations_details, general_conditions, currency
    ]);
    return result.rows[0];
  },

  updateQuote: async (id, data) => {
    await ensureQuotesTableExists();

    const { 
      description,
      amount,
      type = 'revenu',
      date,
      client_name,
      client_type = 'particulier',
      client_address,
      client_nif,
      client_stat,
      client_email,
      client_phone,
      due_date,
      tax_rate = 0,
      quote_number,
      quote_status = 'final',
      prestations_details,
      general_conditions,
      currency = 'MGA'
    } = data;

    const parsedAmount = parseFloat(amount) || 0;
    const parsedTaxRate = parseFloat(tax_rate) || 0;
    const tax_amount = parsedAmount * parsedTaxRate / 100;
    const total_amount = parsedAmount + tax_amount;

    const sql = `
      UPDATE quotes SET
        description = $1,
        amount = $2,
        type_transaction = $3,
        date_transaction = $4,
        client_name = $5,
        client_type = $6,
        client_address = $7,
        client_nif = $8,
        client_stat = $9,
        client_email = $10,
        client_phone = $11,
        due_date = $12,
        tax_rate = $13,
        tax_amount = $14,
        total_amount = $15,
        quote_number = $16,
        quote_status = $17,
        prestations_details = $18,
        general_conditions = $19,
        currency = $20
      WHERE id = $21
      RETURNING *
    `;

    const result = await query(sql, [
      description, parsedAmount, type, date || new Date(),
      client_name, client_type, client_address, client_nif || null, client_stat || null,
      client_email, client_phone, due_date || null, parsedTaxRate, tax_amount, total_amount,
      quote_number, quote_status, prestations_details, general_conditions, currency, id
    ]);
    return result.rows[0];
  },

  migrateQuotesFromFinances: async () => {
    await ensureQuotesTableExists();

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

    return true;
  },

  invoiceTransaction: async (id, data) => {
    const {
      invoice_number,
      client_name,
      client_address,
      client_nif,
      client_stat,
      client_email,
      client_phone,
      due_date,
      tax_rate = 0
    } = data;

    const transaction = await FinanceModel.getTransactionById(id).catch(() => null);
    if (!transaction) {
      return null;
    }

    const tax_amount = parseFloat(transaction.amount) * parseFloat(tax_rate) / 100;
    const total_amount = parseFloat(transaction.amount) + tax_amount;

    const sql = `
      UPDATE finances SET
        is_invoice = TRUE,
        invoice_number = $1,
        client_name = $2,
        client_address = $3,
        client_nif = $4,
        client_stat = $5,
        client_email = $6,
        client_phone = $7,
        due_date = $8,
        tax_rate = $9,
        tax_amount = $10,
        total_amount = $11
      WHERE id = $12
      RETURNING *
    `;
    const result = await query(sql, [
      invoice_number,
      client_name,
      client_address,
      client_nif,
      client_stat,
      client_email,
      client_phone,
      due_date,
      tax_rate,
      tax_amount,
      total_amount,
      id
    ]);
    return result.rows[0];
  }
};
