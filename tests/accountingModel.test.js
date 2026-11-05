import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb } from './setup.js';
import { AccountingError } from '../src/services/accountingEngine.js';

let container;
let pool;
let AccountingModel;

before(async () => {
  const setup = await setupTestDb();
  container = setup.container;
  pool = setup.pool;
  const modelModule = await import('../src/models/accountingModel.js');
  AccountingModel = modelModule.AccountingModel;
  await AccountingModel.ensure();
});

after(async () => {
  if (pool) await pool.end();
  if (container) await container.stop();
});

const postable = async (code) => {
  const rows = await AccountingModel.listAccounts({ postable: true });
  return rows.find((row) => row.code === code);
};

test('Intégration comptable — écriture équilibrée, refus du déséquilibre, balance, grand livre, clôture, doublon source', async () => {
  const periods = await AccountingModel.listPeriods();
  const period = periods[0];
  assert.equal(period.status, 'open');
  const journals = await AccountingModel.listJournals();
  const od = journals.find((item) => item.code === 'OD');
  const client = await postable('411');
  const sales = await postable('706');
  assert.ok(client && sales);

  const draft = await AccountingModel.saveDraft({
    journal_id: od.id,
    entry_date: period.start_date,
    label: 'Prestation client',
    source_type: 'quote',
    source_id: 42,
    lines: [
      { account_id: client.id, debit: 1000, credit: 0, label: 'Créance' },
      { account_id: sales.id, debit: 0, credit: 1000, label: 'Produit' }
    ]
  });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.difference, 0);

  await assert.rejects(
    () => AccountingModel.saveDraft({
      journal_id: od.id,
      entry_date: period.start_date,
      label: 'Cassée',
      lines: [
        { account_id: client.id, debit: 100, credit: 0 },
        { account_id: sales.id, debit: 0, credit: 90 }
      ]
    }),
    AccountingError
  );

  const posted = await AccountingModel.postEntry(draft.id);
  assert.equal(posted.status, 'posted');
  assert.match(posted.entry_number, /^OD-/);

  await assert.rejects(
    () => AccountingModel.saveDraft({
      id: posted.id,
      journal_id: od.id,
      entry_date: period.start_date,
      label: 'modification silencieuse',
      lines: posted.lines
    }),
    AccountingError
  );

  const duplicate = await AccountingModel.saveDraft({
    journal_id: od.id,
    entry_date: period.start_date,
    label: 'Doublon source',
    source_type: 'quote',
    source_id: 42,
    lines: [
      { account_id: client.id, debit: 1000, credit: 0 },
      { account_id: sales.id, debit: 0, credit: 1000 }
    ]
  });
  await assert.rejects(() => AccountingModel.postEntry(duplicate.id), AccountingError);

  const tb = await AccountingModel.trialBalance({ period_id: period.id });
  assert.equal(tb.totals.debit, tb.totals.credit);
  const ledger = await AccountingModel.ledger({ account_id: client.id, period_id: period.id });
  assert.ok(ledger.rows.length >= 1);

  await AccountingModel.updatePeriodStatus(period.id, 'closed');
  await assert.rejects(
    () => AccountingModel.saveDraft({
      journal_id: od.id,
      entry_date: period.start_date,
      label: 'Après clôture',
      lines: [
        { account_id: client.id, debit: 10, credit: 0 },
        { account_id: sales.id, debit: 0, credit: 10 }
      ]
    }),
    AccountingError
  );
});
