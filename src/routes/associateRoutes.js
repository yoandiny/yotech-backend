import express from 'express';
import { AssociateController } from '../controllers/associateController.js';

const router = express.Router();

router.get('/', AssociateController.getAll);
router.get('/accounts', AssociateController.getAccounts);
router.post('/', AssociateController.create);
router.put('/:id', AssociateController.update);
router.delete('/:id', AssociateController.remove);

export default router;