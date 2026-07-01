import express from 'express';
import { login, updateProfile, updatePassword } from '../controllers/authController.js';

const router = express.Router();

router.post('/login', login);
router.put('/profile', updateProfile);
router.put('/password', updatePassword);

export default router;
