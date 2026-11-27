import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAssemblySuggestion } from '../src/services/assemblyDrafting.js';

test('parse une liste de résolutions', () => {
  const parsed = parseAssemblySuggestion(JSON.stringify({
    resolutions: [
      { title: 'Quitus', text: 'L’assemblée donne quitus au gérant.' },
      { title: '', text: 'ignorée' }
    ]
  }), 'resolutions');
  assert.equal(parsed.resolutions.length, 1);
  assert.equal(parsed.resolutions[0].title, 'Quitus');
});

test('parse le texte d’une résolution et des observations', () => {
  const one = parseAssemblySuggestion('{"title":"Comptes","text":"L’assemblée approuve les comptes."}', 'resolution');
  assert.match(one.text, /approuve/);
  const notes = parseAssemblySuggestion('{"notes":"Aucun incident."}', 'notes');
  assert.equal(notes.notes, 'Aucun incident.');
});
