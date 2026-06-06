import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import * as dashboard from '../controllers/dashboard';

const router = Router();

router.get('/summary', authenticate, dashboard.getDashboardSummary);
router.get('/earnings', authenticate, dashboard.getEarningsBreakdown);
router.get('/transactions', authenticate, dashboard.getTransactionHistory);
router.get('/analytics', authenticate, dashboard.getAnalytics);
router.get('/export/transactions', authenticate, dashboard.exportTransactions);

export default router;
