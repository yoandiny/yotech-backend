import { AccountingError } from './accountingEngine.js';
import { completeJson, isDeepSeekConfigured } from './deepseek.js';

const SYSTEM_PROMPT = `Tu rédiges des textes de procès-verbal d’assemblée générale pour une société malgache (YoTech).
Style : juridique, clair, impersonnel, français soutenu. Pas de markdown.
N’invente ni votes, ni noms, ni montants absents du contexte.
Réponds UNIQUEMENT par un objet JSON conforme à la consigne.`;

const compactAnswers = (answers = {}) => ({
  type: answers.assembly_type,
  titre: answers.title,
  date: answers.held_on,
  lieu: answers.location,
  modalite: answers.meeting_mode,
  exercice: answers.fiscal_year,
  president: answers.president,
  secretaire: answers.secretary,
  associes: (answers.associates || []).map((item) => ({
    nom: item.name,
    parts: item.shares,
    presence: item.attendance
  })),
  resolutions: (answers.resolutions || []).map((item) => ({
    titre: item.title,
    texte: item.text,
    resultat: item.result
  })),
  observations: answers.notes || ''
});

export const parseAssemblySuggestion = (text, kind) => {
  if (!text || typeof text !== 'string') {
    throw new AccountingError('La proposition de l’assemblée est vide.');
  }
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AccountingError('La proposition n’est pas un JSON valide.');
  }

  if (kind === 'notes') {
    const notes = String(parsed.notes || parsed.text || '').trim();
    if (!notes) throw new AccountingError('Aucune observation n’a été générée.');
    return { notes };
  }

  if (kind === 'resolution') {
    const title = String(parsed.title || '').trim();
    const body = String(parsed.text || parsed.body || '').trim();
    if (!body) throw new AccountingError('Le texte de la résolution est vide.');
    return { title, text: body };
  }

  const resolutions = (Array.isArray(parsed.resolutions) ? parsed.resolutions : [])
    .map((item) => ({
      title: String(item?.title || '').trim(),
      text: String(item?.text || item?.body || '').trim()
    }))
    .filter((item) => item.title && item.text)
    .slice(0, 12);
  if (!resolutions.length) {
    throw new AccountingError('Aucune résolution n’a été générée.');
  }
  return { resolutions };
};

export const suggestAssemblyText = async ({ kind = 'resolutions', answers = {}, description, resolution } = {}) => {
  if (!isDeepSeekConfigured()) {
    throw new AccountingError('IA désactivée ou clé DeepSeek absente.', 503);
  }
  const brief = String(description || '').trim();
  if (!brief) {
    throw new AccountingError('Indiquez une description des décisions ou du contexte.');
  }

  const schema = kind === 'notes'
    ? '{ "notes": "paragraphe d’observations du PV" }'
    : kind === 'resolution'
      ? '{ "title": "titre court", "text": "texte complet de la résolution" }'
      : '{ "resolutions": [ { "title": "...", "text": "..." } ] }';

  const task = kind === 'notes'
    ? 'Rédige le paragraphe Observations du PV à partir de la description et du contexte (sans répéter tout le PV).'
    : kind === 'resolution'
      ? 'Rédige le texte complet d’UNE résolution (formule « L’assemblée décide que… ») à partir du titre et de la description. Ne change le titre que s’il est vide ou trop vague.'
      : 'Propose 2 à 8 résolutions adaptées au type d’assemblée, en t’appuyant sur la description et le contexte. Si des titres existent déjà, conserve-les et rédige surtout les textes.';

  const content = await completeJson({
    system: `${SYSTEM_PROMPT}\n${task}\nSchéma JSON : ${schema}`,
    user: JSON.stringify({
      description: brief,
      assemblee: compactAnswers(answers),
      resolution_cible: resolution ? { titre: resolution.title, texte: resolution.text } : null
    })
  });
  return parseAssemblySuggestion(content, kind);
};
