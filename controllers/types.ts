import type { Request, Response, NextFunction } from 'express';

// Extend Express Request type to include "user" for typescript
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
    email?: string;
    emailVerified?: boolean;
  };
}

export type CollectionQuery = {
    status?: unknown;
    category?: unknown;
    type?: unknown;
    creator?: unknown;
    featured?: boolean;
    $text?: { $search: string };
  };