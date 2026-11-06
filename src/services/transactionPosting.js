import { query } from '../config/db.js';
import { AccountingModel } from '../models/accountingModel.js';
import { AccountingError, money, validateLines } from './accountingEngine.js';
import { suggestValidatedPlan } from './accountSuggestion.js';

const SOURCE = 'finance';

const ensureFinanceColumns = async () => {
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS auto_post BOOLEAN DEFAULT TRUE`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(20) DEFAULT 'unposted'`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS accounting_entry_id INTEGER`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS accounting_error TEXT`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS cash_account_id INTEGER`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS accounting_source VARCHAR(20)`);
  await query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS accounting_rationale TEXT`);
};

const markFinance = async (id, fields) => {
  await ensureFinanceColumns();
  const result = await query(
    `UPDATE finances SET
      auto_post = COALESCE($2, auto_post),
      accounting_status = COALESCE($3, accounting_status),
      accounting_entry_id = COALESCE($4, accounting_entry_id),
      accounting_error = $5,
      cash_account_id = COALESCE($6, cash_account_id),
      accounting_source = $7,
      accounting_rationale = $8
     WHERE id = $1
     RETURNING *`,
    [
      id,
      fields.auto_post ?? null,
      fields.accounting_status ?? null,
      fields.accounting_entry_id ?? null,
      fields.accounting_error ?? null,
      fields.cash_account_id ?? null,
      fields.accounting_source ?? null,
      fields.accounting_rationale ?? null
    ]
  );
  return result.rows[0];
};

const pickRule = (rules, type, category) => {
  const exact = rules.find((rule) => rule.transaction_type === type && rule.category === category && rule.is_active !== false);
  if (exact) return exact;
  return rules.find((rule) => rule.transaction_type === type && !rule.category && rule.is_active !== false) || null;
};

export const resolveRulePlan = async (transaction) => {
  await AccountingModel.ensure();
  const type = transaction.type_transaction || transaction.type;
  const category = transaction.category || null;
  const rules = await AccountingModel.listPostingRules();
  const rule = pickRule(rules, type, category);
  if (!rule) {
    throw new AccountingError(
      `Aucune règle de comptabilisation pour ${type}${category ? ` / ${category}` : ''}. Configurez-la dans Comptabilité → Paramètres.`
    );
  }

  const cashAccounts = await AccountingModel.listCashAccounts();
  const cash = cashAccounts.find((item) => Number(item.id) === Number(transaction.cash_account_id || rule.cash_account_id))
    || cashAccounts.find((item) => item.kind === 'bank')
    || cashAccounts[0];
  if (!cash) throw new AccountingError('Aucun compte de trésorerie n’est configuré.');

  const journals = await AccountingModel.listJournals();
  const journal = (rule.journal_id && journals.find((item) => Number(item.id) === Number(rule.journal_id)))
    || journals.find((item) => item.code === (cash.kind === 'cash' ? 'CAI' : 'BQ'))
    || journals[0];
  if (!journal) throw new AccountingError('Aucun journal comptable n’est configuré.');

  const ht = money(transaction.amount);
  const tax = money(transaction.tax_amount);
  const ttc = money(transaction.total_amount || (ht + tax));
  if (ttc <= 0) throw new AccountingError('Le montant à comptabiliser doit être supérieur à zéro.');
  if (tax > 0 && !rule.vat_account_id) {
    throw new AccountingError('TVA présente mais aucun compte de TVA n’est associé à la règle de comptabilisation.');
  }

  const label = transaction.description || 'Transaction';
  const isIncome = type === 'revenu';
  const lines = [];

  if (isIncome) {
    lines.push({ account_id: cash.account_id, debit: ttc, credit: 0, label, party_type: null, party_id: null });
    lines.push({
      account_id: rule.account_id,
      debit: 0,
      credit: tax > 0 ? ht : ttc,
      label,
      party_type: transaction.client_id ? 'client' : null,
      party_id: transaction.client_id || null
    });
    if (tax > 0) {
      lines.push({ account_id: rule.vat_account_id, debit: 0, credit: tax, label: 'TVA collectée', party_type: null, party_id: null });
    }
  } else {
    lines.push({ account_id: rule.account_id, debit: tax > 0 ? ht : ttc, credit: 0, label, party_type: null, party_id: null });
    if (tax > 0) {
      lines.push({ account_id: rule.vat_account_id, debit: tax, credit: 0, label: 'TVA déductible', party_type: null, party_id: null });
    }
    lines.push({ account_id: cash.account_id, debit: 0, credit: ttc, label, party_type: null, party_id: null });
  }

  validateLines(lines);
  return { source: 'rule', rule, cash, journal, lines, label, rationale: null };
};

export const resolvePostingPlan = async (transaction) => {
  await AccountingModel.ensure();
  try {
    const aiPlan = await suggestValidatedPlan(transaction);
    if (aiPlan) return aiPlan;
  } catch {
    // Repli volontaire : une proposition IA invalide ne bloque pas si une règle existe.
  }
  return resolveRulePlan(transaction);
};

const accountByCode = (accounts, codes) => {
  for (const code of codes) {
    const match = accounts.find((item) => item.code === code && item.is_postable !== false);
    if (match) return match;
  }
  return null;
};

export const resolveQuoteReceiptPlan = async (transaction, cashAccountId) => {
  await AccountingModel.ensure();
  const cashAccounts = await AccountingModel.listCashAccounts();
  const cash = cashAccounts.find((item) => Number(item.id) === Number(cashAccountId) && item.is_active !== false);
  if (!cash) {
    throw new AccountingError('Indiquez le moyen de paiement (banque, caisse ou autre compte de trésorerie).');
  }

  const ht = money(transaction.amount);
  const tax = money(transaction.tax_amount);
  const ttc = money(transaction.total_amount || (ht + tax));
  if (ttc <= 0) throw new AccountingError('Le montant dû doit être supérieur à zéro.');

  const accounts = await AccountingModel.listAccounts({ postable: true });
  const advance = accountByCode(accounts, ['4191', '419']);
  if (!advance) {
    throw new AccountingError('Le compte 4191 (acomptes reçus) est absent du plan comptable.');
  }
  if (tax > 0 && !accountByCode(accounts, ['4457', '445'])) {
    throw new AccountingError('TVA présente mais le compte 4457 (TVA collectée) n’est pas configuré.');
  }
  const vat = tax > 0 ? accountByCode(accounts, ['4457', '445']) : null;

  const journals = await AccountingModel.listJournals();
  const journal = journals.find((item) => item.code === (cash.kind === 'cash' ? 'CAI' : 'BQ'))
    || journals.find((item) => item.code === 'OD')
    || journals[0];
  if (!journal) throw new AccountingError('Aucun journal comptable n’est configuré.');

  const label = transaction.description || 'Acompte sur devis';
  const lines = [
    {
      account_id: cash.account_id,
      debit: ttc,
      credit: 0,
      label,
      party_type: null,
      party_id: null
    },
    {
      account_id: advance.id,
      debit: 0,
      credit: tax > 0 ? ht : ttc,
      label,
      party_type: transaction.client_id ? 'client' : null,
      party_id: transaction.client_id || null
    }
  ];
  if (tax > 0 && vat) {
    lines.push({
      account_id: vat.id,
      debit: 0,
      credit: tax,
      label: 'TVA collectée sur acompte',
      party_type: null,
      party_id: null
    });
  }
  validateLines(lines);
  return {
    source: 'quote',
    cash,
    journal,
    lines,
    label,
    rationale: `Acompte reçu sur ${cash.name} (${cash.account_code}) / ${advance.code} ${advance.name}`
  };
};

export const postQuoteReceipt = async (transaction, { actorId, cashAccountId } = {}) => {
  await AccountingModel.ensure();
  await ensureFinanceColumns();
  try {
    const existing = await AccountingModel.findEntryBySource(SOURCE, transaction.id);
    if (existing && (existing.status === 'posted' || existing.status === 'locked')) {
      throw new AccountingError('Cet encaissement est déjà lié à une écriture comptabilisée.', 409);
    }
    const plan = await resolveQuoteReceiptPlan(transaction, cashAccountId);
    const draft = await AccountingModel.saveDraft({
      id: existing?.status === 'draft' ? existing.id : null,
      journal_id: plan.journal.id,
      entry_date: transaction.date_transaction || transaction.date,
      reference: transaction.quote_number || `DEV-${transaction.id}`,
      label: plan.label,
      source_type: SOURCE,
      source_id: transaction.id,
      source_reference: transaction.quote_number || String(transaction.id),
      lines: plan.lines
    }, actorId);
    const posted = await AccountingModel.postEntry(draft.id, actorId);
    return persistStatus(
      transaction.id,
      true,
      cashAccountId || plan.cash.id,
      'posted',
      posted.id,
      null,
      { source: plan.source, rationale: plan.rationale }
    );
  } catch (error) {
    if (error.status !== 409) {
      await persistStatus(transaction.id, true, cashAccountId, 'error', null, error.message, { source: 'quote' });
    }
    throw error;
  }
};

const persistStatus = async (financeId, autoPost, cashAccountId, status, entryId, error, extra = {}) => {
  return markFinance(financeId, {
    auto_post: autoPost,
    cash_account_id: cashAccountId,
    accounting_status: status,
    accounting_entry_id: entryId,
    accounting_error: error,
    accounting_source: extra.source ?? null,
    accounting_rationale: extra.rationale ?? null
  });
};

export const postFinanceTransaction = async (transaction, { actorId, force = false } = {}) => {
  await AccountingModel.ensure();
  await ensureFinanceColumns();
  const existing = await AccountingModel.findEntryBySource(SOURCE, transaction.id);
  if (existing && (existing.status === 'posted' || existing.status === 'locked') && !force) {
    throw new AccountingError('Cette transaction est déjà liée à une écriture comptabilisée.', 409);
  }

  const plan = await resolvePostingPlan(transaction);
  let entryId = existing?.status === 'draft' ? existing.id : null;
  const payload = {
    id: entryId,
    journal_id: plan.journal.id,
    entry_date: transaction.date_transaction || transaction.date,
    reference: transaction.invoice_number || `FIN-${transaction.id}`,
    label: plan.label,
    source_type: SOURCE,
    source_id: transaction.id,
    source_reference: transaction.invoice_number || String(transaction.id),
    lines: plan.lines
  };
  const draft = await AccountingModel.saveDraft(payload, actorId);
  const posted = await AccountingModel.postEntry(draft.id, actorId);
  return persistStatus(
    transaction.id,
    true,
    transaction.cash_account_id || plan.cash.id,
    'posted',
    posted.id,
    null,
    { source: plan.source, rationale: plan.rationale }
  );
};

export const syncFinanceAccounting = async (transaction, { autoPost, actorId } = {}) => {
  await AccountingModel.ensure();
  await ensureFinanceColumns();
  const enabled = autoPost !== false && autoPost !== 'false' && autoPost !== 0;
  if (!enabled) {
    const existing = await AccountingModel.findEntryBySource(SOURCE, transaction.id);
    if (existing?.status === 'posted' || existing?.status === 'locked') {
      return persistStatus(transaction.id, false, transaction.cash_account_id, 'posted', existing.id, null);
    }
    return persistStatus(transaction.id, false, transaction.cash_account_id, 'unposted', null, null);
  }

  const existing = await AccountingModel.findEntryBySource(SOURCE, transaction.id);
  try {
    if (existing?.status === 'posted' || existing?.status === 'locked') {
      await AccountingModel.reverseEntry(existing.id, actorId, {
        date: transaction.date_transaction || transaction.date,
        label: `Correction de ${existing.entry_number}`
      });
      const refreshed = { ...transaction, accounting_entry_id: null };
      return postFinanceTransaction(refreshed, { actorId, force: true });
    }
    return await postFinanceTransaction(transaction, { actorId });
  } catch (error) {
    const updated = await persistStatus(
      transaction.id,
      true,
      transaction.cash_account_id,
      'error',
      transaction.accounting_entry_id,
      error.message
    );
    return { ...updated, accounting_failed: true, accounting_error: error.message };
  }
};

export const handleFinanceDelete = async (transaction, actorId) => {
  if (!transaction) return;
  await AccountingModel.ensure();
  const existing = await AccountingModel.findEntryBySource(SOURCE, transaction.id);
  if (!existing) return;
  if (existing.status === 'draft') {
    await AccountingModel.deleteDraft(existing.id);
    return;
  }
  if (existing.status === 'posted' || existing.status === 'locked') {
    await AccountingModel.reverseEntry(existing.id, actorId, {
      label: `Annulation transaction ${transaction.id}`
    });
  }
};
