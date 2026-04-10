import { query } from '../config/db.js';

export const FinanceModel = {
  getStats: async (year, startDate, endDate) => {
    let sql = `
      SELECT 
        SUM(CASE WHEN type_transaction = 'revenu' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type_transaction = 'dépense' THEN amount ELSE 0 END) as total_expenses,
        SUM(CASE WHEN type_transaction = 'revenu' THEN amount ELSE -amount END) as net_profit
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
        SUM(CASE WHEN type_transaction = 'revenu' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type_transaction = 'dépense' THEN amount ELSE 0 END) as total_expenses,
        SUM(CASE WHEN type_transaction = 'revenu' THEN amount ELSE -amount END) as net_profit
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
      WHERE date_transaction >= NOW() - INTERVAL '${days} days'
      GROUP BY date
      ORDER BY date ASC
    `;
    const result = await query(sql);
    return result.rows;
  },

  getRecentTransactions: async (limit = 10, year) => {
    let sql = `SELECT * FROM finances`;
    const params = [limit];
    
    if (year) {
      sql += ` WHERE EXTRACT(YEAR FROM date_transaction) = $2`;
      params.push(year);
    }
    
    sql += ` ORDER BY date_transaction DESC LIMIT $1`;
    const result = await query(sql, params);
    return result.rows;
  },

  addTransaction: async (data) => {
    const { 
      description, 
      amount, 
      type, 
      date,
      is_invoice = false,
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
    
    const tax_amount = is_invoice ? (amount * tax_rate / 100) : 0;
    const total_amount = is_invoice ? (amount + tax_amount) : amount;
    
    const sql = `
      INSERT INTO finances (
        description, amount, type_transaction, date_transaction,
        is_invoice, invoice_number, client_name, client_address, 
        client_nif, client_stat, client_email, client_phone, 
        due_date, tax_rate, tax_amount, total_amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
    const result = await query(sql, [
      description, amount, type, date || new Date(),
      is_invoice, invoice_number, client_name, client_address,
      client_nif, client_stat, client_email, client_phone,
      due_date, tax_rate, tax_amount, total_amount
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
    let sql = `SELECT * FROM finances WHERE 1=1`;
    const params = [];

    if (month) {
      params.push(month);
      sql += ` AND EXTRACT(MONTH FROM date_transaction) = $${params.length}`;
    }
    if (year) {
      params.push(year);
      sql += ` AND EXTRACT(YEAR FROM date_transaction) = $${params.length}`;
    }

    sql += ` ORDER BY date_transaction DESC`;
    const result = await query(sql, params);
    return result.rows;
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

  getTransactionById: async (id) => {
    const result = await query('SELECT * FROM finances WHERE id = $1', [id]);
    return result.rows[0];
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
