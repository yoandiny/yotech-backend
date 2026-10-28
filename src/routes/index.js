import express from 'express';
import financeRoutes from './financeRoutes.js';
import authRoutes from './authRoutes.js';
import todoRoutes from './todoRoutes.js';
import hrRoutes from './hrRoutes.js';
import missionRoutes from './missionRoutes.js';
import sharesRoutes from './sharesRoutes.js';
import clientRoutes from './clientRoutes.js';
import contractRoutes from './contractRoutes.js';
import assemblyRoutes from './assemblyRoutes.js';
import associateRoutes from './associateRoutes.js';
import { attachActor, restrictAssociateWrites } from '../middleware/actor.js';

const router = express.Router();

router.use(attachActor);
router.use(restrictAssociateWrites);

router.use('/finances', financeRoutes);
router.use('/auth', authRoutes);
router.use('/todos', todoRoutes);
router.use('/hr', hrRoutes);
router.use('/missions', missionRoutes);
router.use('/shares', sharesRoutes);
router.use('/clients', clientRoutes);
router.use('/contracts', contractRoutes);
router.use('/assemblies', assemblyRoutes);
router.use('/associates', associateRoutes);

export default router;
