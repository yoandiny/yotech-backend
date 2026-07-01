import { query } from '../config/db.js';

export const UserModel = {
  findByUsername: async (username) => {
    const sql = 'SELECT * FROM users WHERE username = $1';
    const result = await query(sql, [username]);
    return result.rows[0];
  },
  
  findById: async (id) => {
    const sql = 'SELECT * FROM users WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  updateUsername: async (id, newUsername) => {
    const sql = 'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username';
    const result = await query(sql, [newUsername, id]);
    return result.rows[0];
  },

  updatePassword: async (id, newHashedPassword) => {
    const sql = 'UPDATE users SET password = $1 WHERE id = $2';
    await query(sql, [newHashedPassword, id]);
    return true;
  }
};
