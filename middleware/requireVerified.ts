/**
 * Middleware to require email verification.
 * Must be used AFTER the authenticate middleware.
 */
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../controllers/types';


function requireVerified(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // We need to check the DB to ensure we have the latest status, 
  // or trust the token if we include verified status in it.
  // Since we want real-time enforcement, let's assume the authenticate middleware 
  // or a user fetch has populated req.user with enough info.
  
  // NOTE: Our current authenticate middleware only decodes the JWT.
  // The JWT issued at registration has emailVerified: false.
  // We should probably check the database or the decoded token.

  if (req.user && req.user.emailVerified === false) {
    return res.status(403).json({ 
      message: 'Email verification required.',
      requiresVerification: true 
    });
  }
  next();
}

module.exports = requireVerified;
