import { query } from '../config/db.js';

export const TodoModel = {
  getAll: async () => {
    const sql = `SELECT * FROM todos ORDER BY id DESC`;
    const result = await query(sql);
    return result.rows;
  },

  getById: async (id) => {
    const sql = `SELECT * FROM todos WHERE id = $1`;
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  create: async (data) => {
    const { title, description, status, priority, due_date, client_name } = data;
    const sql = `
      INSERT INTO todos (title, description, status, priority, due_date, client_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await query(sql, [
      title, 
      description, 
      status || 'PENDING', 
      priority || 'MEDIUM', 
      due_date || null, 
      client_name || null
    ]);
    return result.rows[0];
  },

  update: async (id, data) => {
    const { title, description, status, priority, due_date, client_name } = data;
    const sql = `
      UPDATE todos 
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          status = COALESCE($3, status),
          priority = COALESCE($4, priority),
          due_date = COALESCE($5, due_date),
          client_name = COALESCE($6, client_name)
      WHERE id = $7
      RETURNING *
    `;
    const result = await query(sql, [
      title, 
      description, 
      status, 
      priority, 
      due_date, 
      client_name, 
      id
    ]);
    return result.rows[0];
  },

  delete: async (id) => {
    const sql = `DELETE FROM todos WHERE id = $1 RETURNING id`;
    const result = await query(sql, [id]);
    return result.rows[0];
  }
};
