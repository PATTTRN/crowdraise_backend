/**
 * Authorization middleware: only allow users with admin role.
 * Must be used after the `authenticate` middleware so that req.user is set.
 */
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../lib/types';

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden. Admins only.' });
  }
  next();
}

module.exports = requireAdmin;
