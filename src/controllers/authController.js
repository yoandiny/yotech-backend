import { UserModel } from '../models/userModel.js';
import {
  exchangeCodeForToken,
  getCasdoorAccount,
  mapCasdoorAccountToUser,
} from '../services/casdoorService.js';

export const casdoorCallback = async (req, res) => {
  const { code, state } = req.body;

  if (!code || !state) {
    return res.status(400).json({ error: 'Code Casdoor ou state manquant' });
  }

  try {
    const tokenData = await exchangeCodeForToken(code);
    const account = await getCasdoorAccount(tokenData.access_token);
    const casdoorUser = mapCasdoorAccountToUser(account, tokenData.access_token);

    let dbUser = null;
    try {
      dbUser = await UserModel.upsertCasdoorUser(casdoorUser);
    } catch (dbError) {
      console.warn('Casdoor user sync retry:', dbError.message);
      dbUser = await UserModel.findByUsername(casdoorUser.username);
      if (!dbUser) throw dbError;
    }

    const user = {
      id: dbUser?.id ?? casdoorUser.casdoorUserId,
      username: casdoorUser.username,
      email: casdoorUser.email,
      displayName: casdoorUser.displayName,
      avatar: casdoorUser.avatarUrl,
      provider: 'casdoor',
      role: casdoorUser.role || dbUser?.role || 'admin',
      roles: casdoorUser.casdoorRoles || [],
    };

    res.json({
      message: 'Connexion Casdoor réussie',
      user,
      token: tokenData.access_token,
    });
  } catch (error) {
    console.error('Casdoor callback error:', error);
    res.status(401).json({
      error: error.message || 'Échec de la connexion avec Casdoor',
    });
  }
};

export const login = async (_req, res) => {
  return res.status(400).json({ error: 'La connexion se fait uniquement via Casdoor.' });
};

export const updateProfile = async (req, res) => {
  const { id, username } = req.body;
  try {
    const updatedUser = await UserModel.updateUsername(id, username);
    if (!updatedUser) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json({ message: 'Profil mis à jour avec succès', user: updatedUser });
  } catch (error) {
    console.error('Profile update error:', error);
    if (error.code === '23505') { // unique_violation in Postgres
      return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updatePassword = async (_req, res) => {
  return res.status(400).json({ error: 'Les mots de passe se gèrent dans Casdoor.' });
};
