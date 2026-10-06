import { query } from '../config/db.js';

let clientsReady = false;

export const ensureClientsTable = async () => {
  if (clientsReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      client_type VARCHAR(20) DEFAULT 'particulier',
      contact_name VARCHAR(255),
      email VARCHAR(100),
      phone VARCHAR(20),
      address TEXT,
      nif VARCHAR(20),
      stat VARCHAR(20),
      rcs VARCHAR(100),
      notes TEXT,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const tableExists = async (name) => {
    const result = await query('SELECT to_regclass($1) AS exists', [`public.${name}`]);
    return Boolean(result.rows[0]?.exists);
  };

  if (await tableExists('quotes')) {
    await query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`);
  }
  if (await tableExists('finances')) {
    await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`);
  }
  if (await tableExists('missions')) {
    await query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`);
  }

  const sources = [];
  if (await tableExists('quotes')) {
    sources.push(`
      SELECT client_name, client_type, client_email, client_phone, client_address, client_nif, client_stat
      FROM quotes
      WHERE TRIM(COALESCE(client_name, '')) <> ''
    `);
  }
  if (await tableExists('finances')) {
    sources.push(`
      SELECT
        client_name,
        CASE
          WHEN COALESCE(client_nif, '') <> '' OR COALESCE(client_stat, '') <> '' THEN 'entreprise'
          ELSE 'particulier'
        END AS client_type,
        client_email, client_phone, client_address, client_nif, client_stat
      FROM finances
      WHERE TRIM(COALESCE(client_name, '')) <> ''
        AND is_quote = FALSE
    `);
  }

  if (sources.length > 0) {
    await query(`
      INSERT INTO clients (name, client_type, email, phone, address, nif, stat)
      SELECT
        TRIM(src.client_name),
        COALESCE(MAX(src.client_type), 'particulier'),
        MAX(NULLIF(TRIM(src.client_email), '')),
        MAX(NULLIF(TRIM(src.client_phone), '')),
        MAX(NULLIF(TRIM(src.client_address), '')),
        MAX(NULLIF(TRIM(src.client_nif), '')),
        MAX(NULLIF(TRIM(src.client_stat), ''))
      FROM (${sources.join(' UNION ALL ')}) src
      WHERE NOT EXISTS (
        SELECT 1 FROM clients c
        WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(src.client_name))
      )
      GROUP BY LOWER(TRIM(src.client_name)), TRIM(src.client_name)
    `);
  }

  if (await tableExists('quotes')) {
    await query(`
      UPDATE quotes q
      SET client_id = c.id
      FROM clients c
      WHERE q.client_id IS NULL
        AND TRIM(COALESCE(q.client_name, '')) <> ''
        AND LOWER(TRIM(q.client_name)) = LOWER(TRIM(c.name))
    `);
  }

  if (await tableExists('finances')) {
    await query(`
      UPDATE finances f
      SET client_id = c.id
      FROM clients c
      WHERE f.client_id IS NULL
        AND TRIM(COALESCE(f.client_name, '')) <> ''
        AND LOWER(TRIM(f.client_name)) = LOWER(TRIM(c.name))
    `);
  }

  if (await tableExists('missions')) {
    await query(`
      UPDATE missions m
      SET client_id = c.id
      FROM clients c
      WHERE m.client_id IS NULL
        AND TRIM(COALESCE(m.client_name, '')) <> ''
        AND LOWER(TRIM(m.client_name)) = LOWER(TRIM(c.name))
    `);
  }

  clientsReady = true;
};

const normalizeType = (value) => (value === 'entreprise' ? 'entreprise' : 'particulier');

export const ClientModel = {
  getAll: async ({ search, type, status } = {}) => {
    await ensureClientsTable();

    const params = [];
    let where = 'WHERE 1=1';

    if (status) {
      params.push(status);
      where += ` AND c.status = $${params.length}`;
    }
    if (type) {
      params.push(type);
      where += ` AND c.client_type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.trim()}%`);
      where += ` AND (
        c.name ILIKE $${params.length}
        OR c.email ILIKE $${params.length}
        OR c.phone ILIKE $${params.length}
        OR c.contact_name ILIKE $${params.length}
      )`;
    }

    const missionsTable = await query("SELECT to_regclass('public.missions') AS exists");
    const contractsTable = await query("SELECT to_regclass('public.contracts') AS exists");
    const missionsCountSql = missionsTable.rows[0]?.exists
      ? '(SELECT COUNT(*) FROM missions m WHERE m.client_id = c.id)'
      : '0';
    const contractsCountSql = contractsTable.rows[0]?.exists
      ? '(SELECT COUNT(*) FROM contracts ct WHERE ct.client_id = c.id)'
      : '0';

    const result = await query(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM quotes q WHERE q.client_id = c.id) AS quotes_count,
        (SELECT COUNT(*) FROM finances f WHERE f.client_id = c.id AND f.is_quote = FALSE) AS transactions_count,
        (SELECT COUNT(*) FROM finances f WHERE f.client_id = c.id AND f.is_invoice = TRUE) AS invoices_count,
        ${missionsCountSql} AS missions_count,
        ${contractsCountSql} AS contracts_count
      FROM clients c
      ${where}
      ORDER BY c.name ASC
    `, params);

    return result.rows.map((row) => ({
      ...row,
      quotes_count: parseInt(row.quotes_count, 10) || 0,
      transactions_count: parseInt(row.transactions_count, 10) || 0,
      invoices_count: parseInt(row.invoices_count, 10) || 0,
      missions_count: parseInt(row.missions_count, 10) || 0,
      contracts_count: parseInt(row.contracts_count, 10) || 0
    }));
  },

  getSummary: async () => {
    await ensureClientsTable();
    const result = await query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
        COUNT(*) FILTER (WHERE client_type = 'particulier') AS particuliers,
        COUNT(*) FILTER (WHERE client_type = 'entreprise') AS entreprises
      FROM clients
    `);
    const row = result.rows[0] || {};
    return {
      total: parseInt(row.total, 10) || 0,
      active: parseInt(row.active, 10) || 0,
      particuliers: parseInt(row.particuliers, 10) || 0,
      entreprises: parseInt(row.entreprises, 10) || 0
    };
  },

  getById: async (id) => {
    await ensureClientsTable();
    const result = await query('SELECT * FROM clients WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  getActivity: async (id) => {
    await ensureClientsTable();
    const missionsTable = await query("SELECT to_regclass('public.missions') AS exists");
    const [quotes, invoices, missions] = await Promise.all([
      query(`
        SELECT id, quote_number, description, amount, total_amount, currency, quote_status, date_transaction
        FROM quotes
        WHERE client_id = $1
        ORDER BY date_transaction DESC
        LIMIT 20
      `, [id]),
      query(`
        SELECT id, invoice_number, description, amount, total_amount, currency, date_transaction, is_invoice
        FROM finances
        WHERE client_id = $1 AND is_quote = FALSE
        ORDER BY date_transaction DESC
        LIMIT 20
      `, [id]),
      missionsTable.rows[0]?.exists
        ? query(`
            SELECT id, title, status, budget, currency, deadline
            FROM missions
            WHERE client_id = $1
            ORDER BY created_at DESC
            LIMIT 20
          `, [id])
        : Promise.resolve({ rows: [] })
    ]);

    return {
      quotes: quotes.rows,
      transactions: invoices.rows,
      missions: missions.rows
    };
  },

  create: async (data) => {
    await ensureClientsTable();
    const name = String(data.name || data.client_name || '').trim();
    if (!name) {
      const error = new Error('Le nom du client est obligatoire');
      error.status = 400;
      throw error;
    }

    const result = await query(`
      INSERT INTO clients (
        name, client_type, contact_name, email, phone, address, nif, stat, rcs, notes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      name,
      normalizeType(data.client_type),
      data.contact_name || null,
      data.email || data.client_email || null,
      data.phone || data.client_phone || null,
      data.address || data.client_address || null,
      data.nif || data.client_nif || null,
      data.stat || data.client_stat || null,
      data.rcs || null,
      data.notes || null,
      data.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE'
    ]);
    return result.rows[0];
  },

  update: async (id, data) => {
    await ensureClientsTable();
    const name = String(data.name || data.client_name || '').trim();
    if (!name) {
      const error = new Error('Le nom du client est obligatoire');
      error.status = 400;
      throw error;
    }

    const result = await query(`
      UPDATE clients SET
        name = $1,
        client_type = $2,
        contact_name = $3,
        email = $4,
        phone = $5,
        address = $6,
        nif = $7,
        stat = $8,
        rcs = $9,
        notes = $10,
        status = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `, [
      name,
      normalizeType(data.client_type),
      data.contact_name || null,
      data.email || data.client_email || null,
      data.phone || data.client_phone || null,
      data.address || data.client_address || null,
      data.nif || data.client_nif || null,
      data.stat || data.client_stat || null,
      data.rcs || null,
      data.notes || null,
      data.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
      id
    ]);
    return result.rows[0] || null;
  },

  delete: async (id) => {
    await ensureClientsTable();
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  },

  findOrCreateFromPayload: async (data = {}) => {
    await ensureClientsTable();

    if (data.client_id) {
      const existing = await ClientModel.getById(data.client_id);
      if (existing) return existing;
    }

    const name = String(data.client_name || data.name || '').trim();
    if (!name) return null;

    const found = await query(
      'SELECT * FROM clients WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1',
      [name]
    );

    if (found.rows[0]) {
      const current = found.rows[0];
      const next = {
        name: current.name,
        client_type: data.client_type || current.client_type,
        contact_name: current.contact_name,
        email: current.email || data.client_email || data.email || null,
        phone: current.phone || data.client_phone || data.phone || null,
        address: current.address || data.client_address || data.address || null,
        nif: current.nif || data.client_nif || data.nif || null,
        stat: current.stat || data.client_stat || data.stat || null,
        rcs: current.rcs,
        notes: current.notes,
        status: current.status
      };
      return ClientModel.update(current.id, next);
    }

    return ClientModel.create({
      name,
      client_type: data.client_type,
      contact_name: data.contact_name,
      email: data.client_email || data.email,
      phone: data.client_phone || data.phone,
      address: data.client_address || data.address,
      nif: data.client_nif || data.nif,
      stat: data.client_stat || data.stat,
      notes: data.notes
    });
  }
};
