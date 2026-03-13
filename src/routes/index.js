import express from 'express';
import financeRoutes from './financeRoutes.js';
import authRoutes from './authRoutes.js';

const router = express.Router();

router.use('/finances', financeRoutes);
router.use('/auth', authRoutes);

export default router;
