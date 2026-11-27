import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArticles, parseContractStructure } from '../src/services/contractDrafting.js';

test('normalise les alinéas sans préfixe Article', () => {
  const articles = normalizeArticles([
    { title: 'Article 1 — Objet', body: 'Prestation web.' },
    { title: 'Prix', body: '  1 000 000 Ar  ' },
    { title: '', body: 'vide' }
  ]);
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, 'Objet');
  assert.equal(articles[1].body, '1 000 000 Ar');
});

test('parse une structure JSON DeepSeek', () => {
  const parsed = parseContractStructure(JSON.stringify({
    articles: [
      { title: 'Objet', body: 'A' },
      { title: 'Durée', body: 'B' },
      { title: 'Droit applicable', body: 'C' }
    ]
  }));
  assert.equal(parsed.articles.length, 3);
});
