import { MissionModel }  from '../models/missionModel.js';
import { FinanceModel }  from '../models/financeModel.js';

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
      res.json(m);
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

  // ─── POST /missions/:id/pay-acompte ────────────────────────────
  // Crée une transaction dans finances + marque l'acompte comme payé
  payAcompte: async (req, res) => {
    try {
      const mission = await MissionModel.getById(req.params.id);
      if (!mission) return res.status(404).json({ message: 'Mission introuvable' });
      if (mission.acompte_paid) return res.status(400).json({ message: 'Acompte déjà enregistré' });

      const amount = parseFloat(mission.acompte_amount);
      const today  = req.body.date || new Date().toISOString().split('T')[0];

      // Crée la transaction dans les finances
      const transaction = await FinanceModel.addTransaction({
        description: `Acompte — ${mission.title} (${mission.client_name})`,
        amount,
        type: 'revenu',
        date: today,
        currency: mission.currency || 'MGA',
      });

      // Marque l'acompte comme payé
      const updated = await MissionModel.recordPayment(req.params.id, 'acompte', {
        finance_id: transaction.id,
        date: today,
      });

      res.json({ mission: updated, transaction });
    } catch (e) {
      console.error('payAcompte:', e);
      res.status(500).json({ message: e.message });
    }
  },

  // ─── POST /missions/:id/pay-final ──────────────────────────────
  // Crée la transaction du solde final + met le statut à "terminee"
  payFinal: async (req, res) => {
    try {
      const mission = await MissionModel.getById(req.params.id);
      if (!mission) return res.status(404).json({ message: 'Mission introuvable' });
      if (mission.final_paid) return res.status(400).json({ message: 'Paiement final déjà enregistré' });

      const amount = parseFloat(mission.final_amount);
      const today  = req.body.date || new Date().toISOString().split('T')[0];

      const transaction = await FinanceModel.addTransaction({
        description: `Solde final — ${mission.title} (${mission.client_name})`,
        amount,
        type: 'revenu',
        date: today,
        currency: mission.currency || 'MGA',
      });

      const updated = await MissionModel.recordPayment(req.params.id, 'final', {
        finance_id: transaction.id,
        date: today,
      });

      // Passe automatiquement en "terminée" si tout est payé
      await MissionModel.updateProgress(req.params.id, 100, 'terminee');

      res.json({ mission: { ...updated, progress: 100, status: 'terminee' }, transaction });
    } catch (e) {
      console.error('payFinal:', e);
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
};
