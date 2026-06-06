import { Response, NextFunction } from 'express';
import Collection from '../models/collection';
import { AuthRequest } from './authenticate';

export async function requireOwnershipOrAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const collection = await Collection.findById(req.params.collectionId);
    if (!collection) return res.status(404).json({ message: 'Collection not found' });
    if (collection.creator.toString() !== req.user?.userId && req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized: Not owner or admin' });
    }
    req.collection = collection;
    next();
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
}
