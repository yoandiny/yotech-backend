import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb } from './setup.js';
import { AccountingError } from '../src/services/accountingEngine.js';

let container;
let pool;
let AccountingModel;
let posting;

const insertFinance = async ({ description, amount, type, category }) => {
  const result = await pool.query(
    `INSERT INTO finances (description, amount, type_transaction, date_transaction, category, total_amount)
     VALUES ($1,$2,$3,CURRENT_DATE,$4,$2) RETURNING *`,
    [description, amount, type, category]
  );
  return result.rows[0];
};

before(async () => {
  const setup = await setupTestDb();
  container = setup.container;
  pool = setup.pool;
  AccountingModel = (await import('../src/models/accountingModel.js')).AccountingModel;
  posting = await import('../src/services/transactionPosting.js');
  await AccountingModel.ensure();
  await pool.query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
});

after(async () => {
  if (pool) await pool.end();
  if (container) await container.stop();
});

test('recette et dépense auto-comptabilisées, manuel, doublon et config incomplète', async () => {
  const income = await insertFinance({
    description: 'Prestation web',
    amount: 100000,
    type: 'revenu',
    category: 'Développement Web'
  });
  const postedIncome = await posting.syncFinanceAccounting(income, { autoPost: true });
  assert.equal(postedIncome.accounting_status, 'posted');
  assert.ok(postedIncome.accounting_entry_id);
  const entry = await AccountingModel.getEntry(postedIncome.accounting_entry_id);
  assert.equal(entry.status, 'posted');
  assert.equal(Number(entry.totals.debit), Number(entry.totals.credit));

  await assert.rejects(
    () => posting.postFinanceTransaction(postedIncome, {}),
    AccountingError
  );

  const expense = await insertFinance({
    description: 'Achat fournitures',
    amount: 50000,
    type: 'dépense',
    category: 'Fournitures & Consommables'
  });
  const postedExpense = await posting.syncFinanceAccounting(expense, { autoPost: true });
  assert.equal(postedExpense.accounting_status, 'posted');

  const manual = await insertFinance({
    description: 'À saisir plus tard',
    amount: 1000,
    type: 'revenu',
    category: 'Autre'
  });
  const unposted = await posting.syncFinanceAccounting(manual, { autoPost: false });
  assert.equal(unposted.accounting_status, 'unposted');
  assert.equal(unposted.auto_post, false);

  const broken = await insertFinance({
    description: 'Montant invalide',
    amount: 0,
    type: 'revenu',
    category: 'Autre'
  });
  const failed = await posting.syncFinanceAccounting(broken, { autoPost: true });
  assert.equal(failed.accounting_status, 'error');
  assert.ok(failed.accounting_error);
});
