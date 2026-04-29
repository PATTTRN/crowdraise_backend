const express = require('express');
const router = express.Router();
const Contribution = require('../models/contribution');
const Collection = require('../models/collection');
const User = require('../models/user');
const authenticate = require('../middleware/authenticate');
const { verifyPaystackTransaction } = require('../middleware/paystack');

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
router.post('/', async (req, res) => {
  try {
    let supporterId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwt = require('jsonwebtoken');
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_KEY);
        supporterId = decoded.userId;
      } catch (err) {
        // Token invalid or expired, proceed as guest
      }
    }

    const {
      collectionId,
      amount,
      message,
      isAnonymous = false,
      supporterName,
      supporterEmail,
      currency = 'NGN',
      paystackReference
    } = req.body;

    const collection = await Collection.findById(collectionId).exec();
    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    if (!paystackReference || typeof paystackReference !== 'string') {
      return res.status(400).json({ message: 'paystackReference is required and must be a string.' });
    }

    const contribution = new Contribution({
      collection: collection._id,
      collectionTitle: collection.title,
      collectionType: collection.type,
      collectionCreator: collection.creator,
      supporter: isAnonymous ? null : supporterId,
      supporterName,
      supporterEmail,
      isAnonymous,
      message,
      amount,
      currency,
      paystackReference
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
router.post('/:contributionId/confirm', async (req, res) => {
  try {
    const contributionRecord = await Contribution.findById(req.params.contributionId);
    if (!contributionRecord) {
      return res.status(404).json({ message: 'Contribution record not found' });
    }

    if (contributionRecord.status === 'completed') {
      return res.status(200).json({ message: 'Contribution already confirmed', data: contributionRecord });
    }

    // Verify with Paystack using abstracted utility
    const paystackResponse = await verifyPaystackTransaction(contributionRecord.paystackReference);

    if (!paystackResponse.status || paystackResponse.data.status !== 'success') {
      return res.status(400).json({ 
        message: 'Payment verification failed', 
        details: paystackResponse.message || 'Transaction not successful' 
      });
    }

    // Verify amount matches (Paystack amount is in kobo)
    const expectedAmountKobo = contributionRecord.amount * 100;
    if (paystackResponse.data.amount !== expectedAmountKobo) {
       return res.status(400).json({ message: 'Payment amount mismatch' });
    }

    const contribution = await Contribution.confirmAndUpdateCounters(req.params.contributionId);
    
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
