import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountingError } from '../src/services/accountingEngine.js';
import { hydrateSuggestion, parseSuggestionJson } from '../src/services/accountSuggestion.js';

const catalogs = {
  accounts: [
    { id: 1, code: '521', name: 'Banques locales', is_postable: true },
    { id: 2, code: '604', name: 'Fournitures', is_postable: true },
    { id: 3, code: '706', name: 'Prestations', is_postable: true },
    { id: 4, code: '6', name: 'Charges', is_postable: false }
  ],
  cashAccounts: [{ id: 10, account_id: 1, account_code: '521', kind: 'bank', name: 'BOA' }],
  journals: [{ id: 20, code: 'BQ', name: 'Banque' }],
  transaction: { description: 'Achat papier', amount: 100000, type: 'dépense' }
};

test('parse les comptes JSON même s’ils sont dans un fence markdown', () => {
  const parsed = parseSuggestionJson('```json\n{"lines":[{"account_code":"604","debit":1,"credit":0},{"account_code":"521","debit":0,"credit":1}]}\n```');
  assert.equal(parsed.lines.length, 2);
});

test('hydrate une proposition IA équilibrée', () => {
  const plan = hydrateSuggestion({
    journal_code: 'BQ',
    rationale: 'Fournitures consommées',
    lines: [
      { account_code: '604', debit: 100000, credit: 0, label: 'Achat papier' },
      { account_code: '521', debit: 0, credit: 100000, label: 'Banque' }
    ]
  }, catalogs);
  assert.equal(plan.source, 'ai');
  assert.equal(plan.lines[0].account_id, 2);
  assert.equal(plan.journal.code, 'BQ');
});

test('rejette un compte inexistant ou une écriture déséquilibrée', () => {
  assert.throws(
    () => hydrateSuggestion({
      journal_code: 'BQ',
      lines: [
        { account_code: '999', debit: 100000, credit: 0 },
        { account_code: '521', debit: 0, credit: 100000 }
      ]
    }, catalogs),
    AccountingError
  );
  assert.throws(
    () => hydrateSuggestion({
      journal_code: 'BQ',
      lines: [
        { account_code: '604', debit: 80000, credit: 0 },
        { account_code: '521', debit: 0, credit: 100000 }
      ]
    }, catalogs),
    AccountingError
  );
});
