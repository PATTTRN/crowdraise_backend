const express = require('express');
const router = express.Router();
const Collection = require('../models/collection');
const jwt = require('jsonwebtoken');
// const User = require('../models/user'); // Assumed path, should exist in your app

// Middleware: Authenticate user using JWT (Authorization: Bearer <token>)
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authentication token.' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid or expired token.' });
    req.user = decoded; // Should include user's _id and role
    next();
  });
}

// Helper: Validate campaign ownership or admin
async function requireOwnershipOrAdmin(req, res, next) {
  try {
    const campaign = await Collection.findById(req.params.campaignId);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    if (
      campaign.creator.toString() !== req.user.userId &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Unauthorized: Not owner or admin' });
    }
    req.campaign = campaign;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET all campaigns: supports filtering, searching, and pagination
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
    const [campaigns, total] = await Promise.all([
      Collection.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('creator', 'firstname lastname email'),
      Collection.countDocuments(query)
    ]);

    res.status(200).json({
      message: 'Campaigns fetched',
      count: total,
      page: parseInt(page),
      pageSize: campaigns.length,
      totalPages: Math.ceil(total / limit),
      data: campaigns
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET one campaign by id
router.get('/:campaignId', async (req, res) => {
  try {
    const campaign = await Collection.findById(req.params.campaignId)
      .populate('creator', 'firstname lastname email');
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    res.status(200).json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create campaign (authenticated)
router.post('/', authenticate, async (req, res) => {
  try {
    // Always use ID from token for creator to prevent forgery
    const campaign = new Collection({
      ...req.body,
      creator: req.user.userId
    });

    await campaign.save();
    res.status(201).json({
      message: 'Campaign created',
      data: campaign
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH update a campaign (ownership required & prevent update if completed)
router.patch('/:campaignId', authenticate, requireOwnershipOrAdmin, async (req, res) => {
  try {
    // Do not allow updates if campaign is completed (custom business logic)
    if (req.campaign.status === 'completed' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Completed campaigns cannot be edited.' });
    }
    // Only allow certain fields to be updated (optional: enforce stronger partial updates)
    Object.assign(req.campaign, req.body);

    await req.campaign.save();
    res.status(200).json({
      message: 'Campaign updated',
      data: req.campaign
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE campaign (ownership required)
router.delete('/:campaignId', authenticate, requireOwnershipOrAdmin, async (req, res) => {
  try {
    await Collection.findByIdAndDelete(req.params.campaignId);
    res.status(200).json({ message: 'Campaign deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;