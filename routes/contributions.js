const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
import { initializeContribution, confirmContribution, getCollectionContributions, getPlatformRevenueSummary, getAllContributions } from '../controllers/contributions';

// POST initialize contribution record
router.post('/', initializeContribution);

// POST confirm contribution
router.post('/:contributionId/confirm', confirmContribution);

// GET collection contributions (Public)
router.get('/collection/:collectionId', getCollectionContributions);

// GET admin platform revenue summary
router.get('/admin/revenue', authenticate, requireAdmin, getPlatformRevenueSummary);

// GET all contributions (admin only)
router.get('/admin/all', authenticate, requireAdmin, getAllContributions);

module.exports = router;
