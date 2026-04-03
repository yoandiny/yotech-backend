import express from 'express';
import { HRController } from '../controllers/hrController.js';

const router = express.Router();

// Employees
router.get('/employees', HRController.getEmployees);
router.post('/employees', HRController.addEmployee);
router.put('/employees/:id', HRController.updateEmployee);
router.delete('/employees/:id', HRController.deleteEmployee);

// Freelancers
router.get('/freelancers', HRController.getFreelancers);
router.post('/freelancers', HRController.addFreelancer);

// Transactions
router.post('/transactions', HRController.addTransaction);

// Payroll
router.get('/payrolls', HRController.getPayrolls);
router.post('/payroll/generate', HRController.generatePayroll);

export default router;
