import { query } from '../config/db.js';

const ensureRoleColumn = async () => {
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS casdoor_roles TEXT`);
  await query(`ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(255)`);
};

const saveCasdoorFields = (userData) => ([
  userData.email || null,
  userData.provider || 'casdoor',
  userData.casdoorUserId || null,
  userData.displayName || userData.username || null,
  userData.avatarUrl || null,
  userData.role || 'admin',
  Array.isArray(userData.casdoorRoles) ? JSON.stringify(userData.casdoorRoles) : (userData.casdoorRoles || null)
]);

export const UserModel = {
  findByUsername: async (username) => {
    await ensureRoleColumn();
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
    await ensureRoleColumn();
    const sql = 'SELECT * FROM users WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  listDirectory: async () => {
    await ensureRoleColumn();
    const result = await query(
      `SELECT id, username, display_name, email, role, casdoor_roles, casdoor_user_id, provider FROM users ORDER BY username ASC`
    );
    return result.rows;
  },

  createLocalUser: async ({ username, password, email, display_name, role }) => {
    await ensureRoleColumn();
    const result = await query(
      `INSERT INTO users (username, password, email, display_name, provider, role)
       VALUES ($1, $2, $3, $4, 'local', $5)
       RETURNING id, username, email, display_name, role`,
      [username, password, email || null, display_name || username, role || 'associate']
    );
    return result.rows[0];
  },

  upsertCasdoorUser: async (userData) => {
    await ensureRoleColumn();
    const username = String(userData.username || '').trim();
    if (!username) throw new Error('Nom d’utilisateur Casdoor manquant');

    const casdoorUserId = userData.casdoorUserId ? String(userData.casdoorUserId) : null;
    let existing = null;
    if (casdoorUserId) {
      const byId = await query('SELECT * FROM users WHERE casdoor_user_id = $1', [casdoorUserId]);
      existing = byId.rows[0];
    }
    if (!existing) {
      const byName = await query('SELECT * FROM users WHERE username = $1', [username]);
      existing = byName.rows[0];
    }

    if (existing) {
      const result = await query(
        `UPDATE users SET
          username = $1,
          email = $2,
          provider = $3,
          casdoor_user_id = COALESCE($4, users.casdoor_user_id),
          display_name = $5,
          avatar_url = $6,
          role = COALESCE($7, users.role),
          casdoor_roles = COALESCE($8, users.casdoor_roles)
         WHERE id = $9
         RETURNING *`,
        [username, ...saveCasdoorFields({ ...userData, username, casdoorUserId }), existing.id]
      );
      return result.rows[0];
    }

    const result = await query(
      `INSERT INTO users (
        username, email, provider, casdoor_user_id, display_name, avatar_url, role, casdoor_roles
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [username, ...saveCasdoorFields({ ...userData, username, casdoorUserId })]
    );
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
