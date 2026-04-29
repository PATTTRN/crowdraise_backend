const express = require('express');
const router = express.Router();
const Collection = require('../models/collection');
const User = require('../models/user');
const authenticate = require('../middleware/authenticate');

// Helper: Validate collection ownership or admin
async function requireOwnershipOrAdmin(req, res, next) {
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

// GET all collections: supports filtering, searching, and pagination
router.get('/', async (req, res) => {
  try {
    const {
      status,
      category,
      type,
      search,
      creator,
      sort = '-createdAt', // default: newest first
      page = 1,
      limit = 10,
      featured
    } = req.query;

    const query = {};

    // Filtering
    if (status) query.status = status;
    if (category) query.category = category;
    if (type) query.type = type;
    if (creator) query.creator = creator;
    if (typeof featured !== 'undefined') query.featured = featured === 'true' ? true : false;

    // Search (text index)
    if (search) {
      query.$text = { $search: search };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Query and count
    const [collections, total] = await Promise.all([
      Collection.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('creator', 'name email role'),
      Collection.countDocuments(query)
    ]);

    res.status(200).json({
      message: 'Collections fetched',
      count: total,
      page: parseInt(page),
      pageSize: collections.length,
      totalPages: Math.ceil(total / limit),
      data: collections
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET one collection by id
router.get('/:collectionId', async (req, res) => {
  try {
    const collection = await Collection.findById(req.params.collectionId)
      .populate('creator', 'name email role');
    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }
    res.status(200).json(collection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create collection (authenticated)
router.post('/', authenticate, async (req, res) => {
  console.log("hrereeer", req.user)
  try {
    const creator = await User.findById(req.user.userId).select('emailVerified').exec();
    if (!creator) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!creator.emailVerified) {
      return res.status(403).json({
        message: 'Email verification is required before creating your first live collection.'
      });
    }

    // Always use ID from token for creator to prevent forgery
    const collection = new Collection({
      ...req.body,
      status: req.body.status === 'draft' ? 'draft' : 'active',
      creator: req.user.userId
    });

    await collection.save();
    res.status(201).json({
      message: 'Collection created',
      data: collection
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH update a collection (ownership required & prevent update if completed)
router.patch('/:collectionId', authenticate, requireOwnershipOrAdmin, async (req, res) => {
  try {
    // Do not allow updates if collection is completed (custom business logic)
    if (req.collection.status === 'completed' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Completed collections cannot be edited.' });
    }
    // Only allow certain fields to be updated (optional: enforce stronger partial updates)
    Object.assign(req.collection, req.body);

    await req.collection.save();
    res.status(200).json({
      message: 'Collection updated',
      data: req.collection
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE collection (ownership required)
router.delete('/:collectionId', authenticate, requireOwnershipOrAdmin, async (req, res) => {
  try {
    await Collection.findByIdAndDelete(req.params.collectionId);
    res.status(200).json({ message: 'Collection deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;