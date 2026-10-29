import { AssociateModel } from '../models/associateModel.js';
import { UserModel } from '../models/userModel.js';
import { FinanceModel } from '../models/financeModel.js';
import { createCasdoorAssociateUser } from '../services/casdoorService.js';
import { hydratePeople, listManagers } from '../services/peopleNames.js';
import { namesFromAccount } from '../utils/legalName.js';

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
  given_names: user.given_names,
  family_name: user.family_name,
  legal_name: user.legal_name,
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

const withVoteSummary = async (associate, activeAssociates, settings) => {
  if (associate.status !== 'pending') {
    return { ...associate, vote: null };
  }
  const votes = await AssociateModel.listVotes(associate.id);
  const forIds = votes.filter((vote) => vote.decision === 'for').map((vote) => vote.voter_id);
  return {
    ...associate,
    vote: {
      ...evaluateApprovals(activeAssociates, forIds, settings),
      ballots: votes.map((vote) => ({
        voter_id: vote.voter_id,
        voter_name: vote.voter_name,
        decision: vote.decision
      }))
    }
  };
};

const currentAssociate = async (req) => {
  const userId = req.actor?.id;
  if (userId) {
    const byUser = await AssociateModel.findByUserId(userId, { statuses: ['active'] });
    if (byUser) return byUser;
  }
  const username = req.actor?.username;
  if (!username) return null;
  const active = await AssociateModel.getAll({ statuses: ['active'] });
  return active.find((item) => item.username === username) || null;
};

export const AssociateController = {
  getAll: async (req, res) => {
    try {
      const associates = await hydratePeople(await AssociateModel.getAll({ statuses: ['active', 'pending'] }));
      const active = associates.filter((item) => item.status === 'active');
      const settings = await FinanceModel.getSettings();
      const me = await currentAssociate(req);
      const listed = await Promise.all(associates.map((item) => withVoteSummary(item, active, settings)));
      res.json({
        associates: listed,
        managers: (await listManagers(active)).map((item) => ({
          id: item.id,
          name: item.legal_name || item.name,
          given_names: item.given_names,
          family_name: item.family_name
        })),
        me: me ? { associate_id: me.id, name: me.legal_name || me.name } : null,
        capital: {
          statutory: Number(settings?.company_share_count) || 0,
          held: active.reduce((sum, item) => sum + (Number(item.shares) || 0), 0)
        }
      });
    } catch (error) {
      console.error('Error listing associates:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  getAccounts: async (_req, res) => {
    try {
      const users = await hydratePeople(await UserModel.listDirectory());
      const associates = await AssociateModel.getAll({ statuses: ['active', 'pending'] });
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
      const { shares, user_id, new_user } = req.body;
      let name = req.body.name;
      let email = req.body.email;

      let userId = user_id || null;
      if (userId && !new_user?.username) {
        const account = await UserModel.findById(userId);
        if (!account) return res.status(400).json({ error: 'Compte introuvable.' });
        const names = namesFromAccount(account);
        name = names.name || account.display_name || account.username;
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
            displayName: (name || '').trim() || new_user.username
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
        const already = await AssociateModel.findByUserId(userId, { statuses: ['active', 'pending'] });
        if (already) return res.status(400).json({ error: 'Ce compte est déjà lié à un associé.' });
      }

      const active = await AssociateModel.getAll({ statuses: ['active'] });
      const associate = await AssociateModel.create({
        user_id: userId,
        name: name.trim(),
        email: email || null,
        shares,
        status: active.length === 0 ? 'active' : 'pending'
      });
      res.status(201).json(associate);
    } catch (error) {
      console.error('Error creating associate:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  vote: async (req, res) => {
    try {
      const decision = req.body?.decision === 'against' ? 'against' : 'for';
      const target = await AssociateModel.getById(req.params.id);
      if (!target || target.status !== 'pending') {
        return res.status(404).json({ error: 'Candidature introuvable.' });
      }

      const voter = await currentAssociate(req);
      if (!voter) {
        return res.status(403).json({ error: 'Seul un associé déjà validé peut voter.' });
      }
      if (Number(voter.id) === Number(target.id)) {
        return res.status(400).json({ error: 'Un candidat ne vote pas sur sa propre admission.' });
      }

      await AssociateModel.upsertVote({ associateId: target.id, voterId: voter.id, decision });

      const active = await AssociateModel.getAll({ statuses: ['active'] });
      const settings = await FinanceModel.getSettings();
      const votes = await AssociateModel.listVotes(target.id);
      const forIds = votes.filter((vote) => vote.decision === 'for').map((vote) => vote.voter_id);
      const result = evaluateApprovals(active, forIds, settings);

      if (result.ok) {
        await AssociateModel.update(target.id, { status: 'active' });
      }

      const updated = await AssociateModel.getById(target.id);
      res.json(await withVoteSummary(updated, active, settings));
    } catch (error) {
      console.error('Error voting associate:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  update: async (req, res) => {
    try {
      const current = await AssociateModel.getById(req.params.id);
      if (!current || current.status === 'inactive') {
        return res.status(404).json({ error: 'Associé introuvable' });
      }
      const updated = await AssociateModel.update(req.params.id, {
        name: req.body.name,
        email: req.body.email
      });
      res.json(updated);
    } catch (error) {
      console.error('Error updating associate:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  remove: async (req, res) => {
    try {
      const current = await AssociateModel.getById(req.params.id);
      if (!current || current.status === 'inactive') {
        return res.status(404).json({ error: 'Associé introuvable' });
      }
      if (current.status !== 'pending') {
        return res.status(400).json({ error: 'Seul un associé en attente peut être retiré sans vote.' });
      }
      const removed = await AssociateModel.remove(req.params.id);
      res.json({ success: Boolean(removed) });
    } catch (error) {
      console.error('Error removing associate:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};
