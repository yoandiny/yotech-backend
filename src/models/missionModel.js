import { query } from '../config/db.js';

export const MissionModel = {
  // ─── Liste / Filtres ──────────────────────────────────────────

  getAll: async ({ status, priority, search } = {}) => {
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
    const result = await query('SELECT * FROM missions WHERE id = $1', [id]);
    return result.rows[0];
  },

  // ─── Création ─────────────────────────────────────────────────

  create: async (data) => {
    const {
      title, description, client_name, client_contact,
      client_email, client_phone,
      status, progress, priority,
      start_date, end_date, deadline,
      budget, currency,
      acompte_percent,
      category, tags, notes,
    } = data;

    // Calcul automatique des montants
    const pct   = parseFloat(acompte_percent ?? 30);
    const total = parseFloat(budget ?? 0);
    const ac    = parseFloat(((pct / 100) * total).toFixed(2));
    const fin   = parseFloat((total - ac).toFixed(2));

    const sql = `
      INSERT INTO missions (
        title, description, client_name, client_contact,
        client_email, client_phone,
        status, progress, priority,
        start_date, end_date, deadline,
        budget, currency,
        acompte_percent, acompte_amount, final_amount,
        category, tags, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *
    `;

    const result = await query(sql, [
      title, description || null, client_name,
      client_contact || null, client_email || null, client_phone || null,
      status || 'prospect', progress ?? 0, priority || 'normale',
      start_date || null, end_date || null, deadline || null,
      total, currency || 'MGA',
      pct, ac, fin,
      category || null,
      tags && tags.length > 0 ? tags : null,
      notes || null,
    ]);
    return result.rows[0];
  },

  // ─── Mise à jour générale ──────────────────────────────────────

  update: async (id, data) => {
    const sanitized = { ...data };
    delete sanitized.id;
    delete sanitized.created_at;

    // Recalcul des montants si budget ou acompte_percent changés
    const total = parseFloat(sanitized.budget ?? 0);
    const pct   = parseFloat(sanitized.acompte_percent ?? 30);
    if (!isNaN(total) && !isNaN(pct)) {
      sanitized.acompte_amount = parseFloat(((pct / 100) * total).toFixed(2));
      sanitized.final_amount   = parseFloat((total - sanitized.acompte_amount).toFixed(2));
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
};
