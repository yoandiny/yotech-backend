import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { setupTestDb } from './setup.js';

let container;
let pool;
let TodoModel;

before(async () => {
  const setup = await setupTestDb();
  container = setup.container;
  pool = setup.pool;

  const modelModule = await import('../src/models/todoModel.js');
  TodoModel = modelModule.TodoModel;
});

after(async () => {
  if (pool) {
    await pool.end();
  }
  if (container) {
    await container.stop();
  }
});

test('Intégration TodoModel - Cycle de vie d\'un Todo', async (t) => {
  let createdTodoId;

  await t.test('1. Devrait créer un nouveau Todo avec succès', async () => {
    const todoData = {
      title: 'Tester Testcontainers',
      description: 'Vérifier le bon fonctionnement de Testcontainers dans le backend',
      status: 'PENDING',
      priority: 'HIGH',
      due_date: '2026-12-31',
      client_name: 'YoTech Test Client'
    };

    const newTodo = await TodoModel.create(todoData);
    
    assert.ok(newTodo.id);
    assert.strictEqual(newTodo.title, todoData.title);
    assert.strictEqual(newTodo.description, todoData.description);
    assert.strictEqual(newTodo.status, todoData.status);
    assert.strictEqual(newTodo.priority, todoData.priority);
    assert.strictEqual(newTodo.client_name, todoData.client_name);
    
    createdTodoId = newTodo.id;
  });

  await t.test('2. Devrait récupérer le Todo créé par son ID', async () => {
    assert.ok(createdTodoId);
    
    const todo = await TodoModel.getById(createdTodoId);
    
    assert.ok(todo);
    assert.strictEqual(todo.id, createdTodoId);
    assert.strictEqual(todo.title, 'Tester Testcontainers');
  });

  await t.test('3. Devrait lister tous les Todos et inclure le Todo créé', async () => {
    const allTodos = await TodoModel.getAll();
    
    assert.ok(Array.isArray(allTodos));
    assert.ok(allTodos.length >= 1);
    
    const found = allTodos.find(todo => todo.id === createdTodoId);
    assert.ok(found);
  });

  await t.test('4. Devrait modifier le statut du Todo créé', async () => {
    assert.ok(createdTodoId);
    
    const updatedTodo = await TodoModel.update(createdTodoId, {
      status: 'COMPLETED'
    });
    
    assert.strictEqual(updatedTodo.id, createdTodoId);
    assert.strictEqual(updatedTodo.status, 'COMPLETED');
    
    const fetched = await TodoModel.getById(createdTodoId);
    assert.strictEqual(fetched.status, 'COMPLETED');
  });

  await t.test('5. Devrait supprimer le Todo avec succès', async () => {
    assert.ok(createdTodoId);
    
    const deletedResult = await TodoModel.delete(createdTodoId);
    assert.strictEqual(deletedResult.id, createdTodoId);
    
    const fetched = await TodoModel.getById(createdTodoId);
    assert.strictEqual(fetched, undefined);
  });
});
