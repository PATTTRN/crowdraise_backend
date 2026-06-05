import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../controllers/types';
const Collection = require('../models/collection');

const requireOwnershipOrAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Ensure req.user exists before accessing its properties
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const collection = await Collection.findById(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    if (
      collection.creator.toString() !== req.user.userId &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Unauthorized: Not owner or admin' });
    }

    req.collection = collection;
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = requireOwnershipOrAdmin;