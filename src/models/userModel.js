import { query } from '../config/db.js';

export const UserModel = {
  findByUsername: async (username) => {
    const sql = 'SELECT * FROM users WHERE username = $1';
    const result = await query(sql, [username]);
    return result.rows[0];
  },

  findByCasdoorUserId: async (casdoorUserId) => {
    const sql = 'SELECT * FROM users WHERE casdoor_user_id = $1';
    const result = await query(sql, [casdoorUserId]);
    return result.rows[0];
  },
  
  findById: async (id) => {
    const sql = 'SELECT * FROM users WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  upsertCasdoorUser: async (userData) => {
    const sql = `
      INSERT INTO users (
        username,
        email,
        provider,
        casdoor_user_id,
        display_name,
        avatar_url,
        password
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (casdoor_user_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        provider = EXCLUDED.provider
      RETURNING *
    `;

    const result = await query(sql, [
      userData.username,
      userData.email || null,
      userData.provider || 'casdoor',
      userData.casdoorUserId || null,
      userData.displayName || null,
      userData.avatarUrl || null,
      userData.password || null,
    ]);

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
