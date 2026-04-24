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
  generateQuoteNumber,
  invoiceTransaction,
  generateInvoicePDF,
  getInvoiceFormData,
  getQuoteFormData
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
router.get('/quote-number', generateQuoteNumber);
router.post('/:id/invoice', invoiceTransaction);
router.get('/:id/pdf', generateInvoicePDF);
router.get('/:id/invoice-data', getInvoiceFormData);
router.get('/:id/quote-data', getQuoteFormData);

export default router;
