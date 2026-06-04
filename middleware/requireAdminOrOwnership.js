const Collection = require('../models/collection');

export const requireOwnershipOrAdmin = async (req, res, next) => {
  try {
    const collection = await Collection.findById(req.params.collectionId);
    if (!collection) return res.status(404).json({ message: 'Collection not found' });
    if (
      collection.creator.toString() !== req.user.userId &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Unauthorized: Not owner or admin' });
    }
    req.collection = collection;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}