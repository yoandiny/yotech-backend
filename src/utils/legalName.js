export const splitLegalName = (value) => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { given_names: '', family_name: '' };
  if (parts.length === 1) return { given_names: parts[0], family_name: '' };
  return {
    given_names: parts.slice(0, -1).join(' '),
    family_name: parts[parts.length - 1]
  };
};

export const formatLegalName = (person) => {
  if (!person) return '';
  if (typeof person === 'string') return formatLegalName(splitLegalName(person));
  const given = String(person.given_names || '').trim();
  const family = String(person.family_name || '').trim();
  if (given && family) return `${given} ${family.toUpperCase()}`;
  if (family) return family.toUpperCase();
  if (given) {
    const split = splitLegalName(given);
    if (split.family_name) return formatLegalName(split);
    return given;
  }
  const fallback = String(person.name || person.display_name || '').trim();
  return fallback ? formatLegalName(splitLegalName(fallback)) : '';
};

export const namesFromAccount = (account = {}) => {
  const given_names = String(account.given_names || account.firstName || account.givenName || '').trim();
  const family_name = String(account.family_name || account.lastName || account.familyName || '').trim();
  if (given_names || family_name) {
    return {
      given_names,
      family_name,
      name: formatLegalName({ given_names, family_name, name: account.display_name || account.displayName })
    };
  }
  const split = splitLegalName(account.display_name || account.displayName || account.name || account.username);
  return {
    given_names: split.given_names,
    family_name: split.family_name,
    name: formatLegalName(split)
  };
};
