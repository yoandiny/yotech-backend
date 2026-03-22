import express from 'express';
import { getStats, getChartData, createTransaction, getHistory, getGoal, setGoal } from '../controllers/financeController.js';

const router = express.Router();

router.get('/stats', getStats);
router.get('/chart', getChartData);
router.post('/', createTransaction);
router.get('/history', getHistory);
router.get('/goal', getGoal);
router.post('/goal', setGoal);

export default router;
