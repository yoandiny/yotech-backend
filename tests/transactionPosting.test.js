import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb } from './setup.js';
import { AccountingError } from '../src/services/accountingEngine.js';
import { setOpenRouterTransport } from '../src/services/openrouter.js';

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

const mockOpenRouter = (payload) => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.ACCOUNTING_AI = 'true';
  setOpenRouterTransport(async () => ({
    ok: true,
    async json() {
      return { choices: [{ message: { content: JSON.stringify(payload) } }] };
    }
  }));
};

test('OpenRouter propose les comptes, sinon repli sur la règle', async () => {
  mockOpenRouter({
    journal_code: 'BQ',
    rationale: 'Vente de services informatiques',
    lines: [
      { account_code: '512', debit: 77000, credit: 0, label: 'Banque' },
      { account_code: '706', debit: 0, credit: 77000, label: 'Prestations de services' }
    ]
  });
  const income = await insertFinance({
    description: 'Audit applicatif',
    amount: 77000,
    type: 'revenu',
    category: 'Développement Web'
  });
  const posted = await posting.syncFinanceAccounting(income, { autoPost: true });
  assert.equal(posted.accounting_status, 'posted');
  assert.equal(posted.accounting_source, 'ai');
  const entry = await AccountingModel.getEntry(posted.accounting_entry_id);
  const codes = entry.lines.map((line) => line.account_code).sort();
  assert.deepEqual(codes, ['512', '706']);

  mockOpenRouter({ lines: [{ account_code: '999', debit: 25000, credit: 0 }] });
  const fallback = await insertFinance({
    description: 'Prestation web',
    amount: 25000,
    type: 'revenu',
    category: 'Développement Web'
  });
  const postedFallback = await posting.syncFinanceAccounting(fallback, { autoPost: true });
  assert.equal(postedFallback.accounting_status, 'posted');
  assert.equal(postedFallback.accounting_source, 'rule');

  setOpenRouterTransport(null);
  delete process.env.OPENROUTER_API_KEY;
});
