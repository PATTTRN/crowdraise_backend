import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const schemas: Record<string, z.ZodSchema> = {
  register: z.object({
    name: z.string().min(1).max(80),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['user', 'admin']).optional(),
    country: z.string().max(100).optional(),
  }),
  login: z.object({ email: z.string().email(), password: z.string().min(1) }),
  createCollection: z.object({
    type: z.enum(['fundraiser', 'occasion', 'tips']),
    title: z.string().min(1),
    category: z.string().min(1),
    description: z.string().min(1).max(300),
    fullStory: z.string().max(5000).optional(),
    goal: z.number().min(1000).optional(),
    images: z.array(z.object({ url: z.string(), publicId: z.string(), isPrimary: z.boolean().optional() })).optional(),
    eventDate: z.string().optional(),
    receiverName: z.string().max(100).optional(),
    suggestedAmounts: z.array(z.number().positive()).optional(),
  }),
  initializeContribution: z.object({
    collectionId: z.string().min(1),
    amount: z.number().min(100),
    message: z.string().max(300).optional(),
    isAnonymous: z.boolean().optional(),
    supporterName: z.string().max(80).optional(),
    supporterEmail: z.string().email().optional(),
  }),
  forgotPassword: z.object({ email: z.string().email() }),
  resetPassword: z.object({ email: z.string().email(), token: z.string().min(1), newPassword: z.string().min(8) }),
  addUpdate: z.object({ message: z.string().min(1) }),
  moderateCollection: z.object({ action: z.enum(['approve', 'reject']), rejectionReason: z.string().optional() }),
  refundContribution: z.object({ reason: z.string().optional() }),
};

export function validate(schemaName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const schema = schemas[schemaName];
    if (!schema) return next();

    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues || [];
      return res.status(400).json({
        message: issues[0]?.message || 'Validation failed',
        errors: issues.map((e: z.ZodIssue) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    req.body = result.data;
    next();
  };
}
