import { ContractModel } from '../models/contractModel.js';
import { FinanceModel } from '../models/financeModel.js';

export const ContractController = {
  getAll: async (req, res) => {
    try {
      const { status, search } = req.query;
      res.json(await ContractModel.getAll({ status, search }));
    } catch (error) {
      console.error('Error listing contracts:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  getNumber: async (_req, res) => {
    try {
      res.json({ contract_number: await ContractModel.generateNumber() });
    } catch (error) {
      console.error('Error generating contract number:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  getById: async (req, res) => {
    try {
      const contract = await ContractModel.getById(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
      res.json(contract);
    } catch (error) {
      console.error('Error fetching contract:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  getPdfData: async (req, res) => {
    try {
      const contract = await ContractModel.getById(req.params.id);
      if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
      const settings = await FinanceModel.getSettings();
      res.json({ contract, settings });
    } catch (error) {
      console.error('Error fetching contract PDF data:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  create: async (req, res) => {
    try {
      const contract = await ContractModel.create(req.body);
      res.status(201).json(contract);
    } catch (error) {
      console.error('Error creating contract:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  update: async (req, res) => {
    try {
      const contract = await ContractModel.update(req.params.id, req.body);
      if (!contract) return res.status(404).json({ error: 'Contrat introuvable' });
      res.json(contract);
    } catch (error) {
      console.error('Error updating contract:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  remove: async (req, res) => {
    try {
      const deleted = await ContractModel.deleteDraft(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Contrat introuvable' });
      res.json({ message: 'Contrat brouillon supprimé', deleted });
    } catch (error) {
      console.error('Error deleting contract:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};
