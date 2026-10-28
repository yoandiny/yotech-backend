import express from 'express';
import { AssemblyController } from '../controllers/assemblyController.js';

const router = express.Router();

router.get('/number', AssemblyController.getNumber);
router.get('/', AssemblyController.getAll);
router.post('/', AssemblyController.create);
router.get('/:id/pdf-data', AssemblyController.getPdfData);
router.get('/:id', AssemblyController.getById);
router.put('/:id', AssemblyController.update);
router.delete('/:id', AssemblyController.remove);

export default router;
