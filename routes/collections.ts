const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireOwnershipOrAdmin = require('../middleware/requireOwnershipOrAdmin');

const { getAllCollections, getCollectionById, createCollection, updateCollection, deleteCollection } = require('../controllers/collections');

// GET all collections: supports filtering, searching, and pagination
router.get('/', getAllCollections);

// GET one collection by id
router.get('/:collectionId', getCollectionById);

// POST create collection (authenticated)
router.post('/', authenticate, createCollection);

// PATCH update a collection (ownership required & prevent update if completed)
router.patch('/:collectionId', authenticate, requireOwnershipOrAdmin, updateCollection);

// DELETE collection (ownership required)
router.delete('/:collectionId', authenticate, requireOwnershipOrAdmin, deleteCollection);

module.exports = router;