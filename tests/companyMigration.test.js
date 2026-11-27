import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb } from './setup.js';

let container;
let pool;
let AccountingModel;
let FinanceModel;
let migrateToCompany;

const insertFinance = async ({ description, amount, type, date }) => {
  const result = await pool.query(
    `INSERT INTO finances (description, amount, total_amount, type_transaction, date_transaction)
     VALUES ($1, $2, $2, $3, $4) RETURNING *`,
    [description, amount, type, date]
  );
  return result.rows[0];
};

before(async () => {
  const setup = await setupTestDb();
  container = setup.container;
  pool = setup.pool;
  AccountingModel = (await import('../src/models/accountingModel.js')).AccountingModel;
  FinanceModel = (await import('../src/models/financeModel.js')).FinanceModel;
  migrateToCompany = (await import('../src/services/companyMigration.js')).migrateToCompany;
  await AccountingModel.ensure();
});

after(async () => {
  if (pool) await pool.end();
  if (container) await container.stop();
});

test('migration EI → Société : archive l’ancien, ouvre l’exercice et comptabilise l’apport en capital hors CA', async () => {
  const startDate = '2026-11-10';

  await insertFinance({ description: 'Prestation EI antérieure', amount: 50000, type: 'revenu', date: '2026-09-15' });
  await insertFinance({ description: 'Frais de constitution', amount: 200000, type: 'dépense', date: '2026-11-12' });

  const result = await migrateToCompany({
    startDate,
    endDate: '2026-12-31',
    capitalAmount: 1000000,
    cashAccountId: null,
    actorId: null
  });

  assert.equal(result.archived_transactions, 1);
  assert.ok(result.period);
  assert.equal(result.period.status, 'open');
  const periodStart = result.period.start_date;
  const periodStartStr = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}-${String(periodStart.getDate()).padStart(2, '0')}`;
  assert.equal(periodStartStr, startDate);

  // Écriture de capital : débit banque (512) / crédit capital (101)
  assert.ok(result.capital.entry);
  assert.equal(result.capital.entry.status, 'posted');
  const codes = result.capital.entry.lines.map((line) => line.account_code).sort();
  assert.deepEqual(codes, ['101', '512']);
  const debit = result.capital.entry.lines.find((line) => Number(line.debit) > 0);
  const credit = result.capital.entry.lines.find((line) => Number(line.credit) > 0);
  assert.equal(Number(debit.debit), 1000000);
  assert.equal(Number(credit.credit), 1000000);

  // Transaction « apport » visible, mais hors revenu/dépense
  assert.ok(result.capital.transaction);
  assert.equal(result.capital.transaction.type_transaction, 'apport');

  // Le CA n'inclut ni l'archivé, ni l'apport en capital
  const stats = await FinanceModel.getStats(2026, null, null);
  assert.equal(Number(stats.total_income), 0);
  assert.equal(Number(stats.total_expenses), 200000);
  assert.equal(Number(stats.net_profit), -200000);

  // Idempotence : un second appel n'archive rien de plus et ne duplique pas le capital
  const again = await migrateToCompany({ startDate, endDate: '2026-12-31', capitalAmount: 1000000, actorId: null });
  assert.equal(again.archived_transactions, 0);
  assert.equal(again.capital.already, true);
});
