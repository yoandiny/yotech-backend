import { AccountingModel } from '../models/accountingModel.js';
import { AccountingError } from '../services/accountingEngine.js';
import { accountingAiStatus, previewPostingSuggestion } from '../services/accountSuggestion.js';

const handle = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json(data);
  } catch (error) {
    if (error instanceof AccountingError || error.status) {
      return res.status(error.status || 400).json({ error: error.message });
    }
    console.error('Accounting error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const actorId = (req) => req.actor?.id || null;

export const AccountingController = {
  bootstrap: handle((req) => AccountingModel.bootstrap()),
  dashboard: handle(() => AccountingModel.dashboard()),

  listAccounts: handle((req) => AccountingModel.listAccounts(req.query)),
  createAccount: handle((req) => AccountingModel.createAccount(req.body)),
  updateAccount: handle((req) => AccountingModel.updateAccount(req.params.id, req.body)),

  listJournals: handle(() => AccountingModel.listJournals()),
  upsertJournal: handle((req) => AccountingModel.upsertJournal(req.body)),

  listPeriods: handle(() => AccountingModel.listPeriods()),
  createPeriod: handle((req) => AccountingModel.createPeriod(req.body)),
  updatePeriodStatus: handle((req) => AccountingModel.updatePeriodStatus(req.params.id, req.body.status, actorId(req))),

  listParties: handle(() => AccountingModel.listParties()),
  createSupplier: handle((req) => AccountingModel.createSupplier(req.body)),

  listCashAccounts: handle(() => AccountingModel.listCashAccounts()),
  upsertCashAccount: handle((req) => AccountingModel.upsertCashAccount(req.body)),

  listEntries: handle((req) => AccountingModel.listEntries(req.query)),
  getEntry: handle(async (req) => {
    const entry = await AccountingModel.getEntry(req.params.id);
    if (!entry) {
      const error = new AccountingError('Écriture introuvable.', 404);
      throw error;
    }
    return entry;
  }),
  saveDraft: handle((req) => AccountingModel.saveDraft({ ...req.body, id: req.body.id || req.params.id }, actorId(req))),
  postEntry: handle((req) => AccountingModel.postEntry(req.params.id, actorId(req))),
  reverseEntry: handle((req) => AccountingModel.reverseEntry(req.params.id, actorId(req), req.body || {})),
  deleteDraft: handle(async (req) => {
    await AccountingModel.deleteDraft(req.params.id);
    return { ok: true };
  }),

  journalBook: handle((req) => AccountingModel.journalBook(req.query)),
  ledger: handle((req) => AccountingModel.ledger(req.query)),
  trialBalance: handle((req) => AccountingModel.trialBalance(req.query)),
  statements: handle((req) => AccountingModel.statements(req.query)),
  auxiliary: handle((req) => AccountingModel.auxiliaryBalance(req.query)),
  treasury: handle((req) => AccountingModel.treasury(req.query)),
  listPostingRules: handle(() => AccountingModel.listPostingRules()),
  upsertPostingRule: handle((req) => AccountingModel.upsertPostingRule(req.body)),
  pendingTransactions: handle(() => AccountingModel.pendingFinanceTransactions()),
  aiStatus: handle(() => accountingAiStatus()),
  suggestPosting: handle((req) => previewPostingSuggestion(req.body || {}))
};
