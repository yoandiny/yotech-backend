import { query } from '../config/db.js';
import pool from '../config/db.js';
import {
  PCG_STANDARD,
  PCG_VERSION,
  PCG_ACCOUNTS,
  REPORT_STRUCTURES,
  DEFAULT_JOURNALS,
  ENTRY_TEMPLATES,
  DEFAULT_POSTING_MAP,
  OBSOLETE_SYSCOHADA_CODES
} from '../data/pcgSyscohada.js';
import {
  AccountingError,
  assertEntryMutable,
  assertPeriodWritable,
  money,
  reversedLines,
  totalsOf,
  validateLines,
  progressiveBalance,
  splitBalance,
  buildStatement
} from '../services/accountingEngine.js';

let accountingReady = false;

const run = (client, text, params) => (client || { query }).query(text, params);

const asSourceId = (value) => (value == null || value === '' ? null : String(value));

const asUserId = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  const text = String(value);
  if (/^\d+$/.test(text)) return Number(text);
  return null;
};

export const ensureAccountingSchema = async () => {
  if (accountingReady) return;

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_standards (
      id SERIAL PRIMARY KEY,
      code VARCHAR(40) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      country VARCHAR(8) DEFAULT 'MG',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_standard_versions (
      id SERIAL PRIMARY KEY,
      standard_id INTEGER NOT NULL REFERENCES accounting_standards(id) ON DELETE CASCADE,
      code VARCHAR(40) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      valid_from DATE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_accounts (
      id SERIAL PRIMARY KEY,
      version_id INTEGER NOT NULL REFERENCES accounting_standard_versions(id) ON DELETE CASCADE,
      code VARCHAR(20) NOT NULL,
      name VARCHAR(255) NOT NULL,
      parent_id INTEGER REFERENCES accounting_accounts(id) ON DELETE SET NULL,
      mapping_key VARCHAR(50) NOT NULL,
      balance_nature VARCHAR(10) NOT NULL DEFAULT 'debit',
      is_postable BOOLEAN DEFAULT TRUE,
      is_active BOOLEAN DEFAULT TRUE,
      auxiliary_type VARCHAR(20),
      treasury_kind VARCHAR(20),
      UNIQUE (version_id, code)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_report_structures (
      id SERIAL PRIMARY KEY,
      version_id INTEGER NOT NULL REFERENCES accounting_standard_versions(id) ON DELETE CASCADE,
      report_type VARCHAR(20) NOT NULL,
      section_code VARCHAR(30) NOT NULL,
      section_label VARCHAR(120) NOT NULL,
      mapping_key VARCHAR(50) NOT NULL,
      group_label VARCHAR(120) NOT NULL,
      sort_order INTEGER DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_periods (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      standard_version_id INTEGER REFERENCES accounting_standard_versions(id),
      closed_at TIMESTAMP,
      closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_journals (
      id SERIAL PRIMARY KEY,
      code VARCHAR(10) UNIQUE NOT NULL,
      name VARCHAR(120) NOT NULL,
      journal_type VARCHAR(30) NOT NULL DEFAULT 'miscellaneous',
      is_active BOOLEAN DEFAULT TRUE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_sequences (
      journal_id INTEGER NOT NULL REFERENCES accounting_journals(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (journal_id, year)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255),
      email VARCHAR(100),
      phone VARCHAR(20),
      address TEXT,
      nif VARCHAR(20),
      stat VARCHAR(20),
      notes TEXT,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_cash_accounts (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      kind VARCHAR(20) NOT NULL,
      account_id INTEGER NOT NULL REFERENCES accounting_accounts(id),
      bank_name VARCHAR(120),
      iban VARCHAR(64),
      is_active BOOLEAN DEFAULT TRUE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_entry_templates (
      id SERIAL PRIMARY KEY,
      code VARCHAR(40) UNIQUE NOT NULL,
      name VARCHAR(120) NOT NULL,
      journal_id INTEGER REFERENCES accounting_journals(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT TRUE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_entries (
      id SERIAL PRIMARY KEY,
      period_id INTEGER NOT NULL REFERENCES accounting_periods(id),
      journal_id INTEGER NOT NULL REFERENCES accounting_journals(id),
      entry_date DATE NOT NULL,
      entry_number VARCHAR(40) UNIQUE,
      reference VARCHAR(80),
      label TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      source_type VARCHAR(40),
      source_id VARCHAR(64),
      source_reference VARCHAR(80),
      reversal_of_id INTEGER REFERENCES accounting_entries(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      posted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      posted_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`ALTER TABLE accounting_entries ALTER COLUMN source_id TYPE VARCHAR(64) USING source_id::text`);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS accounting_entries_source_unique
    ON accounting_entries (source_type, source_id)
    WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND status IN ('posted', 'locked')
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_entry_lines (
      id SERIAL PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES accounting_entries(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      account_id INTEGER NOT NULL REFERENCES accounting_accounts(id),
      debit DECIMAL(18, 2) NOT NULL DEFAULT 0,
      credit DECIMAL(18, 2) NOT NULL DEFAULT 0,
      label TEXT,
      party_type VARCHAR(20),
      party_id INTEGER,
      CHECK (debit >= 0 AND credit >= 0),
      CHECK (NOT (debit > 0 AND credit > 0))
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_audit_log (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(40) NOT NULL,
      entity_id INTEGER,
      action VARCHAR(40) NOT NULL,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      details JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS accounting_posting_rules (
      id SERIAL PRIMARY KEY,
      transaction_type VARCHAR(20) NOT NULL,
      category VARCHAR(100),
      account_id INTEGER NOT NULL REFERENCES accounting_accounts(id),
      cash_account_id INTEGER REFERENCES accounting_cash_accounts(id) ON DELETE SET NULL,
      vat_account_id INTEGER REFERENCES accounting_accounts(id) ON DELETE SET NULL,
      journal_id INTEGER REFERENCES accounting_journals(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT TRUE
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS accounting_posting_rules_type_category
    ON accounting_posting_rules (transaction_type, COALESCE(category, ''))
  `);

  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS auto_post BOOLEAN DEFAULT TRUE`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(20) DEFAULT 'unposted'`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS accounting_entry_id INTEGER`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS accounting_error TEXT`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS cash_account_id INTEGER`);

  await seedReferential();
  accountingReady = true;
};

const migrateStandardLabels = async () => {
  await query(
    `UPDATE accounting_standards SET code = $1, name = $2, country = $3 WHERE code IN ('SYSCOHADA', 'PCG-MG')`,
    [PCG_STANDARD.code, PCG_STANDARD.name, PCG_STANDARD.country]
  );
  await query(
    `UPDATE accounting_standard_versions SET code = $1, name = $2, valid_from = $3, is_active = TRUE
     WHERE code IN ('SYSCOHADA-2017', 'PCG-MG-2005')`,
    [PCG_VERSION.code, PCG_VERSION.name, PCG_VERSION.valid_from]
  );
};

const syncChartOfAccounts = async (versionId) => {
  const existing = await query('SELECT id, code, name FROM accounting_accounts WHERE version_id = $1', [versionId]);
  const byCode = Object.fromEntries(existing.rows.map((row) => [row.code, row.id]));
  const previous604 = existing.rows.find((row) => row.code === '604')?.name || '';
  const migrating = Boolean(previous604) && /fournitures/i.test(previous604);

  for (const account of PCG_ACCOUNTS) {
    if (byCode[account.code]) {
      await query(
        `UPDATE accounting_accounts SET
          name = $1, mapping_key = $2, balance_nature = $3, is_postable = $4,
          is_active = TRUE, auxiliary_type = $5, treasury_kind = $6
         WHERE id = $7`,
        [
          account.name, account.mapping_key, account.balance_nature, account.is_postable,
          account.auxiliary_type, account.treasury_kind, byCode[account.code]
        ]
      );
    } else {
      const inserted = await query(
        `INSERT INTO accounting_accounts
          (version_id, code, name, mapping_key, balance_nature, is_postable, auxiliary_type, treasury_kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, code`,
        [
          versionId, account.code, account.name, account.mapping_key,
          account.balance_nature, account.is_postable, account.auxiliary_type, account.treasury_kind
        ]
      );
      byCode[inserted.rows[0].code] = inserted.rows[0].id;
    }
  }

  for (const account of PCG_ACCOUNTS) {
    const parentId = account.parent_code ? byCode[account.parent_code] || null : null;
    await query(`UPDATE accounting_accounts SET parent_id = $1 WHERE id = $2`, [parentId, byCode[account.code]]);
  }

  for (const code of OBSOLETE_SYSCOHADA_CODES) {
    if (byCode[code] && !PCG_ACCOUNTS.some((account) => account.code === code)) {
      await query(
        `UPDATE accounting_accounts SET is_active = FALSE, is_postable = FALSE WHERE id = $1`,
        [byCode[code]]
      );
    }
  }

  return { byCode, migrating };
};

const upsertPostingRules = async (versionId, byCode, { overwrite } = {}) => {
  const bankCash = (await query(`SELECT id FROM accounting_cash_accounts WHERE kind = 'bank' LIMIT 1`)).rows[0];
  for (const row of DEFAULT_POSTING_MAP) {
    const accountId = byCode[row.account_code];
    if (!accountId) continue;
    const vatId = row.transaction_type === 'revenu' ? (byCode['4457'] || byCode['445'] || null) : (byCode['44566'] || byCode['4456'] || null);
    const existing = await query(
      `SELECT id FROM accounting_posting_rules
       WHERE transaction_type = $1 AND COALESCE(category, '') = COALESCE($2, '')`,
      [row.transaction_type, row.category]
    );
    if (existing.rows[0]) {
      if (overwrite) {
        await query(
          `UPDATE accounting_posting_rules SET account_id = $1, cash_account_id = COALESCE(cash_account_id, $2), vat_account_id = $3
           WHERE id = $4`,
          [accountId, bankCash?.id || null, vatId, existing.rows[0].id]
        );
      }
    } else {
      await query(
        `INSERT INTO accounting_posting_rules (transaction_type, category, account_id, cash_account_id, vat_account_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [row.transaction_type, row.category, accountId, bankCash?.id || null, vatId]
      );
    }
  }
};

const seedReferential = async () => {
  await migrateStandardLabels();
  const standard = await query(
    `INSERT INTO accounting_standards (code, name, country)
     VALUES ($1, $2, $3)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [PCG_STANDARD.code, PCG_STANDARD.name, PCG_STANDARD.country]
  );
  const standardId = standard.rows[0].id;

  const version = await query(
    `INSERT INTO accounting_standard_versions (standard_id, code, name, valid_from, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE
     RETURNING *`,
    [standardId, PCG_VERSION.code, PCG_VERSION.name, PCG_VERSION.valid_from]
  );
  const versionId = version.rows[0].id;

  const { byCode, migrating } = await syncChartOfAccounts(versionId);

  const existingReports = await query('SELECT COUNT(*)::int AS n FROM accounting_report_structures WHERE version_id = $1', [versionId]);
  if (existingReports.rows[0].n === 0) {
    for (const row of REPORT_STRUCTURES) {
      await query(
        `INSERT INTO accounting_report_structures
          (version_id, report_type, section_code, section_label, mapping_key, group_label, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [versionId, row.report_type, row.section_code, row.section_label, row.mapping_key, row.group_label, row.sort_order]
      );
    }
  } else if (migrating) {
    await query(`DELETE FROM accounting_report_structures WHERE version_id = $1`, [versionId]);
    for (const row of REPORT_STRUCTURES) {
      await query(
        `INSERT INTO accounting_report_structures
          (version_id, report_type, section_code, section_label, mapping_key, group_label, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [versionId, row.report_type, row.section_code, row.section_label, row.mapping_key, row.group_label, row.sort_order]
      );
    }
  }

  for (const journal of DEFAULT_JOURNALS) {
    await query(
      `INSERT INTO accounting_journals (code, name, journal_type)
       VALUES ($1,$2,$3)
       ON CONFLICT (code) DO NOTHING`,
      [journal.code, journal.name, journal.journal_type]
    );
  }

  const journals = await query('SELECT id, code FROM accounting_journals');
  const journalByCode = Object.fromEntries(journals.rows.map((row) => [row.code, row.id]));
  for (const template of ENTRY_TEMPLATES) {
    await query(
      `INSERT INTO accounting_entry_templates (code, name, journal_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (code) DO NOTHING`,
      [template.code, template.name, journalByCode[template.journal_code] || null]
    );
  }

  const bank = byCode['512'];
  const cash = byCode['531'];
  if (bank) {
    await query(
      `UPDATE accounting_cash_accounts SET account_id = $1
       WHERE kind = 'bank' AND account_id IN (
         SELECT id FROM accounting_accounts WHERE code IN ('521', '52')
       )`,
      [bank]
    );
  }
  if (cash) {
    await query(
      `UPDATE accounting_cash_accounts SET account_id = $1
       WHERE kind = 'cash' AND account_id IN (
         SELECT id FROM accounting_accounts WHERE code IN ('57', '53')
       )`,
      [cash]
    );
  }

  const cashCount = await query('SELECT COUNT(*)::int AS n FROM accounting_cash_accounts');
  if (cashCount.rows[0].n === 0) {
    if (bank) {
      await query(
        `INSERT INTO accounting_cash_accounts (name, kind, account_id, bank_name) VALUES ($1,'bank',$2,$3)`,
        ['Banque principale', bank, 'Banque']
      );
    }
    if (cash) {
      await query(
        `INSERT INTO accounting_cash_accounts (name, kind, account_id) VALUES ($1,'cash',$2)`,
        ['Caisse', cash]
      );
    }
  }

  const periodCount = await query('SELECT COUNT(*)::int AS n FROM accounting_periods');
  if (periodCount.rows[0].n === 0) {
    const year = new Date().getFullYear();
    await query(
      `INSERT INTO accounting_periods (name, start_date, end_date, status, standard_version_id)
       VALUES ($1,$2,$3,'open',$4)`,
      [`Exercice ${year}`, `${year}-01-01`, `${year}-12-31`, versionId]
    );
  }

  await upsertPostingRules(versionId, byCode, { overwrite: migrating });
};

const audit = async (client, { entity_type, entity_id, action, actor_id, details }) => {
  await run(client, `
    INSERT INTO accounting_audit_log (entity_type, entity_id, action, actor_id, details)
    VALUES ($1,$2,$3,$4,$5)
  `, [entity_type, entity_id || null, action, asUserId(actor_id), details ? JSON.stringify(details) : null]);
};

const mapEntry = (row, lines = []) => {
  if (!row) return null;
  const totals = totalsOf(lines);
  return { ...row, lines, totals, difference: money(totals.debit - totals.credit) };
};

const fetchLines = async (entryId, client) => {
  const result = await run(client, `
    SELECT l.*, a.code AS account_code, a.name AS account_name, a.mapping_key, a.auxiliary_type
    FROM accounting_entry_lines l
    JOIN accounting_accounts a ON a.id = l.account_id
    WHERE l.entry_id = $1
    ORDER BY l.line_no
  `, [entryId]);
  return result.rows;
};

const getPeriodForDate = async (date, client) => {
  const result = await run(client, `
    SELECT * FROM accounting_periods
    WHERE $1::date BETWEEN start_date AND end_date
    ORDER BY start_date DESC
    LIMIT 1
  `, [date]);
  return result.rows[0] || null;
};

const nextEntryNumber = async (client, journalId, year) => {
  await run(client, `
    INSERT INTO accounting_sequences (journal_id, year, last_number)
    VALUES ($1,$2,0)
    ON CONFLICT (journal_id, year) DO NOTHING
  `, [journalId, year]);
  const seq = await run(client, `
    UPDATE accounting_sequences
    SET last_number = last_number + 1
    WHERE journal_id = $1 AND year = $2
    RETURNING last_number
  `, [journalId, year]);
  const journal = await run(client, 'SELECT code FROM accounting_journals WHERE id = $1', [journalId]);
  const n = String(seq.rows[0].last_number).padStart(4, '0');
  return `${journal.rows[0].code}-${year}-${n}`;
};

const insertLines = async (client, entryId, lines) => {
  let lineNo = 1;
  for (const line of lines) {
    const debit = money(line.debit);
    const credit = money(line.credit);
    await run(client, `
      INSERT INTO accounting_entry_lines
        (entry_id, line_no, account_id, debit, credit, label, party_type, party_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      entryId, lineNo++, line.account_id, debit, credit,
      line.label || null, line.party_type || null, asUserId(line.party_id)
    ]);
  }
};

export const AccountingModel = {
  ensure: ensureAccountingSchema,

  bootstrap: async () => {
    await ensureAccountingSchema();
    const [standard, version, journals, period, templates, cash] = await Promise.all([
      query('SELECT * FROM accounting_standards ORDER BY id'),
      query('SELECT * FROM accounting_standard_versions WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'),
      query('SELECT * FROM accounting_journals ORDER BY code'),
      query(`SELECT * FROM accounting_periods ORDER BY start_date DESC LIMIT 1`),
      query(`SELECT t.*, j.code AS journal_code FROM accounting_entry_templates t LEFT JOIN accounting_journals j ON j.id = t.journal_id ORDER BY t.code`),
      query(`SELECT c.*, a.code AS account_code, a.name AS account_name
             FROM accounting_cash_accounts c JOIN accounting_accounts a ON a.id = c.account_id ORDER BY c.name`)
    ]);
    return {
      standard: standard.rows[0],
      version: version.rows[0],
      journals: journals.rows,
      current_period: period.rows[0] || null,
      templates: templates.rows,
      cash_accounts: cash.rows
    };
  },

  listAccounts: async ({ search, postable, active = true } = {}) => {
    await ensureAccountingSchema();
    const clauses = ['1=1'];
    const params = [];
    if (active !== 'all') {
      params.push(active !== false);
      clauses.push(`is_active = $${params.length}`);
    }
    if (postable) {
      params.push(true);
      clauses.push(`is_postable = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(code ILIKE $${params.length} OR name ILIKE $${params.length})`);
    }
    const result = await query(
      `SELECT * FROM accounting_accounts WHERE ${clauses.join(' AND ')} ORDER BY code`,
      params
    );
    return result.rows;
  },

  createAccount: async (data) => {
    await ensureAccountingSchema();
    const version = await query('SELECT id FROM accounting_standard_versions WHERE is_active = TRUE ORDER BY id DESC LIMIT 1');
    const result = await query(
      `INSERT INTO accounting_accounts
        (version_id, code, name, parent_id, mapping_key, balance_nature, is_postable, is_active, auxiliary_type, treasury_kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9)
       RETURNING *`,
      [
        version.rows[0].id, data.code, data.name, data.parent_id || null,
        data.mapping_key, data.balance_nature || 'debit',
        data.is_postable !== false, data.auxiliary_type || null, data.treasury_kind || null
      ]
    );
    return result.rows[0];
  },

  updateAccount: async (id, data) => {
    await ensureAccountingSchema();
    const result = await query(
      `UPDATE accounting_accounts SET
        name = COALESCE($1, name),
        mapping_key = COALESCE($2, mapping_key),
        is_active = COALESCE($3, is_active),
        is_postable = COALESCE($4, is_postable),
        auxiliary_type = $5,
        treasury_kind = $6
       WHERE id = $7 RETURNING *`,
      [data.name, data.mapping_key, data.is_active, data.is_postable, data.auxiliary_type ?? null, data.treasury_kind ?? null, id]
    );
    return result.rows[0] || null;
  },

  listJournals: async () => {
    await ensureAccountingSchema();
    const result = await query('SELECT * FROM accounting_journals ORDER BY code');
    return result.rows;
  },

  upsertJournal: async (data) => {
    await ensureAccountingSchema();
    if (data.id) {
      const result = await query(
        `UPDATE accounting_journals SET name=$1, journal_type=$2, is_active=$3 WHERE id=$4 RETURNING *`,
        [data.name, data.journal_type, data.is_active !== false, data.id]
      );
      return result.rows[0];
    }
    const result = await query(
      `INSERT INTO accounting_journals (code, name, journal_type) VALUES ($1,$2,$3) RETURNING *`,
      [data.code, data.name, data.journal_type || 'miscellaneous']
    );
    return result.rows[0];
  },

  listPeriods: async () => {
    await ensureAccountingSchema();
    const result = await query('SELECT * FROM accounting_periods ORDER BY start_date DESC');
    return result.rows;
  },

  createPeriod: async (data) => {
    await ensureAccountingSchema();
    const version = await query('SELECT id FROM accounting_standard_versions WHERE is_active = TRUE ORDER BY id DESC LIMIT 1');
    const result = await query(
      `INSERT INTO accounting_periods (name, start_date, end_date, status, standard_version_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [data.name, data.start_date, data.end_date, data.status || 'draft', version.rows[0].id]
    );
    return result.rows[0];
  },

  updatePeriodStatus: async (id, status, actorId) => {
    await ensureAccountingSchema();
    const allowed = ['draft', 'open', 'closed', 'locked'];
    if (!allowed.includes(status)) throw new AccountingError('Statut d’exercice invalide.');
    const current = await query('SELECT * FROM accounting_periods WHERE id = $1', [id]);
    if (!current.rows[0]) throw new AccountingError('Exercice introuvable.', 404);
    if (current.rows[0].status === 'locked' && status !== 'locked') {
      throw new AccountingError('Un exercice verrouillé ne peut plus être rouvert.', 409);
    }
    const result = await query(
      `UPDATE accounting_periods SET
        status = $1::varchar,
        closed_at = CASE WHEN $1::varchar IN ('closed','locked') THEN CURRENT_TIMESTAMP ELSE closed_at END,
        closed_by = CASE WHEN $1::varchar IN ('closed','locked') THEN $2::int ELSE closed_by END
       WHERE id = $3 RETURNING *`,
      [status, actorId || null, id]
    );
    await audit(null, { entity_type: 'period', entity_id: id, action: `status:${status}`, actor_id: actorId });
    return result.rows[0];
  },

  listParties: async () => {
    await ensureAccountingSchema();
    const clients = await query(`SELECT id, name, email, phone, nif, 'client' AS party_type FROM clients WHERE status IS NULL OR status <> 'INACTIVE' ORDER BY name`);
    const suppliers = await query(`SELECT id, name, email, phone, nif, 'supplier' AS party_type FROM suppliers WHERE status <> 'INACTIVE' ORDER BY name`);
    return { clients: clients.rows, suppliers: suppliers.rows };
  },

  createSupplier: async (data) => {
    await ensureAccountingSchema();
    if (!data.name?.trim()) throw new AccountingError('Le nom du fournisseur est obligatoire.');
    const result = await query(
      `INSERT INTO suppliers (name, contact_name, email, phone, address, nif, stat, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.name.trim(), data.contact_name || null, data.email || null, data.phone || null, data.address || null, data.nif || null, data.stat || null, data.notes || null]
    );
    return result.rows[0];
  },

  listCashAccounts: async () => {
    await ensureAccountingSchema();
    const result = await query(`
      SELECT c.*, a.code AS account_code, a.name AS account_name
      FROM accounting_cash_accounts c
      JOIN accounting_accounts a ON a.id = c.account_id
      ORDER BY c.kind, c.name
    `);
    return result.rows;
  },

  upsertCashAccount: async (data) => {
    await ensureAccountingSchema();
    if (data.id) {
      const result = await query(
        `UPDATE accounting_cash_accounts SET name=$1, kind=$2, account_id=$3, bank_name=$4, iban=$5, is_active=$6
         WHERE id=$7 RETURNING *`,
        [data.name, data.kind, data.account_id, data.bank_name || null, data.iban || null, data.is_active !== false, data.id]
      );
      return result.rows[0];
    }
    const result = await query(
      `INSERT INTO accounting_cash_accounts (name, kind, account_id, bank_name, iban)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [data.name, data.kind, data.account_id, data.bank_name || null, data.iban || null]
    );
    return result.rows[0];
  },

  listEntries: async ({ journal_id, period_id, status, search, from, to } = {}) => {
    await ensureAccountingSchema();
    const clauses = ['1=1'];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      clauses.push(sql.replace('?', `$${params.length}`));
    };
    if (journal_id) add('e.journal_id = ?', journal_id);
    if (period_id) add('e.period_id = ?', period_id);
    if (status) add('e.status = ?', status);
    if (from) add('e.entry_date >= ?', from);
    if (to) add('e.entry_date <= ?', to);
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(e.entry_number ILIKE $${params.length} OR e.reference ILIKE $${params.length} OR e.label ILIKE $${params.length})`);
    }
    const result = await query(`
      SELECT e.*, j.code AS journal_code, j.name AS journal_name, p.name AS period_name,
             u.username AS created_by_name
      FROM accounting_entries e
      JOIN accounting_journals j ON j.id = e.journal_id
      JOIN accounting_periods p ON p.id = e.period_id
      LEFT JOIN users u ON u.id = e.created_by
      WHERE ${clauses.join(' AND ')}
      ORDER BY e.entry_date DESC, e.id DESC
      LIMIT 400
    `, params);
    return result.rows;
  },

  getEntry: async (id) => {
    await ensureAccountingSchema();
    const result = await query(`
      SELECT e.*, j.code AS journal_code, j.name AS journal_name, p.name AS period_name, p.status AS period_status
      FROM accounting_entries e
      JOIN accounting_journals j ON j.id = e.journal_id
      JOIN accounting_periods p ON p.id = e.period_id
      WHERE e.id = $1
    `, [id]);
    if (!result.rows[0]) return null;
    const lines = await fetchLines(id);
    return mapEntry(result.rows[0], lines);
  },

  saveDraft: async (data, actorId) => {
    await ensureAccountingSchema();
    validateLines(data.lines);
    const period = data.period_id
      ? (await query('SELECT * FROM accounting_periods WHERE id = $1', [data.period_id])).rows[0]
      : await getPeriodForDate(data.entry_date);
    if (!period) throw new AccountingError('Aucun exercice ne couvre cette date.');
    if (period.status === 'closed' || period.status === 'locked') {
      throw new AccountingError('Impossible d’écrire dans un exercice clôturé ou verrouillé.', 409);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let entryId = data.id || null;
      if (entryId) {
        const existing = (await client.query('SELECT * FROM accounting_entries WHERE id = $1', [entryId])).rows[0];
        assertEntryMutable(existing);
        await client.query(
          `UPDATE accounting_entries SET
            period_id=$1, journal_id=$2, entry_date=$3, reference=$4, label=$5,
            source_type=$6, source_id=$7, source_reference=$8, updated_at=CURRENT_TIMESTAMP
           WHERE id=$9`,
          [
            period.id, data.journal_id, data.entry_date, data.reference || null, data.label,
            data.source_type || null, asSourceId(data.source_id), data.source_reference || null, entryId
          ]
        );
        await client.query('DELETE FROM accounting_entry_lines WHERE entry_id = $1', [entryId]);
      } else {
        const inserted = await client.query(
          `INSERT INTO accounting_entries
            (period_id, journal_id, entry_date, reference, label, status, source_type, source_id, source_reference, created_by)
           VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9)
           RETURNING id`,
          [
            period.id, data.journal_id, data.entry_date, data.reference || null, data.label,
            data.source_type || null, asSourceId(data.source_id), data.source_reference || null, asUserId(actorId)
          ]
        );
        entryId = inserted.rows[0].id;
      }
      await insertLines(client, entryId, data.lines);
      await audit(client, { entity_type: 'entry', entity_id: entryId, action: 'save_draft', actor_id: actorId });
      await client.query('COMMIT');
      return AccountingModel.getEntry(entryId);
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw new AccountingError('Une écriture existe déjà pour cette source.', 409);
      throw error;
    } finally {
      client.release();
    }
  },

  postEntry: async (id, actorId) => {
    await ensureAccountingSchema();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const entry = (await client.query('SELECT * FROM accounting_entries WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!entry) throw new AccountingError('Écriture introuvable.', 404);
      if (entry.status !== 'draft') throw new AccountingError('Seule une écriture brouillon peut être comptabilisée.', 409);
      const period = (await client.query('SELECT * FROM accounting_periods WHERE id = $1 FOR UPDATE', [entry.period_id])).rows[0];
      assertPeriodWritable(period);
      const lines = await fetchLines(id, client);
      validateLines(lines);
      const year = new Date(entry.entry_date).getFullYear();
      const entryNumber = await nextEntryNumber(client, entry.journal_id, year);
      await client.query(
        `UPDATE accounting_entries SET
          status='posted', entry_number=$1, posted_by=$2, posted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
         WHERE id=$3`,
        [entryNumber, asUserId(actorId), id]
      );
      await audit(client, { entity_type: 'entry', entity_id: id, action: 'post', actor_id: actorId, details: { entry_number: entryNumber } });
      await client.query('COMMIT');
      return AccountingModel.getEntry(id);
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw new AccountingError('Une écriture comptabilisée existe déjà pour cette source.', 409);
      throw error;
    } finally {
      client.release();
    }
  },

  reverseEntry: async (id, actorId, { date, label } = {}) => {
    await ensureAccountingSchema();
    const original = await AccountingModel.getEntry(id);
    if (!original) throw new AccountingError('Écriture introuvable.', 404);
    if (original.status !== 'posted' && original.status !== 'locked') {
      throw new AccountingError('Seule une écriture comptabilisée peut être contre-passée.', 409);
    }
    const reversalDate = date || original.entry_date;
    const period = await getPeriodForDate(reversalDate);
    assertPeriodWritable(period);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const year = new Date(reversalDate).getFullYear();
      const entryNumber = await nextEntryNumber(client, original.journal_id, year);
      const inserted = await client.query(
        `INSERT INTO accounting_entries
          (period_id, journal_id, entry_date, entry_number, reference, label, status, reversal_of_id, created_by, posted_by, posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,'posted',$7,$8,$8,CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          period.id, original.journal_id, reversalDate, entryNumber,
          original.reference, label || `Contre-passation de ${original.entry_number}`,
          original.id, asUserId(actorId)
        ]
      );
      await insertLines(client, inserted.rows[0].id, reversedLines(original.lines));
      await client.query(`UPDATE accounting_entries SET status='reversed', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [original.id]);
      await audit(client, { entity_type: 'entry', entity_id: original.id, action: 'reverse', actor_id: actorId, details: { reversal_id: inserted.rows[0].id } });
      await client.query('COMMIT');
      return AccountingModel.getEntry(inserted.rows[0].id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  deleteDraft: async (id) => {
    await ensureAccountingSchema();
    const existing = (await query('SELECT * FROM accounting_entries WHERE id = $1', [id])).rows[0];
    assertEntryMutable(existing);
    await query('DELETE FROM accounting_entries WHERE id = $1 AND status = \'draft\'', [id]);
    return existing;
  },

  journalBook: async ({ journal_id, from, to, period_id }) => {
    await ensureAccountingSchema();
    const clauses = [`e.status IN ('posted','locked','reversed')`];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      clauses.push(sql.replace('?', `$${params.length}`));
    };
    if (journal_id) add('e.journal_id = ?', journal_id);
    if (period_id) add('e.period_id = ?', period_id);
    if (from) add('e.entry_date >= ?', from);
    if (to) add('e.entry_date <= ?', to);
    const result = await query(`
      SELECT e.entry_date, e.entry_number, e.reference, e.label AS entry_label, e.status,
             j.code AS journal_code, l.debit, l.credit, l.label AS line_label,
             a.code AS account_code, a.name AS account_name
      FROM accounting_entries e
      JOIN accounting_journals j ON j.id = e.journal_id
      JOIN accounting_entry_lines l ON l.entry_id = e.id
      JOIN accounting_accounts a ON a.id = l.account_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY e.entry_date, e.entry_number, l.line_no
    `, params);
    return result.rows;
  },

  ledger: async ({ account_id, from, to, period_id }) => {
    await ensureAccountingSchema();
    if (!account_id) throw new AccountingError('Compte obligatoire pour le grand livre.');
    const account = (await query('SELECT * FROM accounting_accounts WHERE id = $1', [account_id])).rows[0];
    if (!account) throw new AccountingError('Compte introuvable.', 404);
    const clauses = [`e.status IN ('posted','locked')`, 'l.account_id = $1'];
    const params = [account_id];
    if (period_id) {
      params.push(period_id);
      clauses.push(`e.period_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      clauses.push(`e.entry_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      clauses.push(`e.entry_date <= $${params.length}`);
    }
    let opening = { rows: [{ debit: 0, credit: 0 }] };
    if (from) {
      opening = await query(`
        SELECT COALESCE(SUM(l.debit),0)::numeric AS debit, COALESCE(SUM(l.credit),0)::numeric AS credit
        FROM accounting_entry_lines l
        JOIN accounting_entries e ON e.id = l.entry_id
        WHERE e.status IN ('posted','locked') AND l.account_id = $1 AND e.entry_date < $2
      `, [account_id, from]);
    }
    const movements = await query(`
      SELECT e.entry_date, e.entry_number, e.reference, COALESCE(l.label, e.label) AS label, l.debit, l.credit
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY e.entry_date, e.entry_number, l.line_no
    `, params);
    const open = splitBalance(opening.rows[0].debit, opening.rows[0].credit);
    const openingBalance = account.balance_nature === 'credit'
      ? money(open.credit_balance - open.debit_balance)
      : money(open.debit_balance - open.credit_balance);
    const rows = progressiveBalance(
      [{ entry_date: from || null, entry_number: '', reference: '', label: 'Solde d’ouverture', debit: openingBalance > 0 && account.balance_nature !== 'credit' ? openingBalance : 0, credit: openingBalance > 0 && account.balance_nature === 'credit' ? openingBalance : (openingBalance < 0 ? money(-openingBalance) : 0) }, ...movements.rows],
      account.balance_nature
    );
    return { account, rows };
  },

  trialBalance: async ({ from, to, period_id } = {}) => {
    await ensureAccountingSchema();
    const clauses = [`e.status IN ('posted','locked')`];
    const params = [];
    if (period_id) {
      params.push(period_id);
      clauses.push(`e.period_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      clauses.push(`e.entry_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      clauses.push(`e.entry_date <= $${params.length}`);
    }
    const result = await query(`
      SELECT a.id, a.code, a.name, a.mapping_key, a.balance_nature,
             COALESCE(SUM(l.debit),0)::numeric AS debit,
             COALESCE(SUM(l.credit),0)::numeric AS credit
      FROM accounting_accounts a
      LEFT JOIN accounting_entry_lines l ON l.account_id = a.id
      LEFT JOIN accounting_entries e ON e.id = l.entry_id AND ${clauses.join(' AND ')}
      WHERE a.is_postable = TRUE
      GROUP BY a.id
      HAVING COALESCE(SUM(l.debit),0) <> 0 OR COALESCE(SUM(l.credit),0) <> 0
      ORDER BY a.code
    `, params);
    const rows = result.rows.map((row) => ({
      ...row,
      ...splitBalance(row.debit, row.credit)
    }));
    const totals = rows.reduce((acc, row) => {
      acc.debit = money(acc.debit + Number(row.debit));
      acc.credit = money(acc.credit + Number(row.credit));
      acc.debit_balance = money(acc.debit_balance + row.debit_balance);
      acc.credit_balance = money(acc.credit_balance + row.credit_balance);
      return acc;
    }, { debit: 0, credit: 0, debit_balance: 0, credit_balance: 0 });
    return { rows, totals };
  },

  statements: async ({ from, to, period_id } = {}) => {
    await ensureAccountingSchema();
    const version = (await query('SELECT id FROM accounting_standard_versions WHERE is_active = TRUE ORDER BY id DESC LIMIT 1')).rows[0];
    const structures = (await query(
      'SELECT * FROM accounting_report_structures WHERE version_id = $1 ORDER BY sort_order',
      [version.id]
    )).rows;
    const clauses = [`e.status IN ('posted','locked')`];
    const params = [];
    if (period_id) {
      params.push(period_id);
      clauses.push(`e.period_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      clauses.push(`e.entry_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      clauses.push(`e.entry_date <= $${params.length}`);
    }
    const sums = await query(`
      SELECT a.mapping_key,
             COALESCE(SUM(l.debit),0)::numeric AS debit,
             COALESCE(SUM(l.credit),0)::numeric AS credit
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      JOIN accounting_accounts a ON a.id = l.account_id
      WHERE ${clauses.join(' AND ')}
      GROUP BY a.mapping_key
    `, params);
    const pnl = buildStatement(sums.rows, structures, 'pnl');
    const income = pnl.filter((s) => s.code === 'INCOME').reduce((sum, s) => money(sum + s.total), 0);
    const expense = pnl.filter((s) => s.code === 'EXPENSE').reduce((sum, s) => money(sum + s.total), 0);
    const result = money(income - expense);
    const balance = buildStatement(sums.rows, structures, 'balance');
    const equity = balance.find((s) => s.code === 'EQUITY');
    if (equity) {
      equity.groups.push({ mapping_key: 'RESULT', label: 'Résultat de la période', amount: result });
      equity.total = money(equity.total + result);
    }
    const assets = balance.filter((s) => s.code === 'ASSET').reduce((sum, s) => money(sum + s.total), 0);
    const liabilities = balance.filter((s) => s.code !== 'ASSET').reduce((sum, s) => money(sum + s.total), 0);
    return {
      pnl: { sections: pnl, income, expense, result },
      balance: { sections: balance, assets, liabilities }
    };
  },

  auxiliaryBalance: async ({ party_type } = {}) => {
    await ensureAccountingSchema();
    const clauses = [`e.status IN ('posted','locked')`, 'l.party_type IS NOT NULL', 'l.party_id IS NOT NULL'];
    const params = [];
    if (party_type) {
      params.push(party_type);
      clauses.push(`l.party_type = $${params.length}`);
    }
    const result = await query(`
      SELECT l.party_type, l.party_id,
             COALESCE(SUM(l.debit),0)::numeric AS debit,
             COALESCE(SUM(l.credit),0)::numeric AS credit
      FROM accounting_entry_lines l
      JOIN accounting_entries e ON e.id = l.entry_id
      WHERE ${clauses.join(' AND ')}
      GROUP BY l.party_type, l.party_id
    `, params);
    const parties = await AccountingModel.listParties();
    const nameOf = (type, id) => {
      const list = type === 'supplier' ? parties.suppliers : parties.clients;
      return list.find((item) => Number(item.id) === Number(id))?.name || `#${id}`;
    };
    return result.rows.map((row) => ({
      ...row,
      name: nameOf(row.party_type, row.party_id),
      ...splitBalance(row.debit, row.credit)
    }));
  },

  treasury: async ({ cash_account_id, from, to } = {}) => {
    await ensureAccountingSchema();
    const accounts = await AccountingModel.listCashAccounts();
    const selected = cash_account_id
      ? accounts.filter((item) => Number(item.id) === Number(cash_account_id))
      : accounts;
    const results = [];
    for (const cash of selected) {
      const ledger = await AccountingModel.ledger({ account_id: cash.account_id, from, to });
      const last = ledger.rows[ledger.rows.length - 1];
      results.push({
        ...cash,
        balance: last?.running_balance || 0,
        movements: ledger.rows.slice(1)
      });
    }
    return results;
  },

  listPostingRules: async () => {
    await ensureAccountingSchema();
    const result = await query(`
      SELECT r.*, a.code AS account_code, a.name AS account_name,
             c.name AS cash_account_name, v.code AS vat_account_code, j.code AS journal_code
      FROM accounting_posting_rules r
      JOIN accounting_accounts a ON a.id = r.account_id
      LEFT JOIN accounting_cash_accounts c ON c.id = r.cash_account_id
      LEFT JOIN accounting_accounts v ON v.id = r.vat_account_id
      LEFT JOIN accounting_journals j ON j.id = r.journal_id
      ORDER BY r.transaction_type, COALESCE(r.category, '')
    `);
    return result.rows;
  },

  upsertPostingRule: async (data) => {
    await ensureAccountingSchema();
    if (data.id) {
      const result = await query(
        `UPDATE accounting_posting_rules SET
          transaction_type=$1, category=$2, account_id=$3, cash_account_id=$4,
          vat_account_id=$5, journal_id=$6, is_active=$7
         WHERE id=$8 RETURNING *`,
        [
          data.transaction_type, data.category || null, data.account_id,
          data.cash_account_id || null, data.vat_account_id || null,
          data.journal_id || null, data.is_active !== false, data.id
        ]
      );
      return result.rows[0];
    }
    const result = await query(
      `INSERT INTO accounting_posting_rules
        (transaction_type, category, account_id, cash_account_id, vat_account_id, journal_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        data.transaction_type, data.category || null, data.account_id,
        data.cash_account_id || null, data.vat_account_id || null,
        data.journal_id || null, data.is_active !== false
      ]
    );
    return result.rows[0];
  },

  findEntryBySource: async (sourceType, sourceId) => {
    await ensureAccountingSchema();
    const result = await query(
      `SELECT * FROM accounting_entries
       WHERE source_type = $1 AND source_id::text = $2 AND status IN ('draft','posted','locked')
       ORDER BY id DESC LIMIT 1`,
      [sourceType, asSourceId(sourceId)]
    );
    if (!result.rows[0]) return null;
    return AccountingModel.getEntry(result.rows[0].id);
  },

  pendingFinanceTransactions: async () => {
    await ensureAccountingSchema();
    const result = await query(`
      SELECT id, description, amount, total_amount, type_transaction, category, date_transaction,
             accounting_status, accounting_error, auto_post, accounting_entry_id
      FROM finances
      WHERE COALESCE(is_quote, FALSE) = FALSE
        AND COALESCE(accounting_status, 'unposted') IN ('unposted', 'error')
      ORDER BY date_transaction DESC, id DESC
      LIMIT 50
    `);
    return result.rows;
  },

  dashboard: async () => {
    await ensureAccountingSchema();
    const period = (await query(`SELECT * FROM accounting_periods WHERE status = 'open' ORDER BY start_date DESC LIMIT 1`)).rows[0]
      || (await query('SELECT * FROM accounting_periods ORDER BY start_date DESC LIMIT 1')).rows[0];
    const filters = period ? { period_id: period.id } : {};
    const [tb, statements, entries, cash, pending] = await Promise.all([
      AccountingModel.trialBalance(filters),
      AccountingModel.statements(filters),
      AccountingModel.listEntries({ period_id: period?.id }),
      AccountingModel.treasury(filters),
      AccountingModel.pendingFinanceTransactions()
    ]);
    const cashBalance = cash.reduce((sum, item) => money(sum + Number(item.balance || 0)), 0);
    return {
      period,
      cash_balance: cashBalance,
      revenue: statements.pnl.income,
      expenses: statements.pnl.expense,
      result: statements.pnl.result,
      trial_balanced: money(tb.totals.debit - tb.totals.credit) === 0,
      recent_entries: entries.slice(0, 8),
      pending_transactions: pending,
      alerts: [
        period?.status !== 'open' ? 'Aucun exercice ouvert.' : null,
        money(tb.totals.debit - tb.totals.credit) !== 0 ? 'La balance n’est pas équilibrée.' : null,
        pending.length ? `${pending.length} transaction(s) en attente de comptabilisation.` : null
      ].filter(Boolean)
    };
  }
};
