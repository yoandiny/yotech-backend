import { UserModel } from '../models/userModel.js';
import { appRoleFromCasdoor, collectCasdoorRoleNames, decodeJwtPayload } from '../services/casdoorRoles.js';

const ASSOCIATE_ALLOWED = [
  { method: 'GET', pattern: /^\/assemblies(\/|$)/ },
  { method: 'GET', pattern: /^\/associates\/?$/ },
  { method: 'POST', pattern: /^\/associates\/\d+\/vote$/ },
  { method: 'GET', pattern: /^\/finances\/settings$/ },
  { method: 'GET', pattern: /^\/auth\// }
];

const actorRole = (actor) => actor?.role || 'admin';

export const attachActor = async (req, _res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const tokenPayload = decodeJwtPayload(token);

  if (tokenPayload) {
    const roleNames = collectCasdoorRoleNames({}, tokenPayload);
    const appRole = appRoleFromCasdoor({ roleNames, isAdmin: Boolean(tokenPayload.isAdmin) });
    let dbUser = null;
    try {
      const casdoorId = tokenPayload.id || tokenPayload.sub;
      if (casdoorId) dbUser = await UserModel.findByCasdoorUserId(casdoorId);
      if (!dbUser && tokenPayload.name) dbUser = await UserModel.findByUsername(tokenPayload.name);
    } catch {
      dbUser = null;
    }
    req.actor = {
      ...(dbUser || {}),
      role: appRole,
      casdoor_roles: roleNames
    };
    return next();
  }

  const raw = req.headers['x-user-id'];
  const id = raw ? Number(raw) : NaN;
  if (Number.isInteger(id) && id > 0) {
    try {
      req.actor = await UserModel.findById(id);
    } catch {
      req.actor = null;
    }
  }
  next();
};

export const restrictAssociateWrites = (req, res, next) => {
  if (actorRole(req.actor) !== 'associate') return next();

  const path = req.path || '';
  const allowed = ASSOCIATE_ALLOWED.some(
    (rule) => rule.method === req.method && rule.pattern.test(path)
  );

  if (allowed) return next();
  return res.status(403).json({
    error: 'Un compte associé n’a accès qu’à la consultation des assemblées et des associés.'
  });
};
