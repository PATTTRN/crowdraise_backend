import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import config from '../config';
import { AppError } from '../utils/errors';

interface TokenPayload {
  email: string;
  userId: string;
  role: string;
  emailVerified: boolean;
}

export function signToken(user: { email: string; _id: unknown; role: string; emailVerified: boolean }): string {
  return jwt.sign(
    { email: user.email, userId: String(user._id), role: user.role, emailVerified: user.emailVerified },
    config.jwtKey,
    { expiresIn: config.jwtExpiry } as jwt.SignOptions
  );
}

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, 10);
}

export function extractToken(authHeader?: string): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'AUTH_ERROR', 'No token provided');
  }
  return authHeader.slice(7);
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, config.jwtKey) as TokenPayload;
  } catch {
    throw new AppError(401, 'AUTH_ERROR', 'Invalid or expired token');
  }
}
