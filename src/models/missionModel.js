import { query } from '../config/db.js';

const DEFAULT_STAGES = [
  'Cahier des charges',
  'Conception',
  'Développement',
  'Recette',
  'Livraison',
];

let missionsReady = false;

export const ensureMissionsSchema = async () => {
  if (missionsReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      client_name VARCHAR(255) NOT NULL,
      client_contact VARCHAR(255),
      client_email VARCHAR(100),
      client_phone VARCHAR(30),
      status VARCHAR(30) NOT NULL DEFAULT 'prospect',
      progress INTEGER NOT NULL DEFAULT 0,
      priority VARCHAR(20) NOT NULL DEFAULT 'normale',
      start_date DATE,
      end_date DATE,
      deadline DATE,
      budget DECIMAL(15, 2) DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'MGA',
      acompte_percent DECIMAL(5, 2) DEFAULT 30,
      acompte_amount DECIMAL(15, 2) DEFAULT 0,
      acompte_paid BOOLEAN DEFAULT FALSE,
      acompte_date DATE,
      acompte_finance_id VARCHAR(64),
      final_amount DECIMAL(15, 2) DEFAULT 0,
      final_paid BOOLEAN DEFAULT FALSE,
      final_date DATE,
      final_finance_id VARCHAR(64),
      category VARCHAR(100),
      tags TEXT[],
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS quote_id INTEGER`);
  await query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS finance_id VARCHAR(64)`);
  await query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS client_id INTEGER`);
  await query(`ALTER TABLE missions ALTER COLUMN finance_id TYPE VARCHAR(64) USING finance_id::text`);
  await query(`ALTER TABLE missions ALTER COLUMN acompte_finance_id TYPE VARCHAR(64) USING acompte_finance_id::text`);
  await query(`ALTER TABLE missions ALTER COLUMN final_finance_id TYPE VARCHAR(64) USING final_finance_id::text`);

  await query(`
    CREATE TABLE IF NOT EXISTS mission_updates (
      id SERIAL PRIMARY KEY,
      mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      author VARCHAR(100) DEFAULT 'Admin',
      title VARCHAR(255) NOT NULL,
      content TEXT,
      progress_snapshot INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS mission_stages (
      id SERIAL PRIMARY KEY,
      mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      done_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  missionsReady = true;
};

const syncProgressFromStages = async (missionId) => {
  const stages = await query(
    'SELECT done FROM mission_stages WHERE mission_id = $1',
    [missionId]
  );
  if (stages.rows.length === 0) return null;

  const doneCount = stages.rows.filter((row) => row.done).length;
  const progress = Math.round((doneCount / stages.rows.length) * 100);
  const mission = await query('SELECT status FROM missions WHERE id = $1', [missionId]);
  const currentStatus = mission.rows[0]?.status || 'en_cours';
  let nextStatus = currentStatus;

  if (progress === 100 && ['prospect', 'en_cours'].includes(currentStatus)) {
    nextStatus = 'terminee';
  } else if (progress < 100 && currentStatus === 'terminee') {
    nextStatus = 'en_cours';
  }

  const result = await query(
    'UPDATE missions SET progress = $2, status = $3 WHERE id = $1 RETURNING *',
    [missionId, progress, nextStatus]
  );
  return result.rows[0];
};

export const MissionModel = {
  // ─── Liste / Filtres ──────────────────────────────────────────

  getAll: async ({ status, priority, search } = {}) => {
    await ensureMissionsSchema();
    let sql = `SELECT * FROM missions WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
    if (priority) { sql += ` AND priority = $${idx++}`; params.push(priority); }
    if (search) {
      sql += ` AND (title ILIKE $${idx} OR client_name ILIKE $${idx} OR description ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }

    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    return result.rows;
  },

  getById: async (id) => {
    await ensureMissionsSchema();
    const result = await query('SELECT * FROM missions WHERE id = $1', [id]);
    return result.rows[0];
  },

  // ─── Création ─────────────────────────────────────────────────

  create: async (data) => {
    await ensureMissionsSchema();
    const {
      title, description, client_name, client_contact,
      client_email, client_phone,
      status, progress, priority,
      start_date, end_date, deadline,
      budget, currency,
      acompte_percent,
      category, tags, notes,
      quote_id, finance_id, client_id,
      acompte_paid, acompte_date, acompte_finance_id,
      final_paid, final_date, final_finance_id,
    } = data;

    const fromQuote = Boolean(quote_id);
    const pct   = fromQuote ? 100 : parseFloat(acompte_percent ?? 30);
    const total = parseFloat(budget ?? 0);
    const ac    = fromQuote ? total : parseFloat(((pct / 100) * total).toFixed(2));
    const fin   = fromQuote ? 0 : parseFloat((total - ac).toFixed(2));

    const sql = `
      INSERT INTO missions (
        title, description, client_name, client_contact,
        client_email, client_phone,
        status, progress, priority,
        start_date, end_date, deadline,
        budget, currency,
        acompte_percent, acompte_amount, final_amount,
        acompte_paid, acompte_date, acompte_finance_id,
        final_paid, final_date, final_finance_id,
        category, tags, notes,
        quote_id, finance_id, client_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      RETURNING *
    `;

    const result = await query(sql, [
      title, description || null, client_name,
      client_contact || null, client_email || null, client_phone || null,
      status || (fromQuote ? 'en_cours' : 'prospect'),
      progress ?? 0,
      priority || 'normale',
      start_date || null, end_date || null, deadline || null,
      total, currency || 'MGA',
      pct, ac, fin,
      acompte_paid ?? fromQuote, fromQuote ? (acompte_date || new Date()) : (acompte_date || null),
      acompte_finance_id || finance_id || null,
      final_paid ?? fromQuote, fromQuote ? (final_date || new Date()) : (final_date || null),
      final_finance_id || finance_id || null,
      category || null,
      tags && tags.length > 0 ? tags : null,
      notes || null,
      quote_id || null, finance_id || null, client_id || null,
    ]);

    const mission = result.rows[0];
    await MissionModel.seedDefaultStages(mission.id);
    return mission;
  },

  // ─── Mise à jour générale ──────────────────────────────────────

  update: async (id, data) => {
    await ensureMissionsSchema();
    const existing = await MissionModel.getById(id);
    const sanitized = { ...data };
    delete sanitized.id;
    delete sanitized.created_at;
    delete sanitized.updated_at;
    delete sanitized.stages;

    const fromQuote = Boolean(existing?.quote_id || sanitized.quote_id);
    if (!fromQuote) {
      const total = parseFloat(sanitized.budget ?? existing?.budget ?? 0);
      const pct   = parseFloat(sanitized.acompte_percent ?? existing?.acompte_percent ?? 30);
      if (!isNaN(total) && !isNaN(pct)) {
        sanitized.acompte_amount = parseFloat(((pct / 100) * total).toFixed(2));
        sanitized.final_amount   = parseFloat((total - sanitized.acompte_amount).toFixed(2));
      }
    }

    if (sanitized.start_date === '') sanitized.start_date = null;
    if (sanitized.end_date   === '') sanitized.end_date   = null;
    if (sanitized.deadline   === '') sanitized.deadline   = null;

    const fields   = Object.keys(sanitized);
    const values   = Object.values(sanitized);
    const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');

    const result = await query(`UPDATE missions SET ${setClause} WHERE id = $1 RETURNING *`, [id, ...values]);
    return result.rows[0];
  },

  // ─── Progression rapide ───────────────────────────────────────

  updateProgress: async (id, progress, status) => {
    const result = await query(
      'UPDATE missions SET progress = $2, status = $3 WHERE id = $1 RETURNING *',
      [id, progress, status]
    );
    return result.rows[0];
  },

  // ─── Enregistrement d'un paiement (acompte ou final) ──────────
  // type: 'acompte' | 'final'

  recordPayment: async (id, type, { finance_id, date }) => {
    let sql;
    if (type === 'acompte') {
      sql = `UPDATE missions
             SET acompte_paid = TRUE, acompte_date = $2, acompte_finance_id = $3
             WHERE id = $1 RETURNING *`;
    } else {
      sql = `UPDATE missions
             SET final_paid = TRUE, final_date = $2, final_finance_id = $3
             WHERE id = $1 RETURNING *`;
    }
    const result = await query(sql, [id, date || new Date(), finance_id || null]);
    return result.rows[0];
  },

  // ─── Suppression ──────────────────────────────────────────────

  delete: async (id) => {
    const result = await query('DELETE FROM missions WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },

  // ─── Stats ─────────────────────────────────────────────────────

  getStats: async () => {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'prospect')   AS prospect,
        COUNT(*) FILTER (WHERE status = 'en_cours')   AS en_cours,
        COUNT(*) FILTER (WHERE status = 'en_pause')   AS en_pause,
        COUNT(*) FILTER (WHERE status = 'terminee')   AS terminee,
        COUNT(*) FILTER (WHERE status = 'annulee')    AS annulee,
        COUNT(*)                                        AS total,
        COALESCE(SUM(budget),0)                         AS total_budget,
        COALESCE(SUM(acompte_amount) FILTER (WHERE acompte_paid), 0) AS total_acompte_paid,
        COALESCE(SUM(final_amount)   FILTER (WHERE final_paid),   0) AS total_final_paid,
        COALESCE(AVG(progress),0)                       AS avg_progress
      FROM missions
    `);
    return result.rows[0];
  },

  // ─── Jalons / journal ──────────────────────────────────────────

  getUpdates: async (mission_id) => {
    await ensureMissionsSchema();
    const result = await query(
      'SELECT * FROM mission_updates WHERE mission_id = $1 ORDER BY created_at DESC',
      [mission_id]
    );
    return result.rows;
  },

  addUpdate: async (data) => {
    const { mission_id, author, title, content, progress_snapshot } = data;
    const result = await query(
      `INSERT INTO mission_updates (mission_id, author, title, content, progress_snapshot)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [mission_id, author || 'Admin', title, content || null, progress_snapshot ?? null]
    );
    return result.rows[0];
  },

  getStages: async (mission_id) => {
    await ensureMissionsSchema();
    const result = await query(
      'SELECT * FROM mission_stages WHERE mission_id = $1 ORDER BY position ASC, id ASC',
      [mission_id]
    );
    return result.rows;
  },

  seedDefaultStages: async (mission_id) => {
    await ensureMissionsSchema();
    const existing = await MissionModel.getStages(mission_id);
    if (existing.length > 0) return existing;

    for (const [index, title] of DEFAULT_STAGES.entries()) {
      await query(
        `INSERT INTO mission_stages (mission_id, title, position)
         VALUES ($1, $2, $3)`,
        [mission_id, title, index]
      );
    }
    return MissionModel.getStages(mission_id);
  },

  addStage: async (mission_id, title) => {
    await ensureMissionsSchema();
    const last = await query(
      'SELECT COALESCE(MAX(position), -1) AS max_pos FROM mission_stages WHERE mission_id = $1',
      [mission_id]
    );
    const result = await query(
      `INSERT INTO mission_stages (mission_id, title, position)
       VALUES ($1, $2, $3) RETURNING *`,
      [mission_id, title.trim(), Number(last.rows[0].max_pos) + 1]
    );
    const mission = await syncProgressFromStages(mission_id);
    return { stage: result.rows[0], mission };
  },

  toggleStage: async (mission_id, stage_id, done) => {
    await ensureMissionsSchema();
    const result = await query(
      `UPDATE mission_stages
       SET done = $3, done_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = $2 AND mission_id = $1
       RETURNING *`,
      [mission_id, stage_id, Boolean(done)]
    );
    if (!result.rows[0]) return null;
    const mission = await syncProgressFromStages(mission_id);
    return { stage: result.rows[0], mission };
  },

  deleteStage: async (mission_id, stage_id) => {
    await ensureMissionsSchema();
    const result = await query(
      'DELETE FROM mission_stages WHERE id = $2 AND mission_id = $1 RETURNING *',
      [mission_id, stage_id]
    );
    if (!result.rows[0]) return null;
    const mission = await syncProgressFromStages(mission_id);
    return { stage: result.rows[0], mission };
  },
};
