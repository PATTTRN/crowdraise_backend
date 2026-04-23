const express = require('express');
const router = express.Router();
const Contribution = require('../models/contribution');
const Collection = require('../models/collection');
const authenticate = require('../middleware/authenticate');

// Authorization middleware for viewing collection contributions
async function authorizeCollectionOwnerOrAdmin(req, res, next) {
  try {
    const collection = await Collection.findById(req.params.collectionId || req.body.collectionId || req.query.collectionId);
    if (!collection) return res.status(404).json({ message: 'Collection not found' });

    // Must be the creator or admin
    if (
      collection.creator.toString() !== req.user.userId &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Unauthorized: Only the collection owner or admins can view contributions.' });
    }
    req.collection = collection;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST initialize contribution record (before payment verify)
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      collectionId,
      amount,
      message,
      isAnonymous = false,
      supporterName,
      supporterEmail,
      currency = 'NGN'
    } = req.body;

    const collection = await Collection.findById(collectionId).exec();
    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    const contribution = new Contribution({
      collection: collection._id,
      collectionTitle: collection.title,
      collectionType: collection.type,
      collectionCreator: collection.creator,
      supporter: isAnonymous ? null : req.user.userId,
      supporterName,
      supporterEmail,
      isAnonymous,
      message,
      amount,
      currency,
      paystackReference: `cr_${collection._id}_${Date.now()}`
    });

    await contribution.save();
    res.status(201).json({
      message: 'Contribution initialized',
      data: contribution
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST confirm contribution (after provider verification)
router.post('/:contributionId/confirm', authenticate, async (req, res) => {
  try {
    const contribution = await Contribution.confirmAndUpdateCounters(req.params.contributionId);
    if (!contribution) {
      return res.status(200).json({
        message: 'Contribution already processed or not found'
      });
    }

    res.status(200).json({
      message: 'Contribution confirmed',
      data: contribution
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET collection contributions (authentication and authorization required)
router.get('/collection/:collectionId', authenticate, authorizeCollectionOwnerOrAdmin, async (req, res) => {
  try {
    const contributions = await Contribution.find({
      collection: req.params.collectionId,
      status: 'completed'
    })
      .sort({ createdAt: -1 })
      .exec();

    res.status(200).json({
      count: contributions.length,
      data: contributions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
