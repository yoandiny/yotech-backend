import { query } from '../config/db.js';

let assembliesReady = false;

export const ensureAssembliesTable = async () => {
  if (assembliesReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS general_assemblies (
      id SERIAL PRIMARY KEY,
      assembly_number VARCHAR(50) UNIQUE,
      assembly_type VARCHAR(30) NOT NULL DEFAULT 'ago',
      title VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      held_on DATE,
      location TEXT,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  assembliesReady = true;
};

const TYPE_LABELS = {
  constitutive: 'Assemblée constitutive',
  ago: 'Assemblée générale ordinaire',
  age: 'Assemblée générale extraordinaire',
  mixte: 'Assemblée générale mixte'
};

const normalizePayload = (data = {}) => {
  const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
  const assembly_type = ['constitutive', 'ago', 'age', 'mixte'].includes(data.assembly_type || answers.assembly_type)
    ? (data.assembly_type || answers.assembly_type)
    : 'ago';
  const title = String(data.title || answers.title || TYPE_LABELS[assembly_type]).trim();

  return {
    assembly_type,
    title,
    status: data.status === 'final' ? 'final' : 'draft',
    held_on: data.held_on || answers.held_on || null,
    location: data.location || answers.location || null,
    answers: {
      ...answers,
      assembly_type,
      title,
      held_on: data.held_on || answers.held_on || '',
      location: data.location || answers.location || ''
    }
  };
};

export const AssemblyModel = {
  generateNumber: async () => {
    await ensureAssembliesTable();
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `AG-YT-${yearMonth}-`;
    const result = await query(
      `SELECT assembly_number FROM general_assemblies WHERE assembly_number LIKE $1`,
      [`${prefix}%`]
    );
    let maxSeq = 0;
    for (const row of result.rows) {
      const match = String(row.assembly_number || '').match(/-(\d+)$/);
      if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
    }
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  },

  getAll: async ({ status, type, search } = {}) => {
    await ensureAssembliesTable();
    const params = [];
    let sql = 'SELECT * FROM general_assemblies WHERE 1=1';
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (type) {
      params.push(type);
      sql += ` AND assembly_type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.trim()}%`);
      sql += ` AND (title ILIKE $${params.length} OR assembly_number ILIKE $${params.length} OR location ILIKE $${params.length})`;
    }
    sql += ' ORDER BY COALESCE(held_on, created_at) DESC, created_at DESC';
    const result = await query(sql, params);
    return result.rows;
  },

  getById: async (id) => {
    await ensureAssembliesTable();
    const result = await query('SELECT * FROM general_assemblies WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  create: async (data) => {
    await ensureAssembliesTable();
    const payload = normalizePayload(data);
    const assembly_number = data.assembly_number || await AssemblyModel.generateNumber();
    const result = await query(
      `INSERT INTO general_assemblies (
        assembly_number, assembly_type, title, status, held_on, location, answers
      ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        assembly_number,
        payload.assembly_type,
        payload.title,
        payload.status,
        payload.held_on || null,
        payload.location,
        payload.answers
      ]
    );
    return result.rows[0];
  },

  update: async (id, data) => {
    await ensureAssembliesTable();
    const existing = await AssemblyModel.getById(id);
    if (!existing) return null;
    if (existing.status === 'final') {
      const error = new Error('Un procès-verbal finalisé ne peut plus être modifié');
      error.status = 403;
      throw error;
    }
    const existingAnswers = typeof existing.answers === 'string'
      ? JSON.parse(existing.answers)
      : (existing.answers || {});
    const payload = normalizePayload({
      ...existing,
      ...data,
      answers: { ...existingAnswers, ...(data.answers || {}) }
    });
    const result = await query(
      `UPDATE general_assemblies SET
        assembly_type = $2,
        title = $3,
        status = $4,
        held_on = $5,
        location = $6,
        answers = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`,
      [
        id,
        payload.assembly_type,
        payload.title,
        payload.status,
        payload.held_on || null,
        payload.location,
        payload.answers
      ]
    );
    return result.rows[0];
  },

  deleteDraft: async (id) => {
    await ensureAssembliesTable();
    const existing = await AssemblyModel.getById(id);
    if (!existing) return null;
    if (existing.status !== 'draft') {
      const error = new Error('Seuls les procès-verbaux en brouillon peuvent être supprimés');
      error.status = 403;
      throw error;
    }
    const result = await query(
      `DELETE FROM general_assemblies WHERE id = $1 AND status = 'draft' RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }
};
