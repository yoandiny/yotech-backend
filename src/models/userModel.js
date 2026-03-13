import { query } from '../config/db.js';

export const UserModel = {
  findByUsername: async (username) => {
    const sql = 'SELECT * FROM users WHERE username = $1';
    const result = await query(sql, [username]);
    return result.rows[0];
  }
};
