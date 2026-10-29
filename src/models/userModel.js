import { query } from '../config/db.js';
import { namesFromAccount } from '../utils/legalName.js';

const ensureRoleColumn = async () => {
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS casdoor_roles TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS given_names VARCHAR(255)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS family_name VARCHAR(255)`);
  await query(`ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(255)`);
  await query(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`).catch(() => {});
  await query(`ALTER TABLE users DROP COLUMN IF EXISTS password`);
};

const saveCasdoorFields = (userData) => {
  const names = namesFromAccount({
    firstName: userData.givenNames,
    lastName: userData.familyName,
    displayName: userData.displayName,
    username: userData.username
  });
  return [
    userData.email || null,
    userData.provider || 'casdoor',
    userData.casdoorUserId || null,
    names.name || userData.displayName || userData.username || null,
    userData.avatarUrl || null,
    userData.role || 'admin',
    Array.isArray(userData.casdoorRoles) ? JSON.stringify(userData.casdoorRoles) : (userData.casdoorRoles || null),
    names.given_names || null,
    names.family_name || null
  ];
};

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
      `SELECT id, username, display_name, given_names, family_name, email, role, casdoor_roles, casdoor_user_id, provider FROM users ORDER BY username ASC`
    );
    return result.rows;
  },

  createLocalUser: async ({ username, email, display_name, role }) => {
    await ensureRoleColumn();
    const result = await query(
      `INSERT INTO users (username, email, display_name, provider, role)
       VALUES ($1, $2, $3, 'casdoor', $4)
       RETURNING id, username, email, display_name, role`,
      [username, email || null, display_name || username, role || 'associate']
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
          casdoor_roles = COALESCE($8, users.casdoor_roles),
          given_names = COALESCE($9, users.given_names),
          family_name = COALESCE($10, users.family_name)
         WHERE id = $11
         RETURNING *`,
        [username, ...saveCasdoorFields({ ...userData, username, casdoorUserId }), existing.id]
      );
      return result.rows[0];
    }

    const result = await query(
      `INSERT INTO users (
        username, email, provider, casdoor_user_id, display_name, avatar_url, role, casdoor_roles, given_names, family_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [username, ...saveCasdoorFields({ ...userData, username, casdoorUserId })]
    );
    return result.rows[0];
  },

  updateLegalName: async (id, { given_names, family_name, name } = {}) => {
    await ensureRoleColumn();
    const result = await query(
      `UPDATE users SET
        given_names = COALESCE($1, given_names),
        family_name = COALESCE($2, family_name),
        display_name = COALESCE($3, display_name)
       WHERE id = $4
       RETURNING *`,
      [given_names || null, family_name || null, name || null, id]
    );
    return result.rows[0];
  },

  updateUsername: async (id, newUsername) => {
    const sql = 'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username';
    const result = await query(sql, [newUsername, id]);
    return result.rows[0];
  },

};
