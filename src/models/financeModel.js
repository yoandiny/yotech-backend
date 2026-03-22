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
    const { description, amount, type, date } = data;
    const sql = `
      INSERT INTO finances (description, amount, type_transaction, date_transaction)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await query(sql, [description, amount, type, date || new Date()]);
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
  }
};
