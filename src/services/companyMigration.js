import { query } from '../config/db.js';
import { AccountingModel } from '../models/accountingModel.js';
import { FinanceModel } from '../models/financeModel.js';
import { AccountingError, money } from './accountingEngine.js';

const CAPITAL_SOURCE_TYPE = 'capital';
const CAPITAL_LABEL = 'Apport en capital social';

const asDate = (value, fallback) => {
  const text = String(value || fallback || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
};

export const closeLegacyPeriods = async (startDate, actorId) => {
  // Marque comme historiques (EI) tous les exercices qui démarrent avant la Société,
  // afin que leurs écritures n’apparaissent plus dans les rapports de la Société.
  await query(
    `UPDATE accounting_periods SET is_legacy = TRUE WHERE start_date < $1::date AND COALESCE(is_legacy, FALSE) = FALSE`,
    [startDate]
  );

  const result = await query(
    `UPDATE accounting_periods
     SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = $1::int
     WHERE status IN ('open', 'draft')
       AND start_date < $2::date
     RETURNING id, name`,
    [actorId || null, startDate]
  );
  return result.rows;
};

export const ensureCompanyPeriod = async ({ startDate, endDate }) => {
  const start = asDate(startDate, new Date().toISOString().split('T')[0]);
  const end = asDate(endDate, `${new Date(start).getFullYear()}-12-31`);

  const existing = await query(
    'SELECT * FROM accounting_periods WHERE start_date = $1::date ORDER BY id LIMIT 1',
    [start]
  );
  if (existing.rows[0]) {
    if (existing.rows[0].status !== 'open' || existing.rows[0].is_legacy) {
      await query(`UPDATE accounting_periods SET status = 'open', is_legacy = FALSE WHERE id = $1`, [existing.rows[0].id]);
      existing.rows[0].status = 'open';
      existing.rows[0].is_legacy = false;
    }
    return existing.rows[0];
  }

  const version = await query('SELECT id FROM accounting_standard_versions WHERE is_active = TRUE ORDER BY id DESC LIMIT 1');
  const created = await query(
    `INSERT INTO accounting_periods (name, start_date, end_date, status, standard_version_id)
     VALUES ($1, $2::date, $3::date, 'open', $4)
     RETURNING *`,
    [`Exercice Société ${start}`, start, end, version.rows[0].id]
  );
  return created.rows[0];
};

export const recordCapitalSocial = async ({ amount, cashAccountId, date, periodId, actorId, label }) => {
  await AccountingModel.ensure();
  const amountNum = money(amount);
  if (!(amountNum > 0)) {
    throw new AccountingError('Le montant du capital social doit être supérieur à zéro.');
  }

  const existing = await query(
    `SELECT id FROM accounting_entries
     WHERE source_type = $1 AND status IN ('posted', 'locked')
     ORDER BY id DESC LIMIT 1`,
    [CAPITAL_SOURCE_TYPE]
  );
  if (existing.rows[0]) {
    const entry = await AccountingModel.getEntry(existing.rows[0].id);
    const tx = await query(
      `SELECT * FROM finances WHERE accounting_entry_id = $1 AND type_transaction = 'apport' ORDER BY id DESC LIMIT 1`,
      [existing.rows[0].id]
    );
    if (tx.rows[0]) {
      return { entry, transaction: tx.rows[0], already: true };
    }

    // Répare un état partiel : écriture comptable présente mais transaction absente.
    const cashAccounts = await AccountingModel.listCashAccounts();
    const cashLine = entry.lines.find(
      (line) => Number(line.debit) > 0
        && cashAccounts.some((cash) => Number(cash.account_id) === Number(line.account_id))
    );
    const cash = cashAccounts.find((item) => Number(item.account_id) === Number(cashLine?.account_id));
    const totalDebit = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const transaction = await FinanceModel.addCapitalTransaction({
      description: label || CAPITAL_LABEL,
      amount: money(totalDebit),
      date: entry.entry_date,
      cashAccountId: cash?.id || cashAccountId || null,
      accountingEntryId: entry.id
    });
    return { entry, transaction, already: true, repaired: true };
  }

  const cashAccounts = await AccountingModel.listCashAccounts();
  const cash = cashAccounts.find((item) => Number(item.id) === Number(cashAccountId) && item.is_active !== false)
    || cashAccounts.find((item) => item.kind === 'bank' && item.is_active !== false)
    || cashAccounts.find((item) => item.is_active !== false)
    || cashAccounts[0];
  if (!cash) {
    throw new AccountingError('Aucun compte de trésorerie n’est configuré. Créez-le dans Comptabilité → Trésorerie.');
  }

  const accounts = await AccountingModel.listAccounts({ postable: true });
  const capital = accounts.find((item) => item.code === '101');
  if (!capital) {
    throw new AccountingError('Le compte 101 Capital est absent du plan comptable.');
  }

  const journals = await AccountingModel.listJournals();
  const journal = journals.find((item) => item.code === 'OD') || journals[0];
  if (!journal) {
    throw new AccountingError('Aucun journal comptable n’est configuré.');
  }

  const entryDate = asDate(date, new Date().toISOString().split('T')[0]);

  const draft = await AccountingModel.saveDraft({
    journal_id: journal.id,
    period_id: periodId || undefined,
    entry_date: entryDate,
    label: label || CAPITAL_LABEL,
    source_type: CAPITAL_SOURCE_TYPE,
    source_id: null,
    source_reference: null,
    lines: [
      { account_id: cash.account_id, debit: amountNum, credit: 0, label: 'Trésorerie' },
      { account_id: capital.id, debit: 0, credit: amountNum, label: 'Capital social' }
    ]
  }, actorId);

  const posted = await AccountingModel.postEntry(draft.id, actorId);
  const transaction = await FinanceModel.addCapitalTransaction({
    description: label || CAPITAL_LABEL,
    amount: amountNum,
    date: entryDate,
    cashAccountId: cash.id,
    accountingEntryId: posted.id
  });

  return { entry: posted, transaction, already: false };
};

export const migrateToCompany = async ({ startDate, endDate, capitalAmount, cashAccountId, actorId }) => {
  await AccountingModel.ensure();

  const start = asDate(startDate, new Date().toISOString().split('T')[0]);
  if (!start) {
    throw new AccountingError('Indiquez la date de début de l’exercice (constitution de la société).');
  }

  const archivedCount = await FinanceModel.archiveBefore(start);
  const closedPeriods = await closeLegacyPeriods(start, actorId);
  const period = await ensureCompanyPeriod({ startDate: start, endDate });

  let capital = null;
  if (capitalAmount != null) {
    capital = await recordCapitalSocial({
      amount: capitalAmount,
      cashAccountId,
      date: start,
      periodId: period.id,
      actorId,
      label: 'Apport en capital social'
    });
  }

  return {
    start_date: start,
    archived_transactions: archivedCount,
    closed_periods: closedPeriods,
    period,
    capital
  };
};
