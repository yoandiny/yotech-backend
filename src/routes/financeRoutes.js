import express from 'express';
import { 
  getStats, 
  getChartData, 
  createTransaction, 
  getHistory, 
  getGoal, 
  setGoal,
  getSettings,
  updateSettings,
  generateInvoiceNumber,
  invoiceTransaction,
  generateInvoicePDF
} from '../controllers/financeController.js';

const router = express.Router();

router.get('/stats', getStats);
router.get('/chart', getChartData);
router.post('/', createTransaction);
router.get('/history', getHistory);
router.get('/goal', getGoal);
router.post('/goal', setGoal);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.get('/invoice-number', generateInvoiceNumber);
router.post('/:id/invoice', invoiceTransaction);
router.get('/:id/pdf', generateInvoicePDF);

export default router;
