import { query } from '../config/db.js';

let associatesReady = false;

export const ensureAssociatesTable = async () => {
  if (associatesReady) return;

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin'`);
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

  associatesReady = true;
};

const mapRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    shares: Number(row.shares) || 0,
    username: row.username || null,
    display_name: row.display_name || null,
    user_email: row.user_email || null,
    user_role: row.user_role || null
  };
};

export const AssociateModel = {
  getAll: async () => {
    await ensureAssociatesTable();
    const result = await query(`
      SELECT a.*, u.username, u.display_name, u.email AS user_email, u.role AS user_role
      FROM company_associates a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.status = 'active'
      ORDER BY a.name ASC
    `);
    return result.rows.map(mapRow);
  },

  getById: async (id) => {
    await ensureAssociatesTable();
    const result = await query(`
      SELECT a.*, u.username, u.display_name, u.email AS user_email, u.role AS user_role
      FROM company_associates a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.id = $1
    `, [id]);
    return mapRow(result.rows[0]);
  },

  findByUserId: async (userId) => {
    await ensureAssociatesTable();
    const result = await query(
      `SELECT * FROM company_associates WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId]
    );
    return mapRow(result.rows[0]);
  },

  create: async ({ user_id, name, email, shares }) => {
    await ensureAssociatesTable();
    const result = await query(
      `INSERT INTO company_associates (user_id, name, email, shares, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING *`,
      [user_id || null, name.trim(), email || null, Number(shares) || 0]
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
       WHERE id = $1 AND status = 'active' RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }
};
