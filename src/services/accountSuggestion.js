import { AccountingModel } from '../models/accountingModel.js';
import { AccountingError, money, totalsOf, validateLines } from './accountingEngine.js';
import { completeJson, isOpenRouterConfigured, openRouterConfig } from './openrouter.js';

const SYSTEM_PROMPT = `Tu es un expert-comptable SYSCOHADA (Madagascar / OHADA).
À partir du contexte d'une transaction de trésorerie, tu proposes une écriture en partie double.

Règles :
- Réponds UNIQUEMENT par un objet JSON, sans markdown.
- N'utilise QUE des account_code présents dans le plan fourni, et uniquement des comptes saisissables.
- L'écriture doit être équilibrée : somme(debit) = somme(credit).
- La somme des débits doit égaler le montant TTC de la transaction.
- Une ligne a soit un débit, soit un crédit, jamais les deux.
- Pour une recette encaissée : débiter la trésorerie, créditer le(s) compte(s) de produit (et TVA collectée si besoin).
- Pour une dépense payée : débiter le(s) compte(s) de charge ou d'immobilisation (et TVA déductible si besoin), créditer la trésorerie.
- Choisis le compte le plus précis d'après le libellé, la catégorie, le client et le type — pas seulement la catégorie.
- N'invente aucun compte.
- journal_code doit être l'un des journaux fournis.

Schéma JSON :
{
  "journal_code": "BQ",
  "lines": [
    { "account_code": "604", "debit": 100000, "credit": 0, "label": "..." }
  ],
  "rationale": "explication courte en français"
}`;

export const accountingAiStatus = () => {
  const config = openRouterConfig();
  return {
    enabled: isOpenRouterConfigured(),
    provider: 'openrouter',
    model: config.model
  };
};

export const parseSuggestionJson = (text) => {
  if (!text || typeof text !== 'string') {
    throw new AccountingError('La proposition IA est vide.');
  }
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AccountingError('La proposition IA n’est pas un JSON valide.');
  }
  if (!parsed || !Array.isArray(parsed.lines) || parsed.lines.length < 2) {
    throw new AccountingError('La proposition IA doit contenir au moins deux lignes comptables.');
  }
  return parsed;
};

const catalogs = async () => {
  const [accounts, cashAccounts, journals] = await Promise.all([
    AccountingModel.listAccounts({ postable: true }),
    AccountingModel.listCashAccounts(),
    AccountingModel.listJournals()
  ]);
  return { accounts, cashAccounts, journals };
};

const pickCash = (transaction, cashAccounts) => (
  cashAccounts.find((item) => Number(item.id) === Number(transaction.cash_account_id))
  || cashAccounts.find((item) => item.kind === 'bank')
  || cashAccounts[0]
  || null
);

const amountsOf = (transaction) => {
  const ht = money(transaction.amount);
  const tax = money(transaction.tax_amount);
  const ttc = money(transaction.total_amount || (ht + tax));
  return { ht, tax, ttc };
};

export const hydrateSuggestion = (suggestion, { accounts, cashAccounts, journals, transaction }) => {
  const { ttc } = amountsOf(transaction);
  if (ttc <= 0) throw new AccountingError('Le montant à comptabiliser doit être supérieur à zéro.');

  const byCode = new Map(accounts.map((account) => [String(account.code), account]));
  const cashCodes = new Set(cashAccounts.map((item) => String(item.account_code || item.code)));
  const cash = pickCash(transaction, cashAccounts);

  const lines = suggestion.lines.map((line, index) => {
    const code = String(line.account_code || '').trim();
    const account = byCode.get(code);
    if (!account) {
      throw new AccountingError(`Compte ${code || '?'} inconnu ou non saisissable (ligne ${index + 1}).`);
    }
    if (account.is_postable === false) {
      throw new AccountingError(`Le compte ${code} n’est pas saisissable.`);
    }
    let accountId = account.id;
    if (transaction.cash_account_id && cash && cashCodes.has(code)) {
      accountId = cash.account_id;
    }
    return {
      account_id: accountId,
      account_code: account.code,
      account_name: account.name,
      debit: money(line.debit),
      credit: money(line.credit),
      label: line.label || transaction.description || 'Transaction',
      party_type: transaction.client_id ? 'client' : null,
      party_id: transaction.client_id || null
    };
  });

  validateLines(lines);
  const totals = totalsOf(lines);
  if (money(totals.debit) !== ttc) {
    throw new AccountingError(
      `La proposition IA n’utilise pas le montant TTC (${ttc} attendu, ${totals.debit} proposé).`
    );
  }

  const journal = journals.find((item) => item.code === suggestion.journal_code)
    || (cash?.kind === 'cash' ? journals.find((item) => item.code === 'CAI') : journals.find((item) => item.code === 'BQ'))
    || journals[0];
  if (!journal) throw new AccountingError('Aucun journal comptable n’est configuré.');
  if (!cash) throw new AccountingError('Aucun compte de trésorerie n’est configuré.');

  return {
    source: 'ai',
    cash,
    journal,
    lines,
    label: transaction.description || 'Transaction',
    rationale: suggestion.rationale || '',
    model: openRouterConfig().model
  };
};

const compactAccounts = (accounts) => accounts.map((account) => ({
  code: account.code,
  name: account.name,
  mapping_key: account.mapping_key,
  treasury_kind: account.treasury_kind || null
}));

export const suggestValidatedPlan = async (transaction) => {
  if (!isOpenRouterConfigured()) return null;
  const { accounts, cashAccounts, journals } = await catalogs();
  const { ht, tax, ttc } = amountsOf(transaction);
  const user = JSON.stringify({
    transaction: {
      description: transaction.description,
      type: transaction.type_transaction || transaction.type,
      category: transaction.category || null,
      date: transaction.date_transaction || transaction.date,
      amount_ht: ht,
      tax_amount: tax,
      amount_ttc: ttc,
      currency: transaction.currency || 'MGA',
      client_id: transaction.client_id || null,
      invoice_number: transaction.invoice_number || null,
      cash_account_id: transaction.cash_account_id || null
    },
    cash_accounts: cashAccounts.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      account_code: item.account_code
    })),
    journals: journals.map((item) => ({ code: item.code, name: item.name, journal_type: item.journal_type })),
    postable_accounts: compactAccounts(accounts)
  });

  const content = await completeJson({ system: SYSTEM_PROMPT, user });
  const parsed = parseSuggestionJson(content);
  return hydrateSuggestion(parsed, { accounts, cashAccounts, journals, transaction });
};

export const previewPostingSuggestion = async (transaction) => {
  const status = accountingAiStatus();
  try {
    const plan = await suggestValidatedPlan(transaction);
    if (!plan) {
      return { ...status, available: false, source: null, message: 'IA désactivée ou clé OpenRouter absente.' };
    }
    return {
      ...status,
      available: true,
      source: 'ai',
      rationale: plan.rationale,
      journal_code: plan.journal.code,
      cash_account_id: plan.cash.id,
      lines: plan.lines.map((line) => ({
        account_code: line.account_code,
        account_name: line.account_name,
        debit: line.debit,
        credit: line.credit,
        label: line.label
      }))
    };
  } catch (error) {
    return {
      ...status,
      available: false,
      source: null,
      error: error.message
    };
  }
};
