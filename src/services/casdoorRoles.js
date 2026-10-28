const ASSOCIATE_ROLE_ALIASES = ['associe', 'associate', 'associates'];
const ADMIN_ROLE_ALIASES = ['admin', 'built-in'];

export const normalizeRoleName = (value) =>
  String(value || '')
    .split('/')
    .pop()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const pushRole = (names, value) => {
  if (!value) return;
  if (typeof value === 'string') {
    names.push(value);
    return;
  }
  if (value.name) names.push(value.owner && value.name.includes('/') ? value.name : `${value.owner || ''}/${value.name}`.replace(/^\//, ''));
};

export const collectCasdoorRoleNames = (account = {}, tokenPayload = {}) => {
  const names = [];
  (account.roles || []).forEach((role) => pushRole(names, role));
  (tokenPayload.roles || []).forEach((role) => pushRole(names, role));
  pushRole(names, account.role);
  pushRole(names, tokenPayload.role);
  return [...new Set(names.filter(Boolean))];
};

export const appRoleFromCasdoor = ({ roleNames = [], isAdmin = false } = {}) => {
  const normalized = roleNames.map(normalizeRoleName).filter(Boolean);
  if (isAdmin || normalized.some((name) => ADMIN_ROLE_ALIASES.includes(name))) return 'admin';
  if (normalized.some((name) => ASSOCIATE_ROLE_ALIASES.includes(name))) return 'associate';
  return 'admin';
};

export const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string' || token.split('.').length < 2) return null;
  try {
    const payload = token.split('.')[1];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
};

export const resolveCasdoorAccess = (account, accessToken) => {
  const tokenPayload = decodeJwtPayload(accessToken) || {};
  const roleNames = collectCasdoorRoleNames(account, tokenPayload);
  const isAdmin = Boolean(account?.isAdmin || tokenPayload?.isAdmin);
  return {
    roleNames,
    isAdmin,
    appRole: appRoleFromCasdoor({ roleNames, isAdmin })
  };
};
