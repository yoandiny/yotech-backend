import express from 'express';
import { 
  getStats, 
  getChartData,
  getExpensesByCategory,
  getIncomeByCategory,
  createTransaction, 
  getHistory, 
  updateTransaction,
  getGoal, 
  setGoal,
  getSettings,
  updateSettings,
  generateInvoiceNumber,
  generateQuoteNumber,
  invoiceTransaction,
  generateInvoicePDF,
  getInvoiceFormData,
  getQuoteFormData,
  getTransaction,
  deleteTransaction,
  deleteQuote,
  acceptQuote,
  duplicateQuote
} from '../controllers/financeController.js';

const router = express.Router();

router.get('/stats', getStats);
router.get('/chart', getChartData);
router.get('/expenses-by-category', getExpensesByCategory);
router.get('/income-by-category', getIncomeByCategory);
router.post('/', createTransaction);
router.get('/history', getHistory);
router.put('/:id', updateTransaction);
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
router.post('/quotes/:id/accept', acceptQuote);
router.post('/quotes/:id/duplicate', duplicateQuote);
router.delete('/quotes/:id', deleteQuote);
router.get('/:id', getTransaction);
router.delete('/:id', deleteTransaction);

export default router;
