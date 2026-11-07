import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb } from './setup.js';
import { AccountingError } from '../src/services/accountingEngine.js';

let container;
let pool;
let AccountingModel;
let MissionModel;
let FinanceModel;
let posting;

const pay = async (mission, amount, cashAccountId, isBalance = false) => {
  const remaining = Number(mission.remaining);
  const kind = isBalance || amount === remaining ? 'balance' : 'installment';
  const transaction = await FinanceModel.addTransaction({
    description: `${kind} ${mission.title}`,
    amount,
    type: 'revenu',
    date: new Date().toISOString().split('T')[0],
    currency: 'MGA',
    client_name: mission.client_name
  });
  const posted = kind === 'balance'
    ? await posting.postMissionBalance(transaction, {
      cashAccountId,
      missionTtc: Number(mission.budget),
      taxRate: mission.tax_rate,
      advancesTtc: Number(mission.paid_total)
    })
    : await posting.postMissionInstallment(transaction, { cashAccountId });
  await MissionModel.addPayment({
    mission_id: mission.id,
    amount,
    cash_account_id: cashAccountId,
    kind,
    finance_id: transaction.id,
    accounting_entry_id: posted.accounting_entry_id
  });
  if (kind === 'balance') {
    await MissionModel.recordPayment(mission.id, 'final', { finance_id: transaction.id });
  }
  return { posted, mission: await MissionModel.getById(mission.id) };
};

before(async () => {
  const setup = await setupTestDb();
  container = setup.container;
  pool = setup.pool;
  AccountingModel = (await import('../src/models/accountingModel.js')).AccountingModel;
  MissionModel = (await import('../src/models/missionModel.js')).MissionModel;
  FinanceModel = (await import('../src/models/financeModel.js')).FinanceModel;
  posting = await import('../src/services/transactionPosting.js');
  await AccountingModel.ensure();
  await pool.query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS quote_status VARCHAR(20) DEFAULT 'final'`);
  await pool.query(`ALTER TABLE finances ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
});

after(async () => {
  if (pool) await pool.end();
  if (container) await container.stop();
});

test('échéances 40/40 puis solde 20 : 4191 puis 411/706, 411 net 0', async () => {
  const bank = (await AccountingModel.listCashAccounts()).find((item) => item.kind === 'bank');
  assert.ok(bank);

  let mission = await MissionModel.create({
    title: 'Prestation 900k',
    client_name: 'Client Test',
    budget: 1080000,
    tax_rate: 20,
    status: 'en_cours'
  });
  assert.equal(Number(mission.remaining), 1080000);

  const first = await pay(mission, 432000, bank.id);
  mission = first.mission;
  assert.equal(Number(mission.paid_total), 432000);
  assert.equal(Number(mission.remaining), 648000);
  let entry = await AccountingModel.getEntry(first.posted.accounting_entry_id);
  assert.deepEqual(entry.lines.map((line) => line.account_code).sort(), ['4191', '512']);

  const second = await pay(mission, 432000, bank.id);
  mission = second.mission;
  assert.equal(Number(mission.remaining), 216000);

  await assert.rejects(
    () => posting.resolveMissionBalancePlan(
      { amount: 300000, description: 'trop' },
      { cashAccountId: bank.id, missionTtc: 1080000, taxRate: 20, advancesTtc: 864000 }
    ),
    AccountingError
  );

  const last = await pay(mission, 216000, bank.id, true);
  mission = last.mission;
  assert.equal(Number(mission.remaining), 0);
  assert.equal(mission.final_paid, true);

  entry = await AccountingModel.getEntry(last.posted.accounting_entry_id);
  const byCode = Object.fromEntries(entry.lines.map((line) => [line.account_code, line]));
  const net411 = entry.lines
    .filter((line) => line.account_code === '411')
    .reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0);
  assert.equal(net411, 0);
  assert.equal(Number(byCode['706'].credit), 900000);
  assert.equal(Number(byCode['4457'].credit), 180000);

  const sold = await MissionModel.getById(mission.id);
  await assert.rejects(async () => {
    await posting.resolveMissionBalancePlan(
      { amount: 1, description: 'encore' },
      { cashAccountId: bank.id, missionTtc: Number(sold.budget), taxRate: 20, advancesTtc: Number(sold.paid_total) }
    );
  }, AccountingError);
});
