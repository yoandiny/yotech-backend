import { AssociateModel } from '../models/associateModel.js';
import { UserModel } from '../models/userModel.js';
import { FinanceModel } from '../models/financeModel.js';
import { createCasdoorAssociateUser, listCasdoorUsers } from '../services/casdoorService.js';

const parseRoles = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  display_name: user.display_name,
  email: user.email,
  role: user.role || 'admin',
  roles: parseRoles(user.casdoor_roles || user.casdoorRoles)
});

const totalCapital = (associates, settings) => {
  const statutory = Number(settings?.company_share_count) || 0;
  const held = associates.reduce((sum, item) => sum + (Number(item.shares) || 0), 0);
  return statutory || held;
};

export const evaluateApprovals = (associates, approvalIds = [], settings) => {
  if (!associates.length) {
    return { ok: true, unanimous: true, majority: true, capitalPercent: 100, reason: 'first' };
  }

  const approved = associates.filter((item) => approvalIds.map(Number).includes(Number(item.id)));
  const capital = totalCapital(associates, settings) || 0;
  const approvedShares = approved.reduce((sum, item) => sum + (Number(item.shares) || 0), 0);
  const capitalPercent = capital > 0 ? Math.round((approvedShares / capital) * 1000) / 10 : 0;
  const unanimous = approved.length === associates.length;
  const majority = approved.length > associates.length / 2;
  const threeQuarters = majority && capitalPercent >= 75;
  return {
    ok: unanimous || threeQuarters,
    unanimous,
    majority,
    capitalPercent,
    approvedCount: approved.length,
    totalCount: associates.length
  };
};

export const AssociateController = {
  getAll: async (_req, res) => {
    try {
      const associates = await AssociateModel.getAll();
      const settings = await FinanceModel.getSettings();
      res.json({
        associates,
        capital: {
          statutory: Number(settings?.company_share_count) || 0,
          held: associates.reduce((sum, item) => sum + (Number(item.shares) || 0), 0)
        }
      });
    } catch (error) {
      console.error('Error listing associates:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  getAccounts: async (_req, res) => {
    try {
      try {
        const casdoorUsers = await listCasdoorUsers();
        for (const user of casdoorUsers) {
          try {
            await UserModel.upsertCasdoorUser(user);
          } catch (userError) {
            console.warn(`Casdoor user ${user.username} sync skipped:`, userError.message);
          }
        }
      } catch (syncError) {
        console.warn('Casdoor user directory sync skipped:', syncError.message);
      }

      const users = await UserModel.listDirectory();
      const associates = await AssociateModel.getAll();
      const linked = new Set(associates.map((item) => item.user_id).filter(Boolean));
      res.json({
        users: users.map(publicUser),
        available: users.filter((user) => !linked.has(user.id)).map(publicUser)
      });
    } catch (error) {
      console.error('Error listing accounts:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  create: async (req, res) => {
    try {
      const { shares, user_id, new_user, approvals } = req.body;
      let name = req.body.name;
      let email = req.body.email;

      const associates = await AssociateModel.getAll();
      const settings = await FinanceModel.getSettings();
      const vote = evaluateApprovals(associates, approvals || [], settings);
      if (!vote.ok) {
        return res.status(400).json({
          error: 'L’admission d’un associé requiert l’accord unanime ou la majorité des associés représentant les 3/4 du capital social.',
          vote
        });
      }

      let userId = user_id || null;
      if (userId && !new_user?.username) {
        const account = await UserModel.findById(userId);
        if (!account) return res.status(400).json({ error: 'Compte introuvable.' });
        name = account.display_name || account.username;
        email = account.email || null;
      }
      if (new_user?.username) {
        if (!new_user.password || String(new_user.password).length < 6) {
          return res.status(400).json({ error: 'Le mot de passe du compte Casdoor doit contenir au moins 6 caractères.' });
        }
        let casdoorUser;
        try {
          casdoorUser = await createCasdoorAssociateUser({
            username: new_user.username,
            password: new_user.password,
            email: email || new_user.email || null,
            displayName: name.trim()
          });
        } catch (casdoorError) {
          return res.status(400).json({
            error: casdoorError.message || 'Impossible de créer le compte dans Casdoor. Vérifiez le rôle « associe ».'
          });
        }
        const created = await UserModel.upsertCasdoorUser(casdoorUser);
        userId = created.id;
        name = casdoorUser.displayName || new_user.username;
        email = casdoorUser.email || email || null;
      }

      if (!name?.trim()) return res.status(400).json({ error: 'Le nom de l’associé est obligatoire.' });

      if (userId) {
        const already = await AssociateModel.findByUserId(userId);
        if (already) return res.status(400).json({ error: 'Ce compte est déjà lié à un associé.' });
      }

      const associate = await AssociateModel.create({
        user_id: userId,
        name: name.trim(),
        email: email || null,
        shares
      });
      res.status(201).json(associate);
    } catch (error) {
      console.error('Error creating associate:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  update: async (req, res) => {
    try {
      const current = await AssociateModel.getById(req.params.id);
      if (!current || current.status === 'inactive') {
        return res.status(404).json({ error: 'Associé introuvable' });
      }

      const sharesChanged = req.body.shares !== undefined && Number(req.body.shares) !== Number(current.shares);
      if (sharesChanged) {
        const associates = await AssociateModel.getAll();
        const settings = await FinanceModel.getSettings();
        const vote = evaluateApprovals(associates, req.body.approvals || [], settings);
        if (!vote.ok) {
          return res.status(400).json({
            error: 'La modification des parts requiert l’accord unanime ou la majorité représentant les 3/4 du capital.',
            vote
          });
        }
      }

      const updated = await AssociateModel.update(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error('Error updating associate:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  remove: async (req, res) => {
    try {
      const associates = (await AssociateModel.getAll()).filter(
        (item) => Number(item.id) !== Number(req.params.id)
      );
      const settings = await FinanceModel.getSettings();
      const vote = evaluateApprovals(associates, req.body?.approvals || [], settings);
      if (!vote.ok) {
        return res.status(400).json({
          error: 'Le retrait d’un associé requiert l’accord unanime ou la majorité représentant les 3/4 du capital.',
          vote
        });
      }
      const removed = await AssociateModel.remove(req.params.id);
      if (!removed) return res.status(404).json({ error: 'Associé introuvable' });
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing associate:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};
