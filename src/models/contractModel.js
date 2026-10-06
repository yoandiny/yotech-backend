import { query } from '../config/db.js';
import { ClientModel, ensureClientsTable } from './clientModel.js';

let contractsReady = false;

export const ensureContractsTable = async () => {
  if (contractsReady) return;

  await ensureClientsTable();

  await query(`
    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      contract_number VARCHAR(50) UNIQUE,
      template_id VARCHAR(80) NOT NULL DEFAULT 'prestation_services',
      title VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      quote_id INTEGER,
      client_name VARCHAR(255),
      client_type VARCHAR(20) DEFAULT 'particulier',
      client_address TEXT,
      client_nif VARCHAR(20),
      client_stat VARCHAR(20),
      client_email VARCHAR(100),
      client_phone VARCHAR(20),
      start_date DATE,
      end_date DATE,
      amount DECIMAL(15, 2) DEFAULT 0,
      tax_rate DECIMAL(5, 2) DEFAULT 0,
      tax_amount DECIMAL(15, 2) DEFAULT 0,
      total_amount DECIMAL(15, 2) DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'MGA',
      category VARCHAR(100),
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  contractsReady = true;
};

const normalizePayload = async (data = {}) => {
  const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
  const title = String(data.title || answers.title || 'Contrat de prestation').trim();
  const taxRate = parseFloat(data.tax_rate ?? answers.tax_rate) || 0;
  const enteredTtc = parseFloat(data.total_amount ?? answers.total_ttc ?? answers.amount) || 0;
  const priceIsTtc = answers.price_is_ttc !== false;
  const totalAmount = priceIsTtc || answers.total_ttc != null
    ? enteredTtc
    : enteredTtc + enteredTtc * taxRate / 100;
  const amountHT = taxRate > 0 ? totalAmount / (1 + taxRate / 100) : totalAmount;
  const taxAmount = totalAmount - amountHT;

  const linkedClient = await ClientModel.findOrCreateFromPayload({
    client_id: data.client_id || answers.client_id,
    client_name: data.client_name || answers.client_name,
    client_type: data.client_type || answers.client_type,
    client_email: data.client_email || answers.client_email,
    client_phone: data.client_phone || answers.client_phone,
    client_address: data.client_address || answers.client_address,
    client_nif: data.client_nif || answers.client_nif,
    client_stat: data.client_stat || answers.client_stat
  });

  return {
    template_id: data.template_id || 'prestation_services',
    title,
    status: data.status === 'final' ? 'final' : 'draft',
    client_id: linkedClient?.id || null,
    quote_id: data.quote_id || answers.quote_id || null,
    client_name: data.client_name || answers.client_name || linkedClient?.name || null,
    client_type: data.client_type || answers.client_type || linkedClient?.client_type || 'particulier',
    client_address: data.client_address || answers.client_address || linkedClient?.address || null,
    client_nif: data.client_nif || answers.client_nif || linkedClient?.nif || null,
    client_stat: data.client_stat || answers.client_stat || linkedClient?.stat || null,
    client_email: data.client_email || answers.client_email || linkedClient?.email || null,
    client_phone: data.client_phone || answers.client_phone || linkedClient?.phone || null,
    start_date: data.start_date || answers.start_date || null,
    end_date: data.end_date || answers.end_date || null,
    amount: amountHT,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    currency: data.currency || answers.currency || 'MGA',
    category: data.category || answers.category || null,
    answers: {
      ...answers,
      title,
      client_id: linkedClient?.id || answers.client_id || null,
      client_name: data.client_name || answers.client_name || linkedClient?.name || '',
      total_ttc: totalAmount,
      price_is_ttc: true,
      tax_rate: taxRate,
      currency: data.currency || answers.currency || 'MGA'
    }
  };
};

export const ContractModel = {
  generateNumber: async () => {
    await ensureContractsTable();
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `CTR-YT-${yearMonth}-`;
    const result = await query(
      `SELECT contract_number FROM contracts WHERE contract_number LIKE $1`,
      [`${prefix}%`]
    );

    let maxSeq = 0;
    for (const row of result.rows) {
      const match = String(row.contract_number || '').match(/-(\d+)$/);
      if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
    }
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  },

  getAll: async ({ status, search } = {}) => {
    await ensureContractsTable();
    const params = [];
    let sql = 'SELECT * FROM contracts WHERE 1=1';

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.trim()}%`);
      sql += ` AND (
        title ILIKE $${params.length}
        OR contract_number ILIKE $${params.length}
        OR client_name ILIKE $${params.length}
      )`;
    }

    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    return result.rows;
  },

  getById: async (id) => {
    await ensureContractsTable();
    const result = await query('SELECT * FROM contracts WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  create: async (data) => {
    await ensureContractsTable();
    const payload = await normalizePayload(data);
    const contractNumber = data.contract_number || await ContractModel.generateNumber();

    const result = await query(
      `INSERT INTO contracts (
        contract_number, template_id, title, status, client_id, quote_id,
        client_name, client_type, client_address, client_nif, client_stat,
        client_email, client_phone, start_date, end_date,
        amount, tax_rate, tax_amount, total_amount, currency, category, answers
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      ) RETURNING *`,
      [
        contractNumber,
        payload.template_id,
        payload.title,
        payload.status,
        payload.client_id,
        payload.quote_id,
        payload.client_name,
        payload.client_type,
        payload.client_address,
        payload.client_nif,
        payload.client_stat,
        payload.client_email,
        payload.client_phone,
        payload.start_date || null,
        payload.end_date || null,
        payload.amount,
        payload.tax_rate,
        payload.tax_amount,
        payload.total_amount,
        payload.currency,
        payload.category,
        payload.answers
      ]
    );
    return result.rows[0];
  },

  update: async (id, data) => {
    await ensureContractsTable();
    const existing = await ContractModel.getById(id);
    if (!existing) return null;
    if (existing.status === 'final') {
      const error = new Error('Un contrat finalisé ne peut plus être modifié');
      error.status = 403;
      throw error;
    }

    const existingAnswers = typeof existing.answers === 'string'
      ? JSON.parse(existing.answers)
      : (existing.answers || {});
    const payload = await normalizePayload({
      ...existingAnswers,
      ...data,
      answers: { ...existingAnswers, ...(data.answers || {}) }
    });

    const result = await query(
      `UPDATE contracts SET
        template_id = $2,
        title = $3,
        status = $4,
        client_id = $5,
        quote_id = $6,
        client_name = $7,
        client_type = $8,
        client_address = $9,
        client_nif = $10,
        client_stat = $11,
        client_email = $12,
        client_phone = $13,
        start_date = $14,
        end_date = $15,
        amount = $16,
        tax_rate = $17,
        tax_amount = $18,
        total_amount = $19,
        currency = $20,
        category = $21,
        answers = $22,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`,
      [
        id,
        payload.template_id,
        payload.title,
        payload.status,
        payload.client_id,
        payload.quote_id,
        payload.client_name,
        payload.client_type,
        payload.client_address,
        payload.client_nif,
        payload.client_stat,
        payload.client_email,
        payload.client_phone,
        payload.start_date || null,
        payload.end_date || null,
        payload.amount,
        payload.tax_rate,
        payload.tax_amount,
        payload.total_amount,
        payload.currency,
        payload.category,
        payload.answers
      ]
    );
    return result.rows[0];
  },

  deleteDraft: async (id) => {
    await ensureContractsTable();
    const existing = await ContractModel.getById(id);
    if (!existing) return null;
    if (existing.status !== 'draft') {
      const error = new Error('Seuls les contrats en brouillon peuvent être supprimés');
      error.status = 403;
      throw error;
    }
    const result = await query(
      `DELETE FROM contracts WHERE id = $1 AND status = 'draft' RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }
};
