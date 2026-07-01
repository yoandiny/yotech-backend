import express from 'express';
import * as todoController from '../controllers/todoController.js';

// Note: since auth check might be implemented directly in the routes or custom middleware,
// we will just define the routes. Let's assume standard routing.

const router = express.Router();

router.get('/', todoController.getAllTodos);
router.get('/:id', todoController.getTodoById);
router.post('/', todoController.createTodo);
router.put('/:id', todoController.updateTodo);
router.delete('/:id', todoController.deleteTodo);

export default router;
