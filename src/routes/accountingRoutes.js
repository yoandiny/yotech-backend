import express from 'express';
import { AccountingController } from '../controllers/accountingController.js';

const router = express.Router();

router.get('/bootstrap', AccountingController.bootstrap);
router.get('/dashboard', AccountingController.dashboard);

router.get('/accounts', AccountingController.listAccounts);
router.post('/accounts', AccountingController.createAccount);
router.put('/accounts/:id', AccountingController.updateAccount);

router.get('/journals', AccountingController.listJournals);
router.post('/journals', AccountingController.upsertJournal);

router.get('/periods', AccountingController.listPeriods);
router.post('/periods', AccountingController.createPeriod);
router.post('/periods/:id/status', AccountingController.updatePeriodStatus);

router.get('/parties', AccountingController.listParties);
router.post('/suppliers', AccountingController.createSupplier);

router.get('/cash-accounts', AccountingController.listCashAccounts);
router.post('/cash-accounts', AccountingController.upsertCashAccount);

router.get('/entries', AccountingController.listEntries);
router.post('/entries', AccountingController.saveDraft);
router.get('/entries/:id', AccountingController.getEntry);
router.put('/entries/:id', AccountingController.saveDraft);
router.post('/entries/:id/post', AccountingController.postEntry);
router.post('/entries/:id/reverse', AccountingController.reverseEntry);
router.delete('/entries/:id', AccountingController.deleteDraft);

router.get('/reports/journal', AccountingController.journalBook);
router.get('/reports/ledger', AccountingController.ledger);
router.get('/reports/trial-balance', AccountingController.trialBalance);
router.get('/reports/statements', AccountingController.statements);
router.get('/reports/auxiliary', AccountingController.auxiliary);
router.get('/reports/treasury', AccountingController.treasury);

router.get('/posting-rules', AccountingController.listPostingRules);
router.post('/posting-rules', AccountingController.upsertPostingRule);
router.get('/pending-transactions', AccountingController.pendingTransactions);

export default router;
