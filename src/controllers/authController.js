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
