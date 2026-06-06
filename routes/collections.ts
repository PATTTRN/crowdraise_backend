import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { requireOwnershipOrAdmin } from '../middleware/requireAdminOrOwnership';
import { validate } from '../middleware/validate';
import * as collections from '../controllers/collections';

const router = Router();

router.get('/', collections.getAllCollections);
router.get('/featured', collections.getFeatured);
router.get('/trending', collections.getTrending);
router.get('/almost-funded', collections.getAlmostFunded);
router.get('/:collectionId', collections.getCollectionById);
router.post('/', authenticate, validate('createCollection'), collections.createCollection);
router.patch('/:collectionId', authenticate, requireOwnershipOrAdmin, collections.updateCollection);
router.delete('/:collectionId', authenticate, requireOwnershipOrAdmin, collections.deleteCollection);
router.post('/:collectionId/updates', authenticate, validate('addUpdate'), collections.addUpdate);
router.patch('/:collectionId/moderate', authenticate, requireAdmin, validate('moderateCollection'), collections.moderateCollection);

export default router;
