import { query } from '../config/db.js';

export const HRModel = {
  // Employees
  getEmployees: async () => {
    const result = await query('SELECT * FROM employees ORDER BY full_name ASC');
    return result.rows;
  },

  getEmployeeById: async (id) => {
    const result = await query('SELECT * FROM employees WHERE id = $1', [id]);
    return result.rows[0];
  },

  addEmployee: async (data) => {
    const { 
      full_name, email, phone, address, cin_number, cnaps_number, 
      ostie_number, contract_type, is_social_subject, children_count, 
      base_salary, job_title, hire_date, end_date 
    } = data;
    
    const sql = `
      INSERT INTO employees (
        full_name, email, phone, address, cin_number, cnaps_number, 
        ostie_number, contract_type, is_social_subject, children_count, 
        base_salary, job_title, hire_date, end_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    
    const result = await query(sql, [
      full_name, email, phone, address, cin_number, cnaps_number, 
      ostie_number, contract_type || 'CDI', is_social_subject !== undefined ? is_social_subject : true, 
      children_count || 0, base_salary || 0, job_title, hire_date || null, end_date || null
    ]);
    return result.rows[0];
  },

  updateEmployee: async (id, data) => {
    // Sanitize data
    const sanitized = { ...data };
    if (sanitized.base_salary === '' || sanitized.base_salary === undefined) sanitized.base_salary = 0;
    if (sanitized.children_count === '' || isNaN(sanitized.children_count)) sanitized.children_count = 0;
    if (sanitized.hire_date === '') sanitized.hire_date = null;
    if (sanitized.end_date === '') sanitized.end_date = null;

    // Filter out id from update fields if present
    delete sanitized.id;
    delete sanitized.created_at;

    const fields = Object.keys(sanitized);
    const values = Object.values(sanitized);
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const sql = `UPDATE employees SET ${setClause} WHERE id = $1 RETURNING *`;
    const result = await query(sql, [id, ...values]);
    return result.rows[0];
  },

  deleteEmployee: async (id) => {
    const result = await query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  // Freelancers
  getFreelancers: async () => {
    const result = await query('SELECT * FROM freelancers ORDER BY full_name ASC');
    return result.rows;
  },

  addFreelancer: async (data) => {
    const { full_name, email, phone, nif, stat, daily_rate } = data;
    const sql = `
      INSERT INTO freelancers (full_name, email, phone, nif, stat, daily_rate)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await query(sql, [full_name, email, phone, nif, stat, daily_rate || 0]);
    return result.rows[0];
  },

  updateFreelancer: async (id, data) => {
    const sanitized = { ...data };
    if (sanitized.daily_rate === '' || sanitized.daily_rate === undefined) sanitized.daily_rate = 0;
    
    // Filter out id from update fields if present
    delete sanitized.id;
    delete sanitized.created_at;

    const fields = Object.keys(sanitized);
    const values = Object.values(sanitized);
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const sql = `UPDATE freelancers SET ${setClause} WHERE id = $1 RETURNING *`;
    const result = await query(sql, [id, ...values]);
    return result.rows[0];
  },

  deleteFreelancer: async (id) => {
    const result = await query('DELETE FROM freelancers WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  // Transactions (Advances/Primes)
  addHRTransaction: async (data) => {
    const { employee_id, type, amount, description, date_transaction } = data;
    const sql = `
      INSERT INTO hr_transactions (employee_id, type, amount, description, date_transaction)
      VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE))
      RETURNING *
    `;
    const result = await query(sql, [employee_id, type, amount, description, date_transaction]);
    return result.rows[0];
  },

  getUnprocessedTransactions: async (employee_id, month, year) => {
    // This is simplified: in practice we might look for transactions in a specific month
    // But for advances/primes, we often want all unprocessed ones.
    const result = await query(
      'SELECT * FROM hr_transactions WHERE employee_id = $1 AND is_processed = FALSE',
      [employee_id]
    );
    return result.rows;
  },

  markTransactionsAsProcessed: async (transactionIds) => {
    if (!transactionIds || transactionIds.length === 0) return;
    const sql = `UPDATE hr_transactions SET is_processed = TRUE WHERE id = ANY($1)`;
    await query(sql, [transactionIds]);
  },

  getAllTransactions: async () => {
    const result = await query(`
      SELECT t.*, e.full_name 
      FROM hr_transactions t
      JOIN employees e ON t.employee_id = e.id
      ORDER BY t.created_at DESC
    `);
    return result.rows;
  },

  // Payrolls
  getPayrolls: async (month, year) => {
    let sql = 'SELECT p.*, e.full_name, e.job_title FROM payrolls p JOIN employees e ON p.employee_id = e.id';
    const params = [];
    if (month && year) {
      sql += ' WHERE p.month = $1 AND p.year = $2';
      params.push(month, year);
    }
    sql += ' ORDER BY p.created_at DESC';
    const result = await query(sql, params);
    return result.rows;
  },

  addPayroll: async (data) => {
    const { 
      employee_id, month, year, base_salary, primes_total, 
      cnaps_worker, cnaps_employer, ostie_worker, ostie_employer, 
      irsa, advances_deduction, fmfp, net_to_pay, total_employer_cost 
    } = data;
    
    const sql = `
      INSERT INTO payrolls (
        employee_id, month, year, base_salary, primes_total, 
        cnaps_worker, cnaps_employer, ostie_worker, ostie_employer, 
        irsa, advances_deduction, fmfp, net_to_pay, total_employer_cost
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (employee_id, month, year) 
      DO UPDATE SET 
        base_salary = EXCLUDED.base_salary,
        primes_total = EXCLUDED.primes_total,
        cnaps_worker = EXCLUDED.cnaps_worker,
        cnaps_employer = EXCLUDED.cnaps_employer,
        ostie_worker = EXCLUDED.ostie_worker,
        ostie_employer = EXCLUDED.ostie_employer,
        irsa = EXCLUDED.irsa,
        advances_deduction = EXCLUDED.advances_deduction,
        fmfp = EXCLUDED.fmfp,
        net_to_pay = EXCLUDED.net_to_pay,
        total_employer_cost = EXCLUDED.total_employer_cost
      RETURNING *
    `;
    
    const result = await query(sql, [
      employee_id, month, year, base_salary, primes_total, 
      cnaps_worker, cnaps_employer, ostie_worker, ostie_employer, 
      irsa, advances_deduction, fmfp, net_to_pay, total_employer_cost
    ]);
    return result.rows[0];
  }
};
