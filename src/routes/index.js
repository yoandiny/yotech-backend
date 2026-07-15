import express from 'express';
import financeRoutes from './financeRoutes.js';
import authRoutes from './authRoutes.js';
import todoRoutes from './todoRoutes.js';
import hrRoutes from './hrRoutes.js';
import missionRoutes from './missionRoutes.js';

const router = express.Router();

router.use('/finances', financeRoutes);
router.use('/auth', authRoutes);
router.use('/todos', todoRoutes);
router.use('/hr', hrRoutes);
router.use('/missions', missionRoutes);

export default router;
