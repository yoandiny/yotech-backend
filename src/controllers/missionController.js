import { MissionModel }  from '../models/missionModel.js';
import { FinanceModel }  from '../models/financeModel.js';
import { AccountingModel } from '../models/accountingModel.js';
import { postMissionBalance, postMissionInstallment } from '../services/transactionPosting.js';
import { AccountingError, money } from '../services/accountingEngine.js';

const recordMissionPayment = async (req, { amount: requestedAmount, isBalance, cashAccountId, date, label }) => {
  const mission = await MissionModel.getById(req.params.id);
  if (!mission) {
    const error = new AccountingError('Mission introuvable.', 404);
    throw error;
  }
  const remaining = money(mission.remaining);
  if (remaining <= 0 || mission.final_paid) {
    throw new AccountingError('Cette mission est déjà soldée.', 409);
  }

  let amount = money(requestedAmount);
  const forceBalance = Boolean(isBalance);
  if (forceBalance) amount = remaining;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AccountingError('Le montant du paiement doit être supérieur à zéro.');
  }
  if (amount > remaining) {
    throw new AccountingError(`Le montant dépasse le reste à encaisser (${remaining}).`);
  }
  if (!cashAccountId) {
    throw new AccountingError('Indiquez le moyen de paiement.');
  }

  const kind = forceBalance || amount === remaining ? 'balance' : 'installment';
  const today = date || new Date().toISOString().split('T')[0];
  const advancesTtc = money(mission.paid_total);
  const description = label
    || (kind === 'balance'
      ? `Solde — ${mission.title} (${mission.client_name})`
      : `Échéance — ${mission.title} (${mission.client_name})`);

  const transaction = await FinanceModel.addTransaction({
    description,
    amount,
    type: 'revenu',
    date: today,
    currency: mission.currency || 'MGA',
    client_name: mission.client_name,
    client_email: mission.client_email,
    client_phone: mission.client_phone,
    client_id: mission.client_id,
    category: mission.category,
    cash_account_id: cashAccountId
  });

  let posted = transaction;
  try {
    if (kind === 'balance') {
      posted = await postMissionBalance(transaction, {
        actorId: req.actor?.id,
        cashAccountId,
        missionTtc: money(mission.budget),
        taxRate: mission.tax_rate,
        advancesTtc
      });
    } else {
      posted = await postMissionInstallment(transaction, {
        actorId: req.actor?.id,
        cashAccountId
      });
    }
  } catch (error) {
    posted = { ...transaction, accounting_status: 'error', accounting_error: error.message, accounting_failed: true };
  }

  await MissionModel.addPayment({
    mission_id: mission.id,
    amount,
    date: today,
    cash_account_id: cashAccountId,
    kind,
    finance_id: transaction.id,
    accounting_entry_id: posted.accounting_entry_id,
    label: description
  });

  if (kind === 'balance') {
    await MissionModel.recordPayment(mission.id, 'final', { finance_id: transaction.id, date: today });
    await MissionModel.updateProgress(mission.id, mission.progress === 100 ? 100 : mission.progress, 'terminee');
  } else if (!mission.acompte_paid) {
    await MissionModel.recordPayment(mission.id, 'acompte', { finance_id: transaction.id, date: today });
  }

  const updated = await MissionModel.getById(mission.id);
  const payments = await MissionModel.listPayments(mission.id);
  return { mission: updated, transaction: posted, payment: payments[payments.length - 1], payments };
};

