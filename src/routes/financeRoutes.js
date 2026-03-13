import express from 'express';
import { getStats, getChartData, createTransaction, getHistory } from '../controllers/financeController.js';

const router = express.Router();

router.get('/stats', getStats);
router.get('/chart', getChartData);
router.post('/', createTransaction);
router.get('/history', getHistory);

export default router;
