import { UserModel } from '../models/userModel.js';
import { getCasdoorUser } from './casdoorService.js';
import { normalizeRoleName } from './casdoorRoles.js';
import { formatLegalName, namesFromAccount } from '../utils/legalName.js';

const MANAGER_ROLES = ['admin', 'gerant', 'manager', 'built-in'];

const parseRoles = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [String(value)];
  }
};

export const isManagerRole = (person = {}) => {
  const roles = [
    person.user_role,
    person.role,
    ...parseRoles(person.casdoor_roles)
  ].map(normalizeRoleName);
  return roles.some((role) => MANAGER_ROLES.includes(role));
};

export const hydrateLegalName = async (person) => {
  if (!person) return person;
  let given_names = person.given_names || person.user_given_names || person.givenNames || '';
  let family_name = person.family_name || person.user_family_name || person.familyName || '';

  if ((!given_names || !family_name) && (person.username || person.casdoor_user_id)) {
    try {
      const account = await getCasdoorUser({
        username: person.username,
        casdoorUserId: person.casdoor_user_id
      });
      if (account) {
        const names = namesFromAccount(account);
        given_names = names.given_names || given_names;
        family_name = names.family_name || family_name;
        const isAssociateRow = ['active', 'pending', 'inactive'].includes(person.status) || person.shares !== undefined;
        const userId = isAssociateRow ? person.user_id : person.id;
        if (userId && (names.given_names || names.family_name)) {
          await UserModel.updateLegalName(userId, names);
        }
      }
    } catch (error) {
      console.warn('Impossible de lire le nom Casdoor:', error.message);
    }
  }

  const legal_name = formatLegalName({
    given_names,
    family_name,
    name: person.name || person.display_name || person.displayName
  });

  return {
    ...person,
    given_names,
    family_name,
    legal_name,
    name: legal_name || person.name
  };
};

export const hydratePeople = async (people = []) => (
  Promise.all(people.map((person) => hydrateLegalName(person)))
);

export const listManagers = async (associates = []) => {
  const fromAssociates = associates.filter(isManagerRole);
  if (fromAssociates.length) return fromAssociates;
  const users = await hydratePeople(await UserModel.listDirectory());
  return users.filter(isManagerRole);
};

const normalize = (value) => String(value || '').trim().toLowerCase();

export const matchPerson = (entry, people = []) => {
  const needle = normalize(entry?.registry_id ? '' : (entry?.name || entry));
  return people.find((person) => {
    if (entry?.registry_id && Number(person.id) === Number(entry.registry_id)) return true;
    const candidates = [person.legal_name, person.name, person.display_name, person.username, person.given_names]
      .map(normalize)
      .filter(Boolean);
    return needle && candidates.includes(needle);
  });
};

export const applyLegalNamesToAssembly = (answers = {}, people = [], managers = []) => {
  const associates = (answers.associates || []).map((associate) => {
    const match = matchPerson(associate, people);
    if (!match) {
      return {
        ...associate,
        name: formatLegalName(associate) || associate.name
      };
    }
    return {
      ...associate,
      registry_id: associate.registry_id || match.id,
      given_names: match.given_names,
      family_name: match.family_name,
      name: match.legal_name || match.name || associate.name
    };
  });

  const managerNames = managers.map((person) => person.legal_name || formatLegalName(person)).filter(Boolean);
  const resolveOffice = (value) => {
    if (!value) return managerNames[0] || '';
    const match = matchPerson({ name: value }, [...people, ...managers]);
    return match?.legal_name || formatLegalName(value) || value;
  };

  return {
    answers: {
      ...answers,
      associates,
      president: resolveOffice(answers.president),
      secretary: resolveOffice(answers.secretary)
    },
    company_manager: managerNames.join(' et ')
  };
};
