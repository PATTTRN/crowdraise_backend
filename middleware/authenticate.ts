/**
 * Authentication middleware: requires valid JWT, attaches user info to req.user
 */
import type { Response, NextFunction } from 'express';
import type types = require('../lib/types');
const jwt = require('jsonwebtoken');

function authenticate(req: types.AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authentication token.' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_KEY, (err: any, decoded: any) => {
    if (err) return res.status(401).json({ message: 'Invalid or expired token.' });
    req.user = decoded;
    next();
  });
}

module.exports = authenticate;