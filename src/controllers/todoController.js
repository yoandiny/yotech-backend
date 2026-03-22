import { TodoModel } from '../models/todoModel.js';

export const getAllTodos = async (req, res) => {
  try {
    const todos = await TodoModel.getAll();
    res.json(todos);
  } catch (error) {
    console.error('Error fetching todos:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getTodoById = async (req, res) => {
  try {
    const { id } = req.params;
    const todo = await TodoModel.getById(id);
    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    res.json(todo);
  } catch (error) {
    console.error('Error fetching todo:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const createTodo = async (req, res) => {
  try {
    const todo = await TodoModel.create(req.body);
    res.status(201).json(todo);
  } catch (error) {
    console.error('Error creating todo:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateTodo = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedTodo = await TodoModel.update(id, req.body);
    if (!updatedTodo) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    res.json(updatedTodo);
  } catch (error) {
    console.error('Error updating todo:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const deleteTodo = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedTodo = await TodoModel.delete(id);
    if (!deletedTodo) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    res.json({ message: 'Todo deleted successfully', id: deletedTodo.id });
  } catch (error) {
    console.error('Error deleting todo:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
