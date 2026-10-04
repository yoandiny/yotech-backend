import { ClientModel } from '../models/clientModel.js';

export const getClients = async (req, res) => {
  try {
    const { search, type, status } = req.query;
    const [clients, summary] = await Promise.all([
      ClientModel.getAll({ search, type, status }),
      ClientModel.getSummary()
    ]);
    res.json({ clients, summary });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des clients' });
  }
};

export const getClient = async (req, res) => {
  try {
    const client = await ClientModel.getById(req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client introuvable' });
    }
    const activity = await ClientModel.getActivity(client.id);
    res.json({ client, ...activity });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du client' });
  }
};

export const createClient = async (req, res) => {
  try {
    const client = await ClientModel.create(req.body);
    res.status(201).json(client);
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur lors de la création du client' });
  }
};

export const updateClient = async (req, res) => {
  try {
    const client = await ClientModel.update(req.params.id, req.body);
    if (!client) {
      return res.status(404).json({ error: 'Client introuvable' });
    }
    res.json(client);
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(error.status || 500).json({ error: error.message || 'Erreur lors de la mise à jour du client' });
  }
};

export const deleteClient = async (req, res) => {
  try {
    const client = await ClientModel.delete(req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client introuvable' });
    }
    res.json({ message: 'Client supprimé', client });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du client' });
  }
};
