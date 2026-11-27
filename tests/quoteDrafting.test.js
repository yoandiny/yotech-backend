import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrestationsList, parsePrestationsJson } from '../src/services/quoteDrafting.js';

test('formatte une liste courte de prestations', () => {
  const text = formatPrestationsList(['  Maquette Figma', '• Intégration vitrine', '', '1. Mise en ligne']);
  assert.equal(text, '• Maquette Figma\n• Intégration vitrine\n• Mise en ligne');
});

test('parse le JSON DeepSeek des prestations', () => {
  const parsed = parsePrestationsJson('{"items":["Cahier des besoins","Site vitrine 5 pages"]}');
  assert.equal(parsed.items.length, 2);
  assert.match(parsed.details, /Cahier des besoins/);
});
