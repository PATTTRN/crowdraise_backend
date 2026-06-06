import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractToken } from '../src/services/authService';

export interface AuthRequest extends Request {
  user?: { userId: string; role: string; email?: string; emailVerified?: boolean };
  collection?: unknown;
  file?: Express.Multer.File;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req.headers.authorization);
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.status(401).json({ message });
  }
}
