import express from 'express';
import { MissionController } from '../controllers/missionController.js';

const router = express.Router();

// Stats
router.get('/stats', MissionController.getStats);

// CRUD
router.get('/',    MissionController.getAll);
router.get('/:id', MissionController.getById);
router.post('/',   MissionController.create);
router.put('/:id', MissionController.update);
router.patch('/:id/progress', MissionController.updateProgress);
router.delete('/:id', MissionController.delete);

// Paiements → créent des transactions dans finances
router.post('/:id/pay-acompte', MissionController.payAcompte);
router.post('/:id/pay-final',   MissionController.payFinal);

// Journal
router.get('/:id/updates',  MissionController.getUpdates);
router.post('/:id/updates', MissionController.addUpdate);

export default router;
