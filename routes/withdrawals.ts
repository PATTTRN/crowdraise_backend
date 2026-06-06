import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import * as withdrawals from '../controllers/withdrawals';

const router = Router();

router.get('/banks', withdrawals.getBanks);
router.post('/verify-account', authenticate, withdrawals.verifyAccount);
router.put('/bank-details', authenticate, withdrawals.saveBankDetails);
router.get('/balance', authenticate, withdrawals.getCreatorBalance);
router.post('/request', authenticate, withdrawals.submitWithdrawalRequest);
router.get('/my', authenticate, withdrawals.getCreatorWithdrawalHistory);
router.get('/admin/all', authenticate, requireAdmin, withdrawals.getAllWithdrawals);
router.patch('/:id/approve', authenticate, requireAdmin, withdrawals.approveWithdrawal);
router.patch('/:id/reject', authenticate, requireAdmin, withdrawals.rejectWithdrawal);
router.patch('/:id/complete', authenticate, requireAdmin, withdrawals.markWithdrawalComplete);

export default router;
