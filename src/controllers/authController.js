import { UserModel } from '../models/userModel.js';

export const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await UserModel.findByUsername(username);

    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    // In a real app, use bcrypt to compare hashes
    if (user.password !== password) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Return a mock token or just success for now
    res.json({ 
      message: 'Connexion réussie', 
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
