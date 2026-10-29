import { query } from '../config/db.js';
import { formatLegalName } from '../utils/legalName.js';

let associatesReady = false;

export const ensureAssociatesTable = async () => {
  if (associatesReady) return;

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS given_names VARCHAR(255)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS family_name VARCHAR(255)`);
  await query(`UPDATE users SET role = 'admin' WHERE role IS NULL OR role = ''`);

  await query(`
    CREATE TABLE IF NOT EXISTS company_associates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      shares DECIMAL(15, 4) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS associate_votes (
      id SERIAL PRIMARY KEY,
      associate_id INTEGER NOT NULL REFERENCES company_associates(id) ON DELETE CASCADE,
      voter_id INTEGER NOT NULL REFERENCES company_associates(id) ON DELETE CASCADE,
      decision VARCHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (associate_id, voter_id)
    )
  `);

  associatesReady = true;
};

const mapRow = (row) => {
  if (!row) return null;
  const given_names = row.user_given_names || row.given_names || null;
  const family_name = row.user_family_name || row.family_name || null;
  const legal_name = formatLegalName({
    given_names,
    family_name,
    name: row.display_name || row.name
  });
  return {
    ...row,
    shares: Number(row.shares) || 0,
    username: row.username || null,
    display_name: row.display_name || null,
    given_names,
    family_name,
    legal_name,
    name: legal_name || row.name,
    user_email: row.user_email || null,
    user_role: row.user_role || null,
    casdoor_user_id: row.casdoor_user_id || null,
    casdoor_roles: row.casdoor_roles || null
  };
};

export const AssociateModel = {
  getAll: async ({ statuses } = {}) => {
    await ensureAssociatesTable();
    const allowed = statuses?.length ? statuses : ['active', 'pending'];
    const result = await query(`
      SELECT a.*, u.username, u.display_name, u.given_names AS user_given_names, u.family_name AS user_family_name,
             u.email AS user_email, u.role AS user_role, u.casdoor_user_id, u.casdoor_roles
      FROM company_associates a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.status = ANY($1)
      ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.name ASC
    `, [allowed]);
    return result.rows.map(mapRow);
  },

  getById: async (id) => {
    await ensureAssociatesTable();
    const result = await query(`
      SELECT a.*, u.username, u.display_name, u.given_names AS user_given_names, u.family_name AS user_family_name,
             u.email AS user_email, u.role AS user_role, u.casdoor_user_id, u.casdoor_roles
      FROM company_associates a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.id = $1
    `, [id]);
    return mapRow(result.rows[0]);
  },

  findByUserId: async (userId, { statuses } = {}) => {
    await ensureAssociatesTable();
    const allowed = statuses?.length ? statuses : ['active', 'pending'];
    const result = await query(
      `SELECT * FROM company_associates WHERE user_id = $1 AND status = ANY($2) LIMIT 1`,
      [userId, allowed]
    );
    return mapRow(result.rows[0]);
  },

  create: async ({ user_id, name, email, shares, status }) => {
    await ensureAssociatesTable();
    const result = await query(
      `INSERT INTO company_associates (user_id, name, email, shares, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id || null, name.trim(), email || null, Number(shares) || 0, status || 'pending']
    );
    return AssociateModel.getById(result.rows[0].id);
  },

  update: async (id, { user_id, name, email, shares, status }) => {
    await ensureAssociatesTable();
    const current = await AssociateModel.getById(id);
    if (!current) return null;
    const result = await query(
      `UPDATE company_associates SET
        user_id = $1,
        name = $2,
        email = $3,
        shares = $4,
        status = $5,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        user_id === undefined ? current.user_id : (user_id || null),
        name === undefined ? current.name : name.trim(),
        email === undefined ? current.email : email,
        shares === undefined ? current.shares : Number(shares) || 0,
        status || current.status,
        id
      ]
    );
    return AssociateModel.getById(result.rows[0].id);
  },

  remove: async (id) => {
    await ensureAssociatesTable();
    const result = await query(
      `UPDATE company_associates SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('active', 'pending') RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  listVotes: async (associateId) => {
    await ensureAssociatesTable();
    const result = await query(
      `SELECT v.*, a.name AS voter_name, a.shares AS voter_shares
       FROM associate_votes v
       JOIN company_associates a ON a.id = v.voter_id
       WHERE v.associate_id = $1`,
      [associateId]
    );
    return result.rows.map((row) => ({ ...row, voter_shares: Number(row.voter_shares) || 0 }));
  },

  upsertVote: async ({ associateId, voterId, decision }) => {
    await ensureAssociatesTable();
    const result = await query(
      `INSERT INTO associate_votes (associate_id, voter_id, decision)
       VALUES ($1, $2, $3)
       ON CONFLICT (associate_id, voter_id)
       DO UPDATE SET decision = EXCLUDED.decision
       RETURNING *`,
      [associateId, voterId, decision]
    );
    return result.rows[0];
  }
};
