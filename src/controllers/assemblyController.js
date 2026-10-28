import { AssemblyModel } from '../models/assemblyModel.js';
import { FinanceModel } from '../models/financeModel.js';

export const AssemblyController = {
  getAll: async (req, res) => {
    try {
      const { status, type, search } = req.query;
      res.json(await AssemblyModel.getAll({ status, type, search }));
    } catch (error) {
      console.error('Error listing assemblies:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  getNumber: async (_req, res) => {
    try {
      res.json({ assembly_number: await AssemblyModel.generateNumber() });
    } catch (error) {
      console.error('Error generating assembly number:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  getById: async (req, res) => {
    try {
      const assembly = await AssemblyModel.getById(req.params.id);
      if (!assembly) return res.status(404).json({ error: 'Assemblée introuvable' });
      res.json(assembly);
    } catch (error) {
      console.error('Error fetching assembly:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  getPdfData: async (req, res) => {
    try {
      const assembly = await AssemblyModel.getById(req.params.id);
      if (!assembly) return res.status(404).json({ error: 'Assemblée introuvable' });
      const settings = await FinanceModel.getSettings();
      res.json({ assembly, settings });
    } catch (error) {
      console.error('Error fetching assembly PDF data:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  create: async (req, res) => {
    try {
      const assembly = await AssemblyModel.create(req.body);
      res.status(201).json(assembly);
    } catch (error) {
      console.error('Error creating assembly:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  update: async (req, res) => {
    try {
      const assembly = await AssemblyModel.update(req.params.id, req.body);
      if (!assembly) return res.status(404).json({ error: 'Assemblée introuvable' });
      res.json(assembly);
    } catch (error) {
      console.error('Error updating assembly:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  remove: async (req, res) => {
    try {
      const deleted = await AssemblyModel.deleteDraft(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Assemblée introuvable' });
      res.json({ message: 'Brouillon supprimé', deleted });
    } catch (error) {
      console.error('Error deleting assembly:', error);
      if (error.status) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};
