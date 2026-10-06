import express from 'express';
import { ContractController } from '../controllers/contractController.js';

const router = express.Router();

router.get('/number', ContractController.getNumber);
router.get('/', ContractController.getAll);
router.post('/', ContractController.create);
router.get('/:id/pdf-data', ContractController.getPdfData);
router.get('/:id', ContractController.getById);
router.put('/:id', ContractController.update);
router.delete('/:id', ContractController.remove);

export default router;
