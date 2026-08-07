import express from 'express';
import {
  getShares,
  createShare,
  updateShare,
  deleteShare
} from '../controllers/sharesController.js';

const router = express.Router();

router.get('/', getShares);
router.post('/', createShare);
router.put('/:id', updateShare);
router.delete('/:id', deleteShare);

export default router;
