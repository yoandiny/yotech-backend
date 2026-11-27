import { AccountingError } from './accountingEngine.js';
import { completeJson, isDeepSeekConfigured } from './deepseek.js';
import { getContractType } from '../data/contractTypes.js';

const SYSTEM_PROMPT = `Tu es juriste d’entreprise pour YoTech (Madagascar, droit malgache).
Tu rédiges la structure d’un contrat sous forme d’alinéas, à partir du type de contrat, du modèle d’articles et des réponses utilisateur.
Règles :
- Réponds UNIQUEMENT par un objet JSON, sans markdown.
- N’invente pas de faits absents des réponses.
- Style clair, professionnel, concis (1 à 3 paragraphes par alinéa).
- Les titres d’articles ne doivent pas inclure « Article 1 » : seulement le thème (ex. « Objet »).
- Respecte l’ordre du canevas fourni ; tu peux omettre un alinéa s’il n’est pas pertinent, pas en ajouter hors sujet.

Schéma JSON :
{
  "articles": [
    { "title": "Objet", "body": "..." }
  ]
}`;

export const normalizeArticles = (articles = []) => {
  const list = Array.isArray(articles) ? articles : [];
  return list
    .map((item, index) => ({
      id: String(item?.id || `art-${index + 1}`),
      title: String(item?.title || '').replace(/^article\s+\d+\s*[—-]\s*/i, '').trim(),
      body: String(item?.body || '').trim()
    }))
    .filter((item) => item.title && item.body);
};

export const parseContractStructure = (text) => {
  if (!text || typeof text !== 'string') {
    throw new AccountingError('La structure du contrat est vide.');
  }
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AccountingError('La structure du contrat n’est pas un JSON valide.');
  }
  const articles = normalizeArticles(parsed?.articles);
  if (articles.length < 3) {
    throw new AccountingError('La structure doit contenir au moins trois alinéas.');
  }
  return { articles };
};

export const suggestContractStructure = async ({ template_id, answers = {}, mission } = {}) => {
  if (!isDeepSeekConfigured()) {
    throw new AccountingError('IA désactivée ou clé DeepSeek absente.', 503);
  }
  const type = getContractType(template_id);
  const content = await completeJson({
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      type_contrat: { id: type.id, label: type.label },
      canevas: type.outline,
      reponses: answers,
      mission: mission || null,
      prestataire: 'YoTech'
    })
  });
  return parseContractStructure(content);
};
