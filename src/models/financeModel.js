import { query } from '../config/db.js';

export const FinanceModel = {
  getStats: async () => {
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

  getRecentTransactions: async (limit = 10) => {
    const sql = `
      SELECT * FROM finances
      ORDER BY date_transaction DESC
      LIMIT $1
    `;
    const result = await query(sql, [limit]);
    return result.rows;
  },

  addTransaction: async (data) => {
    const { label, amount, type, date } = data;
    const sql = `
      INSERT INTO finances (label_transaction, amount, type_transaction, date_transaction)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await query(sql, [label, amount, type, date || new Date()]);
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
  }
};
