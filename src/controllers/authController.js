import { UserModel } from '../models/userModel.js';
import bcrypt from 'bcryptjs';

export const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await UserModel.findByUsername(username);

    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    res.json({ 
      message: 'Connexion réussie', 
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
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

export const updatePassword = async (req, res) => {
  const { id, currentPassword, newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
  }

  try {
    const user = await UserModel.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    await UserModel.updatePassword(id, hashedPassword);
    
    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
