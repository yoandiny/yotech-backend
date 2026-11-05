import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AccountingError,
  validateLines,
  totalsOf,
  reversedLines,
  splitBalance,
  buildStatement,
  assertPeriodWritable
} from '../src/services/accountingEngine.js';

test('refuse une écriture déséquilibrée', () => {
  assert.throws(
    () => validateLines([
      { account_id: 1, debit: 100, credit: 0 },
      { account_id: 2, debit: 0, credit: 90 }
    ]),
    AccountingError
  );
});

test('refuse débit et crédit sur la même ligne', () => {
  assert.throws(
    () => validateLines([
      { account_id: 1, debit: 50, credit: 50 },
      { account_id: 2, debit: 0, credit: 0 }
    ]),
    AccountingError
  );
});

test('accepte une écriture à plusieurs lignes équilibrée', () => {
  const totals = validateLines([
    { account_id: 1, debit: 120, credit: 0 },
    { account_id: 2, debit: 30, credit: 0 },
    { account_id: 3, debit: 0, credit: 150 }
  ]);
  assert.equal(totals.debit, 150);
  assert.equal(totals.credit, 150);
  assert.deepEqual(totalsOf([{ debit: 10, credit: 0 }, { debit: 0, credit: 10 }]), { debit: 10, credit: 10 });
});

test('la contre-passation inverse débit et crédit', () => {
  const reversed = reversedLines([
    { account_id: 1, debit: 200, credit: 0 },
    { account_id: 2, debit: 0, credit: 200 }
  ]);
  assert.equal(reversed[0].debit, 0);
  assert.equal(reversed[0].credit, 200);
  assert.equal(reversed[1].debit, 200);
  assert.equal(reversed[1].credit, 0);
});

test('un exercice clôturé bloque l’écriture', () => {
  assert.throws(() => assertPeriodWritable({ status: 'closed' }), AccountingError);
  assert.throws(() => assertPeriodWritable({ status: 'locked' }), AccountingError);
  assert.doesNotThrow(() => assertPeriodWritable({ status: 'open' }));
});

test('les états financiers s’appuient sur mapping_key, pas sur le numéro de compte', () => {
  const structures = [
    { report_type: 'pnl', section_code: 'INCOME', section_label: 'Produits', mapping_key: 'INCOME_OPERATING', group_label: 'Produits', sort_order: 1 },
    { report_type: 'pnl', section_code: 'EXPENSE', section_label: 'Charges', mapping_key: 'EXPENSE_OPERATING', group_label: 'Charges', sort_order: 2 }
  ];
  const sections = buildStatement([
    { mapping_key: 'INCOME_OPERATING', debit: 0, credit: 1000 },
    { mapping_key: 'EXPENSE_OPERATING', debit: 400, credit: 0 }
  ], structures, 'pnl');
  assert.equal(sections.find((s) => s.code === 'INCOME').total, 1000);
  assert.equal(sections.find((s) => s.code === 'EXPENSE').total, 400);
  const split = splitBalance(400, 100);
  assert.equal(split.debit_balance, 300);
  assert.equal(split.credit_balance, 0);
});
