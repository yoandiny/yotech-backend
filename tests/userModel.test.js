import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { setupTestDb } from './setup.js';

let container;
let pool;
let UserModel;

before(async () => {
  const setup = await setupTestDb();
  container = setup.container;
  pool = setup.pool;

  const modelModule = await import('../src/models/userModel.js');
  UserModel = modelModule.UserModel;
});

after(async () => {
  if (pool) {
    await pool.end();
  }
  if (container) {
    await container.stop();
  }
});

test('Intégration UserModel - devrait créer et retrouver un utilisateur Casdoor', async () => {
  const casdoorUser = {
    username: 'casdoor-admin',
    email: 'casdoor-admin@yotech.mg',
    provider: 'casdoor',
    casdoorUserId: 'casdoor-user-001',
    displayName: 'Admin Casdoor',
    avatarUrl: 'https://example.com/avatar.png',
  };

  const createdUser = await UserModel.upsertCasdoorUser(casdoorUser);

  assert.ok(createdUser.id);
  assert.strictEqual(createdUser.email, casdoorUser.email);
  assert.strictEqual(createdUser.provider, 'casdoor');

  const foundById = await UserModel.findByCasdoorUserId(casdoorUser.casdoorUserId);
  assert.ok(foundById);
  assert.strictEqual(foundById.email, casdoorUser.email);

  const updatedUser = await UserModel.upsertCasdoorUser({
    ...casdoorUser,
    displayName: 'Admin Casdoor mis à jour',
  });

  assert.strictEqual(updatedUser.display_name, 'Admin Casdoor mis à jour');
});
