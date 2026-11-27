import { AccountingError } from './accountingEngine.js';
import { completeJson, isDeepSeekConfigured } from './deepseek.js';

const SYSTEM_PROMPT = `Tu aides à rédiger un devis de prestations digitales pour YoTech (Madagascar).
À partir du titre, de la catégorie et des attentes du client, tu listes ce que la prestation comprend.
Reste court : 4 à 8 puces, une idée par puce, pas de jargon inutile, pas de prix.
N’invente pas de livrables hors du contexte fourni.
Réponds UNIQUEMENT par un objet JSON : { "items": ["...", "..."] }`;

export const formatPrestationsList = (items = []) => {
  const cleaned = (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 10);
  return cleaned.map((item) => `• ${item}`).join('\n');
};

export const parsePrestationsJson = (text) => {
  if (!text || typeof text !== 'string') {
    throw new AccountingError('La proposition de prestations est vide.');
  }
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AccountingError('La proposition de prestations n’est pas un JSON valide.');
  }
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const details = formatPrestationsList(items);
  if (!details) {
    throw new AccountingError('La proposition ne contient aucune prestation.');
  }
  return { items, details };
};

export const suggestPrestationsList = async ({ description, category, client_name, notes } = {}) => {
  if (!isDeepSeekConfigured()) {
    throw new AccountingError('IA désactivée ou clé DeepSeek absente.', 503);
  }
  const title = String(description || '').trim();
  if (!title) {
    throw new AccountingError('Indiquez d’abord le libellé du projet.');
  }

  const content = await completeJson({
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      projet: title,
      categorie: category || null,
      client: client_name || null,
      attentes_client: notes || null
    })
  });
  return parsePrestationsJson(content);
};
