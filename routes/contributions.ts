import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { validate } from '../middleware/validate';
import * as contributions from '../controllers/contributions';
import { refundContribution } from '../controllers/payments';

const router = Router();

router.post('/', validate('initializeContribution'), contributions.initializeContribution);
router.post('/:contributionId/confirm', contributions.confirmContribution);
router.get('/collection/:collectionId', contributions.getCollectionContributions);
router.get('/admin/revenue', authenticate, requireAdmin, contributions.getPlatformRevenueSummary);
router.get('/admin/all', authenticate, requireAdmin, contributions.getAllContributions);
router.post('/:contributionId/refund', authenticate, requireAdmin, validate('refundContribution'), refundContribution);

export default router;
