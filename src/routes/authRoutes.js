import express from 'express';
import { casdoorCallback, login, updateProfile, updatePassword } from '../controllers/authController.js';

const router = express.Router();

router.post('/login', login);
router.post('/casdoor/callback', casdoorCallback);
router.put('/profile', updateProfile);
router.put('/password', updatePassword);

export default router;
