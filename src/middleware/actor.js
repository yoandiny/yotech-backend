import { UserModel } from '../models/userModel.js';

const ASSOCIATE_ALLOWED = [
  { method: 'GET', pattern: /^\/assemblies(\/|$)/ },
  { method: 'GET', pattern: /^\/associates\/?$/ },
  { method: 'GET', pattern: /^\/finances\/settings$/ },
  { method: 'GET', pattern: /^\/auth\// }
];

export const attachActor = async (req, _res, next) => {
  const raw = req.headers['x-user-id'];
  const id = raw ? Number(raw) : NaN;
  if (Number.isInteger(id) && id > 0) {
    try {
      req.actor = await UserModel.findById(id);
    } catch (error) {
      req.actor = null;
    }
  }
  next();
};

export const restrictAssociateWrites = (req, res, next) => {
  if (req.actor?.role !== 'associate') return next();

  const path = req.path || '';
  const allowed = ASSOCIATE_ALLOWED.some(
    (rule) => rule.method === req.method && rule.pattern.test(path)
  );

  if (allowed) return next();
  return res.status(403).json({
    error: 'Un compte associé n’a accès qu’à la consultation des assemblées et des associés.'
  });
};