export const MissionController = {
  // GET /missions
  getAll: async (req, res) => {
    try {
      const { status, priority, search } = req.query;
      res.json(await MissionModel.getAll({ status, priority, search }));
    } catch (e) { res.status(500).json({ message: e.message }); }
  },

  // GET /missions/stats
  getStats: async (req, res) => {
    try { res.json(await MissionModel.getStats()); }
    catch (e) { res.status(500).json({ message: e.message }); }
  },

  // GET /missions/:id
  getById: async (req, res) => {
    try {
      const m = await MissionModel.getById(req.params.id);
      if (!m) return res.status(404).json({ message: 'Mission introuvable' });
      const stages = await MissionModel.getStages(req.params.id);
      res.json({ ...m, stages });
    } catch (e) { res.status(500).json({ message: e.message }); }
  },

  // POST /missions
  create: async (req, res) => {
    try { res.status(201).json(await MissionModel.create(req.body)); }
    catch (e) { res.status(500).json({ message: e.message }); }
  },

  // PUT /missions/:id
  update: async (req, res) => {
    try {
      const m = await MissionModel.update(req.params.id, req.body);
      if (!m) return res.status(404).json({ message: 'Mission introuvable' });
      res.json(m);
    } catch (e) { res.status(500).json({ message: e.message }); }
  },

  // PATCH /missions/:id/progress
  updateProgress: async (req, res) => {
    try {
      const { progress, status } = req.body;
      res.json(await MissionModel.updateProgress(req.params.id, progress, status));
    } catch (e) { res.status(500).json({ message: e.message }); }
  },

  // DELETE /missions/:id
  delete: async (req, res) => {
    try {
      const m = await MissionModel.delete(req.params.id);
      if (!m) return res.status(404).json({ message: 'Mission introuvable' });
      res.json({ message: 'Supprimée', mission: m });
    } catch (e) { res.status(500).json({ message: e.message }); }
  },

  listPayments: async (req, res) => {
    try {
      await AccountingModel.ensure();
      const mission = await MissionModel.getById(req.params.id);
      if (!mission) return res.status(404).json({ message: 'Mission introuvable' });
      const payments = await MissionModel.listPayments(req.params.id);
      res.json({ mission, payments });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  },

  addPayment: async (req, res) => {
    try {
      await AccountingModel.ensure();
      const result = await recordMissionPayment(req, {
        amount: req.body?.amount,
        isBalance: req.body?.is_balance,
        cashAccountId: req.body?.cash_account_id,
        date: req.body?.date,
        label: req.body?.label
      });
      res.status(201).json(result);
    } catch (e) {
      console.error('addPayment:', e);
      if (e instanceof AccountingError || e.status) {
        return res.status(e.status || 400).json({ message: e.message, error: e.message });
      }
      res.status(500).json({ message: e.message });
    }
  },

  payAcompte: async (req, res) => {
    try {
      await AccountingModel.ensure();
      const mission = await MissionModel.getById(req.params.id);
      if (!mission) return res.status(404).json({ message: 'Mission introuvable' });
      const result = await recordMissionPayment(req, {
        amount: mission.acompte_amount || mission.remaining,
        isBalance: false,
        cashAccountId: req.body?.cash_account_id,
        date: req.body?.date
      });
      res.json(result);
    } catch (e) {
      console.error('payAcompte:', e);
      if (e instanceof AccountingError || e.status) {
        return res.status(e.status || 400).json({ message: e.message, error: e.message });
      }
      res.status(500).json({ message: e.message });
    }
  },

  payFinal: async (req, res) => {
    try {
      await AccountingModel.ensure();
      const result = await recordMissionPayment(req, {
        amount: req.body?.amount,
        isBalance: true,
        cashAccountId: req.body?.cash_account_id,
        date: req.body?.date
      });
      res.json(result);
    } catch (e) {
      console.error('payFinal:', e);
      if (e instanceof AccountingError || e.status) {
        return res.status(e.status || 400).json({ message: e.message, error: e.message });
      }
      res.status(500).json({ message: e.message });
    }
  },

  // ─── Journal ───────────────────────────────────────────────────

  getUpdates: async (req, res) => {
    try { res.json(await MissionModel.getUpdates(req.params.id)); }
    catch (e) { res.status(500).json({ message: e.message }); }
  },

  addUpdate: async (req, res) => {
    try {
      const data = { ...req.body, mission_id: req.params.id };
      res.status(201).json(await MissionModel.addUpdate(data));
    } catch (e) { res.status(500).json({ message: e.message }); }
  },

  getStages: async (req, res) => {
    try {
      const mission = await MissionModel.getById(req.params.id);
      if (!mission) return res.status(404).json({ message: 'Mission introuvable' });
      const stages = await MissionModel.getStages(req.params.id);
      res.json(stages);
    } catch (e) { res.status(500).json({ message: e.message }); }
  },

  addStage: async (req, res) => {
    try {
      const title = String(req.body?.title || '').trim();
      if (!title) return res.status(400).json({ message: 'Titre d\'étape requis' });
      const mission = await MissionModel.getById(req.params.id);
      if (!mission) return res.status(404).json({ message: 'Mission introuvable' });
      const result = await MissionModel.addStage(req.params.id, title);
      const stages = await MissionModel.getStages(req.params.id);
      res.status(201).json({ ...result, stages });
    } catch (e) { res.status(500).json({ message: e.message }); }
  },

  toggleStage: async (req, res) => {
    try {
      const result = await MissionModel.toggleStage(req.params.id, req.params.stageId, req.body?.done);
      if (!result) return res.status(404).json({ message: 'Étape introuvable' });
      const stages = await MissionModel.getStages(req.params.id);
      res.json({ ...result, stages });
    } catch (e) { res.status(500).json({ message: e.message }); }
  },

  deleteStage: async (req, res) => {
    try {
      const result = await MissionModel.deleteStage(req.params.id, req.params.stageId);
      if (!result) return res.status(404).json({ message: 'Étape introuvable' });
      const stages = await MissionModel.getStages(req.params.id);
      res.json({ ...result, stages });
    } catch (e) { res.status(500).json({ message: e.message }); }
  },
};
